//! Pet Companion Window (Phase 6 S1) — independent transparent always-on-top
//! window that hosts the live "wandering" desktop pet.
//!
//! Design notes
//! ============
//! * Distinct from `main` (floating ball / chat bridge) so the renderer can
//!   relocate it freely without affecting the chat panel.
//! * Skips taskbar (the user can find the pet again via the tray menu or by
//!   double-clicking the taskbar-edge thumbnail when `minimize_to_tray` was
//!   used).
//! * Window position is intentionally NOT persisted — the pet wanders, so the
//!   "last seen at" is meaningless on relaunch; we drop it back to a sane
//!   spawn point near the bottom-right of the primary monitor.
//!
//! Commands exposed to the JS side
//! -------------------------------
//! * `desktop_pet_window_open` — create or show the pet companion window.
//! * `desktop_pet_window_close` — destroy the window (graceful exit).
//! * `desktop_pet_window_move_to(x, y)` — absolute physical-pixel placement.
//! * `desktop_pet_window_minimize_to_tray()` / `desktop_pet_window_restore()`
//!   — implements the "drag to taskbar" hide flow.
//! * `desktop_pet_window_set_state(state)` — informational, the renderer
//!   uses it to mirror state for telemetry; window geometry is owned by JS.
//! * `desktop_pet_window_get_screen_bounds()` — current monitor rect, used
//!   by the wander engine to clamp targets inside visible area.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const PET_LABEL: &str = "pet-companion";
/// Window size when the pet is "wandering" — large enough for a 160 px sprite
/// plus a small text-bubble strip.
const PET_W: f64 = 180.0;
const PET_H: f64 = 220.0;
/// Window size when the pet is "minimized" / docked at taskbar corner.
const PET_MIN_W: f64 = 32.0;
const PET_MIN_H: f64 = 32.0;

static PET_OPENING: AtomicBool = AtomicBool::new(false);

/// Geometry payload returned by `desktop_pet_window_get_screen_bounds`.
/// Mirrors `MonitorInfo` but always returns the monitor that *currently*
/// contains the pet window (or the primary monitor if not yet placed).
#[derive(Debug, Clone, Serialize)]
pub struct PetScreenBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// Whether this monitor is the OS-designated primary.
    pub is_primary: bool,
    /// Reserved bottom padding (taskbar height heuristic) in physical pixels.
    pub taskbar_inset_px: u32,
}

/// Open the pet-companion window. Idempotent — if already open, just shows it.
pub fn open_pet_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(PET_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    if PET_OPENING.swap(true, Ordering::AcqRel) {
        return Ok(());
    }

    // Pick spawn position: bottom-right of the primary monitor, leaving a
    // 24 px gap above the taskbar.
    let (spawn_x, spawn_y) = match app.primary_monitor() {
        Ok(Some(m)) => {
            let mw = m.size().width as f64;
            let mh = m.size().height as f64;
            let mx = m.position().x as f64;
            let my = m.position().y as f64;
            (
                (mx + mw - PET_W - 32.0) as i32,
                (my + mh - PET_H - 96.0) as i32,
            )
        }
        _ => (200, 200),
    };

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let result = WebviewWindowBuilder::new(
            &app_clone,
            PET_LABEL,
            WebviewUrl::App("index.html".into()),
        )
        .title("Agentrix Pet")
        .inner_size(PET_W, PET_H)
        .position(spawn_x as f64, spawn_y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .drag_and_drop(false)
        .build();
        if let Ok(win) = result {
            let _ = win.show();
            #[cfg(target_os = "windows")]
            crate::grant_webview2_permissions(&win);
        }
        PET_OPENING.store(false, Ordering::Release);
    });

    Ok(())
}

pub fn close_pet_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(PET_LABEL) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn move_pet_to(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

/// Shrink to a 32×32 thumbnail and dock at the taskbar-right corner.
pub fn minimize_pet_to_tray(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    if let Ok(Some(m)) = app.primary_monitor() {
        let dock_x = (m.position().x + m.size().width as i32 - PET_MIN_W as i32 - 8) as i32;
        let dock_y = (m.position().y + m.size().height as i32 - PET_MIN_H as i32 - 8) as i32;
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: dock_x,
            y: dock_y,
        }));
    }
    win.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: PET_MIN_W,
        height: PET_MIN_H,
    }))
    .map_err(|e| e.to_string())?;
    let _ = win.eval("window.dispatchEvent(new CustomEvent('agentrix:pet-minimized'))");
    Ok(())
}

pub fn restore_pet_window(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window(PET_LABEL)
        .ok_or("pet-companion window not open")?;
    win.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: PET_W,
        height: PET_H,
    }))
    .map_err(|e| e.to_string())?;
    let _ = win.eval("window.dispatchEvent(new CustomEvent('agentrix:pet-restored'))");
    Ok(())
}

pub fn set_pet_state(app: AppHandle, state: String) -> Result<(), String> {
    // Geometry is owned by JS — Rust just relays state to other windows so the
    // tray + main ball can mirror "is sleeping" / "is wandering" badges.
    if let Some(win) = app.get_webview_window("main") {
        let js = format!(
            "window.dispatchEvent(new CustomEvent('agentrix:pet-companion-state', {{ detail: {{ state: '{}' }} }}))",
            state.replace('\'', "")
        );
        let _ = win.eval(&js);
    }
    Ok(())
}

pub fn get_pet_screen_bounds(app: AppHandle) -> Result<PetScreenBounds, String> {
    // Prefer the monitor the pet window is currently on; fall back to primary.
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
    Ok(PetScreenBounds {
        x: m.position().x,
        y: m.position().y,
        width: m.size().width,
        height: m.size().height,
        is_primary: true,
        // Windows: standard taskbar height is 40 dp ≈ 48 px on 100 % DPI.
        // The wander engine uses this purely as a "don't render below" hint.
        taskbar_inset_px: 48,
    })
}
