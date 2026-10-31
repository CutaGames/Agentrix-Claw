//! L8 D3: the real edges of the home node: the platform, the model server on this computer, Home Assistant, the clock,
//! the emergency stop and the device key. Everything above them is tested with fakes (`runner.rs`).
//!
//! The node only ever calls OUT: to the platform API in its configuration, to a model server on 127.0.0.1, and to the
//! Home Assistant address in its configuration. It opens no port. No client here follows a redirect, so an answer
//! cannot send a bearer token somewhere else. Tokens are read from their files when they are needed and are never
//! written to a log.
use crate::developer_runtime::home_node_identity::{DeviceIdentity, OsKeyringStore, SecureStore};
use crate::home_node::config::{self, KeyStoreKind, NodeConfig};
use crate::home_node::ha_bridge::{self, HaHttp};
use crate::home_node::jobs::{self, Capabilities};
use crate::home_node::keystore::FileSecureStore;
use crate::home_node::runner::{self, NodeIo};
use chrono::{DateTime, Utc};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{json, Map, Value};
use std::io::Read;
use std::path::PathBuf;
use std::time::Duration;

const PLATFORM_RESPONSE_MAX_BYTES: u64 = 1 << 20;
const INFERENCE_RESPONSE_MAX_BYTES: u64 = 256 * 1024;
const HA_RESPONSE_READ_MAX_BYTES: u64 = 64 * 1024;
const STOP_FILE: &str = "STOP";

fn client(timeout_secs: u64) -> Result<reqwest::blocking::Client, &'static str> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "http_client_unavailable")
}

fn read_limited(response: reqwest::blocking::Response, max: u64) -> Result<String, &'static str> {
    let mut bytes = Vec::new();
    response.take(max + 1).read_to_end(&mut bytes).map_err(|_| "network_error")?;
    if bytes.len() as u64 > max {
        return Err("response_too_large");
    }
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

/// `<app data>/hooks`, where the desktop app mirrors its emergency stop (same place `mcp_stdio` reads).
fn hooks_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let base = if cfg!(target_os = "macos") {
        home?.join("Library").join("Application Support")
    } else if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)?
    } else {
        match std::env::var_os("XDG_DATA_HOME") {
            Some(dir) if !dir.is_empty() => PathBuf::from(dir),
            _ => home?.join(".local").join("share"),
        }
    };
    Some(base.join("top.agentrix.desktop").join("hooks"))
}

/// The emergency stop, both gates: the process-wide switch, the desktop app's state file (engaged, or present but
/// unreadable, stops; no file at all means no desktop app ever ran here, which is the normal case for a headless box)
/// and the node's own `STOP` file (touch it to stop the node, delete it to let it go on).
pub fn stop_engaged(node_dir: Option<&std::path::Path>, hooks: Option<&std::path::Path>) -> bool {
    crate::kill_switch::is_engaged() || stop_from_files(node_dir, hooks)
}

/// The two file gates of `stop_engaged` (separate so the tests do not depend on the process-wide switch).
pub fn stop_from_files(node_dir: Option<&std::path::Path>, hooks: Option<&std::path::Path>) -> bool {
    if let Some(hooks) = hooks {
        match crate::agent_hooks::read_state(hooks) {
            Some(crate::agent_hooks::StoredState::Released) | None => {}
            Some(_) => return true,
        }
    }
    match node_dir {
        // Where the node keeps its files is unknown: nothing can show that it is not stopped.
        None => true,
        Some(dir) => dir.join(STOP_FILE).exists(),
    }
}

struct ReqwestHa {
    client: reqwest::blocking::Client,
}

impl HaHttp for ReqwestHa {
    fn get(&self, url: &str, token: &str) -> Result<(u16, String), &'static str> {
        let response = self.client.get(url).bearer_auth(token).header("Accept", "application/json").send().map_err(|_| "ha_unreachable")?;
        let status = response.status().as_u16();
        Ok((status, read_limited(response, HA_RESPONSE_READ_MAX_BYTES).map_err(|_| "ha_response_too_large")?))
    }

    fn post(&self, url: &str, token: &str, body: &Value) -> Result<(u16, String), &'static str> {
        let response = self.client.post(url).bearer_auth(token).json(body).send().map_err(|_| "ha_unreachable")?;
        let status = response.status().as_u16();
        Ok((status, read_limited(response, HA_RESPONSE_READ_MAX_BYTES).map_err(|_| "ha_response_too_large")?))
    }
}

pub struct LiveIo {
    config: NodeConfig,
    identity: DeviceIdentity,
    node_dir: Option<PathBuf>,
    inference_url: Option<reqwest::Url>,
    ha_base: Option<String>,
}

impl LiveIo {
    pub fn new(config: NodeConfig, identity: DeviceIdentity) -> Result<Self, &'static str> {
        let inference_url = match &config.local_inference_url {
            Some(raw) => Some(jobs::local_inference_url(raw)?),
            None => None,
        };
        let ha_base = match &config.ha {
            Some(ha) => Some(ha_bridge::ha_base_url(&ha.url)?),
            None => None,
        };
        let node_dir = config::node_dir(&config);
        Ok(Self { config, identity, node_dir, inference_url, ha_base })
    }

    pub fn capabilities(&self) -> Capabilities {
        Capabilities { llm: self.inference_url.is_some(), ha: self.ha_base.is_some() }
    }

    pub fn device_id(&self) -> &str {
        self.identity.device_id()
    }

    fn platform(&self, method: &str, path: &str, body: Option<&Value>) -> Result<(u16, Value), &'static str> {
        let token = config::read_secret_file(std::path::Path::new(&self.config.token_file))?;
        let url = format!("{}{}", self.config.api_base.trim_end_matches('/'), path);
        let http = client(15)?;
        let request = if method == "GET" { http.get(&url) } else { http.post(&url) };
        let request = request.bearer_auth(token).header("Accept", "application/json");
        let request = match body {
            Some(value) => request.json(value),
            None => request,
        };
        let response = request.send().map_err(|_| "platform_unreachable")?;
        let status = response.status().as_u16();
        let text = read_limited(response, PLATFORM_RESPONSE_MAX_BYTES)?;
        Ok((status, serde_json::from_str(&text).unwrap_or(Value::Null)))
    }

    /// Signs and uploads this node's capability declaration. A rejection is an error code, never the body.
    pub fn declare(&self) -> Result<(), &'static str> {
        let mut raw = [0u8; 16];
        SystemRandom::new().fill(&mut raw).map_err(|_| "random_unavailable")?;
        raw[6] = (raw[6] & 0x0f) | 0x40;
        raw[8] = (raw[8] & 0x3f) | 0x80;
        let hex = hex::encode(raw);
        let declaration_id = format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32]);
        let declaration = runner::build_declaration(
            self.identity.device_id(),
            &declaration_id,
            &self.config.signer_ref,
            &self.config.binding_ref.id,
            self.config.binding_ref.version,
            self.capabilities(),
            self.now(),
        );
        let signed = self.identity.sign_capability_declaration(&declaration).map_err(|_| "sign_failed")?;
        let body = json!({ "declaration": declaration, "signature": signed.signature });
        let (status, _) = self.platform("POST", &format!("/devices/{}/capabilities", self.identity.device_id()), Some(&body))?;
        if (200..300).contains(&status) {
            Ok(())
        } else {
            Err("declaration_rejected")
        }
    }

    /// Takes the next job, if any. `Ok(None)` when there is none.
    pub fn next_job(&self) -> Result<Option<Value>, &'static str> {
        let (status, body) = self.platform("GET", &format!("/home-node/jobs/next?deviceId={}", self.identity.device_id()), None)?;
        if !(200..300).contains(&status) {
            return Err("platform_rejected");
        }
        Ok(body.get("job").filter(|job| !job.is_null()).cloned())
    }

    pub fn is_stopped(&self) -> bool {
        stop_engaged(self.node_dir.as_deref(), hooks_dir().as_deref())
    }
}

impl NodeIo for LiveIo {
    fn stopped(&self) -> bool {
        self.is_stopped()
    }

    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }

    fn infer(&self, prompt: &str, max_tokens: u32) -> Result<String, &'static str> {
        let url = self.inference_url.as_ref().ok_or("inference_not_configured")?;
        // Checked again here, not only at start: the address must still be this computer.
        jobs::local_inference_url(url.as_str())?;
        let response = client(120)?
            .post(url.clone())
            .json(&json!({ "prompt": prompt, "max_tokens": max_tokens, "stream": false }))
            .send()
            .map_err(|_| "local_inference_unreachable")?;
        if !response.status().is_success() {
            return Err("local_inference_failed");
        }
        let text = read_limited(response, INFERENCE_RESPONSE_MAX_BYTES).map_err(|_| "local_inference_failed")?;
        let value: Value = serde_json::from_str(&text).map_err(|_| "local_inference_failed")?;
        value["choices"][0]["text"].as_str().map(str::to_string).ok_or("local_inference_failed")
    }

    fn ha(&self, entity_id: &str, action: &str, data: Option<&Map<String, Value>>) -> Result<String, &'static str> {
        let (base, ha) = (self.ha_base.as_deref().ok_or("ha_not_configured")?, self.config.ha.as_ref().ok_or("ha_not_configured")?);
        // The Home Assistant token is read now and goes nowhere but to the Home Assistant address.
        let token = config::read_secret_file(std::path::Path::new(&ha.token_file))?;
        ha_bridge::call(&ReqwestHa { client: client(15)? }, base, &token, entity_id, action, data)
    }

    fn sign_receipt(&self, job_ref: &str, status: &str, result_digest: &str, finished_at: &str) -> Result<String, &'static str> {
        self.identity.sign_home_job_receipt(job_ref, status, result_digest, finished_at).map_err(|_| "sign_failed")
    }

    fn post_receipt(&self, job_ref: &str, body: &Value) -> Result<(), &'static str> {
        let (status, _) = self.platform("POST", &format!("/home-node/jobs/{job_ref}/receipt"), Some(body))?;
        if (200..300).contains(&status) {
            Ok(())
        } else {
            Err("receipt_rejected")
        }
    }

    fn post_output(&self, job_ref: &str, output: &str) -> Result<(), &'static str> {
        let (status, _) = self.platform("POST", &format!("/home-node/jobs/{job_ref}/output"), Some(&json!({ "output": output })))?;
        if (200..300).contains(&status) {
            Ok(())
        } else {
            Err("output_rejected")
        }
    }
}

/// Opens the device key the configuration names, creating it on first use.
pub fn open_identity(config: &NodeConfig) -> Result<DeviceIdentity, &'static str> {
    let result = match config.key_store {
        KeyStoreKind::Os => DeviceIdentity::load_or_create(&OsKeyringStore as &dyn SecureStore),
        KeyStoreKind::File => {
            let dir = config::node_dir(config).ok_or("key_dir_unknown")?;
            DeviceIdentity::load_or_create(&FileSecureStore::new(dir) as &dyn SecureStore)
        }
    };
    result.map_err(|_| "device_key_unavailable")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_nodes_own_stop_file_stops_it_and_removing_it_lets_it_go() {
        let dir = tempfile::tempdir().unwrap();
        let hooks = tempfile::tempdir().unwrap();
        assert!(!stop_from_files(Some(dir.path()), Some(hooks.path())));
        std::fs::write(dir.path().join(STOP_FILE), "").unwrap();
        assert!(stop_from_files(Some(dir.path()), Some(hooks.path())));
        std::fs::remove_file(dir.path().join(STOP_FILE)).unwrap();
        assert!(!stop_from_files(Some(dir.path()), Some(hooks.path())));
    }

    #[test]
    fn the_desktop_apps_state_file_stops_the_node_unless_it_says_released() {
        let dir = tempfile::tempdir().unwrap();
        let hooks = tempfile::tempdir().unwrap();
        let state = hooks.path().join(crate::agent_hooks::STATE_FILE);
        for (text, stopped) in [("released\n", false), ("engaged\n", true), ("garbage\n", true), ("", true)] {
            std::fs::write(&state, text).unwrap();
            assert_eq!(stop_from_files(Some(dir.path()), Some(hooks.path())), stopped, "{text:?}");
        }
    }

    #[test]
    fn an_unknown_node_directory_counts_as_stopped() {
        let hooks = tempfile::tempdir().unwrap();
        assert!(stop_from_files(None, Some(hooks.path())));
    }

    #[test]
    fn no_desktop_app_and_no_stop_file_is_not_stopped() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!stop_from_files(Some(dir.path()), None));
    }
}
