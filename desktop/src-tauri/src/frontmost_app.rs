//! Name of the frontmost application (E64 / I-030, "active app awareness").
//!
//! Only runs when the owner turned the feature on in Settings (the WebView
//! does not call it otherwise). Returns the application's name only — never
//! a window title — and needs no permission:
//! - macOS: `NSWorkspace.sharedWorkspace.frontmostApplication.localizedName`
//!   (no Accessibility, no Automation / System Events);
//! - Windows: the foreground window's process name.

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::{c_char, c_void, CStr};

    #[link(name = "AppKit", kind = "framework")]
    extern "C" {}

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
        fn objc_autoreleasePoolPush() -> *mut c_void;
        fn objc_autoreleasePoolPop(pool: *mut c_void);
    }

    type MsgSendId = unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void;
    type MsgSendCStr = unsafe extern "C" fn(*mut c_void, *mut c_void) -> *const c_char;

    pub fn frontmost_app_name() -> Option<String> {
        // SAFETY: plain Objective-C message sends to AppKit singletons; every
        // receiver is checked for nil before use; objects are autoreleased and
        // drained by the pool we push and pop here.
        unsafe {
            let pool = objc_autoreleasePoolPush();
            let result = (|| {
                let send_id: MsgSendId = std::mem::transmute(objc_msgSend as *const ());
                let send_cstr: MsgSendCStr = std::mem::transmute(objc_msgSend as *const ());
                let class = objc_getClass(c"NSWorkspace".as_ptr());
                if class.is_null() {
                    return None;
                }
                let workspace = send_id(class, sel_registerName(c"sharedWorkspace".as_ptr()));
                if workspace.is_null() {
                    return None;
                }
                let app = send_id(workspace, sel_registerName(c"frontmostApplication".as_ptr()));
                if app.is_null() {
                    return None;
                }
                let name = send_id(app, sel_registerName(c"localizedName".as_ptr()));
                if name.is_null() {
                    return None;
                }
                let utf8 = send_cstr(name, sel_registerName(c"UTF8String".as_ptr()));
                if utf8.is_null() {
                    return None;
                }
                Some(CStr::from_ptr(utf8).to_string_lossy().into_owned())
            })();
            objc_autoreleasePoolPop(pool);
            result
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    pub fn frontmost_app_name() -> Option<String> {
        crate::commands::get_active_window()
            .ok()
            .flatten()
            .and_then(|window| window.process_name)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    pub fn frontmost_app_name() -> Option<String> {
        None
    }
}

/// Printable, at most 80 characters; nothing else about the app.
fn clean(name: String) -> Option<String> {
    let cleaned: String = name.chars().filter(|c| !c.is_control()).take(80).collect();
    let trimmed = cleaned.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

#[tauri::command(async)]
pub fn desktop_bridge_get_frontmost_app() -> Option<String> {
    platform::frontmost_app_name().and_then(clean)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_trimmed_and_bounded() {
        assert_eq!(clean("  Safari \n".into()).as_deref(), Some("Safari"));
        assert_eq!(clean("\u{7}\u{7}".into()), None);
        assert_eq!(clean("x".repeat(200)).unwrap().chars().count(), 80);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reading_the_frontmost_app_needs_no_permission() {
        // Headless test runs have a frontmost app (or none); either way no prompt, no panic.
        let _ = desktop_bridge_get_frontmost_app();
    }
}
