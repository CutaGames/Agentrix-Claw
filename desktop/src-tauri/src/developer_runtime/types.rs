//! Host-owned types. Presentation DTOs never carry secrets, paths, or handles.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const SCHEMA_VERSION: u32 = 1;
pub const RESULT_CLASS: &str = "LOCAL_RUNTIME_UNCERTIFIED";
pub const ENVIRONMENT: &str = "local_runtime";
pub const HEARTBEAT_INTERVAL_MS: u64 = 15_000;
pub const HEARTBEAT_FRESHNESS_MS: u64 = 45_000;
pub const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 10_000;
pub const MAX_PENDING_RPC: usize = 16;
pub const MAX_LINE_BYTES: usize = 256_000;
pub const KEYRING_SERVICE: &str = "agentrix.developer_runtime";
pub const KEYRING_JOURNAL_KEY: &str = "journal_aead_v1";
pub const KEYRING_RUNTIME_AEAD_KEY: &str = "runtime_aead_v1";
pub const KEYRING_CHANNEL_TOKEN: &str = "channel_bearer_v1";
pub const KEYRING_PROCESS_TOKEN: &str = "process_token_v1";
pub const CHANNEL_PROTOCOL_VERSION: u32 = 1;
pub const AUDIENCE_DESKTOP_RUNTIME: &str = "desktop_runtime";
pub const MESSAGE_TTL_MS: i64 = 30_000;
pub const PRODUCTION_API_ORIGIN: &str = "https://api.agentrix.top";
/// DRW Gate B 在 staging 上验收（REQ-desktop-026）。地址以 release 的答复为准。
pub const STAGING_API_ORIGIN: &str = "https://stg.agentrix.top";
/// 从终端启动时设 `AGENTRIX_API_TARGET=staging`，Rust 和 WebView 都连 staging。
/// 只认 `staging` 这一个值；没设、空、别的任何值都是生产。不接受任意地址。
pub const ENV_API_TARGET: &str = "AGENTRIX_API_TARGET";
/// staging 用单独的钥匙串服务名：设备密钥、设备令牌、运行时凭据和生产互不串用。
pub const KEYRING_SERVICE_STAGING: &str = "agentrix.developer_runtime.staging";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiTarget {
    Production,
    Staging,
}

impl ApiTarget {
    /// 纯函数，测试用；`api_target()` 用进程环境变量调它。
    pub fn from_env_value(value: Option<&str>) -> Self {
        match value.map(str::trim) {
            Some("staging") => ApiTarget::Staging,
            _ => ApiTarget::Production,
        }
    }
    pub fn origin(self) -> &'static str {
        match self {
            ApiTarget::Production => PRODUCTION_API_ORIGIN,
            ApiTarget::Staging => STAGING_API_ORIGIN,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            ApiTarget::Production => "production",
            ApiTarget::Staging => "staging",
        }
    }
    /// 开发者运行时的钥匙串服务名在这个目标下实际用的名字。别的服务名不变。
    pub fn keyring_service(self, service: &str) -> &str {
        if self == ApiTarget::Staging && service == KEYRING_SERVICE {
            KEYRING_SERVICE_STAGING
        } else {
            service
        }
    }
}

/// 进程启动时读一次，之后不变（运行中改环境变量不生效）。
pub fn api_target() -> ApiTarget {
    static TARGET: std::sync::OnceLock<ApiTarget> = std::sync::OnceLock::new();
    *TARGET.get_or_init(|| ApiTarget::from_env_value(std::env::var(ENV_API_TARGET).ok().as_deref()))
}

pub fn api_origin() -> &'static str {
    api_target().origin()
}
pub const RUNTIME_API_PREFIX: &str = "/api/v1/developer/runtime";
pub const DEVELOPER_API_PREFIX: &str = "/api/v1/developer";
pub const MAX_CHANNEL_IN_FLIGHT: usize = 8;
pub const MAX_CLAIM_IN_FLIGHT: usize = 1;
pub const BODY_DIGEST_HEADER: &str = "X-Agentrix-Body-Digest";
pub const CANONICALIZATION_HEADER: &str = "X-Agentrix-Canonicalization";

pub const FLAG_RUNTIME_CHANNEL: &str = "DEVELOPER_RUNTIME_CHANNEL_V1_ENABLED";
pub const FLAG_CURSOR_ACP: &str = "DEVELOPER_ADAPTER_CURSOR_ACP_ENABLED";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestRef {
    pub algorithm: String,
    pub canonicalization: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordRef {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub digest: Option<DigestRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBinding {
    pub owner_principal_ref: String,
    pub agent_id: String,
    pub device_ref: String,
    pub runtime_ref: RecordRef,
    pub machine_ref: String,
    pub machine_version: u64,
    pub workspace_ref: String,
    pub workspace_digest: DigestRef,
    pub workspace_trust: String,
    pub shell_binding_ref: String,
    pub shell_binding_version: u32,
    pub nonce_domain: String,
    pub issued_at: String,
    pub expires_at: String,
    pub status: String,
    pub audience: String,
    pub binding_version: u32,
    #[serde(skip)]
    pub workspace_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindingBootstrap {
    pub bootstrap_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedBinding {
    pub binding: ActiveBinding,
    pub audience: String,
    pub binding_version: u32,
    pub digest: DigestRef,
    pub authentication_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedPayloadRef {
    pub kind: String,
    pub data_kind: String,
    pub data_ref: String,
    pub digest: DigestRef,
    pub size_bytes: u64,
    pub data_class: String,
    pub encryption: String,
    pub owner_scope: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionOperation {
    pub session_ref: String,
    pub operation_ref: String,
    pub session_version: u32,
    pub workspace_ref: String,
    pub adapter_manifest_ref: String,
    pub adapter_manifest_version: u32,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MappedSession {
    pub session_ref: String,
    pub adapter_session_ref: String,
    pub process_generation: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub approval_ref: String,
    pub rpc_id: serde_json::Value,
    pub instruction_ref: String,
    pub action_ref: String,
    pub session_ref: String,
    pub request_digest: DigestRef,
    pub expires_at: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOffer {
    pub instruction_ref: String,
    pub action_ref: String,
    pub adapter_session_ref: String,
    pub session_ref: String,
    pub session_version: u32,
    pub instruction_version: u32,
    pub workspace_ref: String,
    pub request_digest: DigestRef,
    pub issued_at: String,
    pub expires_at: String,
    pub nonce: String,
    pub nonce_domain: String,
    pub audience: String,
    pub binding_version: u32,
    pub idempotency_key: String,
    pub payload_ref: EncryptedPayloadRef,
    pub adapter_manifest_ref: String,
    pub adapter_manifest_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandLock {
    pub program: String,
    pub args: Vec<String>,
    pub protocol_version: u32,
}

impl Default for CommandLock {
    fn default() -> Self {
        Self {
            program: "agent".to_string(),
            args: vec!["acp".to_string()],
            protocol_version: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessage {
    pub protocol_version: u32,
    pub kind: String,
    pub session_ref: Option<String>,
    pub sequence: u64,
    pub digest: DigestRef,
    pub expires_at: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityHeartbeat {
    pub sequence: u64,
    pub observed_at: String,
    pub valid_until: String,
    pub adapter_ref: String,
    pub session_resume: String,
    pub terminal_query: String,
    pub vendor_process: String,
    pub production_certification: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VendorProbe {
    pub available: bool,
    pub reason_code: String,
    pub program: String,
    pub spawn_attempted: bool,
    pub process_started: bool,
    pub production_claim: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePresentation {
    pub result_class: String,
    pub environment: String,
    pub enabled: bool,
    pub default_off: bool,
    pub production_route: bool,
    pub production_certification: bool,
    pub receipt_claim: bool,
    pub canonical_success_claim: bool,
    pub replay_allowed: bool,
    pub vendor_process_started: bool,
    pub outcome: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

impl RuntimePresentation {
    pub fn unavailable(reason_code: &str, enabled: bool) -> Self {
        Self::from_parts("unavailable", enabled, false, None, Some(reason_code))
    }

    pub fn fail_closed(reason_code: &str, enabled: bool) -> Self {
        Self::from_parts("fail_closed", enabled, false, None, Some(reason_code))
    }

    pub fn ok(enabled: bool, vendor_process_started: bool, payload: serde_json::Value) -> Self {
        Self::from_parts("ok", enabled, vendor_process_started, Some(payload), None)
    }

    fn from_parts(
        outcome: &str,
        enabled: bool,
        vendor_process_started: bool,
        payload: Option<serde_json::Value>,
        reason_code: Option<&str>,
    ) -> Self {
        Self {
            result_class: RESULT_CLASS.to_string(),
            environment: ENVIRONMENT.to_string(),
            enabled,
            default_off: true,
            production_route: false,
            production_certification: false,
            receipt_claim: false,
            canonical_success_claim: false,
            replay_allowed: false,
            vendor_process_started,
            outcome: outcome.to_string(),
            reason_code: reason_code.map(|value| value.to_string()),
            payload,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimRequest {
    pub instruction_ref: String,
    pub action_ref: String,
    pub adapter_session_ref: String,
    pub session_ref: String,
    pub session_version: u32,
    pub idempotency_key: String,
    pub request_digest: DigestRef,
    pub workspace_ref: String,
    pub nonce: String,
    pub nonce_domain: String,
    pub issued_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorityDecision {
    pub decision_ref: String,
    pub approval_ref: String,
    pub adapter_request_ref: String,
    pub request_digest: DigestRef,
    pub decision: String,
    pub grant_scope: Option<String>,
    pub local_confirmation_ref: Option<String>,
    pub decided_at: String,
    pub authority_digest: DigestRef,
    pub decision_digest: DigestRef,
    pub authority_grant_ref: Option<serde_json::Value>,
}

pub fn bounded_expires_at() -> String {
    (chrono::Utc::now() + chrono::Duration::milliseconds(MESSAGE_TTL_MS))
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalRecord {
    pub binding_ref: String,
    pub adapter_session_ref: String,
    pub instruction_ref: Option<String>,
    pub idempotency_key: String,
    pub nonce_domain: String,
    pub nonce: String,
    pub sequence: i64,
    pub state: String,
    pub refs_json: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

pub fn env_exact_one(name: &str) -> bool {
    std::env::var(name).ok().as_deref() == Some("1")
}

pub fn runtime_opt_in() -> bool {
    env_exact_one(FLAG_RUNTIME_CHANNEL) && env_exact_one(FLAG_CURSOR_ACP)
}
