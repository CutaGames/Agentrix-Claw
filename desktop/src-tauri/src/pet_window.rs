//! Pet Companion window.
//!
//! Two layouts (E64 / I-030):
//! - **Windows: fullscreen transparent overlay.** WebView2 renders small
//!   transparent windows with checkerboard / snow artifacts (tauri#4881,
//!   tauri#4891), so the window covers the primary monitor, the sprite is
//!   positioned with CSS, and the window is click-through except over the
//!   sprite (JS toggles `set_ignore_cursor_events` by cursor proximity).
//! - **macOS (and others): a small 200×240 window that moves with the pet.**
//!   A fullscreen always-on-top WebKit surface costs WindowServer a full-screen
//!   composite every animation frame, and without `macos-private-api` Tauri
//!   does not make macOS windows transparent at all — the "overlay" was an
//!   opaque window over the whole screen. The sprite sits at a fixed spot in
//!   the small window and `move_to` moves the window.
//!
//! The window is declared in tauri.conf.json with `create: false` (nothing is
//! pre-built at startup) and is created from that config on first open.
//!
//! Commands:
//!   - desktop_pet_window_open / close (close destroys the small window; the
//!     overlay is hidden, WebView2 is expensive to recreate)
//!   - desktop_pet_window_move_to(x, y) - moves the small window; no-op overlay
//!   - desktop_pet_window_minimize_to_tray / restore - JS event only
//!   - desktop_pet_window_set_state(state)
//!   - desktop_pet_window_set_passthrough(enabled) - overlay only
//!   - desktop_pet_window_get_screen_bounds (includes the layout)
//!   - desktop_pet_window_resize_for_popup / restore_size - no-op (compat)
//!   - desktop_pet_relay_event(event)
//!   - desktop_pet_broadcast_mode(mode)

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const PET_LABEL: &str = "pet-companion";
/// Small-window layout, logical px. Must match `WIN_W` / `WIN_H` in
/// `src/components/PetCompanionWindow.tsx`.
pub const PET_WIN_W: f64 = 200.0;
pub const PET_WIN_H: f64 = 240.0;
/// macOS (E66): the pet opens by itself only after the owner opened it once
/// (and did not close it again), and only a few seconds after the main window,
/// so it is not part of the start-up peak. The choice is a one-line file.
const OPEN_ON_STARTUP_FILE: &str = "pet-open-on-startup";
const MACOS_STARTUP_EXTRA_DELAY: std::time::Duration = std::time::Duration::from_secs(6);

fn open_on_startup_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(OPEN_ON_STARTUP_FILE))
}

pub fn read_open_on_startup(path: &std::path::Path) -> bool {
    std::fs::read_to_string(path).map(|text| text.trim() == "1").unwrap_or(false)
}

pub fn write_open_on_startup(path: &std::path::Path, open: bool) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, if open { "1\n" } else { "0\n" });
}

/// The owner opened or closed the pet themselves (tray, menu, a click).
pub fn remember_user_choice(app: &AppHandle, open: bool) {
    if let Some(path) = open_on_startup_path(app) {
        write_open_on_startup(&path, open);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PetLayout {
    Overlay,
    Window,
}

pub fn layout() -> PetLayout {
    if cfg!(windows) {
        PetLayout::Overlay
    } else {
        PetLayout::Window
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PetScreenBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
    pub taskbar_inset_px: u32,
    pub layout: PetLayout,
}

/// The pet window, created from its tauri.conf.json entry if it does not exist.
fn ensure_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(win) = app.get_webview_window(PET_LABEL) {
        return Ok(win);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == PET_LABEL)
        .cloned()
        .ok_or("pet-companion window not declared in tauri.conf.json")?;
    tauri::WebviewWindowBuilder::from_config(app, &config)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

/// Open (create if needed) and show the pet window in this platform's layout.
pub fn open_pet_window(app: AppHandle) -> Result<(), String> {
    let win = ensure_window(&app)?;
    match layout() {
        PetLayout::Overlay => {
            if let Ok(Some(m)) = app.primary_monitor() {
                let mp = m.position();
                let ms = m.size();
                let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: mp.x, y: mp.y }));
                let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: ms.width, height: ms.height }));
            }
            // Default click-through; JS toggles per cursor proximity to sprite.
            let _ = win.set_ignore_cursor_events(true);
        }
        PetLayout::Window => {
            let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize { width: PET_WIN_W, height: PET_WIN_H }));
            if let Ok(Some(m)) = app.primary_monitor() {
                let scale = m.scale_factor();
                let x = (m.position().x as f64 + m.size().width as f64) / scale - PET_WIN_W - 32.0;
                let y = (m.position().y as f64 + m.size().height as f64) / scale - PET_WIN_H - 80.0;
                let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            }
            // The small window only covers the pet: it always takes its own clicks.
            let _ = win.set_ignore_cursor_events(false);
        }
    }

    win.show().map_err(|e| e.to_string())?;
    let _ = win.set_always_on_top(true);

    #[cfg(target_os = "windows")]
    crate::grant_webview2_permissions(&win);

    Ok(())
}

/// Called once, 2 s after startup (on a background thread). Windows opens the
/// pet as before. macOS opens it only if the owner opened it last time, and
/// waits a few more seconds so it does not add to the start-up peak.
pub fn open_on_startup(app: AppHandle) -> Result<(), String> {
    if cfg!(target_os = "macos") {
        let wanted = open_on_startup_path(&app)
            .map(|path| read_open_on_startup(&path))
            .unwrap_or(false);
        if !wanted {
            return Ok(());
        }
        std::thread::sleep(MACOS_STARTUP_EXTRA_DELAY);
    }
    open_pet_window(app)
}

pub fn is_pet_window_visible(app: &AppHandle) -> bool {
    app.get_webview_window(PET_LABEL)
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false)
}

/// Tray menu: show the pet if it is not visible, otherwise put it away.
/// (The old toggle checked only whether the window existed, and the
/// statically declared window always existed, so it could never reopen.)
pub fn toggle_pet_window(app: AppHandle) -> Result<(), String> {
    if is_pet_window_visible(&app) {
        remember_user_choice(&app, false);
        close_pet_window(app)
    } else {
        remember_user_choice(&app, true);
        open_pet_window(app)
    }
}

pub fn close_pet_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(PET_LABEL) {
        match layout() {
            // WebView2 is expensive to recreate; keep the hidden overlay.
            PetLayout::Overlay => win.hide().map_err(|e| e.to_string())?,
            // A closed small window costs nothing: no WebKit process, no timers.
            PetLayout::Window => win.destroy().map_err(|e| e.to_string())?,
        }
    }
    Ok(())
}

/// Small window: move the window (logical px, top-left). Overlay: the sprite
/// moves via CSS inside the fullscreen window, nothing to do.
pub fn move_pet_to(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    if layout() == PetLayout::Overlay {
        return Ok(());
    }
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: x as f64, y: y as f64 }))
        .map_err(|e| e.to_string())
}

/// Overlay only: JS toggles click-through on pointer enter / leave of the
/// sprite hitbox. The small window always takes its own clicks.
pub fn set_pet_passthrough(app: AppHandle, enabled: bool) -> Result<(), String> {
    if layout() == PetLayout::Window {
        return Ok(());
    }
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    win.set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

/// JS shrinks the sprite element and snaps it to the corner. We just relay
/// the event.
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
        layout: layout(),
    })
}

/// Keep a `width` × `height` box at (`x`, `y`) inside the monitor (all logical px).
fn fit_on_monitor(x: f64, y: f64, width: f64, height: f64, monitor: (f64, f64, f64, f64)) -> (f64, f64, f64, f64) {
    let (mx, my, mw, mh) = monitor;
    let w = width.min(mw).max(1.0);
    let h = height.min(mh).max(1.0);
    let nx = x.min(mx + mw - w).max(mx);
    let ny = y.min(my + mh - h).max(my);
    (nx, ny, w, h)
}

/// Small window: grow to fit the context menu (kept on screen). Overlay: the
/// menu already fits inside the fullscreen window, nothing to do.
pub fn resize_for_popup(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if layout() == PetLayout::Overlay {
        return Ok(());
    }
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .ok_or("no monitor for the pet window")?;
    let scale = monitor.scale_factor();
    let position = win.outer_position().map_err(|e| e.to_string())?;
    let bounds = (
        monitor.position().x as f64 / scale,
        monitor.position().y as f64 / scale,
        monitor.size().width as f64 / scale,
        monitor.size().height as f64 / scale,
    );
    let (x, y, w, h) = fit_on_monitor(
        position.x as f64 / scale,
        position.y as f64 / scale,
        width.max(PET_WIN_W),
        height.max(PET_WIN_H),
        bounds,
    );
    win.set_size(tauri::Size::Logical(tauri::LogicalSize { width: w, height: h }))
        .map_err(|e| e.to_string())?;
    win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

/// Small window: back to 200×240 at the pet's position. Overlay: nothing to do.
pub fn restore_size(app: AppHandle, anchor_x: i32, anchor_y: i32) -> Result<(), String> {
    if layout() == PetLayout::Overlay {
        return Ok(());
    }
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    win.set_size(tauri::Size::Logical(tauri::LogicalSize { width: PET_WIN_W, height: PET_WIN_H }))
        .map_err(|e| e.to_string())?;
    win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: anchor_x as f64, y: anchor_y as f64 }))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_startup_choice_is_off_until_the_owner_opens_the_pet() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app").join(OPEN_ON_STARTUP_FILE);
        assert!(!read_open_on_startup(&path), "a fresh install does not open the pet by itself");
        write_open_on_startup(&path, true);
        assert!(read_open_on_startup(&path));
        write_open_on_startup(&path, false);
        assert!(!read_open_on_startup(&path));
        std::fs::write(&path, "yes").unwrap();
        assert!(!read_open_on_startup(&path));
    }

    #[test]
    fn macos_transparency_is_enabled_for_the_small_pet_window() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config["app"]["macOSPrivateApi"], true);
        let manifest = include_str!("../Cargo.toml");
        let tauri_line = manifest.lines().find(|line| line.starts_with("tauri = ")).unwrap();
        assert!(tauri_line.contains("\"macos-private-api\""), "{tauri_line}");
    }

    #[test]
    fn layout_is_overlay_only_on_windows() {
        assert_eq!(layout() == PetLayout::Overlay, cfg!(windows));
    }

    #[test]
    fn the_popup_box_stays_on_the_monitor() {
        let monitor = (0.0, 0.0, 1440.0, 900.0);
        assert_eq!(fit_on_monitor(1300.0, 700.0, 320.0, 600.0, monitor), (1120.0, 300.0, 320.0, 600.0));
        assert_eq!(fit_on_monitor(-50.0, -10.0, 320.0, 600.0, monitor), (0.0, 0.0, 320.0, 600.0));
        assert_eq!(fit_on_monitor(10.0, 10.0, 2000.0, 1200.0, monitor), (0.0, 0.0, 1440.0, 900.0));
        // A second monitor to the left (negative origin).
        assert_eq!(fit_on_monitor(-100.0, 50.0, 320.0, 600.0, (-1920.0, 0.0, 1920.0, 1080.0)), (-320.0, 50.0, 320.0, 600.0));
    }

    #[test]
    fn nothing_is_pre_built_and_the_declared_window_is_small() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let pet = config["app"]["windows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["label"] == PET_LABEL)
            .cloned()
            .unwrap();
        assert_eq!(pet["create"], false, "the pet window must not be built at startup");
        assert_eq!(pet["width"].as_f64(), Some(PET_WIN_W));
        assert_eq!(pet["height"].as_f64(), Some(PET_WIN_H));
        assert_eq!(pet["url"], "pet.html", "the pet loads its own small entry, not the whole app");
    }
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
