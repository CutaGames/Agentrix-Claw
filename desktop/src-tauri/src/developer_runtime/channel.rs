//! Production outbound HTTPS/WSS client. Desktop never listens.

use crate::developer_runtime::crypto::sha256_hex;
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::jcs::jcs_digest;
use crate::developer_runtime::policy::{assert_control_plane_safe, TrustPolicy};
use crate::developer_runtime::types::{
    bounded_expires_at, now_iso, ChannelMessage, DigestRef, RuntimeOffer, SessionOperation,
    VerifiedBinding, CHANNEL_PROTOCOL_VERSION, MAX_CHANNEL_IN_FLIGHT, PRODUCTION_API_ORIGIN,
    RUNTIME_API_PREFIX,
};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub trait OutboundChannelClient: Send + Sync {
    fn listen(&self, _bind: &str) -> RuntimeResult<()> {
        Err(RuntimeError::fail_closed("channel_listen_forbidden"))
    }

    fn connect_outbound(&mut self, url: &str) -> RuntimeResult<()>;
    fn send(&mut self, message: ChannelMessage) -> RuntimeResult<Value>;
    fn poll(&mut self) -> RuntimeResult<Option<ChannelMessage>>;
    fn connected(&self) -> bool;
    fn disconnect(&mut self);
    fn post(&mut self, path: &str, body: Value, idempotency_key: &str) -> RuntimeResult<Value>;
    fn get(&mut self, path: &str, query: &[(&str, &str)]) -> RuntimeResult<Value>;
}

pub trait HttpTransport: Send + Sync {
    fn send(&self, request: OutboundHttpRequest) -> RuntimeResult<OutboundHttpResponse>;
}

#[derive(Debug, Clone)]
pub struct OutboundHttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Value>,
    pub timeout: Duration,
}

#[derive(Debug, Clone)]
pub struct OutboundHttpResponse {
    pub status: u16,
    pub body: Value,
}

#[derive(Default)]
pub struct DisabledChannel;

impl OutboundChannelClient for DisabledChannel {
    fn connect_outbound(&mut self, _url: &str) -> RuntimeResult<()> {
        Err(RuntimeError::unavailable("channel_default_off"))
    }

    fn send(&mut self, _message: ChannelMessage) -> RuntimeResult<Value> {
        Err(RuntimeError::unavailable("channel_default_off"))
    }

    fn poll(&mut self) -> RuntimeResult<Option<ChannelMessage>> {
        Ok(None)
    }

    fn connected(&self) -> bool {
        false
    }

    fn disconnect(&mut self) {}

    fn post(&mut self, _path: &str, _body: Value, _idempotency_key: &str) -> RuntimeResult<Value> {
        Err(RuntimeError::unavailable("channel_default_off"))
    }

    fn get(&mut self, _path: &str, _query: &[(&str, &str)]) -> RuntimeResult<Value> {
        Err(RuntimeError::unavailable("channel_default_off"))
    }
}

pub struct RecordingChannel {
    policy: TrustPolicy,
    connected: bool,
    outbound: Mutex<Vec<ChannelMessage>>,
    inbound: Mutex<VecDeque<ChannelMessage>>,
    scripted: Arc<Mutex<VecDeque<Value>>>,
    ops: Arc<Mutex<Vec<String>>>,
}

impl RecordingChannel {
    pub fn new(policy: TrustPolicy) -> Self {
        Self {
            policy,
            connected: false,
            outbound: Mutex::new(Vec::new()),
            inbound: Mutex::new(VecDeque::new()),
            scripted: Arc::new(Mutex::new(VecDeque::new())),
            ops: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn push_response(&self, body: Value) {
        self.scripted.lock().expect("channel lock").push_back(body);
    }

    pub fn scripted_handle(&self) -> Arc<Mutex<VecDeque<Value>>> {
        self.scripted.clone()
    }

    pub fn outbound_snapshot(&self) -> Vec<ChannelMessage> {
        self.outbound.lock().expect("channel lock").clone()
    }

    pub fn ops_handle(&self) -> Arc<Mutex<Vec<String>>> {
        self.ops.clone()
    }

    pub fn recorded_ops(&self) -> Vec<String> {
        self.ops.lock().expect("channel lock").clone()
    }
}

impl OutboundChannelClient for RecordingChannel {
    fn connect_outbound(&mut self, url: &str) -> RuntimeResult<()> {
        self.policy.validate_outbound_url(url)?;
        self.connected = true;
        Ok(())
    }

    fn send(&mut self, message: ChannelMessage) -> RuntimeResult<Value> {
        validate_channel_message(&message)?;
        if !self.connected {
            return Err(RuntimeError::unavailable("channel_not_connected"));
        }
        self.outbound
            .lock()
            .map_err(|_| RuntimeError::fail_closed("channel_lock"))?
            .push(message);
        let raw = self
            .scripted
            .lock()
            .map_err(|_| RuntimeError::fail_closed("channel_lock"))?
            .pop_front()
            .unwrap_or(json!({ "success": true, "data": {} }));
        parse_success_data(&raw)
    }

    fn poll(&mut self) -> RuntimeResult<Option<ChannelMessage>> {
        Ok(self
            .inbound
            .lock()
            .map_err(|_| RuntimeError::fail_closed("channel_lock"))?
            .pop_front())
    }

    fn connected(&self) -> bool {
        self.connected
    }

    fn disconnect(&mut self) {
        self.connected = false;
    }

    fn post(&mut self, path: &str, body: Value, idempotency_key: &str) -> RuntimeResult<Value> {
        self.ops
            .lock()
            .map_err(|_| RuntimeError::fail_closed("channel_lock"))?
            .push(format!("POST {path}"));
        let message = signed_channel_message(path.trim_start_matches('/'), 1, body)?;
        let _ = idempotency_key;
        self.send(message)
    }

    fn get(&mut self, path: &str, _query: &[(&str, &str)]) -> RuntimeResult<Value> {
        self.ops
            .lock()
            .map_err(|_| RuntimeError::fail_closed("channel_lock"))?
            .push(format!("GET {path}"));
        let message = signed_channel_message(path.trim_start_matches('/'), 1, json!({}))?;
        self.send(message)
    }
}

pub struct HttpsOutboundClient {
    transport: Box<dyn HttpTransport>,
    policy: TrustPolicy,
    origin: String,
    credential: Option<String>,
    connected: bool,
    in_flight: AtomicUsize,
}

impl HttpsOutboundClient {
    pub fn new(
        transport: Box<dyn HttpTransport>,
        policy: TrustPolicy,
        origin: String,
        credential: Option<String>,
    ) -> RuntimeResult<Self> {
        policy.validate_outbound_url(&origin)?;
        Ok(Self {
            transport,
            policy,
            origin,
            credential,
            connected: true,
            in_flight: AtomicUsize::new(0),
        })
    }

    pub fn production(credential: Option<String>, policy: TrustPolicy) -> RuntimeResult<Self> {
        Self::new(
            Box::new(ReqwestTransport),
            policy,
            PRODUCTION_API_ORIGIN.to_string(),
            credential,
        )
    }

    fn request(&self, method: &str, path: &str, body: Option<Value>, idempotency_key: Option<&str>) -> RuntimeResult<Value> {
        if self.in_flight.load(Ordering::SeqCst) >= MAX_CHANNEL_IN_FLIGHT {
            return Err(RuntimeError::fail_closed("channel_backpressure"));
        }
        self.in_flight.fetch_add(1, Ordering::SeqCst);
        let prefix = if path.starts_with("/instructions/")
            || path.starts_with("/receipts/")
            || path.starts_with("/handoffs/")
            || path.starts_with("/machines/")
        {
            crate::developer_runtime::types::DEVELOPER_API_PREFIX
        } else {
            RUNTIME_API_PREFIX
        };
        let url = format!("{}{}{}", self.origin, prefix, path);
        let result = (|| {
            self.policy.validate_outbound_url(&url)?;
            if let Some(value) = &body {
                assert_control_plane_safe(value)?;
            }
            let mut headers = vec![
                ("Accept".into(), "application/json".into()),
                ("Content-Type".into(), "application/json".into()),
            ];
            if let Some(value) = &body {
                let digest = jcs_digest(value)?;
                headers.push((
                    crate::developer_runtime::types::BODY_DIGEST_HEADER.into(),
                    format!("sha-256={}", digest.value),
                ));
                headers.push((
                    crate::developer_runtime::types::CANONICALIZATION_HEADER.into(),
                    "jcs/1".into(),
                ));
            }
            if let Some(token) = &self.credential {
                if token.contains("hex:") {
                    return Err(RuntimeError::fail_closed("channel_credential_corrupt"));
                }
                headers.push(("Authorization".into(), format!("Bearer {token}")));
            }
            if let Some(key) = idempotency_key {
                headers.push(("Idempotency-Key".into(), key.to_string()));
            }
            let response = self.transport.send(OutboundHttpRequest {
                method: method.to_string(),
                url,
                headers,
                body,
                timeout: Duration::from_millis(
                    crate::developer_runtime::types::DEFAULT_REQUEST_TIMEOUT_MS,
                ),
            })?;
            if response.status == 404 || response.status == 503 {
                return Err(RuntimeError::unavailable("runtime_channel_unavailable"));
            }
            if !(200..300).contains(&response.status) {
                return Err(RuntimeError::fail_closed("runtime_channel_rejected"));
            }
            parse_success_data(&response.body)
        })();
        self.in_flight.fetch_sub(1, Ordering::SeqCst);
        result
    }
}

impl OutboundChannelClient for HttpsOutboundClient {
    fn connect_outbound(&mut self, url: &str) -> RuntimeResult<()> {
        self.policy.validate_outbound_url(url)?;
        self.origin = url
            .trim_end_matches('/')
            .trim_end_matches(RUNTIME_API_PREFIX)
            .to_string();
        self.connected = true;
        Ok(())
    }

    fn send(&mut self, message: ChannelMessage) -> RuntimeResult<Value> {
        validate_channel_message(&message)?;
        self.post(&format!("/{}", message.kind), message.payload, "channel")
    }

    fn poll(&mut self) -> RuntimeResult<Option<ChannelMessage>> {
        Ok(None)
    }

    fn connected(&self) -> bool {
        self.connected
    }

    fn disconnect(&mut self) {
        self.connected = false;
        self.credential = None;
    }

    fn post(&mut self, path: &str, body: Value, idempotency_key: &str) -> RuntimeResult<Value> {
        if !self.connected {
            return Err(RuntimeError::unavailable("channel_not_connected"));
        }
        self.request("POST", path, Some(body), Some(idempotency_key))
    }

    fn get(&mut self, path: &str, query: &[(&str, &str)]) -> RuntimeResult<Value> {
        if !self.connected {
            return Err(RuntimeError::unavailable("channel_not_connected"));
        }
        let encoded = query
            .iter()
            .map(|(key, value)| format!("{}={}", url_encode(key), url_encode(value)))
            .collect::<Vec<_>>()
            .join("&");
        let suffix = if encoded.is_empty() {
            path.to_string()
        } else {
            format!("{path}?{encoded}")
        };
        self.request("GET", &suffix, None, None)
    }
}

pub struct ReqwestTransport;

impl HttpTransport for ReqwestTransport {
    fn send(&self, request: OutboundHttpRequest) -> RuntimeResult<OutboundHttpResponse> {
        if !(request.url.starts_with("https://") || request.url.starts_with("wss://")) {
            return Err(RuntimeError::fail_closed("network_not_allowlisted"));
        }
        let client = reqwest::blocking::Client::builder()
            .https_only(true)
            .timeout(request.timeout)
            .build()
            .map_err(|_| RuntimeError::fail_closed("channel_http_client"))?;
        let mut builder = match request.method.as_str() {
            "GET" => client.get(&request.url),
            "POST" => client.post(&request.url),
            _ => return Err(RuntimeError::fail_closed("unknown_method")),
        };
        for (key, value) in &request.headers {
            builder = builder.header(key, value);
        }
        if let Some(body) = request.body {
            builder = builder.json(&body);
        }
        let response = builder
            .send()
            .map_err(|_| RuntimeError::unavailable("runtime_channel_unavailable"))?;
        let status = response.status().as_u16();
        let body = response.json::<Value>().unwrap_or(Value::Null);
        Ok(OutboundHttpResponse { status, body })
    }
}

pub fn signed_channel_message(
    kind: &str,
    sequence: u64,
    payload: Value,
) -> RuntimeResult<ChannelMessage> {
    assert_control_plane_safe(&payload)?;
    let expires_at = bounded_expires_at();
    if expires_at <= now_iso() {
        return Err(RuntimeError::fail_closed("expires_at_not_future"));
    }
    let digest = jcs_digest(&payload)?;
    Ok(ChannelMessage {
        protocol_version: CHANNEL_PROTOCOL_VERSION,
        kind: kind.to_string(),
        session_ref: None,
        sequence,
        digest,
        expires_at,
        payload,
    })
}

pub fn signed_envelope(payload: &Value) -> RuntimeResult<Value> {
    let message = signed_channel_message("envelope", 1, payload.clone())?;
    serde_json::to_value(message).map_err(|_| RuntimeError::fail_closed("unknown_schema"))
}

pub fn validate_channel_message(message: &ChannelMessage) -> RuntimeResult<()> {
    if message.protocol_version != CHANNEL_PROTOCOL_VERSION {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    if message.expires_at <= now_iso() {
        return Err(RuntimeError::fail_closed("expires_at_not_future"));
    }
    let expected = jcs_digest(&message.payload)?;
    if expected != message.digest {
        return Err(RuntimeError::fail_closed("channel_digest_mismatch"));
    }
    assert_control_plane_safe(&message.payload)
}

pub fn parse_success_data(body: &Value) -> RuntimeResult<Value> {
    let object = body
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if object.get("success") != Some(&json!(true)) {
        return Err(RuntimeError::fail_closed("backend_cas_rejected"));
    }
    match object.get("data") {
        None | Some(Value::Null) => Err(RuntimeError::fail_closed("backend_cas_rejected")),
        Some(data) => Ok(data.clone()),
    }
}

pub fn url_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[derive(Clone, Default)]
pub struct ScriptedHttp {
    pub requests: Arc<Mutex<Vec<OutboundHttpRequest>>>,
    pub responses: Arc<Mutex<VecDeque<(u16, Value)>>>,
}

impl ScriptedHttp {
    pub fn push(&self, status: u16, body: Value) {
        self.responses.lock().expect("http").push_back((status, body));
    }

    pub fn recorded(&self) -> Vec<OutboundHttpRequest> {
        self.requests.lock().expect("http").clone()
    }
}

impl HttpTransport for ScriptedHttp {
    fn send(&self, request: OutboundHttpRequest) -> RuntimeResult<OutboundHttpResponse> {
        self.requests.lock().expect("http").push(request);
        let (status, body) = self
            .responses
            .lock()
            .expect("http")
            .pop_front()
            .unwrap_or((503, json!({ "success": false })));
        Ok(OutboundHttpResponse { status, body })
    }
}

pub fn parse_offer(raw: &Value, binding: &VerifiedBinding) -> RuntimeResult<RuntimeOffer> {
    assert_control_plane_safe(raw)?;
    let object = raw
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    let payload_ref: crate::developer_runtime::types::EncryptedPayloadRef =
        serde_json::from_value(
            object
                .get("payloadRef")
                .cloned()
                .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?,
        )
        .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    if payload_ref.data_kind != "instruction" || payload_ref.kind != "encrypted_data_ref" {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    let request_digest: DigestRef = serde_json::from_value(
        object
            .get("instructionRequestDigest")
            .or_else(|| object.get("requestDigest"))
            .cloned()
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?,
    )
    .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    let offer = RuntimeOffer {
        instruction_ref: require_offer_str(object, "instructionRef")?,
        action_ref: require_offer_str(object, "actionRef")?,
        adapter_session_ref: require_offer_str(object, "adapterSessionRef")?,
        session_ref: require_offer_str(object, "sessionRef")?,
        session_version: object
            .get("expectedSessionVersion")
            .or_else(|| object.get("sessionVersion"))
            .and_then(Value::as_u64)
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))? as u32,
        instruction_version: object
            .get("instructionVersion")
            .or_else(|| object.get("instructionSequence"))
            .and_then(Value::as_u64)
            .unwrap_or(1) as u32,
        workspace_ref: require_offer_str(object, "workspaceRef")?,
        request_digest,
        issued_at: require_offer_str(object, "issuedAt")?,
        expires_at: require_offer_str(object, "expiresAt")?,
        nonce: object
            .get("nonce")
            .and_then(Value::as_str)
            .unwrap_or("instruction-nonce")
            .to_string(),
        nonce_domain: object
            .get("nonceDomain")
            .and_then(Value::as_str)
            .unwrap_or(&binding.binding.nonce_domain)
            .to_string(),
        audience: object
            .get("audience")
            .and_then(Value::as_str)
            .unwrap_or(&binding.audience)
            .to_string(),
        binding_version: object
            .get("bindingVersion")
            .and_then(Value::as_u64)
            .unwrap_or(binding.binding_version as u64) as u32,
        idempotency_key: require_offer_str(object, "idempotencyKey")?,
        payload_ref,
        adapter_manifest_ref: require_offer_str(object, "adapterManifestRef")?,
        adapter_manifest_version: object
            .get("adapterManifestVersion")
            .and_then(Value::as_u64)
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))? as u32,
    };
    if offer.audience != binding.audience {
        return Err(RuntimeError::fail_closed("audience_mismatch"));
    }
    if offer.binding_version != binding.binding_version {
        return Err(RuntimeError::fail_closed("binding_version_mismatch"));
    }
    if offer.nonce_domain != binding.binding.nonce_domain {
        return Err(RuntimeError::fail_closed("nonce_domain_mismatch"));
    }
    if offer.workspace_ref != binding.binding.workspace_ref {
        return Err(RuntimeError::fail_closed("workspace_mismatch"));
    }
    let now = now_iso();
    if offer.issued_at > now || offer.expires_at <= now || offer.expires_at <= offer.issued_at {
        return Err(RuntimeError::fail_closed("stale_instruction"));
    }
    let recomputed = instruction_digest(&offer)?;
    if recomputed != offer.request_digest {
        return Err(RuntimeError::fail_closed("exact_digest_mismatch"));
    }
    Ok(offer)
}

fn require_offer_str(
    object: &serde_json::Map<String, Value>,
    key: &str,
) -> RuntimeResult<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))
}

pub fn instruction_digest(offer: &RuntimeOffer) -> RuntimeResult<DigestRef> {
    offer_digest(offer)
}

pub fn offer_digest(offer: &RuntimeOffer) -> RuntimeResult<DigestRef> {
    jcs_digest(&json!({
        "actionRef": offer.action_ref,
        "adapterManifestRef": offer.adapter_manifest_ref,
        "adapterManifestVersion": offer.adapter_manifest_version,
        "adapterSessionRef": offer.adapter_session_ref,
        "audience": offer.audience,
        "bindingVersion": offer.binding_version,
        "expiresAt": offer.expires_at,
        "idempotencyKey": offer.idempotency_key,
        "instructionRef": offer.instruction_ref,
        "issuedAt": offer.issued_at,
        "nonce": offer.nonce,
        "payloadRef": offer.payload_ref,
        "sessionRef": offer.session_ref,
        "sessionVersion": offer.session_version,
        "workspaceRef": offer.workspace_ref,
    }))
}

pub fn validate_claim_snapshot(
    snapshot: &Value,
    binding: &VerifiedBinding,
    offer: &RuntimeOffer,
) -> RuntimeResult<()> {
    if snapshot.get("contractType") != Some(&json!("developer_instruction")) {
        return Err(RuntimeError::fail_closed("backend_cas_rejected"));
    }
    if snapshot.get("instructionRef") != Some(&json!(offer.instruction_ref))
        || snapshot.get("actionRef") != Some(&json!(offer.action_ref))
        || snapshot.get("workspaceRef") != Some(&json!(offer.workspace_ref))
        || snapshot.get("sessionRef") != Some(&json!(offer.session_ref))
    {
        return Err(RuntimeError::fail_closed("claim_snapshot_mismatch"));
    }
    let version = snapshot
        .get("instructionSequence")
        .or_else(|| snapshot.get("expectedInstructionVersion"))
        .or_else(|| snapshot.get("instructionVersion"))
        .and_then(Value::as_u64);
    if version != Some(offer.instruction_version as u64) {
        return Err(RuntimeError::fail_closed("claim_snapshot_mismatch"));
    }
    let claimant = snapshot
        .get("deviceRef")
        .or_else(|| snapshot.get("claimantRef"))
        .and_then(Value::as_str);
    if claimant != Some(binding.binding.device_ref.as_str()) {
        return Err(RuntimeError::fail_closed("claim_snapshot_mismatch"));
    }
    let binding_id = snapshot
        .get("shellBindingRef")
        .and_then(|value| value.get("id").or(Some(value)))
        .and_then(Value::as_str)
        .or_else(|| snapshot.get("bindingRef").and_then(Value::as_str));
    if binding_id != Some(binding.binding.shell_binding_ref.as_str()) {
        return Err(RuntimeError::fail_closed("claim_snapshot_mismatch"));
    }
    let journal_id = snapshot
        .get("shellCommandJournalRef")
        .or_else(|| snapshot.get("journalRef"))
        .and_then(|value| value.get("id").or(Some(value)))
        .and_then(Value::as_str);
    if journal_id != Some(offer.idempotency_key.as_str()) {
        return Err(RuntimeError::fail_closed("claim_snapshot_mismatch"));
    }
    if let Some(state) = snapshot.get("state").and_then(Value::as_str) {
        if state != "claimed" {
            return Err(RuntimeError::fail_closed("claim_snapshot_mismatch"));
        }
    }
    Ok(())
}

pub fn parse_session_operation(raw: &Value) -> RuntimeResult<Option<SessionOperation>> {
    let object = raw.as_object().ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if object.get("contractType") != Some(&json!("developer_session_summary")) {
        return Ok(None);
    }
    let state = object
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("");
    if state != "creating" && state != "loading" {
        return Ok(None);
    }
    let operation_ref = object
        .get("operationRef")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    Ok(Some(SessionOperation {
        session_ref: require_offer_str(object, "sessionRef")?,
        operation_ref: operation_ref.to_string(),
        session_version: object
            .get("sessionVersion")
            .and_then(Value::as_u64)
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))? as u32,
        workspace_ref: require_offer_str(object, "workspaceRef")?,
        adapter_manifest_ref: require_offer_str(object, "adapterManifestRef")?,
        adapter_manifest_version: object
            .get("adapterManifestVersion")
            .and_then(Value::as_u64)
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))? as u32,
        state: state.to_string(),
    }))
}

pub fn validate_session_ready(snapshot: &Value, operation: &SessionOperation, adapter_session_ref: &str) -> RuntimeResult<()> {
    if snapshot.get("contractType") != Some(&json!("developer_session_summary")) {
        return Err(RuntimeError::fail_closed("session_ready_cas_rejected"));
    }
    if snapshot.get("state") != Some(&json!("ready")) {
        return Err(RuntimeError::fail_closed("session_ready_cas_rejected"));
    }
    if snapshot.get("sessionRef") != Some(&json!(operation.session_ref)) {
        return Err(RuntimeError::fail_closed("session_ready_cas_rejected"));
    }
    if snapshot.get("adapterSessionRef") != Some(&json!(adapter_session_ref)) {
        return Err(RuntimeError::fail_closed("session_ready_cas_rejected"));
    }
    if snapshot.get("operationRef").is_some() && snapshot.get("operationRef") != Some(&Value::Null) {
        return Err(RuntimeError::fail_closed("session_ready_cas_rejected"));
    }
    Ok(())
}

pub fn receipt_is_completed(receipt: &Value) -> bool {
    if receipt.get("completed") != Some(&json!(true)) {
        return false;
    }
    let refs = receipt.get("refs").unwrap_or(receipt);
    let action_receipt = refs.get("actionReceiptRef");
    if action_receipt.is_none() || action_receipt == Some(&Value::Null) {
        return false;
    }
    let execution = receipt
        .pointer("/layers/execution/state")
        .and_then(Value::as_str);
    let outcome_ref = receipt
        .pointer("/layers/outcome/outcomeRef")
        .or_else(|| receipt.pointer("/refs/outcomeRef"));
    execution == Some("succeeded") && outcome_ref.is_some() && outcome_ref != Some(&Value::Null)
}

pub fn claim_body(binding: &VerifiedBinding, offer: &RuntimeOffer) -> RuntimeResult<Value> {
    Ok(json!({
        "instructionRef": offer.instruction_ref,
        "deviceRef": binding.binding.device_ref,
        "sessionRef": offer.session_ref,
        "workspaceRef": offer.workspace_ref,
        "expectedInstructionVersion": offer.instruction_version,
        "runtimeRef": binding.binding.runtime_ref,
        "shellCommandJournalRef": {
            "type": "shell_command_journal_entry",
            "id": offer.idempotency_key,
            "version": 1
        },
        "offerDigest": offer_digest(offer)?,
        "instructionRequestDigest": offer.request_digest,
    }))
}

pub fn session_operation_claim_body(
    binding: &VerifiedBinding,
    operation: &SessionOperation,
) -> Value {
    json!({
        "sessionRef": operation.session_ref,
        "operationRef": operation.operation_ref,
        "deviceRef": binding.binding.device_ref,
        "runtimeRef": binding.binding.runtime_ref,
        "expectedSessionVersion": operation.session_version,
        "workspaceRef": operation.workspace_ref,
        "shellBindingRef": {
            "type": "shell_session_binding",
            "id": binding.binding.shell_binding_ref,
            "version": binding.binding.shell_binding_version
        }
    })
}

pub fn validate_session_operation_claim(
    snapshot: &Value,
    operation: &SessionOperation,
    device_ref: &str,
) -> RuntimeResult<()> {
    if snapshot.get("sessionRef") != Some(&json!(operation.session_ref)) {
        return Err(RuntimeError::fail_closed("session_claim_cas_rejected"));
    }
    if snapshot.get("operationRef") != Some(&json!(operation.operation_ref))
        && snapshot.pointer("/operationRef") != Some(&json!(operation.operation_ref))
    {
        return Err(RuntimeError::fail_closed("session_claim_cas_rejected"));
    }
    let claimant = snapshot
        .get("claimedByDeviceRef")
        .or_else(|| snapshot.get("deviceRef"))
        .and_then(Value::as_str);
    if claimant.is_some() && claimant != Some(device_ref) {
        return Err(RuntimeError::fail_closed("session_claim_cas_rejected"));
    }
    Ok(())
}

pub fn validate_terminal_readback(snapshot: &Value, expected_status: &str) -> RuntimeResult<()> {
    let status = snapshot
        .get("status")
        .or_else(|| snapshot.get("state"))
        .or_else(|| snapshot.pointer("/terminalResult/status"))
        .and_then(Value::as_str);
    if status == Some(expected_status) {
        return Ok(());
    }
    Err(RuntimeError::unavailable("terminal_readback_rejected"))
}

#[allow(dead_code)]
pub fn sha256_ref(value: &str) -> String {
    sha256_hex(value.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn never_listens_and_requires_tls_allowlisted_outbound() {
        let mut channel = RecordingChannel::new(TrustPolicy::default());
        assert_eq!(
            channel.listen("0.0.0.0:9443").unwrap_err().code(),
            "channel_listen_forbidden"
        );
        assert_eq!(
            channel
                .connect_outbound("https://evil.example/runtime")
                .unwrap_err()
                .code(),
            "network_not_allowlisted"
        );
        assert_eq!(
            channel
                .connect_outbound("http://api.agentrix.top/api/v1/developer/runtime")
                .unwrap_err()
                .code(),
            "network_not_allowlisted"
        );
        channel
            .connect_outbound("https://api.agentrix.top/api/v1/developer/runtime")
            .unwrap();
        assert!(channel.connected());
        let message = signed_channel_message("heartbeat", 1, json!({ "sequence": 1 })).unwrap();
        assert!(message.expires_at > now_iso());
        assert_eq!(message.digest.canonicalization, "jcs/1");
    }
}
