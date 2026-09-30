//! Developer Runtime Host.
//!
//! Default-off Tauri trust boundary: outbound HTTPS channel, verified binding
//! bootstrap, encrypted journal, locked `agent acp` process host, and
//! presentation-only WebView projections.

mod approval;
mod auth_handoff;
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

/// E84 C：浏览器登录回调只带一次性 code（`auth_handoff.rs`）。启动时 `AGENTRIX_AUTH_HANDOFF=1` 才开。
pub fn auth_handoff_enabled() -> bool {
    auth_handoff::handoff_enabled()
}

/// E84 C：起本机回调口、返回发起地址；后台等回调、换 token，结果交给 `on_done`。
pub fn auth_handoff_begin(
    provider: &str,
    on_done: impl FnOnce(Result<String, String>) + Send + 'static,
) -> Result<String, String> {
    auth_handoff::begin(provider, types::api_origin(), on_done)
}

/// staging 目标下 staging 的 API 源（`https://…`，不带路径）；生产目标下是 None。
pub fn staging_api_origin() -> Option<&'static str> {
    (types::api_target() == types::ApiTarget::Staging).then_some(types::STAGING_API_ORIGIN)
}
