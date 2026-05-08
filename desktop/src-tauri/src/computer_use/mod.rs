//! Codex-borrow Phase B1 — Computer Use cross-platform backend.
//!
//! This module implements the OS-level input + capture primitives that back
//! the `computer_use_*` Tauri commands. The design goals are:
//!
//! 1. **Cross-platform first.** Windows and macOS share one implementation
//!    via `enigo` + `xcap`; we only branch when a capability genuinely
//!    requires it (e.g. macOS Accessibility permission probe).
//! 2. **Deny-by-default.** Every entry point passes through
//!    [`enforce_redlines`] before touching the OS, refusing terminals,
//!    privilege-escalation patterns, and the Agentrix process itself.
//! 3. **No silent failure.** Errors are returned as `Result<_, ComputerUseError>`
//!    so the JS layer can surface a precise reason in the UI.
//!
//! The actual three-layer authorization (OS permission, app whitelist,
//! sensitive-action prompt) lives in TypeScript — this crate enforces only
//! the hardcoded red-lines that must NEVER be bypassed regardless of UI.

use serde::{Deserialize, Serialize};
use std::fmt;

pub mod redlines;
pub mod cdp;
pub mod cdp_eval;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ComputerUseError {
    Redline(String),
    PermissionDenied(String),
    Backend(String),
    InvalidArg(String),
}

impl fmt::Display for ComputerUseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ComputerUseError::Redline(m) => write!(f, "blocked by red-line: {m}"),
            ComputerUseError::PermissionDenied(m) => write!(f, "permission denied: {m}"),
            ComputerUseError::Backend(m) => write!(f, "backend error: {m}"),
            ComputerUseError::InvalidArg(m) => write!(f, "invalid argument: {m}"),
        }
    }
}

impl std::error::Error for ComputerUseError {}

/// Kept identical to `shared/types/computer-use.ts::MouseButton`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotOptions {
    /// Optional 0-based monitor index. None = primary.
    pub monitor_index: Option<usize>,
    /// Region (x,y,w,h) in physical pixels. None = full monitor.
    pub region: Option<[i32; 4]>,
    /// Max longest-edge size; image will be downscaled if larger. Default 1600.
    pub max_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Screenshot {
    /// PNG bytes, base64 encoded — kept simple for the JS bridge.
    pub png_base64: String,
    pub width: u32,
    pub height: u32,
    pub monitor_index: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct WindowNode {
    pub id: String,
    pub title: String,
    pub app_name: String,
    pub bounds: [i32; 4],
    pub is_active: bool,
}

/// Backend trait — one impl is sufficient because `enigo` + `xcap` already
/// abstract over Win + Mac. The trait exists so tests can swap in a fake
/// without going through the OS, and so that platform-specific overrides
/// (e.g. macOS AX permission probe) have a clear extension point.
pub trait ComputerUseBackend: Send + Sync {
    fn screenshot(&self, opts: &ScreenshotOptions) -> Result<Screenshot, ComputerUseError>;
    fn click(&self, x: i32, y: i32, button: MouseButton, double: bool) -> Result<(), ComputerUseError>;
    fn move_pointer(&self, x: i32, y: i32) -> Result<(), ComputerUseError>;
    fn type_text(&self, text: &str) -> Result<(), ComputerUseError>;
    fn key_combo(&self, combo: &str) -> Result<(), ComputerUseError>;
    fn window_tree(&self) -> Result<Vec<WindowNode>, ComputerUseError>;
    fn focus_window(&self, window_id: &str) -> Result<(), ComputerUseError>;
    /// Probe OS-level permissions. Returns a free-form reason string if
    /// missing, else `None`.
    fn probe_permissions(&self) -> Option<String>;
}

mod backend_impl;
pub use backend_impl::DefaultBackend;
