//! The real edges of the MCP server: the stop file, the HTTP gateway, the keychain, stdin / stdout.
//! Everything above these edges is tested with fakes.

use super::{Gateway, GatewayFailure, GatewayReply, HttpMethod, StopSwitch, StopState};
use crate::developer_runtime::context_credential::{load_from_os_keychain, StoredContextCredential};
use serde_json::Value;
use std::io::{BufRead, Read};
use std::path::PathBuf;
use std::time::Duration;

const MAX_RESPONSE_BYTES: usize = 1 << 20;

/// `<app data>/hooks`: the same directory the app's emergency stop mirrors into (`agent_hooks`).
pub fn default_hooks_dir() -> Option<PathBuf> {
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

/// Reads the state file the desktop app keeps in step with the emergency stop. Only an exact `released`
/// lets a call through; a missing, unreadable or unknown file counts as stopped.
pub struct FileStopSwitch {
    pub dir: Option<PathBuf>,
}

impl StopSwitch for FileStopSwitch {
    fn state(&self) -> StopState {
        let Some(dir) = &self.dir else { return StopState::Unknown };
        match crate::agent_hooks::read_state(dir) {
            Some(crate::agent_hooks::StoredState::Released) => StopState::Released,
            Some(crate::agent_hooks::StoredState::Engaged) => StopState::Engaged,
            _ => StopState::Unknown,
        }
    }
}

pub struct KeychainCredentials;

impl super::CredentialSource for KeychainCredentials {
    fn load(&self, client_id: &str) -> Result<Option<StoredContextCredential>, String> {
        load_from_os_keychain(client_id)
    }
}

/// reqwest, no redirects (a bearer token must not follow one), a 15 second limit and a 1 MiB answer limit.
pub struct HttpGateway {
    client: reqwest::blocking::Client,
}

impl HttpGateway {
    pub fn new() -> Result<Self, String> {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map(|client| Self { client })
            .map_err(|_| "http_client_unavailable".to_string())
    }
}

impl Gateway for HttpGateway {
    fn call(
        &self,
        origin: &str,
        method: HttpMethod,
        path: &str,
        token: &str,
        body: Option<&Value>,
    ) -> Result<GatewayReply, GatewayFailure> {
        let url = format!("{origin}{path}");
        let request = match method {
            HttpMethod::Get => self.client.get(&url),
            HttpMethod::Post => self.client.post(&url),
        };
        let request = request.bearer_auth(token).header("Accept", "application/json");
        let request = match body {
            Some(value) => request.json(value),
            None => request,
        };
        let response = request.send().map_err(|_| GatewayFailure::Network)?;
        let status = response.status().as_u16();
        let mut bytes = Vec::new();
        response
            .take(MAX_RESPONSE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| GatewayFailure::Network)?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(GatewayFailure::TooLarge);
        }
        Ok(GatewayReply { status, body: serde_json::from_slice(&bytes).unwrap_or(Value::Null) })
    }
}

pub enum Line {
    Text(String),
    TooLong,
}

/// One line, at most `max` bytes. A longer line is skipped to its end and reported, so one bad message
/// cannot grow memory or desynchronise the stream.
pub fn read_bounded_line<R: BufRead>(reader: &mut R, max: usize) -> std::io::Result<Option<Line>> {
    let mut buf = Vec::new();
    let read = reader.by_ref().take(max as u64 + 1).read_until(b'\n', &mut buf)?;
    if read == 0 {
        return Ok(None);
    }
    if buf.last() != Some(&b'\n') && buf.len() > max {
        loop {
            let (done, used) = {
                let chunk = reader.fill_buf()?;
                if chunk.is_empty() {
                    break;
                }
                match chunk.iter().position(|b| *b == b'\n') {
                    Some(at) => (true, at + 1),
                    None => (false, chunk.len()),
                }
            };
            reader.consume(used);
            if done {
                break;
            }
        }
        return Ok(Some(Line::TooLong));
    }
    Ok(Some(Line::Text(String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_string())))
}
