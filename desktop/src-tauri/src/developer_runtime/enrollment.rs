//! E32 桌面发起绑定（REQ-desktop-018，合同 `shared/types/device-runtime-binding.ts`）：
//! 配对 → 登记签名凭据 → 建桌面绑定 → 签发运行时凭据，以及之后的刷新。
//!
//! - 用户 JWT 只在 `enroll` 这一次调用里用，不保存、不写日志；之后刷新只用运行时凭据和设备签名。
//! - 设备私钥、DST、运行时凭据只进钥匙串（`SecureStore`）；进度（设备 id、签名凭据、绑定、
//!   凭据的 ref 和到期时间，不含 token）也存钥匙串，方便中途失败后续做，不重复建绑定。
//! - 每个会产生新记录的请求（配对、登记、建绑定、签发），`requestId` 先写进进度再发请求：
//!   重试时服务端按 `requestId` 返回同一份，不会多出一份有效绑定（多份绑定会让远程执行找不到
//!   唯一绑定，fail closed）。
//! - HTTP 走 `HttpTransport`（生产是只允许 https 的 reqwest，测试是 `ScriptedHttp`），
//!   URL 先过 `TrustPolicy` 的主机白名单。
//!
//! 默认关：还没有 Tauri 命令调用这里（下一片接界面和在线登记）。
#![allow(dead_code)]

use crate::developer_runtime::channel::{HttpTransport, OutboundHttpRequest};
use crate::developer_runtime::crypto::SecureStore;
use crate::developer_runtime::device_identity::{
    DeviceIdentity, DesktopBindingRequest, ShellBindingRef,
};
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::policy::TrustPolicy;
use crate::developer_runtime::types::{KEYRING_CHANNEL_TOKEN, KEYRING_SERVICE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

pub const KEYRING_ENROLLMENT_STATE: &str = "enrollment_v1";
pub const KEYRING_DEVICE_DST: &str = "device_dst_v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// 进度（不含任何 token 或私钥）。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrollmentState {
    pub device_id: String,
    #[serde(default)]
    pub paired: bool,
    #[serde(default)]
    pub pair_request_id: Option<String>,
    #[serde(default)]
    pub register_request_id: Option<String>,
    #[serde(default)]
    pub signer_ref: Option<String>,
    #[serde(default)]
    pub binding_request_id: Option<String>,
    #[serde(default)]
    pub binding: Option<ShellBindingRef>,
    #[serde(default)]
    pub binding_expires_at: Option<String>,
    #[serde(default)]
    pub credential_request_id: Option<String>,
    #[serde(default)]
    pub credential_ref: Option<String>,
    #[serde(default)]
    pub credential_expires_at: Option<String>,
    #[serde(default)]
    pub credential_refresh_after: Option<String>,
}

impl EnrollmentState {
    pub fn load(store: &dyn SecureStore) -> RuntimeResult<Option<Self>> {
        match store.get_text(KEYRING_SERVICE, KEYRING_ENROLLMENT_STATE)? {
            None => Ok(None),
            Some(text) => serde_json::from_str(&text)
                .map(Some)
                .map_err(|_| RuntimeError::fail_closed("enrollment_state_corrupt")),
        }
    }

    fn save(&self, store: &dyn SecureStore) -> RuntimeResult<()> {
        let text = serde_json::to_string(self).map_err(|_| RuntimeError::fail_closed("enrollment_state_corrupt"))?;
        store.set_text(KEYRING_SERVICE, KEYRING_ENROLLMENT_STATE, &text)
    }

    /// 绑定和凭据都在、凭据还没过期。
    pub fn is_enrolled(&self, now_ms: i64) -> bool {
        self.binding.is_some()
            && self.credential_ref.is_some()
            && self
                .credential_expires_at
                .as_deref()
                .and_then(parse_ms)
                .map(|at| at > now_ms)
                .unwrap_or(false)
    }
}

/// 第一次绑定要的输入。`user_jwt` 由 WebView 在本人点"绑定这台电脑"时交一次。
pub struct EnrollmentInput<'a> {
    pub user_jwt: &'a str,
    /// 本人的主 Agent（UUID）。
    pub agent_account_id: &'a str,
    /// 电脑名（用户可改），1–64 个可见字符。
    pub label: &'a str,
    pub runtime_id: &'a str,
    /// 绑定有效期（秒），省略用服务端默认。
    pub binding_ttl_seconds: Option<u32>,
}

pub struct Api<'a> {
    pub transport: &'a dyn HttpTransport,
    pub origin: &'a str,
    pub policy: &'a TrustPolicy,
}

/// 服务端拒绝时带回的错误码（错误合同 v1 的 `code`，或运行时信封的 `error.code`）。
pub fn server_code(body: &Value) -> Option<String> {
    let code = body
        .get("code")
        .or_else(|| body.get("error").and_then(|error| error.get("code")))
        .and_then(Value::as_str)?;
    let ok = !code.is_empty()
        && code.len() <= 64
        && code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_');
    ok.then(|| code.to_string())
}

impl<'a> Api<'a> {
    fn call(&self, method: &str, path: &str, bearer: &str, body: Option<Value>) -> RuntimeResult<(u16, Value)> {
        self.call_with(method, path, bearer, body, &[])
    }

    /// Runtime routes (`/api/v1/developer/runtime/*`) are signed mutations: the
    /// body's JCS digest goes in `X-Agentrix-Body-Digest`, like the channel client.
    fn call_runtime(&self, path: &str, bearer: &str, body: Value, idempotency_key: Option<&str>) -> RuntimeResult<(u16, Value)> {
        self.send_signed("POST", path, bearer, body, idempotency_key)
    }

    /// A plain call (no body digest), for other modules on the same origin and allowlist.
    pub(crate) fn send(&self, method: &str, path: &str, bearer: &str, body: Option<Value>) -> RuntimeResult<(u16, Value)> {
        self.call_with(method, path, bearer, body, &[])
    }

    /// A runtime mutation with any method: `X-Agentrix-Body-Digest: sha-256=<JCS>` and
    /// `X-Agentrix-Canonicalization: jcs/1` (the order runtime draft is a PUT).
    pub(crate) fn send_signed(
        &self,
        method: &str,
        path: &str,
        bearer: &str,
        body: Value,
        idempotency_key: Option<&str>,
    ) -> RuntimeResult<(u16, Value)> {
        let digest = crate::developer_runtime::jcs::jcs_digest(&body)?;
        let mut headers = vec![
            (
                crate::developer_runtime::types::BODY_DIGEST_HEADER.to_string(),
                format!("sha-256={}", digest.value),
            ),
            (crate::developer_runtime::types::CANONICALIZATION_HEADER.to_string(), "jcs/1".to_string()),
        ];
        if let Some(key) = idempotency_key {
            headers.push(("Idempotency-Key".to_string(), key.to_string()));
        }
        self.call_with(method, path, bearer, Some(body), &headers)
    }

    fn call_with(
        &self,
        method: &str,
        path: &str,
        bearer: &str,
        body: Option<Value>,
        extra_headers: &[(String, String)],
    ) -> RuntimeResult<(u16, Value)> {
        let url = format!("{}{}", self.origin, path);
        self.policy.validate_outbound_url(&url)?;
        if bearer.is_empty() || bearer.contains(char::is_whitespace) {
            return Err(RuntimeError::fail_closed("enrollment_credential_missing"));
        }
        let mut headers = vec![
            ("Accept".to_string(), "application/json".to_string()),
            ("Authorization".to_string(), format!("Bearer {bearer}")),
        ];
        if body.is_some() {
            headers.push(("Content-Type".into(), "application/json".into()));
        }
        headers.extend(extra_headers.iter().cloned());
        let response = self.transport.send(OutboundHttpRequest {
            method: method.into(),
            url,
            headers,
            body,
            timeout: REQUEST_TIMEOUT,
        })?;
        Ok((response.status, response.body))
    }

    /// 2xx 返回响应体；否则按步骤报错，服务端错误码放进 message（界面用）。
    fn expect_ok(&self, step: &'static str, result: (u16, Value)) -> RuntimeResult<Value> {
        let (status, body) = result;
        if (200..300).contains(&status) {
            return Ok(body);
        }
        let detail = server_code(&body).unwrap_or_else(|| format!("http_{status}"));
        Err(RuntimeError::fail_closed(step).with_message(detail))
    }
}

fn parse_ms(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value).ok().map(|t| t.timestamp_millis())
}

fn new_request_id(prefix: &str) -> String {
    let bytes: [u8; 12] = rand::random();
    format!("{prefix}-{}", hex::encode(bytes))
}

/// `{ success: true, data }` → `data`。
fn success_data(body: Value) -> RuntimeResult<Value> {
    if body.get("success") != Some(&json!(true)) {
        return Err(RuntimeError::fail_closed("enrollment_unexpected_response"));
    }
    body.get("data")
        .cloned()
        .filter(|data| data.is_object())
        .ok_or_else(|| RuntimeError::fail_closed("enrollment_unexpected_response"))
}

fn str_field<'v>(value: &'v Value, pointer: &str) -> RuntimeResult<&'v str> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::fail_closed("enrollment_unexpected_response"))
}

/// `DeviceEpochFenceV1`，由 `GET /api/v1/devices` 里这台设备的四个版本号拼出来。
fn device_fence(device: &Value, device_id: &str, now: &str) -> RuntimeResult<Value> {
    let field = |name: &str| -> RuntimeResult<String> {
        let text = device
            .get(name)
            .and_then(Value::as_str)
            .ok_or_else(|| RuntimeError::fail_closed("enrollment_unexpected_response"))?;
        if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
            return Err(RuntimeError::fail_closed("enrollment_unexpected_response"));
        }
        Ok(text.to_string())
    };
    Ok(json!({
        "schemaVersion": 1,
        "target": { "kind": "device_registry", "deviceId": device_id },
        "deviceRevocationEpoch": field("device_revocation_epoch")?,
        "credentialRevocationEpoch": field("credential_revocation_epoch")?,
        "optimisticVersion": field("optimistic_version")?,
        "credentialVersion": field("credential_version")?,
        "capturedAt": now,
    }))
}

/// 第 1 步：配对。已经配过（409，同一个主人）就当配好了，由第 2 步的设备列表确认归属。
fn pair(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    state: &mut EnrollmentState,
    jwt: &str,
    label: &str,
) -> RuntimeResult<()> {
    if state.paired {
        return Ok(());
    }
    let request_id = match &state.pair_request_id {
        Some(id) => id.clone(),
        None => {
            let id = new_request_id("desktop-pair");
            state.pair_request_id = Some(id.clone());
            state.save(store)?;
            id
        }
    };
    let ticket_body = api.expect_ok(
        "enroll_pair_ticket_rejected",
        api.call("POST", "/api/v1/devices/pair/ticket", jwt, Some(json!({})))?,
    )?;
    let ticket = str_field(&ticket_body, "/ticket")?.to_string();
    let proof = identity.pairing_proof(&ticket)?;
    let (status, body) = api.call(
        "POST",
        "/api/v1/devices/pair",
        jwt,
        Some(json!({
            "ticket": ticket,
            "device_id": identity.device_id(),
            "device_class": "desktop",
            "label": label,
            "request_id": request_id,
            "proof": proof,
        })),
    )?;
    if status == 409 {
        // Already registered to this owner (a lost progress record, or a replayed request).
        state.paired = true;
        state.save(store)?;
        return Ok(());
    }
    let body = api.expect_ok("enroll_pair_rejected", (status, body))?;
    if str_field(&body, "/device/device_id")? != identity.device_id() {
        return Err(RuntimeError::fail_closed("enroll_pair_device_mismatch"));
    }
    if let Some(dst) = body.get("dst").and_then(Value::as_str).filter(|dst| !dst.is_empty()) {
        store.set_text(KEYRING_SERVICE, KEYRING_DEVICE_DST, dst)?;
    }
    state.paired = true;
    state.save(store)
}

/// 这台设备在主人的设备列表里的那一行。找不到 = 不是这个主人的，或者已经解绑。
fn own_device(api: &Api<'_>, identity: &DeviceIdentity, jwt: &str) -> RuntimeResult<Value> {
    let body = api.expect_ok("enroll_devices_rejected", api.call("GET", "/api/v1/devices", jwt, None)?)?;
    body.get("items")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("device_id").and_then(Value::as_str) == Some(identity.device_id()))
        })
        .cloned()
        .ok_or_else(|| RuntimeError::fail_closed("enroll_device_not_owned"))
}

/// 第 2 步：用同一把 K 登记 `device-auth` 签名凭据（带持有证明）。已经有一份有效的：
/// 读回来，公钥指纹必须是这把 K，否则拒绝（不接受别的钥匙登记的凭据）。
fn register_signer(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    state: &mut EnrollmentState,
    jwt: &str,
    device: &Value,
    now: &str,
) -> RuntimeResult<String> {
    if let Some(signer) = &state.signer_ref {
        return Ok(signer.clone());
    }
    let request_id = match &state.register_request_id {
        Some(id) => id.clone(),
        None => {
            let id = new_request_id("desktop-register");
            state.register_request_id = Some(id.clone());
            state.save(store)?;
            id
        }
    };
    let device_id = identity.device_id();
    let proof = identity.signing_credential_register_proof(&request_id)?;
    let (status, body) = api.call(
        "POST",
        &format!("/api/v1/devices/{device_id}/signing-credentials/register"),
        jwt,
        Some(json!({
            "schemaVersion": 1,
            "requestId": request_id,
            "expectedDeviceFence": device_fence(device, device_id, now)?,
            "algorithm": "ecdsa-p256-sha256",
            "purpose": "device-auth",
            "publicJwk": identity.public_jwk(),
            "proof": proof,
        })),
    )?;
    let credential = if status == 409 {
        let current = api.expect_ok(
            "enroll_signer_rejected",
            api.call(
                "GET",
                &format!("/api/v1/devices/{device_id}/signing-credentials/current?purpose=device-auth"),
                jwt,
                None,
            )?,
        )?;
        current
            .get("credential")
            .cloned()
            .filter(Value::is_object)
            .ok_or_else(|| RuntimeError::fail_closed("enroll_signer_rejected"))?
    } else {
        let body = api.expect_ok("enroll_signer_rejected", (status, body))?;
        body.pointer("/receipt/credential")
            .cloned()
            .ok_or_else(|| RuntimeError::fail_closed("enrollment_unexpected_response"))?
    };
    if str_field(&credential, "/publicKeyThumbprint")? != identity.thumbprint_hex()
        || str_field(&credential, "/deviceId")? != device_id
    {
        return Err(RuntimeError::fail_closed("enroll_signer_foreign_key"));
    }
    let signer = str_field(&credential, "/credentialRef")?.to_string();
    state.signer_ref = Some(signer.clone());
    state.save(store)?;
    Ok(signer)
}

/// 第 3 步：建桌面绑定（用户 JWT；续期见 `renew_binding`）。
fn create_binding(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    state: &mut EnrollmentState,
    jwt: &str,
    input: &EnrollmentInput<'_>,
    signer: &str,
    now: &str,
) -> RuntimeResult<ShellBindingRef> {
    // REQ-desktop-030: an unexpired binding is always reused. A new one here
    // would not supersede it (no renewal yet), and two live bindings make
    // remote execution fail closed until the older one expires.
    let now_ms = parse_ms(now).unwrap_or(0);
    if let (Some(binding), Some(expires)) = (&state.binding, state.binding_expires_at.as_deref().and_then(parse_ms)) {
        if expires > now_ms {
            return Ok(binding.clone());
        }
    }
    let request_id = match &state.binding_request_id {
        Some(id) => id.clone(),
        None => {
            let id = new_request_id("desktop-binding");
            state.binding_request_id = Some(id.clone());
            state.save(store)?;
            id
        }
    };
    let command = identity.desktop_binding_command(&DesktopBindingRequest {
        request_id: &request_id,
        agent_account_id: input.agent_account_id,
        runtime_id: input.runtime_id,
        signer_ref: signer,
        ttl_seconds: input.binding_ttl_seconds,
        supersedes_binding_ref: None,
        signed_at: now,
    })?;
    let body = api.expect_ok(
        "enroll_binding_rejected",
        api.call(
            "POST",
            &format!("/api/v1/devices/{}/desktop-binding", identity.device_id()),
            jwt,
            Some(serde_json::to_value(&command).map_err(|_| RuntimeError::fail_closed("enrollment_serialize"))?),
        )?,
    )?;
    let data = success_data(body)?;
    if str_field(&data, "/binding/runtimeRef/id")? != input.runtime_id
        || str_field(&data, "/binding/keyRef")? != signer
        || str_field(&data, "/binding/deviceId")? != identity.device_id()
    {
        return Err(RuntimeError::fail_closed("enroll_binding_mismatch"));
    }
    let audience_ok = data
        .pointer("/binding/audience")
        .and_then(Value::as_array)
        .map(|list| list.iter().all(|item| item == "developer_runtime") && !list.is_empty())
        .unwrap_or(false);
    if !audience_ok {
        return Err(RuntimeError::fail_closed("enroll_binding_mismatch"));
    }
    let binding: ShellBindingRef = serde_json::from_value(
        data.get("shellSessionRef").cloned().unwrap_or(Value::Null),
    )
    .map_err(|_| RuntimeError::fail_closed("enrollment_unexpected_response"))?;
    if binding.kind != "shell_session_binding" {
        return Err(RuntimeError::fail_closed("enrollment_unexpected_response"));
    }
    state.binding = Some(binding.clone());
    state.binding_expires_at = Some(str_field(&data, "/binding/expiresAt")?.to_string());
    state.binding_request_id = None;
    // A new binding makes any earlier runtime credential moot; issue a fresh one.
    state.credential_request_id = None;
    state.credential_ref = None;
    state.save(store)?;
    Ok(binding)
}

/// 服务端返回的运行时凭据：token 进钥匙串，其余进进度。
fn store_credential(
    store: &dyn SecureStore,
    state: &mut EnrollmentState,
    identity: &DeviceIdentity,
    runtime_id: &str,
    data: &Value,
) -> RuntimeResult<()> {
    let token = str_field(data, "/token")?;
    let credential_ref = str_field(data, "/credentialRef")?;
    if !crate::developer_runtime::device_identity::is_runtime_credential_ref(credential_ref)
        || str_field(data, "/audience")? != "developer_runtime"
        || str_field(data, "/deviceId")? != identity.device_id()
        || str_field(data, "/runtimeId")? != runtime_id
        || token.split('.').count() != 3
        || token.contains(char::is_whitespace)
    {
        return Err(RuntimeError::fail_closed("enroll_credential_mismatch"));
    }
    let binding: ShellBindingRef = serde_json::from_value(data.get("bindingRef").cloned().unwrap_or(Value::Null))
        .map_err(|_| RuntimeError::fail_closed("enrollment_unexpected_response"))?;
    store.set_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN, token)?;
    state.credential_ref = Some(credential_ref.to_string());
    state.credential_expires_at = Some(str_field(data, "/expiresAt")?.to_string());
    state.credential_refresh_after = Some(str_field(data, "/refreshAfter")?.to_string());
    state.binding = Some(binding);
    state.credential_request_id = None;
    state.save(store)
}

/// 第 4 步：签发运行时凭据（用户 JWT + K 签名）。
fn issue_credential(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    state: &mut EnrollmentState,
    jwt: &str,
    runtime_id: &str,
    signer: &str,
    binding: &ShellBindingRef,
    now: &str,
) -> RuntimeResult<()> {
    let request_id = match &state.credential_request_id {
        Some(id) => id.clone(),
        None => {
            let id = new_request_id("desktop-credential");
            state.credential_request_id = Some(id.clone());
            state.save(store)?;
            id
        }
    };
    let command = identity.runtime_credential_issue_command(&request_id, runtime_id, signer, binding, now)?;
    let body = api.expect_ok(
        "enroll_credential_rejected",
        api.call(
            "POST",
            &format!("/api/v1/devices/{}/runtime-credentials", identity.device_id()),
            jwt,
            Some(serde_json::to_value(&command).map_err(|_| RuntimeError::fail_closed("enrollment_serialize"))?),
        )?,
    )?;
    store_credential(store, state, identity, runtime_id, &success_data(body)?)
}

/// E73：配对之前先确认后端的 E32 能力开着。只读：
/// `GET /api/v1/devices/:id/signing-credentials/current?purpose=device-auth`
/// ——签名凭据 v1（`TRUST_CORE_DEVICE_SIGNING_CREDENTIAL_V1_ENABLED`）管第 2–4 步，
/// 关着时是 503，开着时是 200 `{ credential: … | null }`（设备还没登记也是 200）。
/// 503 → `enroll_backend_disabled`；别的非 2xx、2xx 但形状不对（比如网页兜底的 HTML）→
/// `enroll_backend_unknown`。两种都在配对之前停下，什么都没建。
pub const PROBE_PURPOSE: &str = "device-auth";

pub fn probe_path(device_id: &str) -> String {
    format!("/api/v1/devices/{device_id}/signing-credentials/current?purpose={PROBE_PURPOSE}")
}

fn probe_backend(api: &Api<'_>, identity: &DeviceIdentity, jwt: &str) -> RuntimeResult<()> {
    let (status, body) = api.call("GET", &probe_path(identity.device_id()), jwt, None)?;
    if status == 503 {
        return Err(RuntimeError::unavailable("enroll_backend_disabled"));
    }
    let shaped = |value: &Value| value.as_object().is_some_and(|object| object.contains_key("credential"));
    if (200..300).contains(&status) && (shaped(&body) || body.get("data").is_some_and(shaped)) {
        return Ok(());
    }
    let detail = server_code(&body).unwrap_or_else(|| format!("http_{status}"));
    Err(RuntimeError::unavailable("enroll_backend_unknown").with_message(detail))
}

/// Tauri 命令用这个：先探测（E73），后端能力开着才跑第 1–4 步。这样后端关着时不会
/// 先配对成功、再在第 2 步停下（服务端多出一台设备）。
pub fn enroll_after_probe(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    input: &EnrollmentInput<'_>,
    now: &str,
) -> RuntimeResult<EnrollmentState> {
    probe_backend(api, identity, input.user_jwt)?;
    enroll(api, store, identity, input, now)
}

/// 本人点"绑定这台电脑"：跑完第 1–4 步。中途失败的话进度已经保存，再点一次从断点接着做。
pub fn enroll(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    input: &EnrollmentInput<'_>,
    now: &str,
) -> RuntimeResult<EnrollmentState> {
    let mut state = match EnrollmentState::load(store)? {
        Some(existing) if existing.device_id == identity.device_id() => existing,
        _ => EnrollmentState { device_id: identity.device_id().to_string(), ..Default::default() },
    };
    pair(api, store, identity, &mut state, input.user_jwt, input.label)?;
    let device = own_device(api, identity, input.user_jwt)?;
    let signer = register_signer(api, store, identity, &mut state, input.user_jwt, &device, now)?;
    let binding = create_binding(api, store, identity, &mut state, input.user_jwt, input, &signer, now)?;
    issue_credential(api, store, identity, &mut state, input.user_jwt, input.runtime_id, &signer, &binding, now)?;
    Ok(state)
}

/// 到了 `refreshAfter` 就用旧 token + K 签名换一张新的；不需要用户 JWT。
/// 返回 `Ok(false)` 表示还不用刷新。服务端说 `..._REFRESH_REJECTED` 时要本人重新绑定。
pub fn refresh_if_due(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    runtime_id: &str,
    now: &str,
) -> RuntimeResult<bool> {
    let mut state = EnrollmentState::load(store)?.ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let (Some(credential_ref), Some(binding)) = (state.credential_ref.clone(), state.binding.clone()) else {
        return Err(RuntimeError::unavailable("not_enrolled"));
    };
    let now_ms = parse_ms(now).ok_or_else(|| RuntimeError::fail_closed("signed_at_invalid"))?;
    let due = state
        .credential_refresh_after
        .as_deref()
        .and_then(parse_ms)
        .map(|at| at <= now_ms)
        .unwrap_or(true);
    if !due {
        return Ok(false);
    }
    let token = store
        .get_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN)?
        .ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let request_id = match &state.credential_request_id {
        Some(id) => id.clone(),
        None => {
            let id = new_request_id("desktop-refresh");
            state.credential_request_id = Some(id.clone());
            state.save(store)?;
            id
        }
    };
    let command = identity.runtime_credential_refresh_command(&credential_ref, &request_id, &binding, now)?;
    let (status, body) = api.call(
        "POST",
        &format!("/api/v1/devices/{}/runtime-credentials/refresh", identity.device_id()),
        &token,
        Some(serde_json::to_value(&command).map_err(|_| RuntimeError::fail_closed("enrollment_serialize"))?),
    )?;
    if status == 401 {
        // Revoked, refreshed elsewhere, or too old: the owner has to bind again.
        state.credential_ref = None;
        state.credential_request_id = None;
        state.save(store)?;
        store.delete(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN)?;
        let detail = server_code(&body).unwrap_or_else(|| "http_401".into());
        return Err(RuntimeError::unavailable("enroll_refresh_rejected").with_message(detail));
    }
    let body = api.expect_ok("enroll_refresh_failed", (status, body))?;
    store_credential(store, &mut state, identity, runtime_id, &success_data(body)?)?;
    Ok(true)
}

/// 绑定还有效、运行时凭据却过期了或没了：用本人这次交来的 JWT 只重做第 4 步，沿用这份绑定和
/// 签名凭据；不配对、不建绑定、不选工作区。没开开发者运行时的时候没有循环替凭据刷新，
/// 30 分钟以后就会这样（D5 第 2 片"让电脑先备一份"要用它）。凭据还有效就什么都不发。
pub fn reissue_credential(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    user_jwt: &str,
    runtime_id: &str,
    now: &str,
) -> RuntimeResult<EnrollmentState> {
    let mut state = EnrollmentState::load(store)?.ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let now_ms = parse_ms(now).ok_or_else(|| RuntimeError::fail_closed("signed_at_invalid"))?;
    let binding_live = state.binding_expires_at.as_deref().and_then(parse_ms).is_some_and(|at| at > now_ms);
    let (Some(binding), Some(signer)) = (state.binding.clone(), state.signer_ref.clone()) else {
        return Err(RuntimeError::unavailable("not_enrolled"));
    };
    if state.device_id != identity.device_id() || !binding_live {
        return Err(RuntimeError::unavailable("not_enrolled"));
    }
    let token_present = store
        .get_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN)?
        .is_some_and(|token| !token.is_empty());
    if state.is_enrolled(now_ms) && token_present {
        return Ok(state);
    }
    issue_credential(api, store, identity, &mut state, user_jwt, runtime_id, &signer, &binding, now)?;
    Ok(state)
}

/// 本人在 Rust 的文件夹选择框里选中的工作区（绑定前在线登记要带上它）。
pub struct PickedWorkspace {
    pub path: std::path::PathBuf,
}

/// 文件夹名当显示名：去掉控制字符，1–64 个字符；取不到就叫 "workspace"。
pub fn workspace_display_name(path: &std::path::Path) -> String {
    let name: String = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control())
        .take(64)
        .collect();
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "workspace".into()
    } else {
        trimmed.to_string()
    }
}

pub fn machine_os() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

/// `bootstrapRef` 给宿主去消费（`RuntimeHost::bootstrap`）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssuedBootstrap {
    pub bootstrap_ref: String,
    pub machine_ref: String,
    pub workspace_ref: String,
}

/// 第 5 步：绑定前在线登记（只建 machine、登记这个已信任的工作区），然后用同一张运行时凭据
/// 签发一次性的 bootstrap。都用运行时凭据，不需要用户 JWT。
pub fn presence_and_bootstrap(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    runtime_id: &str,
    label: &str,
    workspace: &PickedWorkspace,
    now: &str,
) -> RuntimeResult<IssuedBootstrap> {
    let state = EnrollmentState::load(store)?.ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let binding = state.binding.clone().ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let token = store
        .get_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN)?
        .ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let path_digest = crate::developer_runtime::workspace_trust::path_digest(&workspace.path)?;
    let presence = identity.runtime_presence(
        &new_request_id("desktop-presence"),
        runtime_id,
        crate::developer_runtime::device_identity::PresenceMachine {
            label: label.to_string(),
            os: machine_os().to_string(),
        },
        vec![crate::developer_runtime::device_identity::PresenceWorkspace {
            path_digest: path_digest.clone(),
            display_name: workspace_display_name(&workspace.path),
            trust: "trusted".into(),
            trust_source: "owner_folder_pick".into(),
            trusted_at: None,
        }],
        now,
    )?;
    let body = serde_json::to_value(&presence).map_err(|_| RuntimeError::fail_closed("enrollment_serialize"))?;
    let registered = success_data(api.expect_ok(
        "enroll_presence_rejected",
        api.call_runtime("/api/v1/developer/runtime/presence", &token, body, None)?,
    )?)?;
    let machine_ref = str_field(&registered, "/machineRef")?.to_string();
    let workspace_ref = registered
        .get("workspaces")
        .and_then(Value::as_array)
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("pathDigest").and_then(Value::as_str) == Some(path_digest.value.as_str())
                    && item.get("trust").and_then(Value::as_str) == Some("trusted")
            })
        })
        .and_then(|item| item.get("workspaceRef").and_then(Value::as_str))
        .ok_or_else(|| RuntimeError::fail_closed("enroll_presence_workspace_missing"))?
        .to_string();

    let issue = json!({
        "deviceRef": identity.device_id(),
        "runtimeRef": { "type": "runtime", "id": runtime_id, "version": 1 },
        "machineRef": machine_ref,
        "workspaceRef": workspace_ref,
        "shellBindingRef": { "type": "shell_session_binding", "id": binding.id, "version": binding.version },
    });
    let idempotency_key = new_request_id("desktop-bootstrap");
    let snapshot = success_data(api.expect_ok(
        "enroll_bootstrap_rejected",
        api.call_runtime("/api/v1/developer/runtime/binding/bootstraps", &token, issue, Some(&idempotency_key))?,
    )?)?;
    let bootstrap_ref = str_field(&snapshot, "/bootstrapRef")?.to_string();
    if bootstrap_ref.is_empty() || bootstrap_ref.len() > 128 || bootstrap_ref.contains(char::is_whitespace) {
        return Err(RuntimeError::fail_closed("enrollment_unexpected_response"));
    }
    Ok(IssuedBootstrap { bootstrap_ref, machine_ref, workspace_ref })
}

/// 急停回执（REQ-desktop-010 / REQ-backend-047）：用登记过的签名凭据给一条本机急停记录签名，
/// 返回 `RecordDeviceSafetyEventRequestV1` 整个请求体（WebView 用本人的登录凭据发）。
/// 这台设备还没登记签名凭据时是 `not_enrolled`：那就只留在本机。
pub fn safety_event_request(store: &dyn SecureStore, identity: &DeviceIdentity, event: &Value, now: &str) -> RuntimeResult<Value> {
    let state = EnrollmentState::load(store)?.ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    if state.device_id != identity.device_id() {
        return Err(RuntimeError::unavailable("not_enrolled"));
    }
    let signer = state.signer_ref.ok_or_else(|| RuntimeError::unavailable("not_enrolled"))?;
    let signed = identity.sign_device_safety_event(&signer, event, now)?;
    Ok(json!({
        "deviceId": signed.device_id,
        "signerRef": signed.signer_ref,
        "signedAt": signed.signed_at,
        "signature": signed.signature,
        "event": event,
    }))
}

/// Tauri 命令用的入口：启动时选定的目标（默认 `https://api.agentrix.top`；
/// `AGENTRIX_API_TARGET=staging` 时是 staging），只走 https、主机白名单。
pub fn production_api<'a>(transport: &'a dyn HttpTransport, policy: &'a TrustPolicy) -> Api<'a> {
    Api {
        transport,
        origin: crate::developer_runtime::types::api_origin(),
        policy,
    }
}

/// 电脑名：去掉控制字符和首尾空白，最多 64 个字符；空的用 "Agentrix Desktop"。
pub fn clean_label(label: &str) -> String {
    let cleaned: String = label.chars().filter(|c| !c.is_control()).take(64).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "Agentrix Desktop".into()
    } else {
        trimmed.to_string()
    }
}

/// 给界面看的绑定状态：不含任何 token、私钥或 DST。
pub fn status_json(store: &dyn SecureStore, device_id: Option<&str>, now_ms: i64) -> Value {
    let state = EnrollmentState::load(store).ok().flatten();
    let enrolled = state
        .as_ref()
        .map(|s| Some(s.device_id.as_str()) == device_id && s.is_enrolled(now_ms))
        .unwrap_or(false);
    let bound = state
        .as_ref()
        .map(|s| {
            Some(s.device_id.as_str()) == device_id
                && s.binding.is_some()
                && s.binding_expires_at.as_deref().and_then(parse_ms).map(|at| at > now_ms).unwrap_or(false)
        })
        .unwrap_or(false);
    json!({
        "deviceId": device_id,
        "enrolled": enrolled,
        "bound": bound,
        "bindingExpiresAt": state.as_ref().and_then(|s| s.binding_expires_at.clone()),
        "credentialExpiresAt": state.as_ref().and_then(|s| s.credential_expires_at.clone()),
        // Gate B flags set at launch: the UI offers "reconnect the runtime"
        // when the binding is live but the runtime credential is not.
        "runtimeOptIn": crate::developer_runtime::types::runtime_opt_in(),
    })
}

/// 退出登录、急停撤销运行时：让服务端吊销这张凭据（用它自己），本机删掉 token 和进度里的凭据。
/// 服务端调不通也照样删本机的；返回服务端是否确认。
pub fn revoke_local_credential(
    api: &Api<'_>,
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
) -> RuntimeResult<bool> {
    let token = store.get_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN)?;
    let mut confirmed = false;
    if let Some(token) = token.as_deref() {
        if let Ok((status, _)) = api.call(
            "POST",
            &format!("/api/v1/devices/{}/runtime-credentials/revoke", identity.device_id()),
            token,
            Some(json!({ "schemaVersion": 1 })),
        ) {
            confirmed = (200..300).contains(&status);
        }
    }
    store.delete(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN)?;
    if let Some(mut state) = EnrollmentState::load(store)? {
        state.credential_ref = None;
        state.credential_expires_at = None;
        state.credential_refresh_after = None;
        state.credential_request_id = None;
        state.save(store)?;
    }
    Ok(confirmed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::channel::ScriptedHttp;
    use crate::developer_runtime::crypto::MemorySecureStore;
    use crate::developer_runtime::device_identity::mint_runtime_id;

    const ORIGIN: &str = "https://api.agentrix.top";
    const JWT: &str = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl";
    const AGENT: &str = "7d7c1f0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";
    const BINDING_ID: &str = "0f1e2d3c-4b5a-4968-8776-655443322110";
    const NOW: &str = "2026-09-29T05:00:00.000Z";
    const RUNTIME_TOKEN: &str = "eyJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJkZXZlbG9wZXJfcnVudGltZSJ9.cnVudGltZQ";

    struct Fixture {
        http: ScriptedHttp,
        store: MemorySecureStore,
        identity: DeviceIdentity,
        runtime_id: String,
        policy: TrustPolicy,
    }

    fn fixture() -> Fixture {
        let store = MemorySecureStore::default();
        let identity = DeviceIdentity::load_or_create(&store).unwrap();
        Fixture { http: ScriptedHttp::default(), store, identity, runtime_id: mint_runtime_id(), policy: TrustPolicy::default() }
    }

    impl Fixture {
        fn api(&self) -> Api<'_> {
            Api { transport: &self.http, origin: ORIGIN, policy: &self.policy }
        }

        fn input(&self) -> EnrollmentInput<'_> {
            EnrollmentInput {
                user_jwt: JWT,
                agent_account_id: AGENT,
                label: "Zhou's MacBook Pro",
                runtime_id: &self.runtime_id,
                binding_ttl_seconds: None,
            }
        }

        fn device_row(&self) -> Value {
            json!({
                "device_id": self.identity.device_id(),
                "device_revocation_epoch": "0",
                "credential_revocation_epoch": "0",
                "optimistic_version": "0",
                "credential_version": "1",
            })
        }

        fn push_pairing(&self) {
            self.http.push(200, json!({ "ticket": "AbCdEfGhIjKlMnOpQrStUvWx", "expires_at": 0 }));
            self.http.push(200, json!({ "device": { "device_id": self.identity.device_id() }, "dst": "dst-secret" }));
        }

        fn push_devices(&self) {
            self.http.push(200, json!({ "items": [ { "device_id": "dev_00000000000000000000000000000000" }, self.device_row() ] }));
        }

        fn credential(&self, thumbprint: &str) -> Value {
            json!({ "credentialRef": "dsc_1", "deviceId": self.identity.device_id(), "publicKeyThumbprint": thumbprint })
        }

        fn push_register(&self) {
            self.http.push(200, json!({ "receipt": { "credential": self.credential(self.identity.thumbprint_hex()) } }));
        }

        fn binding_data(&self, runtime_id: &str, version: u32) -> Value {
            json!({ "success": true, "data": {
                "schemaVersion": 1,
                "binding": {
                    "bindingId": BINDING_ID, "bindingVersion": version, "deviceId": self.identity.device_id(),
                    "runtimeRef": { "type": "runtime", "id": runtime_id }, "keyRef": "dsc_1",
                    "audience": ["developer_runtime"], "expiresAt": "2026-09-30T05:00:00.000Z"
                },
                "shellSessionRef": { "type": "shell_session_binding", "id": BINDING_ID, "version": version }
            }})
        }

        fn credential_data(&self, token: &str, credential_ref: &str, audience: &str) -> Value {
            json!({ "success": true, "data": {
                "schemaVersion": 1, "credentialRef": credential_ref, "token": token, "tokenType": "Bearer",
                "audience": audience, "deviceId": self.identity.device_id(), "runtimeId": self.runtime_id,
                "bindingRef": { "type": "shell_session_binding", "id": BINDING_ID, "version": 1 },
                "issuedAt": NOW, "expiresAt": "2026-09-29T05:30:00.000Z", "refreshAfter": "2026-09-29T05:20:00.000Z"
            }})
        }

        fn push_everything(&self) {
            self.push_pairing();
            self.push_devices();
            self.push_register();
            self.http.push(200, self.binding_data(&self.runtime_id, 1));
            self.http.push(200, self.credential_data(RUNTIME_TOKEN, &format!("drc_{}", "a".repeat(32)), "developer_runtime"));
        }

        fn token(&self) -> Option<String> {
            self.store.get_text(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN).unwrap()
        }
    }

    fn header<'r>(request: &'r OutboundHttpRequest, name: &str) -> Option<&'r str> {
        request.headers.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }

    #[test]
    fn enroll_runs_the_four_steps_and_keeps_secrets_in_the_keychain_only() {
        let f = fixture();
        f.push_everything();
        let state = enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let requests = f.http.recorded();
        let calls: Vec<(String, String)> = requests
            .iter()
            .map(|r| (r.method.clone(), r.url.trim_start_matches(ORIGIN).to_string()))
            .collect();
        let device = f.identity.device_id();
        assert_eq!(
            calls,
            vec![
                ("POST".into(), "/api/v1/devices/pair/ticket".into()),
                ("POST".into(), "/api/v1/devices/pair".into()),
                ("GET".into(), "/api/v1/devices".into()),
                ("POST".into(), format!("/api/v1/devices/{device}/signing-credentials/register")),
                ("POST".into(), format!("/api/v1/devices/{device}/desktop-binding")),
                ("POST".into(), format!("/api/v1/devices/{device}/runtime-credentials")),
            ]
        );
        for request in &requests {
            assert_eq!(header(request, "Authorization"), Some(format!("Bearer {JWT}").as_str()));
        }
        let pair = requests[1].body.as_ref().unwrap();
        assert_eq!(pair["device_class"], "desktop");
        assert_eq!(pair["proof"]["algorithm"], "ecdsa-p256-sha256");
        let register = requests[3].body.as_ref().unwrap();
        assert_eq!(register["purpose"], "device-auth");
        assert_eq!(register["expectedDeviceFence"]["target"], json!({ "kind": "device_registry", "deviceId": device }));
        assert_eq!(register["proof"]["signature"].as_str().unwrap().len(), 86);
        let binding = requests[4].body.as_ref().unwrap();
        assert_eq!(binding["signerRef"], "dsc_1");
        assert_eq!(binding["runtimeId"], f.runtime_id.as_str());
        assert!(binding.get("supersedesBindingRef").is_none());
        let issue = requests[5].body.as_ref().unwrap();
        assert_eq!(issue["bindingRef"]["id"], BINDING_ID);

        assert!(state.is_enrolled(parse_ms(NOW).unwrap()));
        assert_eq!(f.token().as_deref(), Some(RUNTIME_TOKEN));
        assert_eq!(f.store.get_text(KEYRING_SERVICE, KEYRING_DEVICE_DST).unwrap().as_deref(), Some("dst-secret"));
        // The progress record never holds the user JWT, the runtime token or the DST.
        let saved = f.store.get_text(KEYRING_SERVICE, KEYRING_ENROLLMENT_STATE).unwrap().unwrap();
        for secret in [JWT, RUNTIME_TOKEN, "dst-secret"] {
            assert!(!saved.contains(secret));
        }
    }

    #[test]
    fn a_failed_step_resumes_with_the_same_request_id_and_skips_finished_steps() {
        let f = fixture();
        f.push_pairing();
        f.push_devices();
        f.push_register();
        f.http.push(500, json!({ "success": false, "code": "INTERNAL_ERROR" }));
        let error = enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap_err();
        assert_eq!(error.code(), "enroll_binding_rejected");
        let first_binding_request = f.http.recorded()[4].body.clone().unwrap();
        let state = EnrollmentState::load(&f.store).unwrap().unwrap();
        assert!(state.paired && state.signer_ref.is_some() && state.binding.is_none());
        assert!(f.token().is_none());

        f.push_devices();
        f.http.push(200, f.binding_data(&f.runtime_id, 1));
        f.http.push(200, f.credential_data(RUNTIME_TOKEN, &format!("drc_{}", "b".repeat(32)), "developer_runtime"));
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let requests = f.http.recorded();
        assert_eq!(requests.len(), 5 + 3, "no second ticket / pair / register");
        assert_eq!(requests[6].body.as_ref().unwrap()["requestId"], first_binding_request["requestId"]);
    }

    // ── E73: probe before pairing ──

    #[test]
    fn a_switched_off_backend_stops_before_pairing_and_nothing_is_created() {
        let f = fixture();
        f.http.push(503, json!({ "success": false, "code": "SERVICE_UNAVAILABLE" }));
        let error = enroll_after_probe(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap_err();
        assert_eq!(error.code(), "enroll_backend_disabled");
        let requests = f.http.recorded();
        assert_eq!(requests.len(), 1, "no ticket, no pairing");
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].url, format!("{ORIGIN}{}", probe_path(f.identity.device_id())));
        assert!(requests[0].body.is_none());
        assert!(EnrollmentState::load(&f.store).unwrap().is_none());
        assert!(f.store.get_text(KEYRING_SERVICE, KEYRING_DEVICE_DST).unwrap().is_none());
    }

    #[test]
    fn an_unknown_answer_to_the_probe_also_stops_before_pairing() {
        for (status, body) in [
            (404, json!({ "success": false, "code": "NOT_FOUND" })),
            (200, json!({ "success": true })),
            (200, json!("<html>")),
            (401, json!({ "success": false, "code": "UNAUTHORIZED" })),
        ] {
            let f = fixture();
            f.http.push(status, body.clone());
            let error = enroll_after_probe(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap_err();
            assert_eq!(error.code(), "enroll_backend_unknown", "{status} {body}");
            assert_eq!(f.http.recorded().len(), 1, "{status} {body}");
            assert!(EnrollmentState::load(&f.store).unwrap().is_none());
        }
    }

    #[test]
    fn with_the_backend_on_the_probe_comes_first_then_the_four_steps() {
        for probe in [json!({ "credential": null }), json!({ "success": true, "data": { "credential": null } })] {
            let f = fixture();
            f.http.push(200, probe);
            f.push_everything();
            let state = enroll_after_probe(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
            let requests = f.http.recorded();
            assert_eq!(requests.len(), 7);
            assert_eq!(requests[0].method, "GET");
            assert!(requests[0].url.ends_with("/signing-credentials/current?purpose=device-auth"));
            assert_eq!(header(&requests[0], "Authorization"), Some(format!("Bearer {JWT}").as_str()));
            assert!(requests[1].url.ends_with("/api/v1/devices/pair/ticket"));
            assert!(state.is_enrolled(parse_ms(NOW).unwrap()));
        }
    }

    #[test]
    fn binding_again_before_expiry_reuses_the_live_binding_and_only_reissues_the_credential() {
        let f = fixture();
        f.push_everything();
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let first = f.http.recorded().len();
        // One hour before the binding expires (2026-09-30T05:00Z).
        f.push_devices();
        f.http.push(200, f.credential_data(RUNTIME_TOKEN, &format!("drc_{}", "d".repeat(32)), "developer_runtime"));
        enroll(&f.api(), &f.store, &f.identity, &f.input(), "2026-09-30T04:00:00.000Z").unwrap();
        let again: Vec<String> = f.http.recorded()[first..]
            .iter()
            .map(|r| r.url.trim_start_matches(ORIGIN).to_string())
            .collect();
        let device = f.identity.device_id();
        assert_eq!(again, vec!["/api/v1/devices".to_string(), format!("/api/v1/devices/{device}/runtime-credentials")]);
        assert_eq!(EnrollmentState::load(&f.store).unwrap().unwrap().binding.unwrap().id, BINDING_ID);

        // After it expired, a new binding is created.
        f.push_devices();
        f.http.push(200, f.binding_data(&f.runtime_id, 2));
        f.http.push(200, f.credential_data(RUNTIME_TOKEN, &format!("drc_{}", "e".repeat(32)), "developer_runtime"));
        let after = f.http.recorded().len();
        let late = "2026-09-30T05:00:01.000Z";
        let _ = enroll(&f.api(), &f.store, &f.identity, &f.input(), late);
        assert!(f.http.recorded()[after..].iter().any(|r| r.url.ends_with("/desktop-binding")));
    }

    #[test]
    fn safety_event_requests_are_signed_with_the_registered_credential_only() {
        let f = fixture();
        let event = json!({
            "id": "es-1790000000000-1", "kind": "released", "at": "2026-09-29T08:00:00.000Z",
            "origin": "settings", "nativeGate": "confirmed", "settledAfterMs": 120, "withinBudget": true
        });
        assert_eq!(safety_event_request(&f.store, &f.identity, &event, NOW).unwrap_err().code(), "not_enrolled");
        f.push_everything();
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let body = safety_event_request(&f.store, &f.identity, &event, NOW).unwrap();
        assert_eq!(body["deviceId"], f.identity.device_id());
        assert_eq!(body["signerRef"], "dsc_1");
        assert_eq!(body["signedAt"], NOW);
        assert_eq!(body["event"], event);
        assert_eq!(body["signature"].as_str().unwrap().len(), 86);
        let mut bad = event.clone();
        bad["nativeGate"] = json!("pending");
        assert_eq!(safety_event_request(&f.store, &f.identity, &bad, NOW).unwrap_err().code(), "safety_event_invalid");
        // A progress record for another key (the device key was replaced) does not sign.
        let other = DeviceIdentity::load_or_create(&MemorySecureStore::default()).unwrap();
        assert_eq!(safety_event_request(&f.store, &other, &event, NOW).unwrap_err().code(), "not_enrolled");
    }

    #[test]
    fn an_existing_signing_credential_of_another_key_is_refused() {
        let f = fixture();
        f.push_pairing();
        f.push_devices();
        f.http.push(409, json!({ "success": false, "code": "CONFLICT" }));
        f.http.push(200, json!({ "credential": f.credential(&"f".repeat(64)) }));
        let error = enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap_err();
        assert_eq!(error.code(), "enroll_signer_foreign_key");
        assert!(EnrollmentState::load(&f.store).unwrap().unwrap().signer_ref.is_none());
    }

    #[test]
    fn an_already_paired_device_is_confirmed_through_the_owners_device_list() {
        let f = fixture();
        f.http.push(200, json!({ "ticket": "AbCdEfGhIjKlMnOpQrStUvWx" }));
        f.http.push(409, json!({ "success": false, "code": "CONFLICT" }));
        f.http.push(200, json!({ "items": [] }));
        let error = enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap_err();
        assert_eq!(error.code(), "enroll_device_not_owned");
    }

    #[test]
    fn server_answers_that_do_not_match_what_was_asked_are_refused() {
        let f = fixture();
        f.push_pairing();
        f.push_devices();
        f.push_register();
        f.http.push(200, f.binding_data(&mint_runtime_id(), 1));
        assert_eq!(enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap_err().code(), "enroll_binding_mismatch");

        let g = fixture();
        g.push_pairing();
        g.push_devices();
        g.push_register();
        g.http.push(200, g.binding_data(&g.runtime_id, 1));
        g.http.push(200, g.credential_data(RUNTIME_TOKEN, &format!("drc_{}", "a".repeat(32)), "user"));
        assert_eq!(enroll(&g.api(), &g.store, &g.identity, &g.input(), NOW).unwrap_err().code(), "enroll_credential_mismatch");
        assert!(g.token().is_none());
    }

    #[test]
    fn only_allowlisted_https_origins_are_called() {
        let f = fixture();
        let api = Api { transport: &f.http, origin: "https://evil.example", policy: &f.policy };
        assert_eq!(enroll(&api, &f.store, &f.identity, &f.input(), NOW).unwrap_err().code(), "network_not_allowlisted");
        assert!(f.http.recorded().is_empty());
    }

    #[test]
    fn reissue_only_redoes_step_4_on_a_live_binding_and_only_when_the_credential_is_gone() {
        let f = fixture();
        f.push_everything();
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let before = f.http.recorded().len();
        let binding_before = EnrollmentState::load(&f.store).unwrap().unwrap().binding;

        // Still live: nothing is sent.
        reissue_credential(&f.api(), &f.store, &f.identity, JWT, &f.runtime_id, "2026-09-29T05:10:00.000Z").unwrap();
        assert_eq!(f.http.recorded().len(), before);

        // Expired (05:30) while the binding lives until tomorrow: one issue call with the owner's JWT.
        let new_token = "eyJhbGciOiJFUzI1NiJ9.eyJyZWlzc3VlIn0.cmVpc3N1ZQ";
        f.http.push(200, f.credential_data(new_token, &format!("drc_{}", "d".repeat(32)), "developer_runtime"));
        reissue_credential(&f.api(), &f.store, &f.identity, JWT, &f.runtime_id, "2026-09-29T06:00:00.000Z").unwrap();
        let requests = f.http.recorded();
        assert_eq!(requests.len(), before + 1);
        let issue = requests.last().unwrap();
        assert!(issue.url.ends_with(&format!("/api/v1/devices/{}/runtime-credentials", f.identity.device_id())));
        assert_eq!(header(issue, "Authorization"), Some(format!("Bearer {JWT}").as_str()));
        assert_eq!(f.token().as_deref(), Some(new_token));
        let state = EnrollmentState::load(&f.store).unwrap().unwrap();
        assert_eq!(state.binding, binding_before, "the binding is reused, never re-created");
        assert_eq!(state.credential_request_id, None);

        // A missing token on a live binding is renewed the same way.
        f.store.delete(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN).unwrap();
        f.http.push(200, f.credential_data(new_token, &format!("drc_{}", "e".repeat(32)), "developer_runtime"));
        reissue_credential(&f.api(), &f.store, &f.identity, JWT, &f.runtime_id, "2026-09-29T05:10:00.000Z").unwrap();
        assert_eq!(f.http.recorded().len(), before + 2);

        // Binding expired, or never bound: nothing is sent, the owner binds again from "这台电脑".
        let error = reissue_credential(&f.api(), &f.store, &f.identity, JWT, &f.runtime_id, "2026-10-01T00:00:00.000Z").unwrap_err();
        assert_eq!(error.code(), "not_enrolled");
        let fresh = fixture();
        let error = reissue_credential(&fresh.api(), &fresh.store, &fresh.identity, JWT, &fresh.runtime_id, NOW).unwrap_err();
        assert_eq!(error.code(), "not_enrolled");
        assert_eq!(f.http.recorded().len(), before + 2);
        assert!(fresh.http.recorded().is_empty());
    }

    #[test]
    fn refresh_uses_the_old_token_and_a_device_signature_and_drops_it_when_refused() {
        let f = fixture();
        f.push_everything();
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let before = f.http.recorded().len();
        assert!(!refresh_if_due(&f.api(), &f.store, &f.identity, &f.runtime_id, "2026-09-29T05:10:00.000Z").unwrap());
        assert_eq!(f.http.recorded().len(), before);

        let new_token = "eyJhbGciOiJFUzI1NiJ9.eyJuZXcifQ.bmV3";
        f.http.push(200, f.credential_data(new_token, &format!("drc_{}", "c".repeat(32)), "developer_runtime"));
        assert!(refresh_if_due(&f.api(), &f.store, &f.identity, &f.runtime_id, "2026-09-29T05:21:00.000Z").unwrap());
        let refresh = f.http.recorded().last().cloned().unwrap();
        assert!(refresh.url.ends_with("/runtime-credentials/refresh"));
        assert_eq!(header(&refresh, "Authorization"), Some(format!("Bearer {RUNTIME_TOKEN}").as_str()));
        assert_eq!(refresh.body.as_ref().unwrap()["signature"].as_str().unwrap().len(), 86);
        assert_eq!(f.token().as_deref(), Some(new_token));

        // Expire the schedule and let the server refuse: the token is dropped, the owner must bind again.
        f.http.push(401, json!({ "success": false, "code": "DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_REJECTED" }));
        let error = refresh_if_due(&f.api(), &f.store, &f.identity, &f.runtime_id, "2026-09-29T06:00:00.000Z").unwrap_err();
        assert_eq!(error.code(), "enroll_refresh_rejected");
        assert!(f.token().is_none());
        assert!(!EnrollmentState::load(&f.store).unwrap().unwrap().is_enrolled(parse_ms(NOW).unwrap()));
    }

    #[test]
    fn revoke_always_forgets_the_local_token() {
        let f = fixture();
        f.push_everything();
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        f.http.push(503, json!({ "success": false }));
        assert!(!revoke_local_credential(&f.api(), &f.store, &f.identity).unwrap());
        assert!(f.token().is_none());
        let revoke = f.http.recorded().last().cloned().unwrap();
        assert_eq!(header(&revoke, "Authorization"), Some(format!("Bearer {RUNTIME_TOKEN}").as_str()));
        assert!(EnrollmentState::load(&f.store).unwrap().unwrap().credential_ref.is_none());
    }

    #[test]
    fn presence_then_bootstrap_use_the_runtime_credential_and_signed_bodies() {
        let f = fixture();
        f.push_everything();
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let workspace_dir = tempfile::tempdir().unwrap();
        let path = std::fs::canonicalize(workspace_dir.path()).unwrap().join("agentrix");
        std::fs::create_dir_all(&path).unwrap();
        let digest = crate::developer_runtime::workspace_trust::path_digest(&path).unwrap();
        f.http.push(200, json!({ "success": true, "data": {
            "schemaVersion": 1, "machineRef": "mch_1", "machineVersion": 1, "machineCreated": true,
            "workspaces": [ { "workspaceRef": "wks_1", "pathDigest": digest.value, "trust": "trusted" } ]
        }}));
        f.http.push(200, json!({ "success": true, "data": {
            "bootstrapRef": "bst_1", "expiresAt": "2026-09-29T05:05:00.000Z", "audience": "developer_runtime", "bindingVersion": 1
        }}));
        let issued = presence_and_bootstrap(
            &f.api(),
            &f.store,
            &f.identity,
            &f.runtime_id,
            "Zhou's MacBook Pro",
            &PickedWorkspace { path: path.clone() },
            NOW,
        )
        .unwrap();
        assert_eq!(issued, IssuedBootstrap { bootstrap_ref: "bst_1".into(), machine_ref: "mch_1".into(), workspace_ref: "wks_1".into() });

        let requests = f.http.recorded();
        let presence = &requests[requests.len() - 2];
        let bootstrap = &requests[requests.len() - 1];
        assert!(presence.url.ends_with("/api/v1/developer/runtime/presence"));
        assert!(bootstrap.url.ends_with("/api/v1/developer/runtime/binding/bootstraps"));
        for request in [presence, bootstrap] {
            // The runtime credential, never the user JWT.
            assert_eq!(header(request, "Authorization"), Some(format!("Bearer {RUNTIME_TOKEN}").as_str()));
            let body = request.body.as_ref().unwrap();
            let expected = crate::developer_runtime::jcs::jcs_digest(body).unwrap();
            assert_eq!(header(request, "X-Agentrix-Body-Digest"), Some(format!("sha-256={}", expected.value).as_str()));
            assert_eq!(header(request, "X-Agentrix-Canonicalization"), Some("jcs/1"));
        }
        let body = presence.body.as_ref().unwrap();
        assert_eq!(body["deviceRef"], f.identity.device_id());
        assert_eq!(body["workspaces"][0]["pathDigest"]["value"], digest.value.as_str());
        assert_eq!(body["workspaces"][0]["displayName"], "agentrix");
        assert_eq!(body["workspaces"][0]["trust"], "trusted");
        assert!(header(bootstrap, "Idempotency-Key").unwrap().starts_with("desktop-bootstrap-"));
        let issue = bootstrap.body.as_ref().unwrap();
        assert_eq!(issue["runtimeRef"], json!({ "type": "runtime", "id": f.runtime_id, "version": 1 }));
        assert_eq!(issue["shellBindingRef"], json!({ "type": "shell_session_binding", "id": BINDING_ID, "version": 1 }));
        assert_eq!(issue["workspaceRef"], "wks_1");
    }

    #[test]
    fn presence_that_does_not_trust_the_picked_folder_stops_before_bootstrap() {
        let f = fixture();
        f.push_everything();
        enroll(&f.api(), &f.store, &f.identity, &f.input(), NOW).unwrap();
        let dir = tempfile::tempdir().unwrap();
        f.http.push(200, json!({ "success": true, "data": {
            "schemaVersion": 1, "machineRef": "mch_1", "machineVersion": 1, "machineCreated": false,
            "workspaces": [ { "workspaceRef": "wks_1", "pathDigest": "0".repeat(64), "trust": "trusted" } ]
        }}));
        let before = f.http.recorded().len();
        let error = presence_and_bootstrap(
            &f.api(), &f.store, &f.identity, &f.runtime_id, "Mac", &PickedWorkspace { path: dir.path().to_path_buf() }, NOW,
        )
        .unwrap_err();
        assert_eq!(error.code(), "enroll_presence_workspace_missing");
        assert_eq!(f.http.recorded().len(), before + 1, "no bootstrap was requested");
    }

    #[test]
    fn presence_needs_an_enrollment_first() {
        let f = fixture();
        let dir = tempfile::tempdir().unwrap();
        let error = presence_and_bootstrap(
            &f.api(), &f.store, &f.identity, &f.runtime_id, "Mac", &PickedWorkspace { path: dir.path().to_path_buf() }, NOW,
        )
        .unwrap_err();
        assert_eq!(error.code(), "not_enrolled");
        assert!(f.http.recorded().is_empty());
        assert_eq!(workspace_display_name(std::path::Path::new("/")), "workspace");
        assert_eq!(workspace_display_name(std::path::Path::new("/Users/me/项目")), "项目");
    }

    #[test]
    fn server_codes_are_read_from_both_error_envelopes_and_sanitised() {
        assert_eq!(server_code(&json!({ "code": "DESKTOP_BINDING_SIGNATURE_STALE" })).as_deref(), Some("DESKTOP_BINDING_SIGNATURE_STALE"));
        assert_eq!(server_code(&json!({ "error": { "code": "fail_closed" } })).as_deref(), Some("fail_closed"));
        assert_eq!(server_code(&json!({ "code": "<script>" })), None);
        assert_eq!(server_code(&json!({})), None);
    }
}
