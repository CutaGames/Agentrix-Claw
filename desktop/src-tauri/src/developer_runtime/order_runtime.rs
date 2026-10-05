//! 桌面 D5 第 2 片（订单合同 v0.11 `ORDER_RUNTIME_ROUTES`，REQ-desktop-032 / REQ-backend-060）：
//! 用这台电脑的运行时凭据替主人备交付草稿。
//!
//! - 只有三条路由：列单、读单（卖方视图）、写草稿。**没有 actions**：交付、退款、取消只在交付台上、
//!   用本人的登录凭据做（第 1 片 `orderDesk.ts`）。这里也没有拼 actions 路径的代码。
//! - 凭据只从钥匙串读（E32 运行时凭据），不经过 WebView；没绑定、凭据过期、急停拉着时什么都不发。
//! - 写草稿是运行时 mutation：PUT 带 `X-Agentrix-Body-Digest: sha-256=<JCS>` 和
//!   `X-Agentrix-Canonicalization: jcs/1`；附件引用 `deliveryRefs` 固定是空数组。
//! - 服务端不记草稿是谁写的（REQ-backend-060）。这里在本机记"本机备过的草稿"：orderId、version、
//!   摘要，不存正文。只有服务端回来的草稿摘要和本机按发出去的正文重算的一致才记；交付台据此提示
//!   "这份是电脑备的，请看过再交付"。本人改过一次，摘要就变了，标记自然不再匹配。
#![allow(dead_code)]

use crate::developer_runtime::crypto::{sha256_hex, SecureStore};
use crate::developer_runtime::enrollment::{server_code, Api, EnrollmentState};
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::jcs::canonicalize_json;
use crate::developer_runtime::types::{KEYRING_CHANNEL_TOKEN, KEYRING_SERVICE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// 和 shared `ORDER_RUNTIME_ROUTES` 一一对应（桌面 vitest 拿 shared 的常量对照这三行）。
pub const ROUTE_LIST: &str = "GET /api/order-escrow/runtime/orders";
pub const ROUTE_GET: &str = "GET /api/order-escrow/runtime/orders/:orderId";
pub const ROUTE_DRAFT: &str = "PUT /api/order-escrow/runtime/orders/:orderId/delivery-draft";

/// shared `ORDER_DELIVERY_ANSWER_MAX_CHARS`（按码点数，和 shared `isText` 的 `[...text].length` 一样）。
pub const ANSWER_MAX_CHARS: usize = 8000;
/// shared `ORDER_ESCROW_SCHEMA_VERSION` / `ORDER_DELIVERY_DIGEST_DOMAIN_V1`。
const ORDER_SCHEMA_VERSION: &str = "agentrix.order.v0";
const DELIVERY_DIGEST_DOMAIN: &str = "AGENTRIX_ORDER_DELIVERY_V1";
/// 本机记录最多留多少张单（新的在前）。
const LEDGER_MAX_ENTRIES: usize = 200;

/// `"GET /path"` → `("GET", "/path")`，`:orderId` 换成校验过的编号。
fn route(template: &str, order_id: Option<&str>) -> RuntimeResult<(&'static str, String)> {
    let (method, path) = template
        .split_once(' ')
        .ok_or_else(|| RuntimeError::fail_closed("order_route_invalid"))?;
    let method: &'static str = match method {
        "GET" => "GET",
        "PUT" => "PUT",
        _ => return Err(RuntimeError::fail_closed("order_route_invalid")),
    };
    let path = match order_id {
        Some(id) => {
            if !valid_order_id(id) {
                return Err(RuntimeError::fail_closed("order_id_invalid"));
            }
            path.replace(":orderId", id)
        }
        None => path.to_string(),
    };
    Ok((method, path))
}

/// 和 `orderDesk.ts` 的 `ORDER_ID` 一样：`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`。
pub fn valid_order_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 128
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

/// 和 shared `isText(answerText, ORDER_DELIVERY_ANSWER_MAX_CHARS)` 一样：不能全是空白，最多 8000 个码点，
/// 不能有 `\t` `\n` `\r` 以外的控制字符。
pub fn validate_answer(answer_text: &str) -> RuntimeResult<()> {
    if answer_text.trim().is_empty() {
        return Err(RuntimeError::fail_closed("answer_empty"));
    }
    if answer_text.chars().count() > ANSWER_MAX_CHARS {
        return Err(RuntimeError::fail_closed("answer_too_long"));
    }
    let forbidden = |c: char| matches!(c, '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' | '\u{7f}');
    if answer_text.chars().any(forbidden) {
        return Err(RuntimeError::fail_closed("answer_invalid_characters"));
    }
    Ok(())
}

/// shared `orderDeliveryDigestV1({ orderId, deliveryRefs: [], answerText })`。
pub fn delivery_digest(order_id: &str, answer_text: &str) -> RuntimeResult<String> {
    let canonical = canonicalize_json(&json!({
        "v": ORDER_SCHEMA_VERSION,
        "orderId": order_id,
        "deliveryRefs": [],
        "answerText": answer_text,
    }))?;
    Ok(format!(
        "sha256:{}",
        sha256_hex(format!("{DELIVERY_DIGEST_DOMAIN}\n{canonical}").as_bytes())
    ))
}

// ── 本机备过的草稿 ──────────────────────────────────────────────────────────

/// 一条"本机备过的草稿"。不含正文。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftMark {
    pub order_id: String,
    /// 写完以后服务端给的 `version`。
    pub version: u64,
    /// `deliveryDraft.digest`（`sha256:<hex>`），和本机重算的一致。
    pub digest: String,
    pub drafted_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LedgerFile {
    schema_version: u32,
    #[serde(default)]
    entries: Vec<DraftMark>,
}

/// 记录放在 app data 目录下，文件 0600。按 API 目标分文件：staging 和生产的订单互不串。
pub struct DraftLedger {
    path: PathBuf,
}

impl DraftLedger {
    pub fn at(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn file_name(target: &str) -> String {
        format!("order_runtime_drafts.{target}.json")
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// 读不到、格式不对都当没有记录：记录只用来提示，不是门（交付前本人要看过）。
    pub fn marks(&self) -> Vec<DraftMark> {
        let Ok(bytes) = std::fs::read(&self.path) else {
            return Vec::new();
        };
        match serde_json::from_slice::<LedgerFile>(&bytes) {
            Ok(file) if file.schema_version == 1 => file
                .entries
                .into_iter()
                .filter(|mark| valid_order_id(&mark.order_id) && is_delivery_digest(&mark.digest))
                .take(LEDGER_MAX_ENTRIES)
                .collect(),
            _ => Vec::new(),
        }
    }

    /// 同一张单只留最新一条，新的在前，最多 `LEDGER_MAX_ENTRIES` 条。
    pub fn record(&self, mark: DraftMark) -> RuntimeResult<()> {
        let mut entries: Vec<DraftMark> = self
            .marks()
            .into_iter()
            .filter(|existing| existing.order_id != mark.order_id)
            .collect();
        entries.insert(0, mark);
        entries.truncate(LEDGER_MAX_ENTRIES);
        let bytes = serde_json::to_vec_pretty(&LedgerFile { schema_version: 1, entries })
            .map_err(|_| RuntimeError::fail_closed("order_draft_ledger_write"))?;
        let dir = self
            .path
            .parent()
            .ok_or_else(|| RuntimeError::fail_closed("order_draft_ledger_write"))?;
        std::fs::create_dir_all(dir).map_err(|_| RuntimeError::fail_closed("order_draft_ledger_write"))?;
        crate::agent_hooks::write_private(&self.path, &bytes, 0o600)
            .map_err(|_| RuntimeError::fail_closed("order_draft_ledger_write"))
    }
}

fn is_delivery_digest(value: &str) -> bool {
    value
        .strip_prefix("sha256:")
        .is_some_and(|hex| hex.len() == 64 && hex.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')))
}

// ── 运行时凭据的三条路由 ────────────────────────────────────────────────────

/// 钥匙串里的运行时凭据。急停拉着时 `kill_switch_engaged`；没绑定或绑定过期是 `not_enrolled`
/// （本人去"这台电脑"重新绑定）；绑定还在、凭据过期或没了是 `runtime_credential_expired`
/// （交付台用本人的登录重做第 4 步，`enrollment::reissue_credential`）。
/// `engaged` 由调用方传进来（Tauri 命令给 `kill_switch::is_engaged()`），这样测试不用碰进程级开关。
fn runtime_bearer(store: &dyn SecureStore, now_ms: i64, engaged: bool) -> RuntimeResult<String> {
    if engaged {
        return Err(RuntimeError::fail_closed("kill_switch_engaged"));
    }
    let state = EnrollmentState::load(store)?.ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let binding_live = state.binding.is_some()
        && state
            .binding_expires_at
            .as_deref()
            .and_then(|at| chrono::DateTime::parse_from_rfc3339(at).ok())
            .is_some_and(|at| at.timestamp_millis() > now_ms);
    if !binding_live {
        return Err(RuntimeError::unavailable("not_enrolled"));
    }
    let token = store
        .get_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN)?
        .filter(|token| !token.is_empty());
    match token {
        Some(token) if state.is_enrolled(now_ms) => Ok(token),
        _ => Err(RuntimeError::unavailable("runtime_credential_expired")),
    }
}

/// 服务端拒绝：401 统一成 `runtime_credential_rejected`（服务端码放 message），503 是订单总开关关着，
/// 其余用服务端的错误码（`order_not_found`、`action_not_allowed_in_status`、`order_version_conflict`、
/// `order_invalid`、`rate_limited` …），没有就 `http_<status>`。
fn rejection(status: u16, body: &Value) -> RuntimeError {
    let code = server_code(body);
    match status {
        401 => RuntimeError::unavailable("runtime_credential_rejected")
            .with_message(code.unwrap_or_else(|| "http_401".into())),
        503 => RuntimeError::unavailable("orders_unavailable"),
        _ => RuntimeError::fail_closed(&code.unwrap_or_else(|| format!("http_{status}"))),
    }
}

/// 2xx `{ success: true, data: {…} }` → data。
fn expect_data(status: u16, body: Value) -> RuntimeResult<Value> {
    if !(200..300).contains(&status) {
        return Err(rejection(status, &body));
    }
    if body.get("success") != Some(&json!(true)) {
        return Err(RuntimeError::fail_closed("invalid_response"));
    }
    body.get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| RuntimeError::fail_closed("invalid_response"))
}

/// 卖方视图的最低要求：编号对得上、`version` ≥ 1、有 `status`。其余由 WebView 用 shared 的解码器解。
fn seller_view(data: Value, order_id: Option<&str>) -> RuntimeResult<Value> {
    let id = data.get("orderId").and_then(Value::as_str).unwrap_or_default();
    let ok = valid_order_id(id)
        && order_id.map_or(true, |expected| expected == id)
        && data.get("version").and_then(Value::as_u64).is_some_and(|v| v >= 1)
        && data.get("status").and_then(Value::as_str).is_some();
    if ok {
        Ok(data)
    } else {
        Err(RuntimeError::fail_closed("invalid_response"))
    }
}

/// `GET runtime/orders`：凭据绑定的那只 Agent 的单（卖方视图，最多 50 条，新的在前）。
pub fn list_orders(api: &Api<'_>, store: &dyn SecureStore, now_ms: i64, engaged: bool) -> RuntimeResult<Vec<Value>> {
    let bearer = runtime_bearer(store, now_ms, engaged)?;
    let (method, path) = route(ROUTE_LIST, None)?;
    let (status, body) = api.send(method, &path, &bearer, None)?;
    let data = expect_data(status, body)?;
    let items = data
        .get("items")
        .and_then(Value::as_array)
        .filter(|items| items.len() <= 50)
        .ok_or_else(|| RuntimeError::fail_closed("invalid_response"))?;
    items.iter().cloned().map(|item| seller_view(item, None)).collect()
}

/// `GET runtime/orders/:orderId`：一张单（卖方视图）。别人的单服务端给 404，和查无此单一样。
pub fn get_order(api: &Api<'_>, store: &dyn SecureStore, order_id: &str, now_ms: i64, engaged: bool) -> RuntimeResult<Value> {
    let (method, path) = route(ROUTE_GET, Some(order_id))?;
    let bearer = runtime_bearer(store, now_ms, engaged)?;
    let (status, body) = api.send(method, &path, &bearer, None)?;
    seller_view(expect_data(status, body)?, Some(order_id))
}

pub struct DraftInput<'a> {
    pub order_id: &'a str,
    /// 读单拿到的 `version`。
    pub expected_version: u64,
    pub answer_text: &'a str,
}

/// 写草稿的结果：服务端的卖方视图，以及这次有没有记进"本机备过的草稿"。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftOutcome {
    pub order: Value,
    pub marked: bool,
}

/// `PUT runtime/orders/:orderId/delivery-draft`。409（状态不对、版本变了）不重试，由交付台重新读单。
/// 服务端回来的草稿必须就是发出去的这份（正文相同、摘要和本机重算的一致），否则报
/// `draft_digest_mismatch`、不记本机记录。服务端已经收下但本机记录写不进去时，照样返回视图，
/// `marked: false`（记录只是提示，交付前本人还要看过）。
pub fn put_draft(
    api: &Api<'_>,
    store: &dyn SecureStore,
    ledger: &DraftLedger,
    input: &DraftInput<'_>,
    now_ms: i64,
    now: &str,
    engaged: bool,
) -> RuntimeResult<DraftOutcome> {
    let (method, path) = route(ROUTE_DRAFT, Some(input.order_id))?;
    validate_answer(input.answer_text)?;
    if input.expected_version < 1 {
        return Err(RuntimeError::fail_closed("expected_version_invalid"));
    }
    let bearer = runtime_bearer(store, now_ms, engaged)?;
    let expected_digest = delivery_digest(input.order_id, input.answer_text)?;
    let body = json!({
        "expectedVersion": input.expected_version,
        "answerText": input.answer_text,
        "deliveryRefs": [],
    });
    let (status, response) = api.send_signed(method, &path, &bearer, body, None)?;
    let order = seller_view(expect_data(status, response)?, Some(input.order_id))?;
    let stored_text = order.pointer("/deliveryDraft/answerText").and_then(Value::as_str);
    let stored_digest = order.pointer("/deliveryDraft/digest").and_then(Value::as_str);
    let stored_refs_empty = order
        .pointer("/deliveryDraft/deliveryRefs")
        .and_then(Value::as_array)
        .is_some_and(|refs| refs.is_empty());
    if stored_text != Some(input.answer_text) || stored_digest != Some(expected_digest.as_str()) || !stored_refs_empty {
        return Err(RuntimeError::fail_closed("draft_digest_mismatch"));
    }
    let version = order.get("version").and_then(Value::as_u64).unwrap_or_default();
    if version <= input.expected_version {
        return Err(RuntimeError::fail_closed("invalid_response"));
    }
    let marked = ledger
        .record(DraftMark {
            order_id: input.order_id.to_string(),
            version,
            digest: expected_digest,
            drafted_at: now.to_string(),
        })
        .is_ok();
    Ok(DraftOutcome { order, marked })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::channel::{OutboundHttpRequest, ScriptedHttp};
    use crate::developer_runtime::crypto::MemorySecureStore;
    use crate::developer_runtime::enrollment::KEYRING_ENROLLMENT_STATE;
    use crate::developer_runtime::jcs::jcs_digest;
    use crate::developer_runtime::policy::TrustPolicy;

    const ORIGIN: &str = "https://api.agentrix.top";
    const ORDER: &str = "ord_1";
    const NOW: &str = "2026-09-29T05:00:00.000Z";
    const RUNTIME_TOKEN: &str = "eyJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJkZXZlbG9wZXJfcnVudGltZSJ9.cnVudGltZQ";
    /// Same vector as `desktop/src/test/orderRuntimeDraft.test.ts` (shared `orderDeliveryDigestV1`).
    const VECTOR_TEXT: &str = "你好，这是回答。\n第二行";
    const VECTOR_DIGEST: &str = "sha256:3de727358d84bd8998a7259fad42747db90a7f265102a7a23cf324cef5e91944";

    fn now_ms() -> i64 {
        chrono::DateTime::parse_from_rfc3339(NOW).unwrap().timestamp_millis()
    }

    struct Fixture {
        http: ScriptedHttp,
        store: MemorySecureStore,
        policy: TrustPolicy,
        _dir: tempfile::TempDir,
        ledger: DraftLedger,
    }

    impl Fixture {
        fn api(&self) -> Api<'_> {
            Api { transport: &self.http, origin: ORIGIN, policy: &self.policy }
        }
        fn put(&self, order_id: &str, version: u64, text: &str, engaged: bool) -> RuntimeResult<DraftOutcome> {
            put_draft(
                &self.api(),
                &self.store,
                &self.ledger,
                &DraftInput { order_id, expected_version: version, answer_text: text },
                now_ms(),
                NOW,
                engaged,
            )
        }
    }

    fn enrolled(credential_expires_at: &str) -> Fixture {
        let store = MemorySecureStore::default();
        let state = json!({
            "deviceId": "dev_0123456789abcdef0123456789abcdef",
            "paired": true,
            "signerRef": "dsc_1",
            "binding": { "type": "shell_session_binding", "id": "0f1e2d3c-4b5a-4968-8776-655443322110", "version": 1 },
            "bindingExpiresAt": "2026-09-30T05:00:00.000Z",
            "credentialRef": format!("drc_{}", "a".repeat(32)),
            "credentialExpiresAt": credential_expires_at,
        });
        store.set_text(KEYRING_SERVICE, KEYRING_ENROLLMENT_STATE, &state.to_string()).unwrap();
        store.set_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN, RUNTIME_TOKEN).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let ledger = DraftLedger::at(dir.path().join("developer_runtime").join(DraftLedger::file_name("production")));
        Fixture { http: ScriptedHttp::default(), store, policy: TrustPolicy::default(), _dir: dir, ledger }
    }

    fn fixture() -> Fixture {
        enrolled("2026-09-29T05:30:00.000Z")
    }

    fn view(order_id: &str, version: u64, status: &str, draft: Option<(&str, &str)>) -> Value {
        let draft = draft.map(|(text, digest)| json!({ "answerText": text, "deliveryRefs": [], "digest": digest }));
        json!({ "success": true, "data": {
            "orderId": order_id, "version": version, "status": status, "kind": "paid_question",
            "buyerNote": "请问怎么开始？", "deliveryDraft": draft
        }})
    }

    fn header<'r>(request: &'r OutboundHttpRequest, name: &str) -> Option<&'r str> {
        request.headers.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }

    #[test]
    fn only_the_three_v0_11_routes_exist_and_none_of_them_is_an_action() {
        assert_eq!(ROUTE_LIST, "GET /api/order-escrow/runtime/orders");
        assert_eq!(ROUTE_GET, "GET /api/order-escrow/runtime/orders/:orderId");
        assert_eq!(ROUTE_DRAFT, "PUT /api/order-escrow/runtime/orders/:orderId/delivery-draft");
        let source = include_str!("order_runtime.rs");
        // No action path is ever built here: deliver / refund / cancel are the owner's sign-in.
        assert!(!source.contains(concat!("/", "actions")));
        // (The needles are split so this test's own text does not match them.)
        assert!(!source.contains(concat!("\"deli", "ver\"")));
        assert!(!source.contains(concat!("reviewed", "DeliveryDigest")));
        assert!(!source.contains(concat!("\"PO", "ST\"")));
    }

    #[test]
    fn digest_matches_the_shared_vector() {
        assert_eq!(delivery_digest(ORDER, VECTOR_TEXT).unwrap(), VECTOR_DIGEST);
    }

    #[test]
    fn put_draft_sends_a_signed_put_with_the_runtime_credential_and_marks_it() {
        let f = fixture();
        f.http.push(200, view(ORDER, 4, "paid", Some((VECTOR_TEXT, VECTOR_DIGEST))));
        let outcome = f.put(ORDER, 3, VECTOR_TEXT, false).unwrap();
        assert!(outcome.marked);
        assert_eq!(outcome.order["version"], json!(4));

        let requests = f.http.recorded();
        assert_eq!(requests.len(), 1);
        let request = &requests[0];
        assert_eq!(request.method, "PUT");
        assert_eq!(request.url, format!("{ORIGIN}/api/order-escrow/runtime/orders/{ORDER}/delivery-draft"));
        assert_eq!(header(request, "Authorization"), Some(format!("Bearer {RUNTIME_TOKEN}").as_str()));
        let body = request.body.clone().unwrap();
        assert_eq!(body, json!({ "expectedVersion": 3, "answerText": VECTOR_TEXT, "deliveryRefs": [] }));
        let digest = jcs_digest(&body).unwrap();
        assert_eq!(header(request, "X-Agentrix-Body-Digest"), Some(format!("sha-256={}", digest.value).as_str()));
        assert_eq!(header(request, "X-Agentrix-Canonicalization"), Some("jcs/1"));

        let marks = f.ledger.marks();
        assert_eq!(marks, vec![DraftMark { order_id: ORDER.into(), version: 4, digest: VECTOR_DIGEST.into(), drafted_at: NOW.into() }]);
        let text = std::fs::read_to_string(f.ledger.path()).unwrap();
        assert!(!text.contains("你好"), "the ledger never keeps the answer text");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(f.ledger.path()).unwrap().permissions().mode() & 0o777, 0o600);
        }
    }

    #[test]
    fn nothing_is_sent_under_the_emergency_stop_without_a_live_credential_or_with_bad_input() {
        let f = fixture();
        let code = |result: RuntimeResult<DraftOutcome>| result.unwrap_err().reason_code;
        assert_eq!(code(f.put(ORDER, 3, "ok", true)), "kill_switch_engaged");
        assert_eq!(get_order(&f.api(), &f.store, ORDER, now_ms(), true).unwrap_err().reason_code, "kill_switch_engaged");
        assert_eq!(list_orders(&f.api(), &f.store, now_ms(), true).unwrap_err().reason_code, "kill_switch_engaged");
        assert_eq!(code(f.put("../ord_1", 3, "ok", false)), "order_id_invalid");
        assert_eq!(code(f.put("ord_1/x", 3, "ok", false)), "order_id_invalid");
        assert_eq!(code(f.put("ord_1?as=buyer", 3, "ok", false)), "order_id_invalid");
        assert_eq!(code(f.put("", 3, "ok", false)), "order_id_invalid");
        assert_eq!(code(f.put(ORDER, 3, " \n\t ", false)), "answer_empty");
        assert_eq!(code(f.put(ORDER, 3, &"字".repeat(ANSWER_MAX_CHARS + 1), false)), "answer_too_long");
        assert_eq!(code(f.put(ORDER, 3, "bell\u{7}", false)), "answer_invalid_characters");
        assert_eq!(code(f.put(ORDER, 0, "ok", false)), "expected_version_invalid");
        assert!(f.http.recorded().is_empty());

        // Binding live, credential expired or missing: renewable with the owner's sign-in.
        let expired = enrolled("2026-09-29T04:59:59.000Z");
        assert_eq!(code(expired.put(ORDER, 3, "ok", false)), "runtime_credential_expired");
        let empty = enrolled("2026-09-29T05:30:00.000Z");
        empty.store.delete(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN).unwrap();
        assert_eq!(code(empty.put(ORDER, 3, "ok", false)), "runtime_credential_expired");
        // No binding at all, or the binding itself expired: bind again from "这台电脑".
        let never = enrolled("2026-09-29T05:30:00.000Z");
        never.store.delete(KEYRING_SERVICE, KEYRING_ENROLLMENT_STATE).unwrap();
        assert_eq!(code(never.put(ORDER, 3, "ok", false)), "not_enrolled");
        let stale = enrolled("2026-09-29T05:30:00.000Z");
        let late = chrono::DateTime::parse_from_rfc3339("2026-09-30T05:00:01.000Z").unwrap().timestamp_millis();
        assert_eq!(get_order(&stale.api(), &stale.store, ORDER, late, false).unwrap_err().reason_code, "not_enrolled");
        for fixture in [&expired, &empty, &never, &stale] {
            assert!(fixture.http.recorded().is_empty());
        }
    }

    #[test]
    fn answer_length_counts_code_points_like_shared() {
        assert!(validate_answer(&"😀".repeat(ANSWER_MAX_CHARS)).is_ok());
        assert!(validate_answer(&"😀".repeat(ANSWER_MAX_CHARS + 1)).is_err());
        assert!(validate_answer("第一行\n第二行\t\r").is_ok());
    }

    #[test]
    fn server_refusals_keep_their_codes_are_not_retried_and_leave_no_mark() {
        let cases = [
            (409, json!({ "code": "action_not_allowed_in_status" }), "action_not_allowed_in_status"),
            (409, json!({ "code": "order_version_conflict" }), "order_version_conflict"),
            (404, json!({ "code": "order_not_found" }), "order_not_found"),
            (400, json!({ "code": "order_invalid" }), "order_invalid"),
            (401, json!({ "code": "DEVELOPER_RUNTIME_CREDENTIAL_REQUIRED" }), "runtime_credential_rejected"),
            (503, json!({ "code": "orders_unavailable" }), "orders_unavailable"),
            (500, Value::Null, "http_500"),
        ];
        for (status, body, expected) in cases {
            let f = fixture();
            f.http.push(status, body);
            let error = f.put(ORDER, 3, "回答", false).unwrap_err();
            assert_eq!(error.reason_code, expected, "status {status}");
            assert_eq!(f.http.recorded().len(), 1, "no retry for {status}");
            assert!(f.ledger.marks().is_empty());
        }
        let f = fixture();
        f.http.push(401, json!({ "code": "DEVELOPER_RUNTIME_CREDENTIAL_REQUIRED" }));
        assert_eq!(f.put(ORDER, 3, "回答", false).unwrap_err().message, "DEVELOPER_RUNTIME_CREDENTIAL_REQUIRED");
    }

    #[test]
    fn a_draft_that_is_not_what_we_sent_is_not_marked() {
        let digest = delivery_digest(ORDER, "别的内容").unwrap();
        let replies = [
            view(ORDER, 4, "paid", Some(("别的内容", digest.as_str()))),
            view(ORDER, 4, "paid", Some((VECTOR_TEXT, digest.as_str()))),
            view(ORDER, 4, "paid", None),
            view(ORDER, 3, "paid", Some((VECTOR_TEXT, VECTOR_DIGEST))),
            view("ord_2", 4, "paid", Some((VECTOR_TEXT, VECTOR_DIGEST))),
            json!({ "success": true, "data": { "orderId": ORDER, "version": 4, "status": "paid",
                "deliveryDraft": { "answerText": VECTOR_TEXT, "deliveryRefs": ["file_1"], "digest": VECTOR_DIGEST } } }),
            json!({ "success": false }),
            json!("<html>"),
        ];
        let expected = [
            "draft_digest_mismatch",
            "draft_digest_mismatch",
            "draft_digest_mismatch",
            "invalid_response",
            "invalid_response",
            "draft_digest_mismatch",
            "invalid_response",
            "invalid_response",
        ];
        for (reply, code) in replies.into_iter().zip(expected) {
            let f = fixture();
            f.http.push(200, reply.clone());
            assert_eq!(f.put(ORDER, 3, VECTOR_TEXT, false).unwrap_err().reason_code, code, "{reply}");
            assert!(f.ledger.marks().is_empty());
        }
    }

    #[test]
    fn list_and_get_are_plain_gets_with_the_runtime_credential() {
        let f = fixture();
        f.http.push(200, json!({ "success": true, "data": { "items": [
            view(ORDER, 3, "paid", None)["data"].clone(),
            view("ord_2", 1, "awaiting_payment", None)["data"].clone(),
        ] } }));
        f.http.push(200, view(ORDER, 3, "paid", None));
        f.http.push(200, view("ord_2", 3, "paid", None));
        let items = list_orders(&f.api(), &f.store, now_ms(), false).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(get_order(&f.api(), &f.store, ORDER, now_ms(), false).unwrap()["orderId"], json!(ORDER));
        assert_eq!(get_order(&f.api(), &f.store, ORDER, now_ms(), false).unwrap_err().reason_code, "invalid_response");
        let requests = f.http.recorded();
        assert_eq!(requests[0].url, format!("{ORIGIN}/api/order-escrow/runtime/orders"));
        assert_eq!(requests[1].url, format!("{ORIGIN}/api/order-escrow/runtime/orders/{ORDER}"));
        for request in &requests {
            assert_eq!(request.method, "GET");
            assert!(request.body.is_none());
            assert_eq!(header(request, "Authorization"), Some(format!("Bearer {RUNTIME_TOKEN}").as_str()));
            assert_eq!(header(request, "X-Agentrix-Body-Digest"), None);
        }

        let too_many: Vec<Value> = (0..51).map(|i| view(&format!("ord_{i}"), 1, "paid", None)["data"].clone()).collect();
        f.http.push(200, json!({ "success": true, "data": { "items": too_many } }));
        assert_eq!(list_orders(&f.api(), &f.store, now_ms(), false).unwrap_err().reason_code, "invalid_response");
        f.http.push(503, json!({ "code": "orders_unavailable" }));
        assert_eq!(list_orders(&f.api(), &f.store, now_ms(), false).unwrap_err().reason_code, "orders_unavailable");
    }

    #[test]
    fn the_ledger_keeps_the_latest_mark_per_order_and_ignores_garbage() {
        let f = fixture();
        let mark = |order: &str, version: u64| DraftMark {
            order_id: order.into(),
            version,
            digest: VECTOR_DIGEST.into(),
            drafted_at: NOW.into(),
        };
        f.ledger.record(mark(ORDER, 2)).unwrap();
        f.ledger.record(mark(ORDER, 4)).unwrap();
        assert_eq!(f.ledger.marks(), vec![mark(ORDER, 4)]);
        for i in 0..(LEDGER_MAX_ENTRIES + 5) {
            f.ledger.record(mark(&format!("ord_{i}"), 1)).unwrap();
        }
        let marks = f.ledger.marks();
        assert_eq!(marks.len(), LEDGER_MAX_ENTRIES);
        assert_eq!(marks[0].order_id, format!("ord_{}", LEDGER_MAX_ENTRIES + 4));

        std::fs::write(f.ledger.path(), b"{not json").unwrap();
        assert!(f.ledger.marks().is_empty());
        std::fs::write(
            f.ledger.path(),
            json!({ "schemaVersion": 1, "entries": [
                { "orderId": "../x", "version": 1, "digest": VECTOR_DIGEST, "draftedAt": NOW },
                { "orderId": ORDER, "version": 1, "digest": "sha256:XYZ", "draftedAt": NOW },
                { "orderId": ORDER, "version": 1, "digest": VECTOR_DIGEST, "draftedAt": NOW }
            ] })
            .to_string(),
        )
        .unwrap();
        assert_eq!(f.ledger.marks(), vec![mark(ORDER, 1)]);
        assert!(DraftLedger::at(f._dir.path().join("missing.json")).marks().is_empty());
        assert_ne!(DraftLedger::file_name("staging"), DraftLedger::file_name("production"));
    }
}
