//! Cursor position for the pet companion (it looks at where the mouse is).
//!
//! E64 / I-030: this must never ask for a permission. It used to build an
//! `enigo::Enigo` on every call; on macOS `Enigo::new` checks Accessibility
//! trust with the system prompt enabled, so launching the app popped
//! "allow Agentrix to control this computer" — just to read the mouse.
//! Reading the position needs no permission on either platform:
//! - macOS: `CGEventCreate(NULL)` + `CGEventGetLocation` (global points,
//!   origin at the top-left of the main display — the same frame enigo used);
//! - Windows: `GetCursorPos`.
//! Nothing here touches Accessibility, Screen Recording or input simulation.

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct CursorPosition {
    pub x: i32,
    pub y: i32,
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const c_void) -> *mut c_void;
        fn CGEventGetLocation(event: *mut c_void) -> CGPoint;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    pub fn location() -> Result<(f64, f64), String> {
        // SAFETY: a null source is documented as valid; the event is owned by
        // us (Create rule) and released exactly once.
        unsafe {
            let event = CGEventCreate(std::ptr::null());
            if event.is_null() {
                return Err("cursor location unavailable".into());
            }
            let point = CGEventGetLocation(event);
            CFRelease(event as *const c_void);
            Ok((point.x, point.y))
        }
    }
}

#[cfg(windows)]
mod platform {
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetCursorPos(point: *mut Point) -> i32;
    }

    pub fn location() -> Result<(f64, f64), String> {
        let mut point = Point { x: 0, y: 0 };
        // SAFETY: `point` is a valid, writable POINT for the duration of the call.
        if unsafe { GetCursorPos(&mut point) } == 0 {
            return Err("cursor location unavailable".into());
        }
        Ok((point.x as f64, point.y as f64))
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn location() -> Result<(f64, f64), String> {
        Err("cursor location unsupported on this platform".into())
    }
}

fn to_position((x, y): (f64, f64)) -> Result<CursorPosition, String> {
    if !x.is_finite() || !y.is_finite() {
        return Err("cursor location unavailable".into());
    }
    let clamp = |value: f64| value.round().clamp(i32::MIN as f64, i32::MAX as f64) as i32;
    Ok(CursorPosition { x: clamp(x), y: clamp(y) })
}

#[tauri::command]
pub fn desktop_pet_get_cursor_position() -> Result<CursorPosition, String> {
    platform::location().and_then(to_position)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn positions_are_rounded_and_non_finite_values_refused() {
        assert_eq!(to_position((10.4, 20.6)).unwrap(), CursorPosition { x: 10, y: 21 });
        assert_eq!(to_position((-3.5, 0.0)).unwrap(), CursorPosition { x: -4, y: 0 });
        assert!(to_position((f64::NAN, 1.0)).is_err());
        assert!(to_position((1.0, f64::INFINITY)).is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reading_the_cursor_needs_no_permission_prompt() {
        // Runs headless in CI and under `cargo test` without Accessibility trust:
        // if this path asked for a permission it would fail or block here.
        assert!(desktop_pet_get_cursor_position().is_ok());
    }

    #[test]
    fn this_module_never_builds_an_input_simulator() {
        let source = include_str!("cursor_position.rs");
        let code: String = source.lines().filter(|line| !line.trim_start().starts_with("//")).collect::<Vec<_>>().join("\n");
        for forbidden in ["Enigo", "AXIsProcessTrusted", "CGRequestScreenCaptureAccess"] {
            let needle = format!("{forbidden}::");
            assert!(!code.contains(&needle), "{forbidden} used in cursor_position.rs");
            assert!(!code.contains(&format!("{forbidden}(")), "{forbidden} called in cursor_position.rs");
        }
    }
}
