//! Codex-borrow Phase B3 — system-Chrome via CDP (HTTP control plane).
//!
//! Design choice: we deliberately do NOT embed a Chromium runtime. Instead
//! we spawn the user's existing Google Chrome / Edge with
//! `--remote-debugging-port=9222` against an isolated `--user-data-dir`,
//! then drive it through CDP's HTTP endpoints (`/json/new`, `/json/list`).
//!
//! This v1 covers: spawn, navigate, list tabs, close. Full JS evaluation
//! requires the WebSocket transport — left for a follow-up so we don't
//! pull in `tokio-tungstenite` until needed.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::ComputerUseError;

const DEFAULT_DEBUG_PORT: u16 = 9222;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTab {
    pub id: String,
    pub title: String,
    pub url: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "webSocketDebuggerUrl", default)]
    pub websocket_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrowserStatus {
    pub running: bool,
    pub port: u16,
    pub user_data_dir: Option<String>,
    pub chrome_path: Option<String>,
}

static BROWSER_STATE: Mutex<Option<BrowserState>> = Mutex::new(None);

#[derive(Debug)]
struct BrowserState {
    port: u16,
    user_data_dir: PathBuf,
    chrome_path: PathBuf,
    pid: Option<u32>,
    /// Per-session secret Origin passed to Chrome via `--remote-allow-origins`.
    /// Only CDP WebSocket clients that echo this exact Origin header can open
    /// a debugger session — it acts as a local bearer token for the port.
    session_origin: String,
}

/// Generate a non-guessable per-session token for the CDP Origin gate.
///
/// This is NOT a cryptographic secret (no OS CSPRNG dependency is pulled in
/// to keep the desktop binary lean); it mixes a high-resolution monotonic
/// clock, the process id and a monotonic counter, which is sufficient to stop
/// a co-resident local process from guessing the Origin and hijacking the
/// agent's debugger session within a single run.
fn gen_session_token() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let now = || {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    };
    let t1 = now();
    let c = COUNTER.fetch_add(1, Ordering::Relaxed) as u128;
    let pid = std::process::id() as u128;
    let t2 = now();
    let mix1 = t1 ^ (pid << 17) ^ c.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    let mix2 = t2.rotate_left(31) ^ pid.rotate_left(41) ^ c.wrapping_mul(0xD1B5_4A32_D192_ED03);
    format!("{:032x}{:032x}", mix1, mix2)
}

/// Derive an ephemeral, hard-to-predict debug port from the session token.
/// Randomising the port (vs the fixed 9222) is defence-in-depth on top of
/// the Origin gate — the real access control is `--remote-allow-origins`.
fn pick_debug_port(token: &str) -> u16 {
    // FNV-1a over the token bytes → map into 9223..=49222.
    let mut acc: u32 = 0x811c_9dc5;
    for b in token.bytes() {
        acc = (acc ^ b as u32).wrapping_mul(0x0100_0193);
    }
    9223u16.wrapping_add((acc % 40000) as u16)
}

/// Locate a Chromium-family browser binary on this OS. Searches Chrome
/// then Edge in well-known install paths.
fn find_chrome_binary() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ];
        for c in candidates {
            let p = PathBuf::from(c);
            if p.exists() {
                return Some(p);
            }
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let p = PathBuf::from(local).join(r"Google\Chrome\Application\chrome.exe");
            if p.exists() {
                return Some(p);
            }
        }
        None
    }
    #[cfg(target_os = "macos")]
    {
        let candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ];
        for c in candidates {
            let p = PathBuf::from(c);
            if p.exists() {
                return Some(p);
            }
        }
        None
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

fn agent_user_data_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir());
    base.join("Agentrix Desktop").join("computer-use-chrome-profile")
}

/// Spawn (or report-already-running) a debugging-enabled Chrome.
pub async fn ensure_browser_running() -> Result<BrowserStatus, ComputerUseError> {
    // Fast path: reuse a live instance with its existing (random) port +
    // session origin — snapshot state, drop the lock, then await.
    let cached = {
        let state = BROWSER_STATE.lock().unwrap();
        state.as_ref().map(|s| {
            (
                s.port,
                s.user_data_dir.to_string_lossy().into_owned(),
                s.chrome_path.to_string_lossy().into_owned(),
            )
        })
    };
    if let Some((port, data_dir, chrome_path)) = cached {
        if http_alive(port).await {
            return Ok(BrowserStatus {
                running: true,
                port,
                user_data_dir: Some(data_dir),
                chrome_path: Some(chrome_path),
            });
        }
    }

    let chrome = find_chrome_binary().ok_or_else(|| {
        ComputerUseError::Backend(
            "no Chrome / Edge install found in standard paths; install Google Chrome or pass a custom path"
                .into(),
        )
    })?;
    let user_data = agent_user_data_dir();
    let _ = std::fs::create_dir_all(&user_data);

    // Per-session secret Origin → local token gate on the debug port.
    // Chrome (111+) only upgrades a CDP WebSocket whose `Origin` header is in
    // `--remote-allow-origins`; without this flag ANY local process could
    // connect with no Origin and drive `Runtime.evaluate`. We echo this exact
    // origin from `cdp_eval::open_socket`.
    let token = gen_session_token();
    let session_origin = format!("http://cdp-{token}.agentrix.localhost");
    let port = pick_debug_port(&token);

    let child = std::process::Command::new(&chrome)
        .arg(format!("--remote-debugging-port={}", port))
        .arg(format!("--remote-allow-origins={}", session_origin))
        .arg(format!("--user-data-dir={}", user_data.to_string_lossy()))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-features=ChromeWhatsNewUI,PrivacySandboxSettings4")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| ComputerUseError::Backend(format!("failed to spawn chrome: {e}")))?;

    let pid = Some(child.id());

    // Poll the HTTP endpoint up to ~5s for readiness.
    let mut alive = false;
    for _ in 0..25 {
        if http_alive(port).await {
            alive = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    if !alive {
        return Err(ComputerUseError::Backend(format!(
            "spawned chrome but its CDP endpoint never came up on :{port}"
        )));
    }

    {
        let mut state = BROWSER_STATE.lock().unwrap();
        *state = Some(BrowserState {
            port,
            user_data_dir: user_data.clone(),
            chrome_path: chrome.clone(),
            pid,
            session_origin,
        });
    }
    Ok(BrowserStatus {
        running: true,
        port,
        user_data_dir: Some(user_data.to_string_lossy().into_owned()),
        chrome_path: Some(chrome.to_string_lossy().into_owned()),
    })
}

/// The per-session CDP Origin token, if a browser has been launched. CDP
/// WebSocket clients MUST send this as their `Origin` header to be accepted.
pub fn current_ws_origin() -> Option<String> {
    BROWSER_STATE
        .lock()
        .unwrap()
        .as_ref()
        .map(|s| s.session_origin.clone())
}

async fn http_alive(port: u16) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    client
        .get(format!("http://127.0.0.1:{}/json/version", port))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

pub async fn list_tabs() -> Result<Vec<BrowserTab>, ComputerUseError> {
    let port = current_port();
    let resp = reqwest::Client::new()
        .get(format!("http://127.0.0.1:{}/json/list", port))
        .send()
        .await
        .map_err(|e| ComputerUseError::Backend(format!("CDP /json/list: {e}")))?;
    let tabs: Vec<BrowserTab> = resp
        .json()
        .await
        .map_err(|e| ComputerUseError::Backend(format!("CDP json parse: {e}")))?;
    Ok(tabs)
}

pub async fn open_tab(url: &str) -> Result<BrowserTab, ComputerUseError> {
    let port = current_port();
    // Modern Chrome requires PUT for `/json/new`.
    let endpoint = format!(
        "http://127.0.0.1:{}/json/new?{}",
        port,
        urlencoding_minimal(url)
    );
    let resp = reqwest::Client::new()
        .put(&endpoint)
        .send()
        .await
        .map_err(|e| ComputerUseError::Backend(format!("CDP /json/new: {e}")))?;
    if !resp.status().is_success() {
        return Err(ComputerUseError::Backend(format!(
            "CDP /json/new returned {}",
            resp.status()
        )));
    }
    let tab: BrowserTab = resp
        .json()
        .await
        .map_err(|e| ComputerUseError::Backend(format!("CDP json parse: {e}")))?;
    Ok(tab)
}

pub async fn close_tab(target_id: &str) -> Result<(), ComputerUseError> {
    let port = current_port();
    let resp = reqwest::Client::new()
        .get(format!("http://127.0.0.1:{}/json/close/{}", port, target_id))
        .send()
        .await
        .map_err(|e| ComputerUseError::Backend(format!("CDP /json/close: {e}")))?;
    if !resp.status().is_success() {
        return Err(ComputerUseError::Backend(format!(
            "CDP /json/close returned {}",
            resp.status()
        )));
    }
    Ok(())
}

pub async fn status() -> BrowserStatus {
    let (port, user_data_dir, chrome_path) = {
        let state = BROWSER_STATE.lock().unwrap();
        let port = state.as_ref().map(|s| s.port).unwrap_or(DEFAULT_DEBUG_PORT);
        let data = state
            .as_ref()
            .map(|s| s.user_data_dir.to_string_lossy().into_owned());
        let chrome = state
            .as_ref()
            .map(|s| s.chrome_path.to_string_lossy().into_owned());
        (port, data, chrome)
    };
    let alive = http_alive(port).await;
    BrowserStatus {
        running: alive,
        port,
        user_data_dir,
        chrome_path,
    }
}

fn current_port() -> u16 {
    BROWSER_STATE
        .lock()
        .unwrap()
        .as_ref()
        .map(|s| s.port)
        .unwrap_or(DEFAULT_DEBUG_PORT)
}

/// Minimal URL-component encoder good enough for the small set of chars
/// we send to `/json/new?<url>`. Avoids pulling in `urlencoding` crate.
fn urlencoding_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~'
            | b':' | b'/' | b'?' | b'#' | b'[' | b']' | b'@' | b'!' | b'$'
            | b'\'' | b'(' | b')' | b'*' | b'+' | b',' | b';' | b'=' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}
