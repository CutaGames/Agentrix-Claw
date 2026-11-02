//! L8 D3: the home node's own configuration file, and the places it keeps secrets.
//!
//! Everything the node needs to know lives in one JSON file the owner writes (`--config <path>`). Secrets are not in
//! it: the platform sign-in token and the Home Assistant token are each in a file of their own, and the node refuses
//! a secret file other users can read (mode 0600 on Unix). Unknown settings are an error, not ignored.
use serde::Deserialize;
use std::path::{Path, PathBuf};

pub const CONFIG_MAX_BYTES: u64 = 64 * 1024;
pub const SECRET_MAX_BYTES: u64 = 4096;
pub const POLL_SECONDS_MIN: u64 = 3;
pub const POLL_SECONDS_MAX: u64 = 300;
pub const POLL_SECONDS_DEFAULT: u64 = 10;
pub const DECLARE_SECONDS_DEFAULT: u64 = 240;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BindingRef {
    pub id: String,
    pub version: u32,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HaConfig {
    /// Where Home Assistant is on this network (`http://homeassistant.local:8123`).
    pub url: String,
    /// File with the long-lived Home Assistant token (mode 0600). Never sent anywhere but to `url`.
    pub token_file: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodeConfig {
    /// The platform API, `https://api.agentrix.top/api`. Plain `http` is accepted only for this computer.
    pub api_base: String,
    /// File with the owner's sign-in token for this node (mode 0600).
    pub token_file: String,
    /// The signing credential of this node's device key and the shell binding it declares under (set up once
    /// with the owner's pairing flow; the node never creates either by itself).
    pub signer_ref: String,
    pub binding_ref: BindingRef,
    /// Where the device key is kept: a 0600 file in `key_dir` (default, works without a desktop session) or the OS keyring.
    #[serde(default)]
    pub key_store: KeyStoreKind,
    #[serde(default)]
    pub key_dir: Option<String>,
    /// OpenAI-style `/v1/completions` address of a model server on THIS computer. Absent = no text jobs.
    #[serde(default)]
    pub local_inference_url: Option<String>,
    /// Absent = no Home Assistant jobs.
    #[serde(default)]
    pub ha: Option<HaConfig>,
    #[serde(default)]
    pub poll_seconds: Option<u64>,
    #[serde(default)]
    pub declare_seconds: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum KeyStoreKind {
    #[default]
    File,
    Os,
}

impl NodeConfig {
    pub fn poll_seconds(&self) -> u64 {
        self.poll_seconds.unwrap_or(POLL_SECONDS_DEFAULT).clamp(POLL_SECONDS_MIN, POLL_SECONDS_MAX)
    }

    pub fn declare_seconds(&self) -> u64 {
        self.declare_seconds.unwrap_or(DECLARE_SECONDS_DEFAULT).clamp(60, 600)
    }
}

/// Reads and checks the configuration. Every refusal is a short code, never the content of the file.
pub fn load_config(path: &Path) -> Result<NodeConfig, &'static str> {
    let meta = std::fs::metadata(path).map_err(|_| "config_unreadable")?;
    if !meta.is_file() || meta.len() > CONFIG_MAX_BYTES {
        return Err("config_unreadable");
    }
    let text = std::fs::read_to_string(path).map_err(|_| "config_unreadable")?;
    let config: NodeConfig = serde_json::from_str(&text).map_err(|_| "config_invalid")?;
    validate(&config)?;
    Ok(config)
}

pub fn validate(config: &NodeConfig) -> Result<(), &'static str> {
    let api = config.api_base.as_str();
    let api_ok = api.starts_with("https://") && reqwest::Url::parse(api).map(|u| u.host_str().is_some() && u.username().is_empty() && u.password().is_none()).unwrap_or(false)
        || crate::home_node::jobs::local_inference_url(api).is_ok();
    if !api_ok {
        return Err("api_base_invalid");
    }
    if config.token_file.is_empty() || config.signer_ref.is_empty() || config.signer_ref.len() > 128 || config.signer_ref.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("config_invalid");
    }
    let binding = &config.binding_ref;
    if binding.version < 1 || binding.id.len() != 36 {
        return Err("config_invalid");
    }
    if let Some(url) = &config.local_inference_url {
        crate::home_node::jobs::local_inference_url(url)?;
    }
    if let Some(ha) = &config.ha {
        crate::home_node::ha_bridge::ha_base_url(&ha.url)?;
        if ha.token_file.is_empty() {
            return Err("config_invalid");
        }
    }
    if config.key_store == KeyStoreKind::Os && config.key_dir.is_some() {
        return Err("config_invalid");
    }
    Ok(())
}

/// A secret kept in its own file: at most 4 KiB, not empty, and on Unix not readable by anyone else.
pub fn read_secret_file(path: &Path) -> Result<String, &'static str> {
    let meta = std::fs::metadata(path).map_err(|_| "secret_unreadable")?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > SECRET_MAX_BYTES {
        return Err("secret_unreadable");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o077 != 0 {
            return Err("secret_permissions");
        }
    }
    let text = std::fs::read_to_string(path).map_err(|_| "secret_unreadable")?;
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.chars().any(|c| c.is_control()) {
        return Err("secret_unreadable");
    }
    Ok(trimmed.to_string())
}

/// `<dir>` for the node's own files (device key, STOP file): `key_dir`, else `$HOME/.config/agentrix/home-node`.
pub fn node_dir(config: &NodeConfig) -> Option<PathBuf> {
    match &config.key_dir {
        Some(dir) => Some(PathBuf::from(dir)),
        None => std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config").join("agentrix").join("home-node")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> serde_json::Value {
        serde_json::json!({
            "apiBase": "https://api.agentrix.top/api",
            "tokenFile": "/etc/agentrix/token",
            "signerRef": "dsc_key_1",
            "bindingRef": { "id": "22222222-3333-4444-8555-666666666666", "version": 1 },
            "localInferenceUrl": "http://127.0.0.1:8080/v1/completions",
            "ha": { "url": "http://homeassistant.local:8123", "tokenFile": "/etc/agentrix/ha" }
        })
    }

    fn parse(value: serde_json::Value) -> Result<NodeConfig, &'static str> {
        let config: NodeConfig = serde_json::from_value(value).map_err(|_| "config_invalid")?;
        validate(&config)?;
        Ok(config)
    }

    #[test]
    fn a_complete_configuration_is_accepted_with_defaults() {
        let config = parse(base()).unwrap();
        assert_eq!(config.key_store, KeyStoreKind::File);
        assert_eq!(config.poll_seconds(), POLL_SECONDS_DEFAULT);
        assert_eq!(config.declare_seconds(), DECLARE_SECONDS_DEFAULT);
    }

    #[test]
    fn unknown_settings_and_bad_values_are_refused() {
        let mut extra = base();
        extra["shell"] = serde_json::json!("/bin/sh");
        assert_eq!(parse(extra), Err("config_invalid"));
        for (field, value) in [
            ("apiBase", serde_json::json!("http://api.agentrix.top/api")),
            ("apiBase", serde_json::json!("ftp://x")),
            ("apiBase", serde_json::json!("https://user:pw@api.agentrix.top/api")),
            ("localInferenceUrl", serde_json::json!("http://192.168.1.5:8080/x")),
            ("localInferenceUrl", serde_json::json!("https://127.0.0.1/x")),
            ("bindingRef", serde_json::json!({ "id": "short", "version": 1 })),
            ("bindingRef", serde_json::json!({ "id": "22222222-3333-4444-8555-666666666666", "version": 0 })),
            ("signerRef", serde_json::json!("has space")),
            ("ha", serde_json::json!({ "url": "http://user:pw@ha.local", "tokenFile": "/x" })),
            ("ha", serde_json::json!({ "url": "http://ha.local", "tokenFile": "" })),
        ] {
            let mut config = base();
            config[field] = value.clone();
            assert!(parse(config).is_err(), "{field} = {value}");
        }
        let mut os_with_dir = base();
        os_with_dir["keyStore"] = serde_json::json!("os");
        os_with_dir["keyDir"] = serde_json::json!("/tmp/x");
        assert_eq!(parse(os_with_dir), Err("config_invalid"));
    }

    #[test]
    fn plain_http_is_for_this_computer_only() {
        let mut local = base();
        local["apiBase"] = serde_json::json!("http://127.0.0.1:3001/api");
        assert!(parse(local).is_ok());
    }

    #[test]
    fn intervals_are_kept_inside_their_bounds() {
        let mut config = parse(base()).unwrap();
        config.poll_seconds = Some(0);
        config.declare_seconds = Some(1);
        assert_eq!((config.poll_seconds(), config.declare_seconds()), (POLL_SECONDS_MIN, 60));
        config.poll_seconds = Some(100_000);
        config.declare_seconds = Some(100_000);
        assert_eq!((config.poll_seconds(), config.declare_seconds()), (POLL_SECONDS_MAX, 600));
    }

    #[cfg(unix)]
    #[test]
    fn a_secret_file_other_users_can_read_is_refused() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("token");
        std::fs::write(&file, "  s3cret-token \n").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(read_secret_file(&file), Err("secret_permissions"));
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(read_secret_file(&file).unwrap(), "s3cret-token");
        std::fs::write(&file, "").unwrap();
        assert_eq!(read_secret_file(&file), Err("secret_unreadable"));
        std::fs::write(&file, "line1\nline2").unwrap();
        assert_eq!(read_secret_file(&file), Err("secret_unreadable"));
        assert_eq!(read_secret_file(&dir.path().join("missing")), Err("secret_unreadable"));
    }

    #[test]
    fn a_missing_oversized_or_broken_config_file_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("home-node.json");
        assert_eq!(load_config(&file), Err("config_unreadable"));
        std::fs::write(&file, "{ not json").unwrap();
        assert_eq!(load_config(&file), Err("config_invalid"));
        std::fs::write(&file, base().to_string()).unwrap();
        assert!(load_config(&file).is_ok());
        std::fs::write(&file, vec![b' '; (CONFIG_MAX_BYTES + 1) as usize]).unwrap();
        assert_eq!(load_config(&file), Err("config_unreadable"));
    }
}
