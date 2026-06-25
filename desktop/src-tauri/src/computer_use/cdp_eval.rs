//! Codex-borrow Phase B3 (eval) — Chrome DevTools Protocol over WebSocket.
//!
//! `cdp.rs` covers the HTTP control plane (spawn / list / new / close).
//! This file adds the per-target WebSocket transport so we can drive
//! `Runtime.evaluate`, `Page.navigate`, `DOM.querySelector`, etc.
//!
//! Design notes:
//! - We open a fresh WebSocket per call. CDP supports long-lived
//!   sessions but the small set of operations we expose (eval / click)
//!   does not need one and the connect cost on localhost is < 5 ms.
//! - All eval results are stringified before crossing the Tauri
//!   boundary; the LLM only ever sees text.
//! - `expression` is wrapped in a defensive try/catch on the page side
//!   so a thrown JS error returns a structured payload rather than
//!   blowing up the Rust call.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

use super::{cdp, ComputerUseError};

#[derive(Debug, Serialize, Deserialize)]
pub struct EvalResult {
    /// Best-effort stringified value (kept short for LLM context).
    pub value: String,
    /// Raw CDP `result.type` (`string` / `number` / `object` / …).
    pub r#type: String,
    /// True when the page-side try/catch threw.
    pub thrown: bool,
}

async fn open_socket(
    ws_url: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    ComputerUseError,
> {
    let (stream, _) = tokio::time::timeout(
        Duration::from_secs(5),
        tokio_tungstenite::connect_async(ws_url),
    )
    .await
    .map_err(|_| ComputerUseError::Backend("CDP WS connect timeout".into()))?
    .map_err(|e| ComputerUseError::Backend(format!("CDP WS connect: {e}")))?;
    Ok(stream)
}

async fn send_command(
    ws_url: &str,
    method: &str,
    params: Value,
) -> Result<Value, ComputerUseError> {
    let mut socket = open_socket(ws_url).await?;
    let payload = json!({ "id": 1, "method": method, "params": params }).to_string();
    socket
        .send(Message::Text(payload.into()))
        .await
        .map_err(|e| ComputerUseError::Backend(format!("CDP WS send: {e}")))?;

    // Wait for the matching response (id == 1). CDP may emit unrelated
    // events on the socket before our reply; we just skip them.
    while let Some(msg) = tokio::time::timeout(Duration::from_secs(15), socket.next())
        .await
        .map_err(|_| ComputerUseError::Backend("CDP WS reply timeout".into()))?
    {
        let msg = msg.map_err(|e| ComputerUseError::Backend(format!("CDP WS recv: {e}")))?;
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            Message::Close(_) => break,
            _ => continue,
        };
        let v: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if v.get("id").and_then(|i| i.as_i64()) == Some(1) {
            let _ = socket.close(None).await;
            if let Some(err) = v.get("error") {
                return Err(ComputerUseError::Backend(format!("CDP error: {err}")));
            }
            return Ok(v.get("result").cloned().unwrap_or(Value::Null));
        }
    }
    Err(ComputerUseError::Backend("CDP WS closed before reply".into()))
}

fn stringify_value(v: &Value) -> String {
    let s = match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    if s.len() > 4000 {
        format!("{}…[truncated {} chars]", &s[..4000], s.len() - 4000)
    } else {
        s
    }
}

/// Resolve a target_id (or first page tab) to its WebSocket URL.
async fn ws_url_for(target_id: Option<&str>) -> Result<String, ComputerUseError> {
    let tabs = cdp::list_tabs().await?;
    let tab = match target_id {
        Some(id) => tabs.into_iter().find(|t| t.id == id),
        None => tabs.into_iter().find(|t| t.kind == "page"),
    };
    let tab = tab.ok_or_else(|| {
        ComputerUseError::InvalidArg("no matching CDP target / no open page tab".into())
    })?;
    if tab.websocket_url.is_empty() {
        return Err(ComputerUseError::Backend(
            "tab has no webSocketDebuggerUrl (chrome --remote-debugging-port not active?)".into(),
        ));
    }
    Ok(tab.websocket_url)
}

pub async fn evaluate(
    target_id: Option<String>,
    expression: &str,
) -> Result<EvalResult, ComputerUseError> {
    let ws = ws_url_for(target_id.as_deref()).await?;
    // Wrap so a thrown error becomes structured rather than killing the call.
    let wrapped = format!(
        "(() => {{ try {{ return {{ ok: true, v: ({expr}) }}; }} catch (e) {{ return {{ ok: false, v: String(e && e.message || e) }}; }} }})()",
        expr = expression
    );
    let result = send_command(
        &ws,
        "Runtime.evaluate",
        json!({
            "expression": wrapped,
            "returnByValue": true,
            "awaitPromise": true,
        }),
    )
    .await?;

    let inner = result
        .get("result")
        .and_then(|r| r.get("value"))
        .cloned()
        .unwrap_or(Value::Null);
    let kind = result
        .get("result")
        .and_then(|r| r.get("type"))
        .and_then(|t| t.as_str())
        .unwrap_or("undefined")
        .to_string();
    let ok = inner.get("ok").and_then(|b| b.as_bool()).unwrap_or(false);
    let value = inner.get("v").cloned().unwrap_or(Value::Null);
    Ok(EvalResult {
        value: stringify_value(&value),
        r#type: kind,
        thrown: !ok,
    })
}

pub async fn click_selector(
    target_id: Option<String>,
    selector: &str,
) -> Result<(), ComputerUseError> {
    // Defensive selector escape — single quotes only.
    let escaped = selector.replace('\\', "\\\\").replace('\'', "\\'");
    let expr = format!(
        "(() => {{ const el = document.querySelector('{sel}'); if (!el) throw new Error('selector not found: {sel}'); el.click(); return 'clicked'; }})()",
        sel = escaped
    );
    let result = evaluate(target_id, &expr).await?;
    if result.thrown {
        return Err(ComputerUseError::Backend(format!(
            "click_selector failed: {}",
            result.value
        )));
    }
    Ok(())
}

pub async fn navigate(
    target_id: Option<String>,
    url: &str,
) -> Result<(), ComputerUseError> {
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("about:")) {
        return Err(ComputerUseError::InvalidArg(
            "only http(s)/about URLs are allowed".into(),
        ));
    }
    let ws = ws_url_for(target_id.as_deref()).await?;
    send_command(&ws, "Page.navigate", json!({ "url": url })).await?;
    Ok(())
}
