//! Desktop D0 — process-wide emergency stop (kill switch), the Rust-side
//! second gate behind the TypeScript `executionFence`.
//!
//! - The tray menu "急停" engages it directly (no JS round-trip), then tells
//!   every window so the TS fence, pending approvals and Computer Use toggles
//!   follow.
//! - The TS side mirrors its persisted state here on startup and whenever it
//!   changes (`desktop_bridge_set_kill_switch`).
//! - While engaged, side-effecting bridge commands refuse to run, and a shell
//!   command that is already running is killed on the next poll (≤ 50 ms).
//!
//! Only stop-type operations are allowed while engaged. Releasing is a local
//! user action in the desktop UI; remote channels have no release path.

use std::sync::atomic::{AtomicBool, Ordering};

static ENGAGED: AtomicBool = AtomicBool::new(false);

/// Error string returned to JS; matches the TS `FenceDeniedError` prefix so the
/// UI shows the same message for both gates.
pub const KILL_SWITCH_ERROR: &str = "DESKTOP_FENCE_DENIED:kill_switch_engaged";

/// JS snippet dispatched into every webview when the tray engages the switch.
pub const EMERGENCY_STOP_JS: &str =
    "window.dispatchEvent(new CustomEvent('agentrix:emergency-stop', { detail: { origin: 'tray' } }))";

pub fn engage() {
    ENGAGED.store(true, Ordering::SeqCst);
    crate::agent_hooks::mirror(true);
}

// Release goes through `set(false)` from the TS mirror; kept for tests and a
// future native "解除急停" entry.
#[allow(dead_code)]
pub fn release() {
    ENGAGED.store(false, Ordering::SeqCst);
    crate::agent_hooks::mirror(false);
}

pub fn set(engaged: bool) {
    ENGAGED.store(engaged, Ordering::SeqCst);
    // Desktop D3: third-party AI hooks (agentrix-guard.sh) read this file.
    crate::agent_hooks::mirror(engaged);
}

pub fn is_engaged() -> bool {
    ENGAGED.load(Ordering::SeqCst)
}

/// Refuse a side effect while the kill switch is engaged.
pub fn ensure_not_engaged() -> Result<(), String> {
    if is_engaged() {
        Err(KILL_SWITCH_ERROR.to_string())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // One test touches the global so parallel test threads cannot race on it.
    #[test]
    fn engage_blocks_and_release_restores() {
        release();
        assert!(ensure_not_engaged().is_ok());

        engage();
        assert!(is_engaged());
        assert_eq!(ensure_not_engaged().unwrap_err(), KILL_SWITCH_ERROR);

        set(false);
        assert!(ensure_not_engaged().is_ok());

        set(true);
        assert!(ensure_not_engaged().is_err());
        release();
        assert!(!is_engaged());
    }

    #[test]
    fn emergency_stop_js_targets_the_ts_listener() {
        assert!(EMERGENCY_STOP_JS.contains("agentrix:emergency-stop"));
        assert!(EMERGENCY_STOP_JS.contains("origin: 'tray'"));
    }
}
