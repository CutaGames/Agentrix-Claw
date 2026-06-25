//! Pet Companion Window - fullscreen transparent overlay.
//!
//! Architecture (v0.6.4, restored from commit 9d5824d02):
//!   The pet window is a FULLSCREEN transparent overlay covering the entire
//!   primary monitor. The pet sprite is positioned via CSS inside that
//!   overlay; everywhere else the window is fully click-through.
//!
//! Why fullscreen instead of small 200x240 transparent:
//!   WebView2 on Windows has well-documented bugs with small transparent
//!   windows (tauri#4881, tauri#4891) - they render checkerboard / snow
//!   artifacts. A fullscreen transparent surface stays GPU-stable.
//!
//! Click-through:
//!   - Default: window absorbs no cursor events (set_ignore_cursor_events=true)
//!   - When cursor enters pet sprite hitbox: JS calls set_passthrough(false)
//!   - When cursor leaves: JS calls set_passthrough(true)
//!
//! Right-click menu:
//!   - Renders via CSS position:fixed inside the fullscreen overlay
//!   - No window resize needed (window is already covering whole screen)
//!
//! Commands:
//!   - desktop_pet_window_open / close
//!   - desktop_pet_window_move_to(x, y) - no-op (CSS positions sprite)
//!   - desktop_pet_window_minimize_to_tray / restore - JS event only
//!   - desktop_pet_window_set_state(state)
//!   - desktop_pet_window_set_passthrough(enabled) - real toggle
//!   - desktop_pet_window_get_screen_bounds
//!   - desktop_pet_window_resize_for_popup - no-op (kept for compat)
//!   - desktop_pet_window_restore_size - no-op (kept for compat)
//!   - desktop_pet_relay_event(event)
//!   - desktop_pet_broadcast_mode(mode)

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const PET_LABEL: &str = "pet-companion";

#[derive(Debug, Clone, Serialize)]
pub struct PetScreenBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
    pub taskbar_inset_px: u32,
}

/// Open the pet-companion window. The window is statically declared in
/// tauri.conf.json (fullscreen overlay), we just resize it to current
/// monitor + show + set click-through default.
pub fn open_pet_window(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not declared in tauri.conf.json")?;

    // Size to current primary monitor (full coverage).
    if let Ok(Some(m)) = app.primary_monitor() {
        let mp = m.position();
        let ms = m.size();
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: mp.x,
            y: mp.y,
        }));
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: ms.width,
            height: ms.height,
        }));
    }

    // Default click-through; JS toggles per cursor proximity to sprite.
    let _ = win.set_ignore_cursor_events(true);

    win.show().map_err(|e| e.to_string())?;
    let _ = win.set_always_on_top(true);

    #[cfg(target_os = "windows")]
    crate::grant_webview2_permissions(&win);

    Ok(())
}

pub fn close_pet_window(app: AppHandle) -> Result<(), String> {
    // Statically declared windows must NOT be destroyed; hide instead.
    if let Some(win) = app.get_webview_window(PET_LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// In fullscreen overlay mode the OS window doesn't move - the sprite
/// element moves via CSS inside the window. No-op here.
pub fn move_pet_to(_app: AppHandle, _x: i32, _y: i32) -> Result<(), String> {
    Ok(())
}

/// Toggle window-level click-through. JS calls this on pointer
/// enter/leave of the sprite hitbox so clicks pass through the rest
/// of the transparent overlay.
pub fn set_pet_passthrough(app: AppHandle, enabled: bool) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    win.set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

/// In fullscreen overlay mode JS shrinks the sprite element and snaps
/// its CSS position to the corner. We just relay the event.
pub fn minimize_pet_to_tray(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    let _ = win.eval("window.dispatchEvent(new CustomEvent('agentrix:pet-minimized'))");
    Ok(())
}

pub fn restore_pet_window(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    let _ = win.eval("window.dispatchEvent(new CustomEvent('agentrix:pet-restored'))");
    Ok(())
}

pub fn set_pet_state(app: AppHandle, state: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let js = format!(
            "window.dispatchEvent(new CustomEvent('agentrix:pet-companion-state', {{ detail: {{ state: '{}' }} }}))",
            state.replace('\'', "")
        );
        let _ = win.eval(&js);
    }
    Ok(())
}

pub fn set_approval_active(app: AppHandle, active: bool) -> Result<(), String> {
    let js = format!(
        "window.dispatchEvent(new CustomEvent('agentrix:approval-active', {{ detail: {{ active: {} }} }}))",
        if active { "true" } else { "false" }
    );
    // Dispatch to all 3 user-facing webviews so any of them can subscribe
    // (pet-companion needs it for the wander pause + alert sprite; main
    // needs it for the petMode bus to set "approval"; chat-panel for
    // overlay UI).
    for label in &[PET_LABEL, "main", "chat-panel"] {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.eval(&js);
        }
    }
    Ok(())
}

pub fn get_pet_screen_bounds(app: AppHandle) -> Result<PetScreenBounds, String> {
    let monitor = if let Some(win) = app.get_webview_window(PET_LABEL) {
        win.current_monitor().ok().flatten()
    } else {
        None
    };
    let m = match monitor {
        Some(m) => m,
        None => app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("no primary monitor")?,
    };
    let scale = m.scale_factor();
    Ok(PetScreenBounds {
        x: (m.position().x as f64 / scale) as i32,
        y: (m.position().y as f64 / scale) as i32,
        width: (m.size().width as f64 / scale) as u32,
        height: (m.size().height as f64 / scale) as u32,
        is_primary: true,
        taskbar_inset_px: 48,
    })
}

/// In fullscreen overlay mode the menu is rendered with CSS position:fixed
/// inside the already-fullscreen window - no resize needed. No-op.
pub fn resize_for_popup(_app: AppHandle, _width: f64, _height: f64) -> Result<(), String> {
    Ok(())
}

pub fn restore_size(_app: AppHandle, _anchor_x: i32, _anchor_y: i32) -> Result<(), String> {
    Ok(())
}

/// Relay an event to all user-facing webviews (main, chat-panel).
pub fn relay_event(app: AppHandle, event_name: String) -> Result<(), String> {
    if !event_name.starts_with("agentrix:") {
        return Err("event_name must start with 'agentrix:'".into());
    }
    if !event_name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == ':' || c == '.')
    {
        return Err("event_name contains invalid characters".into());
    }
    let js = format!("window.dispatchEvent(new CustomEvent('{}'))", event_name);
    for label in &["main", "chat-panel"] {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.eval(&js);
        }
    }
    Ok(())
}

pub fn broadcast_mode(app: AppHandle, mode: String) -> Result<(), String> {
    // Two broadcast channels (belt-and-braces):
    //   1) DOM CustomEvent eval'd into each webview window — picked up by
    //      any code that listens with window.addEventListener
    //   2) Tauri IPC emit — picked up by the listener registered via
    //      tauri-apps/api/event listen() in services/petMode.ts
    let js = format!(
        "window.dispatchEvent(new CustomEvent('agentrix:pet-mode-broadcast', {{ detail: {{ mode: '{}' }} }}))",
        mode.replace('\'', "")
    );
    for label in &["main", "chat-panel", PET_LABEL] {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.eval(&js);
        }
    }
    // Emit as object so the front-end listener can destructure
    // `event.payload.mode` (was emitting bare string before, breaking the
    // listener's `{ mode, source }` deconstruction).
    let _ = app.emit(
        "agentrix:pet-mode-broadcast",
        serde_json::json!({ "mode": mode, "source": "broadcast" }),
    );
    Ok(())
}

/// P-7+ Tray icon by mode (2026-05-26).
/// Updates the system tray icon to reflect the current PetMode. Each
/// mode maps to a 32x32 tray icon embedded at compile time. The icons
/// are generated by `.tmp_apk/sprite-tools/generate-tray-icons.mjs`
/// from frame 0 of each sprite sheet.
pub fn set_tray_mode(app: AppHandle, mode: String) -> Result<(), String> {
    use tauri::tray::TrayIconId;
    let bytes: &[u8] = match mode.as_str() {
        "listening" => include_bytes!("../icons/tray/listen.png"),
        "speaking" => include_bytes!("../icons/tray/talk.png"),
        "thinking" => include_bytes!("../icons/tray/pro-thinking.png"),
        "typing" => include_bytes!("../icons/tray/pro-typing.png"),
        "done" => include_bytes!("../icons/tray/pro-done.png"),
        "computer-use" => include_bytes!("../icons/tray/cu-mouse.png"),
        "approval" => include_bytes!("../icons/tray/alert.png"),
        "sleep" => include_bytes!("../icons/tray/sleep.png"),
        // wardrobe / idle / unknown -> idle icon
        _ => include_bytes!("../icons/tray/idle.png"),
    };

    let img = image::load_from_memory_with_format(bytes, image::ImageFormat::Png)
        .map_err(|e| format!("decode tray icon: {e}"))?
        .into_rgba8();
    let (w, h) = img.dimensions();
    let rgba = img.into_raw();
    let icon = tauri::image::Image::new_owned(rgba, w, h);

    let tray = app
        .tray_by_id(&TrayIconId::new("main"))
        .ok_or("main tray icon not found")?;
    tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    Ok(())
}
