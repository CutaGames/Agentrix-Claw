//! Binding freshness, workspace trust, allowlists, kill switch, and redaction.

use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::types::{now_iso, ActiveBinding, CommandLock, DigestRef};
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::{Component, Path};

const OPAQUE_REF: &str = r"^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$";
const ALLOWED_PROGRAMS: &[&str] = &["agent", "agent.exe", "agent.cmd", "agent.bat"];
const ALLOWED_NETWORK_HOSTS: &[&str] = &[
    "api.agentrix.top",
    "agentrix.top",
    "127.0.0.1",
    "localhost",
];

const FORBIDDEN_CONTROL_KEYS: &[&str] = &[
    "absolutelocalpath",
    "apikey",
    "authorization",
    "body",
    "cookie",
    "credential",
    "cwd",
    "devicesigningkey",
    "diffbody",
    "executiontoken",
    "filepath",
    "localpath",
    "logbody",
    "password",
    "pathmap",
    "processhandle",
    "processid",
    "promptbody",
    "providertoken",
    "rawcredential",
    "rawdiff",
    "rawlog",
    "rawprompt",
    "secret",
    "signingkey",
];

#[derive(Debug, Clone)]
pub struct TrustPolicy {
    pub allowed_commands: BTreeSet<String>,
    pub allowed_hosts: BTreeSet<String>,
}

impl Default for TrustPolicy {
    fn default() -> Self {
        Self {
            allowed_commands: ALLOWED_PROGRAMS.iter().map(|value| value.to_string()).collect(),
            allowed_hosts: ALLOWED_NETWORK_HOSTS
                .iter()
                .map(|value| value.to_string())
                .collect(),
        }
    }
}

impl TrustPolicy {
    pub fn validate_binding(&self, binding: &ActiveBinding, now: &str) -> RuntimeResult<()> {
        if binding.status != "active" {
            return Err(RuntimeError::fail_closed("binding_not_active"));
        }
        if binding.workspace_trust != "trusted" {
            return Err(RuntimeError::fail_closed("workspace_untrusted"));
        }
        if !is_opaque(&binding.owner_principal_ref)
            || !is_opaque(&binding.device_ref)
            || !is_opaque(&binding.workspace_ref)
            || !is_opaque(&binding.shell_binding_ref)
        {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
        if binding.machine_version == 0 {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
        if !is_fresh(binding.issued_at.as_str(), binding.expires_at.as_str(), now) {
            return Err(RuntimeError::fail_closed("stale_binding"));
        }
        if looks_like_absolute_path(&binding.workspace_ref)
            || looks_like_absolute_path(&binding.shell_binding_ref)
        {
            return Err(RuntimeError::fail_closed("path_in_control_plane"));
        }
        Ok(())
    }

    pub fn exact_workspace_trust(
        &self,
        binding: &ActiveBinding,
        workspace_ref: &str,
        workspace_digest: &DigestRef,
    ) -> RuntimeResult<()> {
        if binding.workspace_ref != workspace_ref {
            return Err(RuntimeError::fail_closed("workspace_mismatch"));
        }
        if binding.workspace_digest != *workspace_digest {
            return Err(RuntimeError::fail_closed("workspace_digest_mismatch"));
        }
        if binding.workspace_trust != "trusted" {
            return Err(RuntimeError::fail_closed("workspace_untrusted"));
        }
        if let Some(path) = &binding.workspace_path {
            assert_exact_workspace_path(path)?;
        }
        Ok(())
    }

    pub fn validate_command_lock(&self, lock: &CommandLock) -> RuntimeResult<()> {
        // Desktop build unblock (macOS): check for path components first. On
        // Unix `Path::file_name` does not split on `\`, so a Windows path like
        // `C:\evil\agent.exe` used to fall through to `command_not_allowlisted`
        // instead of `command_path_forbidden`. Both reject; now the reason is
        // the same on every platform.
        if lock.program.contains("..") || lock.program.contains('/') || lock.program.contains('\\')
        {
            return Err(RuntimeError::fail_closed("command_path_forbidden"));
        }
        let program = Path::new(&lock.program)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(lock.program.as_str())
            .to_ascii_lowercase();
        if !self.allowed_commands.contains(&program) {
            return Err(RuntimeError::fail_closed("command_not_allowlisted"));
        }
        if lock.args != ["acp"] {
            return Err(RuntimeError::fail_closed("command_args_locked"));
        }
        if lock.protocol_version != 1 {
            return Err(RuntimeError::fail_closed("protocol_version_locked"));
        }
        Ok(())
    }

    pub fn validate_outbound_url(&self, url: &str) -> RuntimeResult<()> {
        if !(url.starts_with("https://") || url.starts_with("wss://")) {
            return Err(RuntimeError::fail_closed("network_not_allowlisted"));
        }
        let parsed = url::loose_host(url).ok_or_else(|| RuntimeError::fail_closed("network_not_allowlisted"))?;
        if !self.allowed_hosts.contains(&parsed) {
            return Err(RuntimeError::fail_closed("network_not_allowlisted"));
        }
        Ok(())
    }
}

mod url {
    pub fn loose_host(url: &str) -> Option<String> {
        let rest = url
            .strip_prefix("wss://")
            .or_else(|| url.strip_prefix("https://"))
            .or_else(|| url.strip_prefix("ws://"))
            .or_else(|| url.strip_prefix("http://"))?;
        let host = rest.split(['/', '?', '#']).next().unwrap_or(rest);
        let host = host.split('@').next_back().unwrap_or(host);
        Some(host.split(':').next().unwrap_or(host).to_string())
    }
}

pub fn is_opaque(value: &str) -> bool {
    regex_is_match(OPAQUE_REF, value)
}

fn regex_is_match(pattern: &str, value: &str) -> bool {
    // Avoid a regex crate: the opaque-ref charset is small and stable.
    if value.is_empty() || value.len() > 128 {
        return false;
    }
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '~' | '-'))
        && pattern.starts_with('^')
}

pub fn is_fresh(issued_at: &str, expires_at: &str, now: &str) -> bool {
    issued_at <= now && now < expires_at
}

pub fn looks_like_absolute_path(value: &str) -> bool {
    let candidate = value.trim_start();
    let bytes = candidate.as_bytes();
    (bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/'))
        || candidate.starts_with('/')
        || candidate.starts_with("\\\\")
        || candidate.to_ascii_lowercase().starts_with("file:")
        || candidate.starts_with("~/")
        || candidate.starts_with("~\\")
}

pub fn assert_exact_workspace_path(path: &Path) -> RuntimeResult<()> {
    if !path.is_absolute() {
        return Err(RuntimeError::fail_closed("workspace_path_not_absolute"));
    }
    if path.components().any(|component| matches!(component, Component::ParentDir)) {
        return Err(RuntimeError::fail_closed("workspace_path_escape"));
    }
    Ok(())
}

pub fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|ch| *ch != '_' && *ch != '-')
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

pub fn control_plane_errors(value: &Value, path: &str, errors: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            if looks_like_absolute_path(text) {
                errors.push(format!("{path}: absolute local paths are forbidden"));
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                control_plane_errors(item, &format!("{path}[{index}]"), errors);
            }
        }
        Value::Object(map) => {
            for (key, child) in map {
                let normalized = normalize_key(key);
                if FORBIDDEN_CONTROL_KEYS.contains(&normalized.as_str()) {
                    errors.push(format!("{path}.{key}: forbidden control-plane field"));
                }
                control_plane_errors(child, &format!("{path}.{key}"), errors);
            }
        }
        _ => {}
    }
}

pub fn assert_control_plane_safe(value: &Value) -> RuntimeResult<()> {
    let mut errors = Vec::new();
    control_plane_errors(value, "root", &mut errors);
    if errors.is_empty() {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("control_plane_unsafe"))
    }
}

pub fn redact_text(input: &str) -> String {
    let mut out = input.to_string();
    for token in [
        "CURSOR_API_KEY",
        "providerToken",
        "provider_token",
        "authorization",
        "Bearer ",
        "password=",
        "secret=",
        "token=",
    ] {
        if let Some(index) = out.to_ascii_lowercase().find(&token.to_ascii_lowercase()) {
            let end = (index + token.len() + 24).min(out.len());
            out.replace_range(index..end, "[redacted]");
        }
    }
    if looks_like_absolute_path(&out) {
        return "[redacted-path]".to_string();
    }
    out
}

pub fn presentation_strip(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut clean = serde_json::Map::new();
            for (key, child) in map {
                if FORBIDDEN_CONTROL_KEYS.contains(&normalize_key(&key).as_str()) {
                    continue;
                }
                let stripped = presentation_strip(child);
                if let Value::String(text) = &stripped {
                    if looks_like_absolute_path(text) {
                        continue;
                    }
                }
                clean.insert(key, stripped);
            }
            Value::Object(clean)
        }
        Value::Array(items) => Value::Array(items.into_iter().map(presentation_strip).collect()),
        Value::String(text) if looks_like_absolute_path(&text) => Value::Null,
        other => other,
    }
}

pub fn heartbeat_valid_until(observed_at: &str) -> String {
    if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(observed_at) {
        let next = parsed + chrono::Duration::milliseconds(crate::developer_runtime::types::HEARTBEAT_FRESHNESS_MS as i64);
        return next.with_timezone(&chrono::Utc).format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    }
    now_iso()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::types::RecordRef;

    fn binding() -> ActiveBinding {
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
            workspace_digest: DigestRef {
                algorithm: "sha-256".into(),
                canonicalization: "jcs/1".into(),
                value: "a".repeat(64),
            },
            workspace_trust: "trusted".into(),
            shell_binding_ref: "binding-1".into(),
            shell_binding_version: 1,
            nonce_domain: "developer-remote-workspace".into(),
            issued_at: "2026-08-22T12:00:00.000Z".into(),
            expires_at: "2026-08-22T13:00:00.000Z".into(),
            status: "active".into(),
            audience: crate::developer_runtime::types::AUDIENCE_DESKTOP_RUNTIME.into(),
            binding_version: 1,
            workspace_path: None,
        }
    }

    #[test]
    fn stale_binding_fails_closed() {
        let policy = TrustPolicy::default();
        let err = policy
            .validate_binding(&binding(), "2026-08-22T14:00:00.000Z")
            .unwrap_err();
        assert_eq!(err.code(), "stale_binding");
    }

    #[test]
    fn command_lock_rejects_extra_args_and_paths() {
        let policy = TrustPolicy::default();
        assert!(policy.validate_command_lock(&CommandLock::default()).is_ok());
        let mut bad = CommandLock::default();
        bad.args = vec!["acp".into(), "--trust-all-tools".into()];
        assert_eq!(
            policy.validate_command_lock(&bad).unwrap_err().code(),
            "command_args_locked"
        );
        bad = CommandLock::default();
        bad.program = r"C:\evil\agent.exe".into();
        assert_eq!(
            policy.validate_command_lock(&bad).unwrap_err().code(),
            "command_path_forbidden"
        );
    }

    #[test]
    fn control_plane_rejects_secrets_and_paths() {
        let value = serde_json::json!({
            "providerToken": "secret",
            "cwd": "D:/repo"
        });
        assert!(assert_control_plane_safe(&value).is_err());
        let stripped = presentation_strip(value);
        assert!(stripped.get("providerToken").is_none());
        assert!(stripped.get("cwd").is_none());
    }

    #[test]
    fn stderr_redacts_tokens_and_paths() {
        assert!(redact_text("CURSOR_API_KEY=abcd1234").contains("[redacted]"));
        assert_eq!(redact_text("D:\\Users\\owner\\source"), "[redacted-path]");
    }
}
