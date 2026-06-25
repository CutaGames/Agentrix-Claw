//! Codex-borrow Phase B1 — default backend impl using `enigo` + `xcap`.
//!
//! Both crates support Windows and macOS uniformly, so we keep a single
//! impl. The trait boundary in [`super`] still lets future per-platform
//! divergence drop in without churn.

use std::io::Cursor;

use base64::Engine as _;
use enigo::{Button as EnigoButton, Direction, Enigo, Key as EnigoKey, Keyboard, Mouse, Settings};

use super::redlines;
use super::{
    ComputerUseBackend, ComputerUseError, MouseButton, Screenshot, ScreenshotOptions, WindowNode,
};

pub struct DefaultBackend;

impl Default for DefaultBackend {
    fn default() -> Self {
        Self
    }
}

fn make_enigo() -> Result<Enigo, ComputerUseError> {
    Enigo::new(&Settings::default())
        .map_err(|e| ComputerUseError::Backend(format!("enigo init failed: {e}")))
}

fn map_button(b: MouseButton) -> EnigoButton {
    match b {
        MouseButton::Left => EnigoButton::Left,
        MouseButton::Right => EnigoButton::Right,
        MouseButton::Middle => EnigoButton::Middle,
    }
}

/// Translate a "Ctrl+Shift+T" style combo into a sequence of `enigo` keys.
/// Unknown tokens are typed as literal characters.
fn parse_combo(combo: &str) -> Vec<EnigoKey> {
    combo
        .split('+')
        .map(|raw| raw.trim())
        .filter(|t| !t.is_empty())
        .map(|t| match t.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => EnigoKey::Control,
            "shift" => EnigoKey::Shift,
            "alt" | "option" => EnigoKey::Alt,
            "cmd" | "meta" | "win" | "super" => EnigoKey::Meta,
            "enter" | "return" => EnigoKey::Return,
            "tab" => EnigoKey::Tab,
            "esc" | "escape" => EnigoKey::Escape,
            "backspace" => EnigoKey::Backspace,
            "delete" | "del" => EnigoKey::Delete,
            "space" => EnigoKey::Space,
            "up" => EnigoKey::UpArrow,
            "down" => EnigoKey::DownArrow,
            "left" => EnigoKey::LeftArrow,
            "right" => EnigoKey::RightArrow,
            "home" => EnigoKey::Home,
            "end" => EnigoKey::End,
            "pageup" => EnigoKey::PageUp,
            "pagedown" => EnigoKey::PageDown,
            other if other.len() == 1 => {
                EnigoKey::Unicode(other.chars().next().unwrap())
            }
            "f1" => EnigoKey::F1,
            "f2" => EnigoKey::F2,
            "f3" => EnigoKey::F3,
            "f4" => EnigoKey::F4,
            "f5" => EnigoKey::F5,
            "f6" => EnigoKey::F6,
            "f7" => EnigoKey::F7,
            "f8" => EnigoKey::F8,
            "f9" => EnigoKey::F9,
            "f10" => EnigoKey::F10,
            "f11" => EnigoKey::F11,
            "f12" => EnigoKey::F12,
            other => {
                // Fallback: type the first char as Unicode.
                EnigoKey::Unicode(other.chars().next().unwrap_or(' '))
            }
        })
        .collect()
}

impl ComputerUseBackend for DefaultBackend {
    fn screenshot(&self, opts: &ScreenshotOptions) -> Result<Screenshot, ComputerUseError> {
        let monitors = xcap::Monitor::all()
            .map_err(|e| ComputerUseError::Backend(format!("monitor enumeration failed: {e}")))?;
        if monitors.is_empty() {
            return Err(ComputerUseError::Backend("no monitor found".into()));
        }
        let idx = opts.monitor_index.unwrap_or(0).min(monitors.len() - 1);
        let monitor = &monitors[idx];
        let img = monitor
            .capture_image()
            .map_err(|e| ComputerUseError::Backend(format!("capture failed: {e}")))?;

        // Optional region crop (physical pixels).
        let img = if let Some([x, y, w, h]) = opts.region {
            let mut dyn_img = image::DynamicImage::ImageRgba8(img);
            dyn_img = dyn_img.crop_imm(
                x.max(0) as u32,
                y.max(0) as u32,
                w.max(1) as u32,
                h.max(1) as u32,
            );
            dyn_img.to_rgba8()
        } else {
            img
        };

        // Optional downscale.
        let max_size = opts.max_size.unwrap_or(1600);
        let (orig_w, orig_h) = (img.width(), img.height());
        let dyn_img = image::DynamicImage::ImageRgba8(img);
        let scaled = if orig_w.max(orig_h) > max_size {
            let ratio = max_size as f32 / orig_w.max(orig_h) as f32;
            dyn_img.resize(
                (orig_w as f32 * ratio) as u32,
                (orig_h as f32 * ratio) as u32,
                image::imageops::FilterType::Triangle,
            )
        } else {
            dyn_img
        };

        let final_w = scaled.width();
        let final_h = scaled.height();
        let mut buf: Vec<u8> = Vec::with_capacity(64 * 1024);
        scaled
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| ComputerUseError::Backend(format!("png encode failed: {e}")))?;
        let png_base64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        Ok(Screenshot {
            png_base64,
            width: final_w,
            height: final_h,
            monitor_index: idx,
        })
    }

    fn click(
        &self,
        x: i32,
        y: i32,
        button: MouseButton,
        double: bool,
    ) -> Result<(), ComputerUseError> {
        let mut enigo = make_enigo()?;
        enigo
            .move_mouse(x, y, enigo::Coordinate::Abs)
            .map_err(|e| ComputerUseError::Backend(format!("move_mouse: {e}")))?;
        let btn = map_button(button);
        enigo
            .button(btn, Direction::Click)
            .map_err(|e| ComputerUseError::Backend(format!("click: {e}")))?;
        if double {
            enigo
                .button(btn, Direction::Click)
                .map_err(|e| ComputerUseError::Backend(format!("dblclick: {e}")))?;
        }
        Ok(())
    }

    fn move_pointer(&self, x: i32, y: i32) -> Result<(), ComputerUseError> {
        let mut enigo = make_enigo()?;
        enigo
            .move_mouse(x, y, enigo::Coordinate::Abs)
            .map_err(|e| ComputerUseError::Backend(format!("move_mouse: {e}")))
    }

    fn type_text(&self, text: &str) -> Result<(), ComputerUseError> {
        redlines::enforce_no_priv_escalation(text)?;
        let mut enigo = make_enigo()?;
        enigo
            .text(text)
            .map_err(|e| ComputerUseError::Backend(format!("type: {e}")))
    }

    fn key_combo(&self, combo: &str) -> Result<(), ComputerUseError> {
        redlines::enforce_no_priv_escalation(combo)?;
        let keys = parse_combo(combo);
        if keys.is_empty() {
            return Err(ComputerUseError::InvalidArg("empty combo".into()));
        }
        let mut enigo = make_enigo()?;
        // Press all but last as modifiers, click the last, then release.
        let (last, mods) = keys.split_last().unwrap();
        for k in mods {
            enigo
                .key(*k, Direction::Press)
                .map_err(|e| ComputerUseError::Backend(format!("key down: {e}")))?;
        }
        let click_result = enigo
            .key(*last, Direction::Click)
            .map_err(|e| ComputerUseError::Backend(format!("key click: {e}")));
        for k in mods.iter().rev() {
            let _ = enigo.key(*k, Direction::Release);
        }
        click_result
    }

    fn window_tree(&self) -> Result<Vec<WindowNode>, ComputerUseError> {
        let windows = xcap::Window::all()
            .map_err(|e| ComputerUseError::Backend(format!("window enumeration: {e}")))?;
        // 需求 4.3 — report is_active truthfully by comparing each window's
        // title against the OS foreground window (xcap 0.0.14 has no
        // is_focused() probe). On platforms where we cannot read the
        // foreground window this stays `None` and every is_active is false
        // (explicit, never faked).
        let foreground = super::grounding_platform::foreground_window_title();
        let mut out = Vec::with_capacity(windows.len());
        for w in windows {
            let app_name = w.app_name().to_string();
            let title = w.title().to_string();
            let x = w.x();
            let y = w.y();
            let width = w.width() as i32;
            let height = w.height() as i32;
            let is_active = foreground
                .as_deref()
                .map(|fg| !title.is_empty() && (fg == title || fg.contains(&title) || title.contains(fg)))
                .unwrap_or(false);
            out.push(WindowNode {
                id: w.id().to_string(),
                title,
                app_name,
                bounds: [x, y, width, height],
                is_active,
            });
        }
        Ok(out)
    }

    fn focus_window(&self, window_id: &str) -> Result<(), ComputerUseError> {
        let windows = xcap::Window::all()
            .map_err(|e| ComputerUseError::Backend(format!("window enumeration: {e}")))?;
        for w in windows {
            let id = w.id().to_string();
            if id == window_id {
                let app_name = w.app_name().to_string();
                redlines::enforce_window_allowed(&app_name)?;
                // xcap does not yet expose a portable focus API; signal
                // back so the JS layer can fall back to keystroke alt-tab.
                return Err(ComputerUseError::Backend(
                    "focus_window not yet supported by backend; use keystroke fallback".into(),
                ));
            }
        }
        Err(ComputerUseError::InvalidArg(format!(
            "no window with id '{}'",
            window_id
        )))
    }

    fn probe_permissions(&self) -> Option<String> {
        // On macOS we expect the host app to have Accessibility + Screen Recording
        // approved; on Windows nothing extra is required for input/capture.
        // A real implementation would call AXIsProcessTrustedWithOptions on
        // macOS — left as a follow-up since `enigo`/`xcap` already surface
        // failures with descriptive errors at first use.
        None
    }
}
