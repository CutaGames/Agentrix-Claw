//! High-risk / Tier_C experience isolation in a separate Tauri WebView window
//! (design §5.1, R6.4).
//!
//! A high-risk experience must run in a **separate WebView window, isolated
//! from the map process**, so a crash or runaway inside it cannot take down
//! the World_Map. Each isolated experience gets its own window labeled
//! `world-c-<plotId>` (a dedicated OS-level WebView), distinct from the `main`
//! map window. The window navigates to the in-app sandbox host route which, in
//! turn, drives the L1 iframe / L2 WASM runtime for that Plot.
//!
//! This module only owns *window lifecycle* (create / focus / close). The
//! capability gate + WASM execution live in `capability_guard` / `wasm_runtime`.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Reserved window label for the World_Map ("map process"). The isolated
/// Tier_C windows are intentionally never created with this label.
pub const MAP_WINDOW_LABEL: &str = "main";

/// Build the dedicated window label for a Plot's isolated experience.
pub fn isolated_label(plot_id: &str) -> String {
    // Keep it filesystem/label-safe: callers pass opaque plot ids.
    let safe: String = plot_id
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    format!("world-c-{safe}")
}

/// Open (or focus, if already open) an isolated WebView window for a high-risk
/// Tier_C experience, separate from the map window (R6.4).
///
/// The window loads the in-app sandbox host route (`index.html#/world/plot/<id>`)
/// which boots the Capability_Sandbox for that Plot. Created with
/// `drag_and_drop(false)` and its own label so it is a distinct WebView from
/// the map; closing/crashing it never affects `main`.
pub fn open_isolated_experience(app: AppHandle, plot_id: &str) -> Result<String, String> {
    let label = isolated_label(plot_id);

    // Already open → just focus it.
    if let Some(win) = app.get_webview_window(&label) {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(label);
    }

    let route = format!("index.html#/world/plot/{plot_id}");
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(route.into()))
        .title("Agentrix World — Experience")
        .inner_size(1280.0, 800.0)
        .min_inner_size(640.0, 480.0)
        .decorations(true)
        .resizable(true)
        .visible(true);
    // `drag_and_drop` only exists on Windows (tauri 2.10).
    #[cfg(target_os = "windows")]
    let builder = builder.drag_and_drop(false);
    let win = builder
        .build()
        .map_err(|e| format!("failed to create isolated experience window: {e}"))?;

    #[cfg(target_os = "windows")]
    crate::grant_webview2_permissions(&win);

    win.set_focus().map_err(|e| e.to_string())?;
    Ok(label)
}

/// Close an isolated Tier_C experience window. No-op if it is not open or if
/// the caller accidentally targets the map window (never closed here).
pub fn close_isolated_experience(app: AppHandle, plot_id: &str) -> Result<(), String> {
    let label = isolated_label(plot_id);
    if label == MAP_WINDOW_LABEL {
        return Err("refusing to close the map window".into());
    }
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
