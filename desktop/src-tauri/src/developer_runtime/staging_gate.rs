//! staging 门禁请求头（REQ-desktop-026，release 的答复）。
//!
//! staging 的 `/api/**` 要带 `X-Agentrix-Staging-Key` 才放行。值只放在 owner 的钥匙串里
//! （服务 `agentrix-staging-gate`，account `staging-key`），不进仓库、不进日志。
//!
//! - 只在启动时选了 staging（`AGENTRIX_API_TARGET=staging`）时读钥匙串，连生产时从不读、从不带。
//! - 只给 staging 主机的 https / wss 请求带；别的主机一律不带（值不会发给第三方）。
//! - 值要是 16–256 个可见 ASCII 字符（不含空格），否则当没有。
//! - 进程里只读一次；owner 后来才放进钥匙串的话，要重启应用。

use crate::developer_runtime::crypto::{OsKeyringStore, SecureStore};
use crate::developer_runtime::types::{api_target, ApiTarget};

pub const HEADER: &str = "X-Agentrix-Staging-Key";
pub const KEYCHAIN_SERVICE: &str = "agentrix-staging-gate";
pub const KEYCHAIN_ACCOUNT: &str = "staging-key";

pub fn is_valid_key(value: &str) -> bool {
    (16..=256).contains(&value.len()) && value.bytes().all(|b| (0x21..=0x7e).contains(&b))
}

fn host_of(url: &str) -> Option<&str> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("wss://"))?;
    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.contains('@') {
        return None;
    }
    Some(authority.split(':').next().unwrap_or(authority))
}

/// 纯函数：这个请求要不要带、带什么。
pub fn header_for_with(target: ApiTarget, url: &str, key: Option<&str>) -> Option<(String, String)> {
    if target != ApiTarget::Staging {
        return None;
    }
    let staging_host = host_of(ApiTarget::Staging.origin())?;
    if !host_of(url).is_some_and(|host| host.eq_ignore_ascii_case(staging_host)) {
        return None;
    }
    let key = key.filter(|key| is_valid_key(key))?;
    Some((HEADER.to_string(), key.to_string()))
}

/// staging 目标下钥匙串里的值（读一次）；生产目标下是 None，而且不碰钥匙串。
pub fn staging_gate_key() -> Option<String> {
    if api_target() != ApiTarget::Staging {
        return None;
    }
    static KEY: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    KEY.get_or_init(|| {
        OsKeyringStore
            .get_text(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            .ok()
            .flatten()
            .map(|value| value.trim().to_string())
            .filter(|value| is_valid_key(value))
    })
    .clone()
}

/// Rust 发出的请求用这个（`ReqwestTransport`）。
pub fn header_for(url: &str) -> Option<(String, String)> {
    let target = api_target();
    if target != ApiTarget::Staging {
        return None;
    }
    header_for_with(target, url, staging_gate_key().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "stg-0123456789abcdef-XYZ";

    #[test]
    fn production_never_carries_the_header() {
        assert_eq!(header_for_with(ApiTarget::Production, "https://stg.agentrix.top/api/v1/devices", Some(KEY)), None);
        assert_eq!(header_for_with(ApiTarget::Production, "https://api.agentrix.top/api/v1/devices", Some(KEY)), None);
    }

    #[test]
    fn staging_carries_it_to_the_staging_host_only() {
        let expected = Some((HEADER.to_string(), KEY.to_string()));
        assert_eq!(header_for_with(ApiTarget::Staging, "https://stg.agentrix.top/api/v1/devices", Some(KEY)), expected);
        assert_eq!(header_for_with(ApiTarget::Staging, "wss://stg.agentrix.top/socket.io/", Some(KEY)), expected);
        assert_eq!(header_for_with(ApiTarget::Staging, "https://STG.agentrix.top:443/api", Some(KEY)), expected);
        for url in [
            "https://api.agentrix.top/api/v1/devices",
            "http://stg.agentrix.top/api",
            "https://stg.agentrix.top.evil.example/api",
            "https://stg.agentrix.top@evil.example/api",
            "https://evil.example/?next=https://stg.agentrix.top/",
            "stg.agentrix.top/api",
        ] {
            assert_eq!(header_for_with(ApiTarget::Staging, url, Some(KEY)), None, "{url}");
        }
    }

    #[test]
    fn a_missing_or_malformed_key_is_not_sent() {
        let url = "https://stg.agentrix.top/api";
        assert_eq!(header_for_with(ApiTarget::Staging, url, None), None);
        for bad in ["", "short", "has space in the middle!!", "line\nbreak-0123456789", &"x".repeat(257), "中文中文中文中文中文中文"] {
            assert_eq!(header_for_with(ApiTarget::Staging, url, Some(bad)), None, "{bad:?}");
        }
        assert!(is_valid_key(&"x".repeat(16)) && is_valid_key(&"x".repeat(256)));
    }

    #[test]
    fn the_production_process_does_not_read_the_keychain() {
        // Tests run without AGENTRIX_API_TARGET, i.e. as production.
        assert_eq!(api_target(), ApiTarget::Production);
        assert_eq!(staging_gate_key(), None);
        assert_eq!(header_for("https://stg.agentrix.top/api"), None);
    }
}
