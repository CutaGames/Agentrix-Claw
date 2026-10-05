//! Integration harness: HTTP mock, background offers, workspace trust.

use crate::developer_runtime::approval::project_permission_request;
use crate::developer_runtime::binding::{sign_projection, ScriptedBindingSource};
use crate::developer_runtime::channel::{
    instruction_digest, parse_offer, parse_success_data, url_encode, HttpsOutboundClient,
    OutboundChannelClient, ScriptedHttp,
};
use crate::developer_runtime::crypto::{MemorySecureStore, SecureStore};
use crate::developer_runtime::host::RuntimeHost;
use crate::developer_runtime::policy::TrustPolicy;
use crate::developer_runtime::process::{CursorAcpProcessHost, PromptProgress, ScriptedAgent};
use crate::developer_runtime::types::SessionOperation;
use crate::developer_runtime::types::{
    ActiveBinding, DigestRef, EncryptedPayloadRef, RecordRef, RuntimeOffer,
    AUDIENCE_DESKTOP_RUNTIME, BODY_DIGEST_HEADER, CANONICALIZATION_HEADER, KEYRING_CHANNEL_TOKEN,
    KEYRING_PROCESS_TOKEN, KEYRING_SERVICE,
};
use serde_json::json;

fn payload_ref(text: &str) -> EncryptedPayloadRef {
    EncryptedPayloadRef {
        kind: "encrypted_data_ref".into(),
        data_kind: "instruction".into(),
        data_ref: "data-instruction-1".into(),
        digest: DigestRef {
            algorithm: "sha-256".into(),
            canonicalization: "jcs/1".into(),
            value: crate::developer_runtime::crypto::sha256_hex(text.as_bytes()),
        },
        size_bytes: text.len() as u64,
        data_class: "owner_private".into(),
        encryption: "runtime_managed".into(),
        owner_scope: "authenticated_owner".into(),
        expires_at: "2099-08-22T12:00:00.000Z".into(),
    }
}

fn binding_for(path: &std::path::Path) -> ActiveBinding {
    ActiveBinding {
        owner_principal_ref: "principal-1".into(),
        agent_id: "agent-1".into(),
        device_ref: "device-1".into(),
        runtime_ref: RecordRef {
            kind: "runtime".into(),
            id: "runtime-1".into(),
            version: Some(1),
            digest: None,
        },
        machine_ref: "machine-1".into(),
        machine_version: 1,
        workspace_ref: "workspace-1".into(),
        workspace_digest: crate::developer_runtime::workspace_trust::path_digest(&path.to_path_buf())
            .unwrap(),
        workspace_trust: "trusted".into(),
        shell_binding_ref: "binding-1".into(),
        shell_binding_version: 1,
        nonce_domain: "developer-remote-workspace".into(),
        issued_at: "2026-08-22T12:00:00.000Z".into(),
        expires_at: "2099-08-22T12:00:00.000Z".into(),
        status: "active".into(),
        audience: AUDIENCE_DESKTOP_RUNTIME.into(),
        binding_version: 3,
        workspace_path: None,
    }
}

fn offer_for(binding: &ActiveBinding) -> RuntimeOffer {
    let mut offer = RuntimeOffer {
        instruction_ref: "instruction-1".into(),
        action_ref: "action-1".into(),
        adapter_session_ref: "adapter-session-1".into(),
        session_ref: "session-1".into(),
        session_version: 1,
        instruction_version: 4,
        workspace_ref: binding.workspace_ref.clone(),
        request_digest: DigestRef {
            algorithm: "sha-256".into(),
            canonicalization: "jcs/1".into(),
            value: "d".repeat(64),
        },
        issued_at: "2026-08-22T12:01:00.000Z".into(),
        expires_at: "2099-08-22T12:00:00.000Z".into(),
        nonce: "nonce-1".into(),
        nonce_domain: binding.nonce_domain.clone(),
        audience: binding.audience.clone(),
        binding_version: binding.binding_version,
        idempotency_key: "idem-harness-1".into(),
        payload_ref: payload_ref("do the work"),
        adapter_manifest_ref: "cursor-acp-local-runtime-manifest-1".into(),
        adapter_manifest_version: 1,
    };
    offer.request_digest = instruction_digest(&offer).unwrap();
    offer
}

fn instruction_snapshot(offer: &RuntimeOffer, binding: &ActiveBinding) -> serde_json::Value {
    json!({
        "schemaVersion": 1,
        "contractType": "developer_instruction",
        "instructionRef": offer.instruction_ref,
        "actionRef": offer.action_ref,
        "workspaceRef": offer.workspace_ref,
        "sessionRef": offer.session_ref,
        "deviceRef": binding.device_ref,
        "instructionSequence": offer.instruction_version,
        "shellBindingRef": { "type": "shell_session_binding", "id": binding.shell_binding_ref, "version": binding.shell_binding_version },
        "shellCommandJournalRef": { "type": "shell_command_journal_entry", "id": offer.idempotency_key, "version": 1 },
        "state": "claimed"
    })
}

#[test]
fn http_sends_raw_dto_and_rejects_null_data() {
    let http = ScriptedHttp::default();
    http.push(200, json!({ "success": true, "data": { "items": [] } }));
    http.push(
        200,
        json!({
            "success": true,
            "data": {
                "schemaVersion": 1,
                "contractType": "developer_instruction",
                "instructionRef": "instruction-1",
                "actionRef": "action-1",
                "workspaceRef": "workspace-1",
                "sessionRef": "session-1",
                "deviceRef": "device-1",
                "instructionSequence": 4,
                "shellBindingRef": { "id": "binding-1" },
                "shellCommandJournalRef": { "id": "idem-harness-1" },
                "state": "claimed"
            }
        }),
    );
    http.push(200, json!({ "success": true, "data": null }));
    let mut client = HttpsOutboundClient::new(
        Box::new(http.clone()),
        TrustPolicy::default(),
        "https://api.agentrix.top".into(),
        Some("hdr.payload.sig".into()),
    )
    .unwrap();
    let offers = client.get("/offers", &[("deviceRef", "device 1")]).unwrap();
    assert_eq!(offers["items"], json!([]));
    let claimed = client
        .post(
            "/claims",
            json!({
                "instructionRef": "instruction-1",
                "deviceRef": "device-1",
                "sessionRef": "session-1",
                "workspaceRef": "workspace-1",
                "expectedInstructionVersion": 4
            }),
            "idem",
        )
        .unwrap();
    assert_eq!(claimed["instructionRef"], "instruction-1");
    assert_eq!(
        client
            .post("/claims", json!({ "instructionRef": "instruction-1" }), "idem-2")
            .unwrap_err()
            .code(),
        "backend_cas_rejected"
    );
    assert_eq!(
        parse_success_data(&json!({ "success": false, "data": {} }))
            .unwrap_err()
            .code(),
        "backend_cas_rejected"
    );
    assert_eq!(url_encode("device 1"), "device%201");
    let recorded = http.recorded();
    let get = recorded
        .iter()
        .find(|item| item.method == "GET")
        .expect("get");
    assert!(get.url.contains("deviceRef=device%201"));
    let post = recorded
        .iter()
        .find(|item| item.method == "POST")
        .expect("post");
    assert_eq!(post.body.as_ref().unwrap()["instructionRef"], "instruction-1");
    assert!(post.body.as_ref().unwrap().get("protocolVersion").is_none());
    assert!(post.body.as_ref().unwrap().get("kind").is_none());
    assert!(post.headers.iter().any(|(key, value)| {
        key == BODY_DIGEST_HEADER && value.starts_with("sha-256=")
    }));
    assert!(post.headers.iter().any(|(key, value)| {
        key == CANONICALIZATION_HEADER && value == "jcs/1"
    }));
    assert!(post
        .headers
        .iter()
        .any(|(key, value)| key == "Authorization" && value == "Bearer hdr.payload.sig"));
    http.push(
        200,
        json!({
            "success": true,
            "data": { "items": [creating_session()] }
        }),
    );
    let operations = client.get("/session-operations", &[("deviceRef", "device-1")]).unwrap();
    assert_eq!(operations["items"][0]["operationRef"], "op-1");
    http.push(200, json!({ "success": true, "data": ready_session() }));
    let ready = client
        .post(
            "/sessions/ready",
            json!({
                "sessionRef": "session-1",
                "operationRef": "op-1",
                "adapterSessionRef": "acp-session-1"
            }),
            "ready-op-1",
        )
        .unwrap();
    assert_eq!(ready["state"], "ready");
    http.push(
        200,
        json!({
            "success": true,
            "data": {
                "completed": true,
                "refs": { "actionReceiptRef": { "type": "action_receipt", "id": "ar-1" } },
                "layers": {
                    "execution": { "state": "succeeded" },
                    "outcome": { "outcomeRef": { "type": "outcome_record", "id": "out-1" } }
                }
            }
        }),
    );
    let receipt = client.get("/receipts/action-1", &[]).unwrap();
    assert_eq!(receipt["completed"], true);
    assert!(receipt.pointer("/refs/actionReceiptRef").is_some());
}

#[test]
fn production_constructor_reads_raw_jwt_not_hex_bearer() {
    let store = MemorySecureStore::default();
    store
        .set_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN, "hdr.payload.sig")
        .unwrap();
    let mut host = RuntimeHost::default_off();
    host.store_for_test(Box::new(store));
    host.instantiate_production_for_test().unwrap();
    assert!(host.is_enabled());
    assert!(host.status_payload().get("processToken").is_none());
    let _ = KEYRING_PROCESS_TOKEN;
}

#[test]
fn forged_binding_never_opens_journal() {
    let dir = tempfile::tempdir().unwrap();
    let mut forged = sign_projection(&binding_for(dir.path()));
    forged["binding"]["ownerPrincipalRef"] = json!("attacker");
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-bad", forged);
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default()),
    )
    .unwrap();
    assert_eq!(
        host.bootstrap("bootstrap-bad", dir.path().join("missing.sqlite"))
            .unwrap_err()
            .code(),
        "binding_digest_mismatch"
    );
    assert!(!dir.path().join("missing.sqlite").exists());
}

fn plaintext_data() -> serde_json::Value {
    json!({
        "encoding": "plaintext_base64",
        "plaintextBase64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, "do the work"),
        "sizeBytes": 11,
        "dataKind": "instruction",
        "deliveryRef": "dlev-1"
    })
}

fn session_claim_snapshot() -> serde_json::Value {
    json!({
        "sessionRef": "session-1",
        "operationRef": "op-1",
        "claimedByDeviceRef": "device-1",
        "state": "claimed"
    })
}

fn completed_terminal() -> serde_json::Value {
    json!({
        "contractType": "developer_terminal_result",
        "status": "completed"
    })
}

fn rejected_terminal() -> serde_json::Value {
    json!({
        "contractType": "developer_terminal_result",
        "status": "rejected"
    })
}

fn unknown_terminal() -> serde_json::Value {
    json!({
        "contractType": "developer_terminal_result",
        "status": "unknown_outcome"
    })
}

fn completed_receipt() -> serde_json::Value {
    json!({
        "completed": true,
        "refs": { "actionReceiptRef": { "type": "action_receipt", "id": "ar-1" } },
        "layers": {
            "execution": { "state": "succeeded" },
            "outcome": { "outcomeRef": { "type": "outcome_record", "id": "out-1" } }
        }
    })
}

fn creating_session() -> serde_json::Value {
    json!({
        "schemaVersion": 1,
        "contractType": "developer_session_summary",
        "sessionRef": "session-1",
        "operationRef": "op-1",
        "state": "creating",
        "sessionVersion": 1,
        "workspaceRef": "workspace-1",
        "adapterManifestRef": "cursor-acp-local-runtime-manifest-1",
        "adapterManifestVersion": 1,
        "adapterSessionRef": "pending"
    })
}

fn ready_session() -> serde_json::Value {
    json!({
        "schemaVersion": 1,
        "contractType": "developer_session_summary",
        "sessionRef": "session-1",
        "state": "ready",
        "adapterSessionRef": "acp-session-1",
        "sessionVersion": 2
    })
}

#[test]
fn scripted_stdio_keeps_permission_order() {
    let mut process = CursorAcpProcessHost::attach_scripted(ScriptedAgent::default());
    process.initialize().unwrap();
    process.authenticate().unwrap();
    process.session_new("D:/trusted/workspace").unwrap();
    process.start_prompt("acp-session-1", "do the work").unwrap();
    match process.drive_prompt().unwrap() {
        PromptProgress::Permission { params, .. } => {
            assert_eq!(params["toolCall"]["toolCallId"], "fs-write-1");
        }
        other => panic!("expected permission, got {other:?}"),
    }
}

#[test]
fn offer_rejects_arbitrary_value() {
    let dir = tempfile::tempdir().unwrap();
    let verified = crate::developer_runtime::binding::verify_projection(
        &sign_projection(&binding_for(dir.path())),
        "2026-08-22T12:30:00.000Z",
        &TrustPolicy::default(),
    )
    .unwrap();
    assert_eq!(
        parse_offer(&json!({ "hello": true }), &verified)
            .unwrap_err()
            .code(),
        "unknown_schema"
    );
}

#[test]
fn project_permission_rejects_missing_tool_fields() {
    assert_eq!(
        project_permission_request(&json!({ "sessionRef": "session-1" }))
            .unwrap_err()
            .code(),
        "unknown_schema"
    );
}

#[test]
fn cancel_without_binding_is_not_cancelled_true() {
    let mut host = RuntimeHost::default_off();
    host.enable_for_test();
    let error = host.cancel("instruction-1").unwrap_err();
    assert_eq!(error.code(), "binding_bootstrap_unavailable");
    assert_ne!(error.code(), "cancelled");
}

#[test]
fn drive_once_claims_background_offers() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let ops = channel.ops_handle();
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": { "items": [] } }));
    channel.push_response(json!({
        "success": true,
        "data": { "items": [serde_json::to_value(&offer).unwrap()] }
    }));
    channel.push_response(json!({
        "success": true,
        "data": instruction_snapshot(&offer, &bound)
    }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": completed_terminal() }));
    channel.push_response(json!({ "success": true, "data": completed_receipt() }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.drive_once().unwrap();
    let recorded = ops.lock().unwrap().clone();
    assert!(recorded.iter().any(|item| item == "POST /heartbeat"));
    assert!(recorded.iter().any(|item| item == "GET /offers"));
    assert!(recorded.iter().any(|item| item == "POST /claims"));
    assert!(!recorded.iter().any(|item| item.contains("adapter_initialize")));
}

#[test]
fn reconnect_queries_inflight_before_claim() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let ops = channel.ops_handle();
    channel.push_response(json!({ "success": true, "data": { "items": [] } }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.recover_query_first().unwrap();
    let recorded = ops.lock().unwrap().clone();
    assert!(!recorded.iter().any(|item| item == "POST /claims"));
    assert_eq!(host.query_inflight().unwrap().len(), 0);
}

#[test]
fn no_webview_adapter_commands_are_exported() {
    let source = include_str!("commands.rs");
    assert!(!source.contains("developer_runtime_adapter_initialize"));
    assert!(!source.contains("developer_runtime_adapter_authenticate"));
    assert!(!source.contains("developer_runtime_adapter_list_sessions"));
    assert!(!source.contains("developer_runtime_adapter_create_session"));
    assert!(!source.contains("developer_runtime_adapter_prompt"));
    let permissions = include_str!("../../permissions/developer-runtime.toml");
    assert!(!permissions.contains("developer_runtime_adapter_"));
}

#[test]
fn instantiate_failure_does_not_enable() {
    let mut host = RuntimeHost::default_off();
    host.store_for_test(Box::new(MemorySecureStore::default()));
    assert_eq!(
        host.instantiate_production_for_test().unwrap_err().code(),
        "channel_credential_missing"
    );
    assert!(!host.is_enabled());
    assert_eq!(host.status_payload()["operational"], false);
    host.enable_from_flags();
    assert!(!host.is_enabled());
}

#[test]
fn session_ready_before_instruction_avoids_deadlock() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let ops = channel.ops_handle();
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": { "items": [creating_session()] } }));
    channel.push_response(json!({ "success": true, "data": session_claim_snapshot() }));
    channel.push_response(json!({ "success": true, "data": ready_session() }));
    channel.push_response(json!({ "success": true, "data": { "items": [] } }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.drive_once().unwrap();
    let recorded = ops.lock().unwrap().clone();
    let sop_at = recorded
        .iter()
        .position(|item| item == "POST /session-operations/claims");
    let ready_at = recorded.iter().position(|item| item == "POST /sessions/ready");
    let claim_at = recorded.iter().position(|item| item == "POST /claims");
    assert!(sop_at.is_some());
    assert!(ready_at.is_some());
    assert!(sop_at.unwrap() < ready_at.unwrap());
    assert!(claim_at.is_none());
    assert_eq!(host.session_new_count(), 1);
}

#[test]
fn same_session_two_prompts_reuse_adapter_session() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let mut first = offer_for(&bound);
    first.idempotency_key = "idem-a".into();
    first.nonce = "nonce-a".into();
    first.request_digest = instruction_digest(&first).unwrap();
    let mut second = offer_for(&bound);
    second.instruction_ref = "instruction-2".into();
    second.action_ref = "action-2".into();
    second.idempotency_key = "idem-b".into();
    second.nonce = "nonce-b".into();
    second.request_digest = instruction_digest(&second).unwrap();
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&first, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": completed_terminal() }));
    channel.push_response(json!({ "success": true, "data": completed_receipt() }));
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 3 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&second, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": completed_terminal() }));
    channel.push_response(json!({ "success": true, "data": completed_receipt() }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    host.claim_offer(serde_json::to_value(&first).unwrap()).unwrap();
    host.heartbeat().unwrap();
    host.claim_offer(serde_json::to_value(&second).unwrap()).unwrap();
    assert_eq!(host.session_new_count(), 0);
    assert_eq!(host.prompt_calls(), 2);
}

#[test]
fn session_ready_cas_failure_does_not_prompt() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({
        "success": true,
        "data": {
            "sessionRef": "session-1",
            "operationRef": "op-1",
            "claimedByDeviceRef": "other-device",
            "state": "claimed"
        }
    }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    let op = SessionOperation {
        session_ref: "session-1".into(),
        operation_ref: "op-1".into(),
        session_version: 1,
        workspace_ref: "workspace-1".into(),
        adapter_manifest_ref: "cursor-acp-local-runtime-manifest-1".into(),
        adapter_manifest_version: 1,
        state: "creating".into(),
    };
    assert_eq!(
        host.claim_session_operation(op).unwrap_err().code(),
        "session_claim_cas_rejected"
    );
    assert_eq!(host.session_new_count(), 0);
    assert_eq!(host.prompt_calls(), 0);
}

#[test]
fn receipt_field_mismatch_is_not_completed() {
    use crate::developer_runtime::channel::receipt_is_completed;
    assert!(!receipt_is_completed(&json!({
        "receiptRef": "r-1",
        "status": "completed"
    })));
    assert!(receipt_is_completed(&json!({
        "completed": true,
        "refs": { "actionReceiptRef": { "type": "action_receipt", "id": "ar-1" } },
        "layers": {
            "execution": { "state": "succeeded" },
            "outcome": { "outcomeRef": { "type": "outcome_record", "id": "out-1" } }
        }
    })));
}

fn approved_item(request: &serde_json::Value) -> serde_json::Value {
    let request_digest = request.get("requestDigest").cloned().unwrap_or(json!(null));
    let approval_ref = request.get("approvalRef").cloned().unwrap_or(json!("approval-fs-write-1"));
    let adapter_request_ref = request
        .get("adapterRequestRef")
        .cloned()
        .unwrap_or(json!("fs-write-1"));
    let authority = crate::developer_runtime::jcs::jcs_digest(&json!({
        "decisionRef": "decision-1",
        "approvalRef": approval_ref,
        "requestDigest": request_digest,
        "decision": "approved"
    }))
    .unwrap();
    json!({
        "decisionRef": "decision-1",
        "approvalRef": approval_ref,
        "adapterRequestRef": adapter_request_ref,
        "requestDigest": request_digest,
        "decision": "approved",
        "grantScope": "once",
        "decidedAt": "2026-08-22T12:10:00.000Z",
        "authorityDigest": authority,
        "decisionDigest": crate::developer_runtime::jcs::jcs_digest(&json!({
            "decisionRef": "decision-1",
            "approvalRef": approval_ref,
            "decision": "approved"
        })).unwrap(),
        "authorityGrantRef": {
            "type": "authority_grant",
            "id": "auth-grant-1",
            "version": 1
        }
    })
}

fn rejected_item(request: &serde_json::Value) -> serde_json::Value {
    let request_digest = request.get("requestDigest").cloned().unwrap_or(json!(null));
    let approval_ref = request.get("approvalRef").cloned().unwrap_or(json!("approval-fs-write-1"));
    let adapter_request_ref = request
        .get("adapterRequestRef")
        .cloned()
        .unwrap_or(json!("fs-write-1"));
    let authority = crate::developer_runtime::jcs::jcs_digest(&json!({
        "decisionRef": "decision-2",
        "approvalRef": approval_ref,
        "requestDigest": request_digest,
        "decision": "rejected"
    }))
    .unwrap();
    json!({
        "decisionRef": "decision-2",
        "approvalRef": approval_ref,
        "adapterRequestRef": adapter_request_ref,
        "requestDigest": request_digest,
        "decision": "rejected",
        "decidedAt": "2026-08-22T12:10:00.000Z",
        "authorityDigest": authority,
        "decisionDigest": crate::developer_runtime::jcs::jcs_digest(&json!({
            "decisionRef": "decision-2",
            "approvalRef": approval_ref,
            "decision": "rejected"
        })).unwrap()
    })
}

#[test]
fn permission_blocks_then_resumes_same_prompt() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let scripted = channel.scripted_handle();
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": { "approvalRef": "approval-fs-write-1" } }));
    channel.push_response(json!({ "success": true, "data": { "items": [] } }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.attach_scripted_permission_process();
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    let first = host
        .claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    assert_eq!(first["state"], "awaiting_approval");
    assert!(host.has_pending_vendor());
    let request = host.pending_approval_request().expect("approval request");
    assert_eq!(request["adapterRequestRef"], "fs-write-1");
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 3 } }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "items": [] } }));
    scripted.lock().unwrap().push_back(json!({
        "success": true,
        "data": { "items": [approved_item(&request)] }
    }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": completed_terminal() }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": completed_receipt() }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "items": [] } }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "items": [] } }));
    host.drive_once().unwrap();
    assert!(!host.has_pending_vendor());
    assert_eq!(host.prompt_calls(), 1);
    assert_eq!(host.session_new_count(), 0);
}

#[test]
fn restart_restores_pending_approval_from_journal() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let store = MemorySecureStore::default();
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": { "approvalRef": "approval-fs-write-1" } }));
    channel.push_response(json!({ "success": true, "data": { "items": [] } }));
    let journal = dir.path().join("j.sqlite");
    let mut host = RuntimeHost::for_test(
        journal.clone(),
        store.clone(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.attach_scripted_permission_process();
    host.bootstrap("bootstrap-1", journal.clone()).unwrap();
    host.heartbeat().unwrap();
    let first = host
        .claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    assert_eq!(first["state"], "awaiting_approval");
    host.clear_memory_pending_for_test();
    assert!(!host.has_pending_vendor());
    host.restore_pending_for_test();
    assert!(host.has_pending_vendor());
    let request = host.pending_approval_request().expect("restored request");
    assert_eq!(request["adapterRequestRef"], "fs-write-1");

    let mut source2 = ScriptedBindingSource::new();
    source2.insert("bootstrap-1", sign_projection(&bound));
    let channel2 = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let ops2 = channel2.ops_handle();
    channel2.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel2.push_response(json!({ "success": true, "data": { "items": [] } }));
    channel2.push_response(json!({
        "success": true,
        "data": { "items": [approved_item(&request)] }
    }));
    channel2.push_response(json!({ "success": true, "data": unknown_terminal() }));
    channel2.push_response(json!({ "success": true, "data": { "items": [] } }));
    channel2.push_response(json!({ "success": true, "data": { "items": [] } }));
    let mut restarted = RuntimeHost::for_test(
        journal.clone(),
        store,
        Box::new(source2),
        channel2,
    )
    .unwrap();
    restarted.map_workspace("workspace-1", dir.path().to_path_buf());
    restarted.bootstrap("bootstrap-1", journal).unwrap();
    assert!(restarted.has_pending_vendor());
    restarted.drive_once().unwrap();
    let recorded = ops2.lock().unwrap().clone();
    assert!(recorded.iter().any(|item| item == "GET /approvals"));
    assert_eq!(restarted.prompt_calls(), 0);
}

#[test]
fn session_operation_double_claim_has_zero_process_side_effect() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({
        "success": true,
        "data": {
            "sessionRef": "session-1",
            "operationRef": "op-1",
            "claimedByDeviceRef": "other-device",
            "state": "claimed"
        }
    }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    let op = SessionOperation {
        session_ref: "session-1".into(),
        operation_ref: "op-1".into(),
        session_version: 1,
        workspace_ref: "workspace-1".into(),
        adapter_manifest_ref: "cursor-acp-local-runtime-manifest-1".into(),
        adapter_manifest_version: 1,
        state: "creating".into(),
    };
    assert_eq!(
        host.claim_session_operation(op).unwrap_err().code(),
        "session_claim_cas_rejected"
    );
    assert_eq!(host.session_new_count(), 0);
}

#[test]
fn prompt_done_posts_runtime_observed_terminal_then_receipt() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let ops = channel.ops_handle();
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": completed_terminal() }));
    channel.push_response(json!({ "success": true, "data": completed_receipt() }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    let payload = host
        .claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    assert_eq!(payload["state"], "completed");
    let recorded = ops.lock().unwrap().clone();
    let terminal_at = recorded.iter().position(|item| item == "POST /terminal");
    let receipt_at = recorded
        .iter()
        .position(|item| item == "GET /receipts/action-1");
    assert!(terminal_at.is_some());
    assert!(receipt_at.unwrap() > terminal_at.unwrap());
}

#[test]
fn backend_terminal_reject_stays_unknown() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": false, "error": { "code": "stale_version" } }));
    channel.push_response(json!({ "success": true, "data": unknown_terminal() }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    let payload = host
        .claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    assert_eq!(payload["state"], "unknown_outcome");
}

#[test]
fn restart_does_not_adopt_persisted_session() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let store = MemorySecureStore::default();
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let journal = dir.path().join("j.sqlite");
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let mut host = RuntimeHost::for_test(
        journal.clone(),
        store.clone(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.attach_scripted_process();
    host.bootstrap("bootstrap-1", journal.clone()).unwrap();
    host.persist_maps_for_test().unwrap();
    let first_gen = host.mapped_generation("session-1").unwrap();
    assert!(first_gen > 0);

    let mut source2 = ScriptedBindingSource::new();
    source2.insert("bootstrap-1", sign_projection(&bound));
    let channel2 = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let mut restarted = RuntimeHost::for_test(
        journal.clone(),
        store,
        Box::new(source2),
        channel2,
    )
    .unwrap();
    restarted.map_workspace("workspace-1", dir.path().to_path_buf());
    restarted.bootstrap("bootstrap-1", journal).unwrap();
    restarted.attach_scripted_process();
    assert_ne!(
        restarted.mapped_generation("session-1").unwrap(),
        restarted.session_new_count() as u64
    );
    let offer = offer_for(&bound);
    assert_eq!(
        restarted
            .claim_offer(serde_json::to_value(&offer).unwrap())
            .unwrap_err()
            .code(),
        "session_resume_unverified"
    );
}

#[test]
fn approval_reject_posts_rejected_terminal() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    let ops = channel.ops_handle();
    let scripted = channel.scripted_handle();
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": { "approvalRef": "approval-fs-write-1" } }));
    channel.push_response(json!({ "success": true, "data": { "items": [] } }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.attach_scripted_permission_process();
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    let first = host
        .claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    assert_eq!(first["state"], "awaiting_approval");
    let request = host.pending_approval_request().expect("approval request");
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 3 } }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "items": [] } }));
    scripted.lock().unwrap().push_back(json!({
        "success": true,
        "data": { "items": [rejected_item(&request)] }
    }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": rejected_terminal() }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "items": [] } }));
    scripted.lock().unwrap().push_back(json!({ "success": true, "data": { "items": [] } }));
    host.drive_once().unwrap();
    let recorded = ops.lock().unwrap().clone();
    assert!(recorded.iter().any(|item| item == "POST /terminal"));
    assert!(!host.has_pending_vendor());
}

#[test]
fn lost_claim_response_replays_same_idempotency() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": completed_terminal() }));
    channel.push_response(json!({ "success": true, "data": completed_receipt() }));
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 3 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": completed_terminal() }));
    channel.push_response(json!({ "success": true, "data": completed_receipt() }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    let first = host
        .claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    assert_eq!(first["state"], "completed");
    host.heartbeat().unwrap();
    let replay = host
        .claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    assert_eq!(replay["state"], "completed");
}

#[test]
fn wrong_runtime_owner_is_fail_closed() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({
        "success": true,
        "data": {
            "encoding": "plaintext_base64",
            "plaintextBase64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, "do the work"),
            "sizeBytes": 11,
            "dataKind": "instruction",
            "deliveryRef": "dlev-1",
            "ownerRuntimeRef": { "id": "runtime-other" }
        }
    }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    assert_eq!(
        host.claim_offer(serde_json::to_value(&offer).unwrap())
            .unwrap_err()
            .code(),
        "payload_acl_denied"
    );
}

#[test]
fn local_http_mock_vertical_slice() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let http = ScriptedHttp::default();
    http.push(200, json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    http.push(200, json!({ "success": true, "data": { "items": [creating_session()] } }));
    http.push(200, json!({ "success": true, "data": session_claim_snapshot() }));
    http.push(200, json!({ "success": true, "data": ready_session() }));
    http.push(200, json!({ "success": true, "data": { "items": [serde_json::to_value(&offer).unwrap()] } }));
    http.push(200, json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    http.push(200, json!({ "success": true, "data": plaintext_data() }));
    http.push(200, json!({ "success": true, "data": { "acked": true } }));
    http.push(200, json!({ "success": true, "data": { "approvalRef": "approval-fs-write-1" } }));
    http.push(200, json!({ "success": true, "data": { "items": [] } }));
    let client = HttpsOutboundClient::new(
        Box::new(http.clone()),
        TrustPolicy::default(),
        "https://api.agentrix.top".into(),
        Some("hdr.payload.sig".into()),
    )
    .unwrap();
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let mut host = RuntimeHost::for_http(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        client,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.attach_scripted_permission_process();
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.drive_once().unwrap();
    let request = host.pending_approval_request().expect("approval");
    http.push(200, json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 3 } }));
    http.push(200, json!({
        "success": true,
        "data": {
            "instructionRef": "instruction-1",
            "state": "awaiting_approval"
        }
    }));
    http.push(200, json!({ "success": true, "data": { "items": [approved_item(&request)] } }));
    http.push(200, json!({ "success": true, "data": completed_terminal() }));
    http.push(200, json!({ "success": true, "data": completed_receipt() }));
    http.push(200, json!({ "success": true, "data": { "items": [] } }));
    http.push(200, json!({ "success": true, "data": { "items": [] } }));
    host.drive_once().unwrap();
    let recorded = http.recorded();
    assert!(recorded.iter().any(|item| {
        item.method == "POST"
            && item.url.contains("/api/v1/developer/runtime/session-operations/claims")
    }));
    assert!(recorded.iter().any(|item| {
        item.method == "POST" && item.url.contains("/api/v1/developer/runtime/data/ack")
    }));
    assert!(recorded.iter().any(|item| {
        item.method == "GET"
            && item.url.contains("/api/v1/developer/runtime/approvals")
            && item.url.contains("deviceRef=device-1")
            && item.url.contains("runtimeId=runtime-1")
    }));
    assert!(recorded.iter().any(|item| {
        item.method == "POST" && item.url.contains("/api/v1/developer/runtime/terminal")
    }));
    assert!(recorded.iter().any(|item| {
        item.method == "GET" && item.url.contains("/api/v1/developer/receipts/action-1")
    }));
    let claim = recorded
        .iter()
        .find(|item| item.method == "POST" && item.url.contains("/runtime/claims"))
        .expect("claim");
    assert!(claim.body.as_ref().unwrap().get("offerDigest").is_some());
    assert!(claim
        .body
        .as_ref()
        .unwrap()
        .get("instructionRequestDigest")
        .is_some());
    assert!(claim.headers.iter().any(|(key, value)| {
        key == BODY_DIGEST_HEADER && value.starts_with("sha-256=")
    }));
    assert!(!host.has_pending_vendor());
}

#[test]
fn emergency_cancel_unknown_keeps_inflight() {
    let dir = tempfile::tempdir().unwrap();
    let bound = binding_for(dir.path());
    let offer = offer_for(&bound);
    let mut source = ScriptedBindingSource::new();
    source.insert("bootstrap-1", sign_projection(&bound));
    let channel = crate::developer_runtime::channel::RecordingChannel::new(TrustPolicy::default());
    channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
    channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
    channel.push_response(json!({ "success": true, "data": plaintext_data() }));
    channel.push_response(json!({ "success": true, "data": { "acked": true } }));
    channel.push_response(json!({ "success": true, "data": { "approvalRef": "approval-fs-write-1" } }));
    channel.push_response(json!({ "success": true, "data": { "items": [] } }));
    let mut host = RuntimeHost::for_test(
        dir.path().join("j.sqlite"),
        MemorySecureStore::default(),
        Box::new(source),
        channel,
    )
    .unwrap();
    host.map_workspace("workspace-1", dir.path().to_path_buf());
    host.map_session("session-1", "acp-session-1");
    host.attach_scripted_permission_process();
    host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
        .unwrap();
    host.heartbeat().unwrap();
    host.claim_offer(serde_json::to_value(&offer).unwrap())
        .unwrap();
    let cancelled = host.cancel("instruction-1").unwrap();
    assert_eq!(cancelled["cancelled"], false);
    assert_eq!(cancelled["terminal"], "unknown_outcome");
    assert!(!host.query_inflight().unwrap().is_empty());
}

#[test]
fn handoff_accept_uses_owner_prefix_and_exact_fields() {
    let http = ScriptedHttp::default();
    http.push(
        200,
        json!({
            "success": true,
            "data": {
                "handoffRef": "handoff-1",
                "fromRuntimeId": "runtime-src",
                "toRuntimeId": "runtime-1"
            }
        }),
    );
    let mut client = HttpsOutboundClient::new(
        Box::new(http.clone()),
        TrustPolicy::default(),
        "https://api.agentrix.top".into(),
        Some("hdr.payload.sig".into()),
    )
    .unwrap();
    client
        .connect_outbound("https://api.agentrix.top/api/v1/developer/runtime")
        .unwrap();
    let accepted = client
        .post(
            "/handoffs/handoff-1/accept",
            json!({
                "expectedVersion": 1,
                "handoffDigest": {
                    "algorithm": "sha-256",
                    "canonicalization": "jcs/1",
                    "value": "a".repeat(64)
                },
                "targetRuntimeId": "runtime-1",
                "targetDeviceId": "device-1",
                "bindingVersion": 3,
                "consumerSessionRef": "session-1"
            }),
            "handoff-handoff-1-1",
        )
        .unwrap();
    assert_eq!(accepted["handoffRef"], "handoff-1");
    let post = http.recorded().into_iter().next().unwrap();
    assert!(post.url.contains("/api/v1/developer/handoffs/handoff-1/accept"));
    assert!(!post.url.contains("/runtime/handoffs"));
}
