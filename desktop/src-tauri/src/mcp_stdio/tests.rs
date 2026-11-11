use super::io::{read_bounded_line, FileStopSwitch, Line};
use super::*;
use crate::developer_runtime::context_credential::ShellBindingRef;
use std::cell::{Cell, RefCell};
use std::collections::VecDeque;
use std::rc::Rc;

const TOKEN: &str = "tok.secret.value";
const NOW: i64 = 1_792_000_000_000;

#[derive(Clone)]
struct Creds {
    value: Rc<RefCell<Result<Option<StoredContextCredential>, String>>>,
    loads: Rc<Cell<usize>>,
}
impl CredentialSource for Creds {
    fn load(&self, _client_id: &str) -> Result<Option<StoredContextCredential>, String> {
        self.loads.set(self.loads.get() + 1);
        self.value.borrow().clone()
    }
}

#[derive(Clone, Default)]
struct Gw {
    replies: Rc<RefCell<VecDeque<Result<GatewayReply, GatewayFailure>>>>,
    calls: Rc<RefCell<Vec<(HttpMethod, String, String, Option<Value>)>>>,
}
impl Gateway for Gw {
    fn call(&self, origin: &str, method: HttpMethod, path: &str, token: &str, body: Option<&Value>) -> Result<GatewayReply, GatewayFailure> {
        assert_eq!(origin, "https://api.agentrix.top");
        self.calls.borrow_mut().push((method, path.to_string(), token.to_string(), body.cloned()));
        self.replies.borrow_mut().pop_front().unwrap_or(Err(GatewayFailure::Network))
    }
}

#[derive(Clone)]
struct Stop(Rc<Cell<StopState>>);
impl StopSwitch for Stop {
    fn state(&self) -> StopState {
        self.0.get()
    }
}

struct Rig {
    server: McpServer,
    creds: Creds,
    gw: Gw,
    stop: Stop,
    clock: Rc<Cell<i64>>,
}

fn credential(categories: &[&str]) -> StoredContextCredential {
    StoredContextCredential {
        credential_ref: format!("cgc_{}", "a".repeat(32)),
        token: TOKEN.into(),
        client_id: "cursor".into(),
        categories: categories.iter().map(|c| c.to_string()).collect(),
        device_id: format!("dev_{}", "0".repeat(32)),
        issued_at: "2026-10-18T13:00:00.000Z".into(),
        expires_at: "2099-01-01T00:00:00.000Z".into(),
        refresh_after: "2098-12-31T00:00:00.000Z".into(),
        api_origin: "https://api.agentrix.top".into(),
        binding_ref: ShellBindingRef { kind: "shell_session_binding".into(), id: "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b".into(), version: 1 },
    }
}

fn rig_with(credential: Result<Option<StoredContextCredential>, String>) -> Rig {
    let creds = Creds { value: Rc::new(RefCell::new(credential)), loads: Rc::new(Cell::new(0)) };
    let gw = Gw::default();
    let stop = Stop(Rc::new(Cell::new(StopState::Released)));
    let clock = Rc::new(Cell::new(NOW));
    let tick = clock.clone();
    let server = McpServer::new("cursor".into(), Box::new(creds.clone()), Box::new(gw.clone()), Box::new(stop.clone()), Box::new(move || tick.get()));
    Rig { server, creds, gw, stop, clock }
}

fn rig() -> Rig {
    rig_with(Ok(Some(credential(&["agent_profile", "agent_preferences"]))))
}

fn reply(status: u16, body: Value) -> Result<GatewayReply, GatewayFailure> {
    Ok(GatewayReply { status, body })
}

fn issued(result: Value) -> Result<GatewayReply, GatewayFailure> {
    reply(200, json!({ "schemaVersion": 1, "status": "issued", "reasonCode": "ok", "correlationId": "c", "result": result }))
}

fn prov(kind: &str) -> Value {
    json!({ "sourceDomain": "memory", "sourceKind": kind, "sourceRef": "memory_fact:1", "sourceVersion": "3", "observedAt": "2026-10-01T00:00:00Z" })
}

fn data_reply(records: Value) -> Result<GatewayReply, GatewayFailure> {
    issued(json!({ "projectionId": "prj_1", "payload": { "schemaVersion": 1, "disclosureReceiptId": "rcpt_1", "records": records } }))
}

fn call(rig: &mut Rig, name: &str, arguments: Value) -> Value {
    let line = json!({ "jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": { "name": name, "arguments": arguments } }).to_string();
    serde_json::from_str(&rig.server.handle_line(&line).expect("a reply")).unwrap()
}

fn tool_text_of(reply: &Value) -> String {
    reply["result"]["content"][0]["text"].as_str().unwrap_or_default().to_string()
}

fn is_error(reply: &Value) -> bool {
    reply["result"]["isError"] == json!(true)
}

#[test]
fn protocol_basics_answer_and_notifications_stay_silent() {
    let mut r = rig();
    let init: Value = serde_json::from_str(&r.server.handle_line(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}"#).unwrap()).unwrap();
    assert_eq!(init["result"]["protocolVersion"], "2024-11-05");
    assert_eq!(init["result"]["serverInfo"]["name"], "agentrix");
    let newer: Value = serde_json::from_str(&r.server.handle_line(r#"{"jsonrpc":"2.0","id":"a","method":"initialize","params":{"protocolVersion":"2099-01-01"}}"#).unwrap()).unwrap();
    assert_eq!(newer["id"], "a");
    assert_eq!(newer["result"]["protocolVersion"], "2025-06-18");
    assert!(r.server.handle_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).is_none());
    assert!(r.server.handle_line(r#"{"jsonrpc":"2.0","method":"nope"}"#).is_none());
    let list: Value = serde_json::from_str(&r.server.handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#).unwrap()).unwrap();
    let names: Vec<&str> = list["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["agentrix_recall", "agentrix_propose_memory"]);
    let ping: Value = serde_json::from_str(&r.server.handle_line(r#"{"jsonrpc":"2.0","id":3,"method":"ping"}"#).unwrap()).unwrap();
    assert_eq!(ping["result"], json!({}));
    let unknown: Value = serde_json::from_str(&r.server.handle_line(r#"{"jsonrpc":"2.0","id":4,"method":"resources/list"}"#).unwrap()).unwrap();
    assert_eq!(unknown["error"]["code"], -32601);
    let bad: Value = serde_json::from_str(&r.server.handle_line("{nope").unwrap()).unwrap();
    assert_eq!(bad["error"]["code"], -32700);
    let batch: Value = serde_json::from_str(&r.server.handle_line("[]").unwrap()).unwrap();
    assert_eq!(batch["error"]["code"], -32600);
    // No tool other than the two exists.
    let other = call(&mut r, "desktop_run_command", json!({}));
    assert_eq!(other["error"]["code"], -32602);
    assert!(r.gw.calls.borrow().is_empty());
}

#[test]
fn the_emergency_stop_refuses_every_call_before_anything_is_read_or_sent() {
    for state in [StopState::Engaged, StopState::Unknown] {
        let mut r = rig();
        r.stop.0.set(state);
        let recall = call(&mut r, "agentrix_recall", json!({ "query": "hi" }));
        let propose = call(&mut r, "agentrix_propose_memory", json!({ "text": "x" }));
        for reply in [&recall, &propose] {
            assert!(is_error(reply), "{state:?}");
            assert!(tool_text_of(reply).contains(if state == StopState::Engaged { "kill_switch_engaged" } else { "kill_switch_unreadable" }));
        }
        // Neither the keychain nor the network was touched.
        assert_eq!(r.creds.loads.get(), 0);
        assert!(r.gw.calls.borrow().is_empty());
    }
    // Released again: the same call goes through to the credential check.
    let mut r = rig();
    r.stop.0.set(StopState::Engaged);
    assert!(is_error(&call(&mut r, "agentrix_recall", json!({ "query": "hi" }))));
    r.stop.0.set(StopState::Released);
    r.gw.replies.borrow_mut().push_back(issued(json!({ "projection": { "projectionId": "prj_1" } })));
    r.gw.replies.borrow_mut().push_back(data_reply(json!([])));
    assert!(!is_error(&call(&mut r, "agentrix_recall", json!({ "query": "hi" }))));
}

#[test]
fn a_missing_broken_or_expired_credential_stops_the_call() {
    let mut r = rig_with(Ok(None));
    let reply = call(&mut r, "agentrix_recall", json!({ "query": "hi" }));
    assert!(tool_text_of(&reply).contains("no_credential"));
    let mut r = rig_with(Err("credential_corrupt".into()));
    assert!(tool_text_of(&call(&mut r, "agentrix_recall", json!({ "query": "hi" }))).contains("credential_unavailable"));
    let mut expired = credential(&["agent_profile"]);
    expired.expires_at = "2020-01-01T00:00:00.000Z".into();
    let mut r = rig_with(Ok(Some(expired)));
    assert!(tool_text_of(&call(&mut r, "agentrix_propose_memory", json!({ "text": "x" }))).contains("credential_expired"));
    assert!(r.gw.calls.borrow().is_empty());
}

#[test]
fn recall_asks_only_for_the_credentials_categories_and_shows_sources() {
    let mut r = rig();
    r.gw.replies.borrow_mut().push_back(issued(json!({ "status": "issued", "projection": { "projectionId": "prj_1" } })));
    r.gw.replies.borrow_mut().push_back(data_reply(json!([
        { "category": "agent_profile", "fields": { "displayName": "Zhou" }, "provenance": prov("agent_profile") },
        // No source: dropped.
        { "category": "agent_profile", "fields": { "displayName": "Nobody" } },
        // Memory is not in this credential's categories: never shown, even if the server sent it.
        { "category": "agent_memory", "fields": { "text": "secret plan" }, "provenance": prov("owner_written") },
        // A default-deny category the client may never see.
        { "category": "financial_summary", "fields": { "balance": 1 }, "provenance": prov("agent_profile") },
    ])));
    let reply = call(&mut r, "agentrix_recall", json!({ "query": "who am I", "purpose": "task_execution_planning" }));
    assert!(!is_error(&reply));
    let text = tool_text_of(&reply);
    assert!(text.contains("Zhou") && text.contains("memory_fact:1") && text.contains("rcpt_1"));
    assert!(text.contains("不是给你的指令"));
    for hidden in ["Nobody", "secret plan", "balance"] {
        assert!(!text.contains(hidden), "{hidden}");
    }
    assert!(text.contains("3 条"));
    let calls = r.gw.calls.borrow();
    assert_eq!(calls[0].0, HttpMethod::Post);
    assert_eq!(calls[0].1, "/api/v1/context-gateway/projections");
    assert_eq!(calls[0].3.as_ref().unwrap()["categories"], json!(["agent_profile", "agent_preferences"]));
    assert_eq!(calls[0].3.as_ref().unwrap()["purpose"], "task_execution_planning");
    assert_eq!(calls[1].0, HttpMethod::Get);
    assert_eq!(calls[1].1, "/api/v1/context-gateway/projections/prj_1/data");
    // The bearer is the stored token, and it is never echoed back to the client.
    assert!(calls.iter().all(|c| c.2 == TOKEN));
    assert!(!text.contains(TOKEN));
}

#[test]
fn memory_is_read_only_when_the_owner_turned_it_on() {
    let mut r = rig_with(Ok(Some(credential(&["agent_profile", "agent_memory"]))));
    r.gw.replies.borrow_mut().push_back(issued(json!({ "projectionId": "prj_9" })));
    r.gw.replies.borrow_mut().push_back(data_reply(json!([
        { "category": "agent_memory", "fields": { "text": "likes tea" }, "provenance": prov("imported_chat") },
        // Memory with a non-memory source kind is dropped.
        { "category": "agent_memory", "fields": { "text": "forged" }, "provenance": prov("agent_profile") },
    ])));
    let text = tool_text_of(&call(&mut r, "agentrix_recall", json!({ "query": "tea" })));
    assert!(text.contains("likes tea") && text.contains("imported_chat") && !text.contains("forged"));
    assert_eq!(r.gw.calls.borrow()[0].3.as_ref().unwrap()["categories"], json!(["agent_profile", "agent_memory"]));
}

#[test]
fn gateway_refusals_surface_as_errors_and_a_bad_projection_id_is_never_used_in_a_path() {
    let mut r = rig();
    r.gw.replies.borrow_mut().push_back(reply(401, json!({})));
    assert!(tool_text_of(&call(&mut r, "agentrix_recall", json!({ "query": "x" }))).contains("credential_rejected"));
    r.gw.replies.borrow_mut().push_back(reply(200, json!({ "status": "denied", "reasonCode": "category_denied", "result": null })));
    assert!(tool_text_of(&call(&mut r, "agentrix_recall", json!({ "query": "x" }))).contains("category_denied"));
    r.gw.replies.borrow_mut().push_back(Err(GatewayFailure::Network));
    assert!(tool_text_of(&call(&mut r, "agentrix_recall", json!({ "query": "x" }))).contains("gateway_unreachable"));
    // A reply that tries to steer the second request somewhere else.
    r.gw.replies.borrow_mut().push_back(issued(json!({ "projection": { "projectionId": "../../act-requests" } })));
    let before = r.gw.calls.borrow().len();
    assert!(tool_text_of(&call(&mut r, "agentrix_recall", json!({ "query": "x" }))).contains("gateway_reply_invalid"));
    assert_eq!(r.gw.calls.borrow().len(), before + 1, "only the first request was sent");
}

#[test]
fn recall_inputs_are_checked_on_this_computer() {
    let mut r = rig();
    for args in [json!({}), json!({ "query": "   " }), json!({ "query": "a".repeat(4097) }), json!({ "query": "x", "purpose": "schedule_assistance" })] {
        assert!(is_error(&call(&mut r, "agentrix_recall", args)));
    }
    assert!(r.gw.calls.borrow().is_empty());
}

#[test]
fn propose_sends_an_untrusted_candidate_and_never_writes_memory_itself() {
    let mut r = rig();
    r.gw.replies.borrow_mut().push_back(issued(json!({ "candidateId": "cand_1" })));
    let reply = call(&mut r, "agentrix_propose_memory", json!({ "text": "  prefers dark mode  ", "source": "has spaces" }));
    assert!(!is_error(&reply));
    assert!(tool_text_of(&reply).contains("确认"));
    let calls = r.gw.calls.borrow();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].1, "/api/v1/context-gateway/ingest-candidates");
    let body = calls[0].3.as_ref().unwrap();
    assert_eq!(body["proposedText"], "prefers dark mode");
    assert_eq!(body["sourceKind"], "desktop_mcp:cursor");
    // A source that is not a plain token falls back to the client's own name.
    assert_eq!(body["sourceRef"], "mcp:cursor");
    assert_eq!(body["proposedCanonicalDomain"], "memory");
}

#[test]
fn propose_refuses_bad_text_and_more_than_twenty_an_hour() {
    let mut r = rig();
    for text in [json!(""), json!("   "), json!("a".repeat(2001)), json!(5)] {
        assert!(is_error(&call(&mut r, "agentrix_propose_memory", json!({ "text": text }))));
    }
    assert!(r.gw.calls.borrow().is_empty());
    for _ in 0..20 {
        r.gw.replies.borrow_mut().push_back(issued(json!({})));
        assert!(!is_error(&call(&mut r, "agentrix_propose_memory", json!({ "text": "note", "source": "notes.md" }))));
        r.clock.set(r.clock.get() + 1000);
    }
    assert_eq!(r.gw.calls.borrow().last().unwrap().3.as_ref().unwrap()["sourceRef"], "notes.md");
    let before = r.gw.calls.borrow().len();
    let refused = call(&mut r, "agentrix_propose_memory", json!({ "text": "21st" }));
    assert!(tool_text_of(&refused).contains("rate_limited"));
    assert_eq!(r.gw.calls.borrow().len(), before, "the 21st never left this computer");
    // An hour after the first one, there is room again.
    r.clock.set(NOW + HOUR_MS + 1);
    r.gw.replies.borrow_mut().push_back(issued(json!({})));
    assert!(!is_error(&call(&mut r, "agentrix_propose_memory", json!({ "text": "later" }))));
}

#[test]
fn a_server_that_did_not_accept_the_proposal_is_not_reported_as_saved() {
    let mut r = rig();
    r.gw.replies.borrow_mut().push_back(reply(403, json!({})));
    let denied = call(&mut r, "agentrix_propose_memory", json!({ "text": "x" }));
    assert!(is_error(&denied) && !tool_text_of(&denied).contains("已记下"));
}

#[test]
fn args_name_one_known_client_and_nothing_else() {
    let a = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert!(parse_args(&a(&["--agentrix-claude-snapshot", "x"])).is_none());
    assert!(parse_args(&[]).is_none());
    assert_eq!(parse_args(&a(&["--agentrix-mcp", "--client", "kiro"])).unwrap().unwrap(), McpArgs { client_id: "kiro".into() });
    // The open-source Agent connectors (C3) are known clients too; the list is exactly the five of the shared contract.
    for known in ["openclaw", "hermes"] {
        assert_eq!(parse_args(&a(&["--agentrix-mcp", "--client", known])).unwrap().unwrap(), McpArgs { client_id: known.into() });
    }
    for known in ["cursor", "claude_code", "kiro", "openclaw", "hermes"] {
        assert!(is_client_id(known), "{known}");
    }
    for unknown in ["vscode", "OpenClaw", "hermes ", ""] {
        assert!(!is_client_id(unknown), "{unknown}");
    }
    for bad in [
        // The emergency-stop directory cannot be redirected by the client's settings.
        a(&["--agentrix-mcp", "--client", "cursor", "--state-dir", "/tmp/h"]),
        a(&["--agentrix-mcp"]),
        a(&["--agentrix-mcp", "--client", "vscode"]),
        a(&["--agentrix-mcp", "--client", "kiro", "--client", "cursor"]),
        a(&["--agentrix-mcp", "--client", "kiro", "--token", "x"]),
        a(&["--agentrix-mcp", "--client"]),
    ] {
        assert!(parse_args(&bad).unwrap().is_err(), "{bad:?}");
    }
}

#[test]
fn only_an_exact_released_state_file_lets_calls_through() {
    use crate::agent_hooks::{write_state, STATE_FILE};
    let dir = tempfile::tempdir().unwrap();
    let hooks = dir.path().join("hooks");
    let switch = FileStopSwitch { dir: Some(hooks.clone()) };
    assert_eq!(switch.state(), StopState::Unknown, "no file");
    write_state(&hooks, true).unwrap();
    assert_eq!(switch.state(), StopState::Engaged);
    write_state(&hooks, false).unwrap();
    assert_eq!(switch.state(), StopState::Released);
    std::fs::write(hooks.join(STATE_FILE), "Released\n").unwrap();
    assert_eq!(switch.state(), StopState::Unknown, "anything but the exact word");
    assert_eq!((FileStopSwitch { dir: None }).state(), StopState::Unknown);
}

#[test]
fn serve_answers_line_by_line_and_survives_an_oversized_line() {
    let mut r = rig();
    let long = "x".repeat(MAX_LINE_BYTES + 10);
    let input = format!("{long}\n{}\n\n{}\n", r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
    let mut out = Vec::new();
    serve(&mut r.server, &mut std::io::Cursor::new(input.into_bytes()), &mut out).unwrap();
    let lines: Vec<Value> = String::from_utf8(out).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["error"]["code"], -32600);
    assert_eq!(lines[1]["id"], 1);
}

#[test]
fn bounded_lines_stop_at_the_limit_and_resume_after_it() {
    let mut cursor = std::io::Cursor::new(b"short\r\n0123456789abcdef\nnext".to_vec());
    assert!(matches!(read_bounded_line(&mut cursor, 8).unwrap(), Some(Line::Text(t)) if t == "short"));
    assert!(matches!(read_bounded_line(&mut cursor, 8).unwrap(), Some(Line::TooLong)));
    assert!(matches!(read_bounded_line(&mut cursor, 8).unwrap(), Some(Line::Text(t)) if t == "next"));
    assert!(read_bounded_line(&mut cursor, 8).unwrap().is_none());
}

#[test]
fn decoding_drops_what_has_no_valid_source() {
    let good = json!({ "category": "agent_preferences", "fields": { "tone": "short" }, "provenance": prov("agent_settings") });
    let mut bad_time = good.clone();
    bad_time["provenance"]["observedAt"] = json!("yesterday");
    let mut bad_domain = good.clone();
    bad_domain["provenance"]["sourceDomain"] = json!("secrets");
    let mut empty_memory = json!({ "category": "agent_memory", "fields": { "text": "" }, "provenance": prov("owner_written") });
    empty_memory["fields"]["text"] = json!("");
    let long_memory = json!({ "category": "agent_memory", "fields": { "text": "a".repeat(8001) }, "provenance": prov("owner_written") });
    let decoded = decode::decode_projection_data(&json!({ "projectionId": "p", "disclosureReceiptId": "r", "records": [good, bad_time, bad_domain, empty_memory, long_memory] })).unwrap();
    assert_eq!(decoded.records.len(), 1);
    assert_eq!(decoded.dropped, 4);
    assert!(decode::decode_projection_data(&json!({ "projectionId": "p", "records": [] })).is_none());
    assert!(decode::decode_projection_data(&json!({ "projectionId": "p", "disclosureReceiptId": "r", "records": {} })).is_none());
    assert_eq!(decode::normalize_proposal_text("  ok "), Some("ok".to_string()));
    assert_eq!(decode::normalize_proposal_text(&"é".repeat(2000)).map(|s| s.chars().count()), Some(2000));
    assert!(decode::normalize_proposal_text(&"é".repeat(2001)).is_none());
}
