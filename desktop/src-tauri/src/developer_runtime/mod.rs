//! Developer Runtime Host.
//!
//! Default-off Tauri trust boundary: outbound HTTPS channel, verified binding
//! bootstrap, encrypted journal, locked `agent acp` process host, and
//! presentation-only WebView projections.

mod approval;
mod binding;
mod channel;
mod confirmation;
pub mod commands;
mod crypto;
mod device_identity;
mod enrollment;
mod error;
mod host;
mod jcs;
mod journal;
mod order_runtime;
mod payload;
mod policy;
mod process;
mod runtime_loop;
mod staging_gate;
mod types;
mod workspace_trust;

#[cfg(test)]
mod harness;

pub use host::DeveloperRuntimeState;

/// REQ-desktop-026：进程启动时选定的 API 目标（`production` / `staging`），给 WebView 用。
pub fn api_target_name() -> &'static str {
    types::api_target().name()
}

/// staging 门禁请求头的值（REQ-desktop-026），给 WebView 用。生产目标下是 None，不读钥匙串。
pub fn staging_gate_key() -> Option<String> {
    staging_gate::staging_gate_key()
}

/// staging 目标下 staging 的 API 源（`https://…`，不带路径）；生产目标下是 None。
pub fn staging_api_origin() -> Option<&'static str> {
    (types::api_target() == types::ApiTarget::Staging).then_some(types::STAGING_API_ORIGIN)
}
