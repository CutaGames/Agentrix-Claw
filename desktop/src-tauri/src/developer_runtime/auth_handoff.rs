//! E84 C（REQ-backend-073，合同 `shared/types/auth-handoff-code.ts`）：浏览器登录的回调只带一次性 code。
//!
//! 整条流程都在 Rust 里做，WebView 只说"用哪个服务商"，最后拿到登录 token（`auth-token-received`）：
//! 1. 生成 `state`（32 字节随机数）和 PKCE 的 `codeVerifier`（32 字节随机数），算出 S256 `code_challenge`。
//!    两个都只在内存里，用完清零，不落盘。
//! 2. 起本机回调口（`127.0.0.1:<随机端口>/auth-callback`），把发起地址
//!    `GET /api/auth/<provider>?handoff_client=desktop&state=…&code_challenge=…&code_challenge_method=S256&callback_port=…`
//!    交给 WebView 在系统浏览器里打开。
//! 3. 回调只收 `?code=…&state=…`（读法和 shared `readAuthHandoffCallbackV1` 一样，对拍向量见
//!    `auth_handoff_vectors.json`）：`state` 不是这次发的、URL 里有 `token` / `access_token`、code 格式不对，都不认，
//!    继续等真正的回调（别的进程先敲这个端口，最多让登录失败，拿不到 token）。
//! 4. 用 `codeVerifier` 调 `POST /api/auth/handoff/exchange`（https、主机白名单），换到登录 token。
//!
//! 后端实现之前（CONTRACTS 标"已实现"之前）默认关：启动时设 `AGENTRIX_AUTH_HANDOFF=1` 才开，
//! 关着时 WebView 走旧的本机回调（`desktop_bridge_start_auth_callback_server`）。

use crate::developer_runtime::channel::{HttpTransport, OutboundHttpRequest};
use crate::developer_runtime::policy::TrustPolicy;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};
use zeroize::Zeroize;

pub const ENV_AUTH_HANDOFF: &str = "AGENTRIX_AUTH_HANDOFF";
pub const CALLBACK_PATH: &str = "/auth-callback";
pub const EXCHANGE_PATH: &str = "/api/auth/handoff/exchange";
/// shared `AUTH_HANDOFF_CALLBACK_ERRORS`。
pub const CALLBACK_ERRORS: [&str; 3] = ["login_failed", "login_cancelled", "provider_unavailable"];
/// 回调口最多等多久（服务端的 code 只活 60 秒，但人在浏览器里登录可能要几分钟）。
pub const CALLBACK_WAIT: Duration = Duration::from_secs(600);
/// 回调口最多处理多少个请求（浏览器会顺带要 favicon；别的进程也可能乱敲）。
const MAX_CALLBACK_REQUESTS: usize = 16;
const EXCHANGE_TIMEOUT: Duration = Duration::from_secs(15);

/// 启动时读一次：`AGENTRIX_AUTH_HANDOFF=1` 才开。
pub fn handoff_enabled() -> bool {
    static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var(ENV_AUTH_HANDOFF).ok().as_deref() == Some("1"))
}

/// 登录方式 id（shared `AUTH_PROVIDER_IDS` 里能跳浏览器的那几个）→ 服务端的路由段。
/// Apple 从 E86 ②（REQ-backend-078）起也走 handoff；WebView 只在服务端说支持时才发起
/// （`authProviderSupportsHandoffV1`），旧后端上 Apple 不会出现。
pub fn provider_route(provider: &str) -> Option<&'static str> {
    match provider {
        "google" => Some("google"),
        "apple" => Some("apple"),
        "discord" => Some("discord"),
        "x" => Some("twitter"),
        _ => None,
    }
}

fn all_bytes(value: &str, min: usize, max: usize, ok: impl Fn(u8) -> bool) -> bool {
    (min..=max).contains(&value.len()) && value.bytes().all(ok)
}

fn is_b64url_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'-' || b == b'_'
}

/// shared `AUTH_HANDOFF_STATE_PATTERN`：43–128 位 base64url。
pub fn valid_state(value: &str) -> bool {
    all_bytes(value, 43, 128, is_b64url_byte)
}

/// shared `AUTH_HANDOFF_CODE_VERIFIER_PATTERN`（RFC 7636 §4.1）。
pub fn valid_code_verifier(value: &str) -> bool {
    all_bytes(value, 43, 128, |b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'~' | b'-'))
}

/// shared `AUTH_HANDOFF_CODE_PATTERN`：`ahc_` + 43 位 base64url。
pub fn valid_code(value: &str) -> bool {
    value.strip_prefix("ahc_").is_some_and(|rest| all_bytes(rest, 43, 43, is_b64url_byte))
}

/// PKCE S256：`base64url(SHA-256(ASCII(codeVerifier)))`，和 shared `authHandoffPkceChallengeV1` 一样。
pub fn pkce_challenge(code_verifier: &str) -> String {
    use sha2::{Digest, Sha256};
    URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()))
}

fn random_b64url() -> String {
    let mut bytes: [u8; 32] = rand::random();
    let text = URL_SAFE_NO_PAD.encode(bytes);
    bytes.zeroize();
    text
}

/// 这一次登录的 `state` 和 `codeVerifier`。只在内存里，丢掉时清零。
pub struct HandoffSecrets {
    state: String,
    code_verifier: String,
}

impl HandoffSecrets {
    pub fn generate() -> Self {
        Self { state: random_b64url(), code_verifier: random_b64url() }
    }

    #[cfg(test)]
    pub fn fixed(state: &str, code_verifier: &str) -> Self {
        Self { state: state.into(), code_verifier: code_verifier.into() }
    }

    pub fn state(&self) -> &str {
        &self.state
    }

    pub fn code_verifier(&self) -> &str {
        &self.code_verifier
    }

    pub fn code_challenge(&self) -> String {
        pkce_challenge(&self.code_verifier)
    }
}

impl Drop for HandoffSecrets {
    fn drop(&mut self) {
        self.state.zeroize();
        self.code_verifier.zeroize();
    }
}

/// 发起地址。`origin` 是 API 源（`https://api.agentrix.top`，不带 `/api`）。
pub fn start_url(origin: &str, provider: &str, secrets: &HandoffSecrets, callback_port: u16) -> Result<String, String> {
    let route = provider_route(provider).ok_or_else(|| "handoff_provider_unknown".to_string())?;
    if callback_port == 0 {
        return Err("callback_unavailable".into());
    }
    Ok(format!(
        "{origin}/api/auth/{route}?handoff_client=desktop&state={}&code_challenge={}&code_challenge_method=S256&callback_port={callback_port}",
        secrets.state(),
        secrets.code_challenge()
    ))
}

// ── 读回调（和 shared `parseAuthHandoffCallbackParamsV1` / `readAuthHandoffCallbackV1` 逐条一致）──────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CallbackRead {
    Code(String),
    Error(String),
    Invalid,
}

/// JS `decodeURIComponent(s.replace(/\+/g, ' '))`：`%XX` 必须是两位十六进制，解出来必须是 UTF-8，否则 None。
fn decode_component(raw: &str) -> Option<String> {
    let replaced = raw.replace('+', " ");
    let bytes = replaced.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes.get(i + 1..i + 3)?;
            let text = std::str::from_utf8(hex).ok()?;
            if !text.bytes().all(|b| b.is_ascii_hexdigit()) {
                return None;
            }
            out.push(u8::from_str_radix(text, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn has_scheme(url: &str) -> bool {
    let mut chars = url.chars();
    if !chars.next().is_some_and(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    for c in chars {
        if c == ':' {
            return true;
        }
        if !(c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-')) {
            return false;
        }
    }
    false
}

/// 第一个 `?` 到 `#` 之间（没有 `?` 就取 `#` 之后），按 `&` 切，每项只按第一个 `=` 切。
/// 解码失败、同一个参数出现两次都算读不出（None）。
pub fn parse_callback_params(url: &str) -> Option<Vec<(String, String)>> {
    if url.encode_utf16().count() > 4096 || !has_scheme(url) {
        return None;
    }
    let q = url.find('?');
    let h = url.find('#');
    let raw = match (q, h) {
        (Some(q), Some(h)) if q < h => &url[q + 1..h],
        (Some(q), None) => &url[q + 1..],
        (_, Some(h)) => &url[h + 1..],
        (None, None) => "",
    };
    let mut params: Vec<(String, String)> = Vec::new();
    for part in raw.split('&') {
        if part.is_empty() {
            continue;
        }
        let (key, value) = match part.find('=') {
            Some(i) => (&part[..i], &part[i + 1..]),
            None => (part, ""),
        };
        let key = decode_component(key)?;
        let value = decode_component(value)?;
        if params.iter().any(|(k, _)| *k == key) {
            return None;
        }
        params.push((key, value));
    }
    Some(params)
}

pub fn read_callback(url: &str, expected_state: &str) -> CallbackRead {
    let Some(params) = parse_callback_params(url) else {
        return CallbackRead::Invalid;
    };
    let get = |name: &str| params.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str());
    if get("token").is_some() || get("access_token").is_some() {
        return CallbackRead::Invalid;
    }
    if get("state") != Some(expected_state) || !valid_state(expected_state) {
        return CallbackRead::Invalid;
    }
    if let Some(error) = get("error") {
        return CallbackRead::Error(if CALLBACK_ERRORS.contains(&error) { error.to_string() } else { "login_failed".into() });
    }
    match get("code") {
        Some(code) if valid_code(code) => CallbackRead::Code(code.to_string()),
        _ => CallbackRead::Invalid,
    }
}

// ── 换 token ─────────────────────────────────────────────────────────────

/// `POST /api/auth/handoff/exchange`。不带任何登录凭据。成功返回登录 token，失败返回原因码：
/// 400 → `handoff_code_invalid`（或服务端的码），429 → `handoff_rate_limited`，连不上 → `network`，
/// 2xx 但格式不对 → `invalid_response`。
pub fn exchange(
    transport: &dyn HttpTransport,
    policy: &TrustPolicy,
    origin: &str,
    code: &str,
    secrets: &HandoffSecrets,
) -> Result<String, String> {
    if !valid_code(code) || !valid_state(secrets.state()) || !valid_code_verifier(secrets.code_verifier()) {
        return Err("handoff_code_invalid".into());
    }
    let url = format!("{origin}{EXCHANGE_PATH}");
    policy.validate_outbound_url(&url).map_err(|error| error.code().to_string())?;
    let response = transport
        .send(OutboundHttpRequest {
            method: "POST".into(),
            url,
            headers: vec![
                ("Accept".into(), "application/json".into()),
                ("Content-Type".into(), "application/json".into()),
            ],
            body: Some(json!({
                "schemaVersion": 1,
                "code": code,
                "state": secrets.state(),
                "codeVerifier": secrets.code_verifier(),
            })),
            timeout: EXCHANGE_TIMEOUT,
        })
        .map_err(|_| "network".to_string())?;
    let status = response.status;
    if !(200..300).contains(&status) {
        let server = crate::developer_runtime::enrollment::server_code(&response.body);
        return Err(match status {
            429 => "handoff_rate_limited".into(),
            400 => server.unwrap_or_else(|| "handoff_code_invalid".into()),
            _ => server.unwrap_or_else(|| format!("http_{status}")),
        });
    }
    access_token_of(&response.body).ok_or_else(|| "invalid_response".to_string())
}

/// shared `decodeAuthHandoffExchangeResponseV1` 的检查，再加上 token 本身的样子（不含空白、不超过 8 KB）。
fn access_token_of(body: &Value) -> Option<String> {
    let data = match body.get("data") {
        Some(data) if body.get("success") != Some(&json!(false)) && data.is_object() => data,
        _ => body,
    };
    if data.get("schemaVersion") != Some(&json!(1)) || data.get("tokenType") != Some(&json!("Bearer")) {
        return None;
    }
    if !data.get("authIssuedAt").and_then(Value::as_f64).is_some_and(f64::is_finite) {
        return None;
    }
    if !data.pointer("/user/id").and_then(Value::as_str).is_some_and(|id| !id.is_empty()) {
        return None;
    }
    let token = data.get("accessToken").and_then(Value::as_str)?;
    (!token.is_empty() && token.len() <= 8192 && !token.contains(char::is_whitespace)).then(|| token.to_string())
}

// ── 本机回调口 ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServeOutcome {
    /// 换到了 token，已经交给 `on_token`。
    SignedIn,
    /// 服务商那边没登录成功（`state` 对得上的 `?error=`）。
    ProviderError(String),
    /// code 对，但换 token 失败。
    ExchangeFailed(String),
    /// 等到时间或请求数用完，都没有对得上的回调。
    NoCallback,
}

impl ServeOutcome {
    /// 界面用的原因码（成功时 None）。
    pub fn reason(&self) -> Option<String> {
        match self {
            ServeOutcome::SignedIn => None,
            ServeOutcome::ProviderError(error) => Some(error.clone()),
            ServeOutcome::ExchangeFailed(reason) => Some(reason.clone()),
            ServeOutcome::NoCallback => Some("handoff_timeout".into()),
        }
    }
}

/// 请求行里的目标（`/auth-callback?…`）。只收 GET。
fn read_request_target(stream: &mut TcpStream) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    while !buf.windows(2).any(|w| w == b"\r\n") && buf.len() < 8192 {
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let text = String::from_utf8_lossy(&buf);
    let line = text.lines().next()?;
    let mut parts = line.split(' ');
    let (method, target) = (parts.next()?, parts.next()?);
    (method == "GET" && target.starts_with('/')).then(|| target.to_string())
}

const PAGE_OK: (&str, &str) = ("登录成功", "已经登录，请回到 Agentrix Desktop。这个页面可以关掉。");
const PAGE_FAILED: (&str, &str) = ("登录没有完成", "请回到 Agentrix Desktop 重新发起登录。");
const PAGE_STRAY: (&str, &str) = ("这不是这次登录的回调", "请回到 Agentrix Desktop 重新发起登录。");

fn respond(stream: &mut TcpStream, status: &str, page: (&str, &str)) {
    let (title, message) = page;
    let html = format!(
        "<!DOCTYPE html><html lang=\"zh\"><head><meta charset=\"utf-8\"><title>{title}</title></head>\
         <body style=\"margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#F7F8FA;color:#0B0E11;display:flex;align-items:center;justify-content:center;min-height:100vh;\">\
         <div style=\"max-width:420px;padding:28px 24px;border-radius:16px;background:#FFFFFF;border:1px solid #DDE3EA;text-align:center;\">\
         <h1 style=\"margin:0 0 10px;font-size:20px;\">{title}</h1><p style=\"margin:0;color:#4A5563;line-height:1.6;\">{message}</p></div></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// 等真正的回调：路径不对 404、`state` 对不上或带着 token 400，都接着等；`state` 对得上就只处理这一次。
/// `exchange` 拿 code 换 token，`on_token` 收下 token（写进本机登录、通知 WebView）。
pub fn serve_callback(
    listener: TcpListener,
    expected_state: &str,
    wait: Duration,
    mut exchange: impl FnMut(&str) -> Result<String, String>,
    on_token: impl FnOnce(String),
) -> ServeOutcome {
    let deadline = Instant::now() + wait;
    if listener.set_nonblocking(true).is_err() {
        return ServeOutcome::NoCallback;
    }
    let mut handled = 0usize;
    while Instant::now() < deadline && handled < MAX_CALLBACK_REQUESTS {
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(_) => return ServeOutcome::NoCallback,
        };
        handled += 1;
        let _ = stream.set_nonblocking(false);
        let Some(target) = read_request_target(&mut stream) else {
            respond(&mut stream, "400 Bad Request", PAGE_STRAY);
            continue;
        };
        let path = target.split(['?', '#']).next().unwrap_or("");
        if path != CALLBACK_PATH {
            respond(&mut stream, "404 Not Found", PAGE_STRAY);
            continue;
        }
        match read_callback(&format!("http://127.0.0.1{target}"), expected_state) {
            CallbackRead::Invalid => {
                respond(&mut stream, "400 Bad Request", PAGE_STRAY);
            }
            CallbackRead::Error(error) => {
                respond(&mut stream, "200 OK", PAGE_FAILED);
                return ServeOutcome::ProviderError(error);
            }
            CallbackRead::Code(code) => {
                return match exchange(&code) {
                    Ok(token) => {
                        on_token(token);
                        respond(&mut stream, "200 OK", PAGE_OK);
                        ServeOutcome::SignedIn
                    }
                    Err(reason) => {
                        respond(&mut stream, "200 OK", PAGE_FAILED);
                        ServeOutcome::ExchangeFailed(reason)
                    }
                };
            }
        }
    }
    ServeOutcome::NoCallback
}

/// 本人点"用 X 登录"：生成这次的秘密、起回调口、返回发起地址；后台线程等回调、换 token。
/// `on_done(Ok(token))` 或 `on_done(Err(reason))` 在后台线程里调一次。
pub fn begin(
    provider: &str,
    origin: &'static str,
    on_done: impl FnOnce(Result<String, String>) + Send + 'static,
) -> Result<String, String> {
    if !handoff_enabled() {
        return Err("handoff_disabled".into());
    }
    provider_route(provider).ok_or_else(|| "handoff_provider_unknown".to_string())?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "callback_unavailable".to_string())?;
    let port = listener.local_addr().map_err(|_| "callback_unavailable".to_string())?.port();
    let secrets = HandoffSecrets::generate();
    let url = start_url(origin, provider, &secrets, port)?;
    std::thread::Builder::new()
        .name("auth-handoff-callback".into())
        .spawn(move || {
            let transport = crate::developer_runtime::channel::ReqwestTransport;
            let policy = TrustPolicy::default();
            let mut token: Option<String> = None;
            let outcome = serve_callback(
                listener,
                secrets.state(),
                CALLBACK_WAIT,
                |code| exchange(&transport, &policy, origin, code, &secrets),
                |t| token = Some(t),
            );
            drop(secrets);
            match (outcome.reason(), token) {
                (None, Some(token)) => on_done(Ok(token)),
                (reason, _) => on_done(Err(reason.unwrap_or_else(|| "handoff_failed".into()))),
            }
        })
        .map_err(|_| "callback_unavailable".to_string())?;
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::channel::ScriptedHttp;

    const VECTORS: &str = include_str!("auth_handoff_vectors.json");
    const ORIGIN: &str = "https://api.agentrix.top";

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).expect("vectors")
    }

    fn fill(text: &str, v: &Value) -> String {
        text.replace("{state}", v["state"].as_str().unwrap()).replace("{code}", v["code"].as_str().unwrap())
    }

    fn secrets(v: &Value) -> HandoffSecrets {
        HandoffSecrets::fixed(v["state"].as_str().unwrap(), v["pkce"][0]["verifier"].as_str().unwrap())
    }

    #[test]
    fn pkce_matches_rfc_7636_and_the_shared_vectors() {
        for item in vectors()["pkce"].as_array().unwrap() {
            let verifier = item["verifier"].as_str().unwrap();
            assert!(valid_code_verifier(verifier), "{verifier}");
            assert_eq!(pkce_challenge(verifier), item["challenge"].as_str().unwrap(), "{verifier}");
        }
    }

    #[test]
    fn the_callback_is_read_exactly_like_shared() {
        let v = vectors();
        for item in v["callback"].as_array().unwrap() {
            let name = item["name"].as_str().unwrap();
            let url = fill(item["url"].as_str().unwrap(), &v);
            let expected_state = item.get("expectedState").and_then(Value::as_str).unwrap_or(v["state"].as_str().unwrap());
            let expected = match item["result"]["kind"].as_str().unwrap() {
                "code" => CallbackRead::Code(fill(item["result"]["code"].as_str().unwrap(), &v)),
                "error" => CallbackRead::Error(item["result"]["error"].as_str().unwrap().into()),
                _ => CallbackRead::Invalid,
            };
            assert_eq!(read_callback(&url, expected_state), expected, "{name}");
        }
        let long = format!("http://127.0.0.1:1/auth-callback?code={}&state={}&pad={}", v["code"].as_str().unwrap(), v["state"].as_str().unwrap(), "p".repeat(4096));
        assert_eq!(read_callback(&long, v["state"].as_str().unwrap()), CallbackRead::Invalid);
    }

    #[test]
    fn fresh_secrets_are_well_formed_random_and_the_start_url_carries_no_verifier() {
        let a = HandoffSecrets::generate();
        let b = HandoffSecrets::generate();
        assert!(valid_state(a.state()) && valid_code_verifier(a.code_verifier()));
        assert_eq!(a.state().len(), 43);
        assert_ne!(a.state(), b.state());
        assert_ne!(a.code_verifier(), b.code_verifier());
        let url = start_url(ORIGIN, "x", &a, 53123).unwrap();
        assert_eq!(
            url,
            format!(
                "{ORIGIN}/api/auth/twitter?handoff_client=desktop&state={}&code_challenge={}&code_challenge_method=S256&callback_port=53123",
                a.state(),
                a.code_challenge()
            )
        );
        assert!(!url.contains(a.code_verifier()));
        assert!(!url.contains("token"));
        assert_eq!(start_url(ORIGIN, "wallet", &a, 5000).unwrap_err(), "handoff_provider_unknown");
        assert_eq!(start_url(ORIGIN, "google", &a, 0).unwrap_err(), "callback_unavailable");
        for provider in ["google", "apple", "discord", "x"] {
            assert!(start_url(ORIGIN, provider, &a, 5000).is_ok(), "{provider}");
        }
        assert!(start_url(ORIGIN, "apple", &a, 5000).unwrap().starts_with(&format!("{ORIGIN}/api/auth/apple?handoff_client=desktop&")));
    }

    fn exchange_ok(token: &str) -> Value {
        json!({ "schemaVersion": 1, "accessToken": token, "tokenType": "Bearer", "authIssuedAt": 1_790_000_000,
            "user": { "id": "user-1", "agentrixId": null, "email": null } })
    }

    #[test]
    fn exchange_posts_code_state_and_verifier_without_any_credential() {
        let v = vectors();
        let s = secrets(&v);
        let code = v["code"].as_str().unwrap();
        let http = ScriptedHttp::default();
        http.push(200, exchange_ok("header.payload.sig"));
        let policy = TrustPolicy::default();
        assert_eq!(exchange(&http, &policy, ORIGIN, code, &s).unwrap(), "header.payload.sig");
        let request = &http.recorded()[0];
        assert_eq!(request.method, "POST");
        assert_eq!(request.url, format!("{ORIGIN}/api/auth/handoff/exchange"));
        assert!(!request.headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("authorization")));
        assert_eq!(
            request.body.clone().unwrap(),
            json!({ "schemaVersion": 1, "code": code, "state": s.state(), "codeVerifier": s.code_verifier() })
        );
    }

    #[test]
    fn exchange_refusals_and_odd_replies() {
        let v = vectors();
        let s = secrets(&v);
        let code = v["code"].as_str().unwrap();
        let policy = TrustPolicy::default();
        let cases = [
            (400, json!({ "code": "handoff_code_invalid" }), "handoff_code_invalid"),
            (400, Value::Null, "handoff_code_invalid"),
            (429, json!({ "code": "handoff_rate_limited" }), "handoff_rate_limited"),
            (503, Value::Null, "http_503"),
            (200, json!({ "accessToken": "a.b.c" }), "invalid_response"),
            (200, json!({ "schemaVersion": 1, "accessToken": "a b", "tokenType": "Bearer", "authIssuedAt": 1, "user": { "id": "u" } }), "invalid_response"),
            (200, json!({ "schemaVersion": 1, "accessToken": "a.b.c", "tokenType": "Bearer", "authIssuedAt": 1, "user": {} }), "invalid_response"),
            (200, json!("<html>"), "invalid_response"),
        ];
        for (status, body, reason) in cases {
            let http = ScriptedHttp::default();
            http.push(status, body.clone());
            assert_eq!(exchange(&http, &policy, ORIGIN, code, &s).unwrap_err(), reason, "{status} {body}");
        }
        let http = ScriptedHttp::default();
        http.push(200, json!({ "success": true, "data": exchange_ok("w.r.p") }));
        assert_eq!(exchange(&http, &policy, ORIGIN, code, &s).unwrap(), "w.r.p");
        // Not on the allowlist, or a malformed code: nothing is sent.
        let quiet = ScriptedHttp::default();
        assert_eq!(exchange(&quiet, &policy, "https://evil.example", code, &s).unwrap_err(), "network_not_allowlisted");
        assert_eq!(exchange(&quiet, &policy, ORIGIN, "ahc_short", &s).unwrap_err(), "handoff_code_invalid");
        assert!(quiet.recorded().is_empty());
    }

    fn get(port: u16, target: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(stream, "GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
        let mut out = String::new();
        let _ = stream.read_to_string(&mut out);
        out
    }

    #[test]
    fn the_callback_port_waits_through_strays_and_signs_in_on_the_real_one() {
        let v = vectors();
        let state = v["state"].as_str().unwrap().to_string();
        let code = v["code"].as_str().unwrap().to_string();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let state_for_server = state.clone();
        let server = std::thread::spawn(move || {
            let mut seen = Vec::new();
            let mut token = None;
            let outcome = serve_callback(
                listener,
                &state_for_server,
                Duration::from_secs(10),
                |c| {
                    seen.push(c.to_string());
                    Ok("header.payload.sig".to_string())
                },
                |t| token = Some(t),
            );
            (outcome, seen, token)
        });
        assert!(get(port, "/favicon.ico").starts_with("HTTP/1.1 404"));
        let forged = format!("/auth-callback?code={code}&state={}", "t".repeat(43));
        assert!(get(port, &forged).starts_with("HTTP/1.1 400"));
        let with_token = format!("/auth-callback?code={code}&state={state}&token=x.y.z");
        assert!(get(port, &with_token).starts_with("HTTP/1.1 400"));
        let page = get(port, &format!("/auth-callback?code={code}&state={state}"));
        assert!(page.starts_with("HTTP/1.1 200") && page.contains("登录成功"));
        assert!(page.contains("Cache-Control: no-store"));
        let (outcome, seen, token) = server.join().unwrap();
        assert_eq!(outcome, ServeOutcome::SignedIn);
        assert_eq!(seen, vec![code]);
        assert_eq!(token.as_deref(), Some("header.payload.sig"));
    }

    #[test]
    fn a_provider_error_or_a_failed_exchange_ends_the_wait_without_a_token() {
        let v = vectors();
        let state = v["state"].as_str().unwrap().to_string();
        let code = v["code"].as_str().unwrap().to_string();
        for (target, expected) in [
            (format!("/auth-callback?error=login_cancelled&state={state}"), ServeOutcome::ProviderError("login_cancelled".into())),
            (format!("/auth-callback?code={code}&state={state}"), ServeOutcome::ExchangeFailed("handoff_code_invalid".into())),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            let s = state.clone();
            let server = std::thread::spawn(move || {
                let mut token = None;
                let outcome = serve_callback(listener, &s, Duration::from_secs(10), |_| Err("handoff_code_invalid".into()), |t| token = Some(t));
                (outcome, token)
            });
            let page = get(port, &target);
            assert!(page.contains("登录没有完成"));
            let (outcome, token) = server.join().unwrap();
            assert_eq!(outcome, expected);
            assert!(token.is_none());
        }
    }

    #[test]
    fn nobody_calling_back_times_out() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let outcome = serve_callback(listener, &"s".repeat(43), Duration::from_millis(300), |_| unreachable!(), |_| unreachable!());
        assert_eq!(outcome, ServeOutcome::NoCallback);
        assert_eq!(outcome.reason().as_deref(), Some("handoff_timeout"));
    }

    #[test]
    fn off_by_default() {
        // The test process never sets AGENTRIX_AUTH_HANDOFF.
        assert!(!handoff_enabled());
        assert_eq!(begin("google", ORIGIN, |_| unreachable!()).unwrap_err(), "handoff_disabled");
    }
}
