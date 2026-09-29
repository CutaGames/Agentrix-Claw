//! 需求 4 — Desktop GUI hardening (P1).
//!
//! Native-GUI Computer Use has three classic weak points that this module
//! closes:
//!
//! 1. **Coordinate grounding** — instead of asking the model to guess pixel
//!    coordinates, we extract the *interactable* elements from the OS
//!    accessibility tree (Windows UI Automation / macOS AX) and present them
//!    as a **set-of-marks** (`m1`, `m2`, …). The model then selects a *mark*
//!    and we map it back to a click point. Canvas / custom-draw apps that have
//!    no usable accessibility tree degrade to OCR / icon detection.
//! 2. **Window focus** — a portable [`focus_window_active`] that actually
//!    brings a window forward (Windows `SetForegroundWindow`, macOS
//!    `activate`) and **reports `is_active` truthfully** by re-reading the
//!    foreground window afterwards.
//! 3. **Tiered approval** — every native click / type is classified into a
//!    risk tier ([`classify_action_risk`]) and gated through
//!    [`gate_native_action`], which enforces the hardcoded red-lines and hands
//!    the tier to the TypeScript approval flow (需求 3).
//!
//! ## Property 8 — 降级显式 (explicit degraded)
//!
//! When grounding is unavailable we NEVER silently fall back to guessing
//! coordinates. The result carries an explicit [`GroundingMode`]
//! (`AccessibilityTree` / `OcrFallback` / `Degraded`) plus a
//! `degraded_reason`, and [`GroundingResult::resolve`] refuses to produce a
//! click point while degraded. This mirrors the wallet / on-chain identity
//! "explicit not-enabled" contract from the backend.

use serde::{Deserialize, Serialize};

use super::{redlines, ComputerUseError};

// ─────────────────────────────────────────────────────────────────────────
// Core types (platform-independent, fully unit-tested)
// ─────────────────────────────────────────────────────────────────────────

/// How a [`GroundingResult`] was obtained. Property 8 (降级显式): the caller
/// can always tell whether elements are trustworthy AX nodes, lower-confidence
/// OCR detections, or whether grounding failed entirely.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroundingMode {
    /// Elements extracted from the OS accessibility tree (UIA / AX). Highest
    /// confidence — exact bounds + role + accessible name.
    AccessibilityTree,
    /// Accessibility tree unusable (canvas / custom-draw app); elements come
    /// from OCR / icon detection. Lower confidence, but coordinates are real
    /// detections — NOT guesses.
    OcrFallback,
    /// No usable grounding at all. `elements` is empty and the caller MUST NOT
    /// fabricate coordinates.
    Degraded,
}

/// A raw interactable element straight from a platform provider, before
/// set-of-marks ids are assigned.
#[derive(Debug, Clone, PartialEq)]
pub struct RawElement {
    /// Accessibility control type (`button`, `edit`, `checkbox`, …) or, for
    /// OCR, `ocr_text` / `icon`.
    pub role: String,
    /// Accessible name / label / OCR text.
    pub name: String,
    /// Physical-pixel bounds `[x, y, w, h]` in screen coordinates.
    pub bounds: [i32; 4],
    /// Whether the element is clickable / focusable.
    pub interactable: bool,
    /// 0.0–1.0; AX elements ~1.0, OCR detections lower.
    pub confidence: f32,
}

/// An interactable element with a stable set-of-marks id for the current pass.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundingElement {
    /// Set-of-marks id, stable within a single grounding pass (`m1`, `m2`, …).
    pub mark: String,
    pub role: String,
    pub name: String,
    /// Physical-pixel bounds `[x, y, w, h]`.
    pub bounds: [i32; 4],
    pub interactable: bool,
    pub confidence: f32,
}

impl GroundingElement {
    /// Click point — the centre of the element's bounds.
    pub fn center(&self) -> (i32, i32) {
        let [x, y, w, h] = self.bounds;
        (x + w / 2, y + h / 2)
    }
}

/// The full grounding of one window: mode + marks + (when degraded) the reason.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundingResult {
    pub window_id: String,
    pub app_name: String,
    pub mode: GroundingMode,
    pub elements: Vec<GroundingElement>,
    /// Present whenever `mode != AccessibilityTree` — explains the degradation
    /// so the UI/model can surface it instead of silently guessing.
    pub degraded_reason: Option<String>,
}

impl GroundingResult {
    pub fn is_degraded(&self) -> bool {
        matches!(self.mode, GroundingMode::Degraded)
    }

    /// Map a set-of-marks id to a click point.
    ///
    /// Property 8: while `Degraded` we refuse to return any coordinate rather
    /// than guess. `OcrFallback` is allowed (real detections) but the caller
    /// is expected to surface the lower confidence.
    pub fn resolve(&self, mark: &str) -> Result<(i32, i32), ComputerUseError> {
        if self.is_degraded() {
            return Err(ComputerUseError::Backend(format!(
                "grounding degraded for '{}' ({}); refusing to guess pixel coordinates",
                self.app_name,
                self.degraded_reason.as_deref().unwrap_or("no accessible elements")
            )));
        }
        let el = self
            .elements
            .iter()
            .find(|e| e.mark == mark)
            .ok_or_else(|| ComputerUseError::InvalidArg(format!("no element with mark '{mark}'")))?;
        if !el.interactable {
            return Err(ComputerUseError::InvalidArg(format!(
                "element '{mark}' ({}) is not interactable",
                el.role
            )));
        }
        Ok(el.center())
    }
}

/// Assign set-of-marks ids in human reading order (top-to-bottom, then
/// left-to-right within a row tolerance). Deterministic so the same screen
/// produces the same marks across calls.
pub fn assign_marks(mut raw: Vec<RawElement>) -> Vec<GroundingElement> {
    const ROW_TOLERANCE: i32 = 12;
    raw.sort_by(|a, b| {
        let (ay, by) = (a.bounds[1], b.bounds[1]);
        if (ay - by).abs() <= ROW_TOLERANCE {
            a.bounds[0].cmp(&b.bounds[0])
        } else {
            ay.cmp(&by)
        }
    });
    raw.into_iter()
        .enumerate()
        .map(|(i, e)| GroundingElement {
            mark: format!("m{}", i + 1),
            role: e.role,
            name: e.name,
            bounds: e.bounds,
            interactable: e.interactable,
            confidence: e.confidence,
        })
        .collect()
}

/// Apps that draw their own UI (games, creative tools, 3D/CAD) where the
/// accessibility tree is empty or meaningless — we go straight to OCR/icon
/// detection for these.
const CANVAS_APP_NEEDLES: &[&str] = &[
    "photoshop",
    "illustrator",
    "after effects",
    "aftereffects",
    "premiere",
    "davinci",
    "blender",
    "figma",
    "gimp",
    "krita",
    "unity",
    "unreal",
    "godot",
    "autocad",
    "sketchup",
    "maya",
    "game",
];

/// Heuristic: does this app render a custom canvas (so the AX tree is not
/// reliable)? Drives the OCR/icon-detection fallback.
pub fn is_canvas_app(app_name: &str) -> bool {
    let lower = app_name.to_ascii_lowercase();
    CANVAS_APP_NEEDLES.iter().any(|n| lower.contains(n))
}

// ─────────────────────────────────────────────────────────────────────────
// Grounding providers (injectable so orchestration is testable off-OS)
// ─────────────────────────────────────────────────────────────────────────

/// Extracts interactable elements from the OS accessibility tree.
pub trait AxTreeProvider {
    fn extract(&self, window_id: &str, app_name: &str) -> Result<Vec<RawElement>, String>;
}

/// Detects interactable elements from pixels (OCR text + icon detection) for
/// canvas apps with no usable accessibility tree.
pub trait OcrProvider {
    fn detect(&self, window_id: &str, app_name: &str) -> Result<Vec<RawElement>, String>;
}

/// Orchestrate grounding with explicit degradation (Property 8):
///
/// 1. Non-canvas app → try the accessibility tree. Non-empty ⇒
///    `AccessibilityTree`.
/// 2. Canvas app, or AX empty / failed → try OCR. Non-empty ⇒ `OcrFallback`
///    (carries `degraded_reason` so the lower confidence is visible).
/// 3. Neither yields elements ⇒ `Degraded` with an explicit reason and an
///    empty element list. The caller refuses to guess.
pub fn ground_with(
    window_id: &str,
    app_name: &str,
    ax: &dyn AxTreeProvider,
    ocr: &dyn OcrProvider,
) -> GroundingResult {
    let mut reason: String;

    if is_canvas_app(app_name) {
        reason = format!("'{app_name}' renders a custom canvas; accessibility tree not reliable");
    } else {
        match ax.extract(window_id, app_name) {
            Ok(raw) if !raw.is_empty() => {
                return GroundingResult {
                    window_id: window_id.to_string(),
                    app_name: app_name.to_string(),
                    mode: GroundingMode::AccessibilityTree,
                    elements: assign_marks(raw),
                    degraded_reason: None,
                };
            }
            Ok(_) => {
                reason = "accessibility tree returned no interactable elements".to_string();
            }
            Err(e) => {
                reason = format!("accessibility tree unavailable: {e}");
            }
        }
    }

    match ocr.detect(window_id, app_name) {
        Ok(raw) if !raw.is_empty() => GroundingResult {
            window_id: window_id.to_string(),
            app_name: app_name.to_string(),
            mode: GroundingMode::OcrFallback,
            elements: assign_marks(raw),
            degraded_reason: Some(reason),
        },
        Ok(_) => {
            reason.push_str("; OCR/icon detection found nothing — refusing to guess coordinates");
            degraded(window_id, app_name, reason)
        }
        Err(e) => {
            reason.push_str(&format!(
                "; OCR/icon detection unavailable ({e}) — refusing to guess coordinates"
            ));
            degraded(window_id, app_name, reason)
        }
    }
}

fn degraded(window_id: &str, app_name: &str, reason: String) -> GroundingResult {
    GroundingResult {
        window_id: window_id.to_string(),
        app_name: app_name.to_string(),
        mode: GroundingMode::Degraded,
        elements: Vec::new(),
        degraded_reason: Some(reason),
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Tiered-approval risk classification (需求 4.4 → 需求 3)
// ─────────────────────────────────────────────────────────────────────────

/// Risk tier for a native-GUI action, aligned with the backend
/// `PolicyEvaluatorService` levels (需求 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskTier {
    /// Read-only (inspect / grounding / focus) — auto.
    Read,
    /// Native click / type / key — policy + budget gated.
    Medium,
    /// Reserved for callers that mark an action high-risk (e.g. a click the
    /// model knows submits a transaction). Always human confirmation.
    High,
    /// Hardcoded red-line — never permitted regardless of UI/policy.
    Redline,
}

/// The kind of native-GUI action being requested.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeActionKind {
    /// Screenshot / grounding / window-tree read.
    Inspect,
    /// Bring a window to the foreground.
    Focus,
    /// Mouse click at a grounded element.
    Click,
    /// Type text into the focused control.
    Type,
    /// Press a key combo.
    KeyCombo,
}

/// Classify a native action into a risk tier. Red-lines win over everything:
/// a blocked target window or privilege-escalation text is `Redline`
/// regardless of the action kind.
pub fn classify_action_risk(
    kind: NativeActionKind,
    app_name: &str,
    text: Option<&str>,
) -> RiskTier {
    if redlines::enforce_window_allowed(app_name).is_err() {
        return RiskTier::Redline;
    }
    if let Some(t) = text {
        if redlines::enforce_no_priv_escalation(t).is_err() {
            return RiskTier::Redline;
        }
    }
    match kind {
        NativeActionKind::Inspect | NativeActionKind::Focus => RiskTier::Read,
        NativeActionKind::Click | NativeActionKind::Type | NativeActionKind::KeyCombo => {
            RiskTier::Medium
        }
    }
}

/// Gate a native action through the red-lines and return the risk tier the
/// TypeScript approval flow must satisfy (需求 4.4). Returns `Err` for
/// red-line actions — these can never be approved.
pub fn gate_native_action(
    kind: NativeActionKind,
    app_name: &str,
    text: Option<&str>,
) -> Result<RiskTier, ComputerUseError> {
    // Surface the precise red-line reason if any.
    redlines::enforce_window_allowed(app_name)?;
    if let Some(t) = text {
        redlines::enforce_no_priv_escalation(t)?;
    }
    Ok(classify_action_risk(kind, app_name, text))
}

// ─────────────────────────────────────────────────────────────────────────
// Window focus + truthful is_active reporting (需求 4.3)
// ─────────────────────────────────────────────────────────────────────────

/// Result of a focus attempt. `is_active` is verified by re-reading the
/// foreground window afterwards — never assumed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowFocusResult {
    pub window_id: String,
    pub app_name: String,
    /// True only if the OS confirms this window is now the foreground window.
    pub is_active: bool,
    /// `set_foreground` (verified), `unsupported`, or `failed: <reason>`.
    pub mode: String,
}

// ─────────────────────────────────────────────────────────────────────────
// Default / OCR providers
// ─────────────────────────────────────────────────────────────────────────

/// OCR provider that is wired but has no engine in this build. It honestly
/// returns "no detections" so [`ground_with`] surfaces an explicit `Degraded`
/// result rather than pretending OCR succeeded (Property 8).
pub struct NoOcrProvider;

impl OcrProvider for NoOcrProvider {
    fn detect(&self, _window_id: &str, _app_name: &str) -> Result<Vec<RawElement>, String> {
        Err("no OCR/icon-detection engine integrated in this build".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeAx(Vec<RawElement>);
    impl AxTreeProvider for FakeAx {
        fn extract(&self, _w: &str, _a: &str) -> Result<Vec<RawElement>, String> {
            Ok(self.0.clone())
        }
    }
    struct ErrAx;
    impl AxTreeProvider for ErrAx {
        fn extract(&self, _w: &str, _a: &str) -> Result<Vec<RawElement>, String> {
            Err("UIA COM init failed".into())
        }
    }
    struct FakeOcr(Vec<RawElement>);
    impl OcrProvider for FakeOcr {
        fn detect(&self, _w: &str, _a: &str) -> Result<Vec<RawElement>, String> {
            Ok(self.0.clone())
        }
    }

    fn el(role: &str, name: &str, bounds: [i32; 4]) -> RawElement {
        RawElement {
            role: role.into(),
            name: name.into(),
            bounds,
            interactable: true,
            confidence: 1.0,
        }
    }

    #[test]
    fn marks_are_assigned_in_reading_order() {
        // Provide out-of-order: bottom-right first.
        let raw = vec![
            el("button", "OK", [300, 200, 60, 24]),
            el("edit", "Search", [10, 10, 200, 24]),
            el("button", "Cancel", [380, 200, 60, 24]),
        ];
        let marks = assign_marks(raw);
        assert_eq!(marks[0].mark, "m1");
        assert_eq!(marks[0].name, "Search"); // top row first
        assert_eq!(marks[1].name, "OK"); // bottom row, left before right
        assert_eq!(marks[2].name, "Cancel");
    }

    #[test]
    fn center_is_bounds_midpoint() {
        let e = GroundingElement {
            mark: "m1".into(),
            role: "button".into(),
            name: "OK".into(),
            bounds: [100, 200, 40, 20],
            interactable: true,
            confidence: 1.0,
        };
        assert_eq!(e.center(), (120, 210));
    }

    #[test]
    fn ax_tree_used_when_available() {
        let ax = FakeAx(vec![el("button", "Buy", [10, 10, 50, 20])]);
        let r = ground_with("w1", "chrome.exe", &ax, &NoOcrProvider);
        assert_eq!(r.mode, GroundingMode::AccessibilityTree);
        assert_eq!(r.elements.len(), 1);
        assert!(r.degraded_reason.is_none());
        // Resolving a mark yields the element centre, not a guess.
        assert_eq!(r.resolve("m1").unwrap(), (35, 20));
    }

    #[test]
    fn canvas_app_skips_ax_and_uses_ocr() {
        let ax = FakeAx(vec![el("button", "ShouldBeIgnored", [0, 0, 10, 10])]);
        let ocr = FakeOcr(vec![el("ocr_text", "Export", [40, 40, 60, 20])]);
        let r = ground_with("w1", "Adobe Photoshop", &ax, &ocr);
        assert_eq!(r.mode, GroundingMode::OcrFallback);
        assert_eq!(r.elements[0].name, "Export");
        assert!(r.degraded_reason.is_some());
    }

    #[test]
    fn no_grounding_is_explicitly_degraded_not_guessed() {
        // AX fails AND no OCR engine → explicit Degraded, empty elements.
        let r = ground_with("w1", "SomeCustomApp", &ErrAx, &NoOcrProvider);
        assert_eq!(r.mode, GroundingMode::Degraded);
        assert!(r.elements.is_empty());
        assert!(r.degraded_reason.is_some());
        // Property 8: resolving while degraded must refuse, never guess.
        let err = r.resolve("m1").unwrap_err();
        assert!(matches!(err, ComputerUseError::Backend(_)));
    }

    #[test]
    fn empty_ax_falls_through_to_degraded() {
        let ax = FakeAx(vec![]);
        let r = ground_with("w1", "EmptyApp", &ax, &NoOcrProvider);
        assert_eq!(r.mode, GroundingMode::Degraded);
        assert!(r
            .degraded_reason
            .as_ref()
            .unwrap()
            .contains("no interactable elements"));
    }

    #[test]
    fn resolve_unknown_mark_errors() {
        let ax = FakeAx(vec![el("button", "Buy", [10, 10, 50, 20])]);
        let r = ground_with("w1", "chrome.exe", &ax, &NoOcrProvider);
        assert!(matches!(
            r.resolve("m99"),
            Err(ComputerUseError::InvalidArg(_))
        ));
    }

    #[test]
    fn resolve_non_interactable_mark_errors() {
        let raw = vec![RawElement {
            role: "text".into(),
            name: "label".into(),
            bounds: [0, 0, 10, 10],
            interactable: false,
            confidence: 1.0,
        }];
        let ax = FakeAx(raw);
        let r = ground_with("w1", "chrome.exe", &ax, &NoOcrProvider);
        assert!(matches!(
            r.resolve("m1"),
            Err(ComputerUseError::InvalidArg(_))
        ));
    }

    #[test]
    fn native_click_is_medium_risk() {
        assert_eq!(
            classify_action_risk(NativeActionKind::Click, "chrome.exe", None),
            RiskTier::Medium
        );
        assert_eq!(
            classify_action_risk(NativeActionKind::Type, "Notepad", Some("hello")),
            RiskTier::Medium
        );
    }

    #[test]
    fn inspect_and_focus_are_read_tier() {
        assert_eq!(
            classify_action_risk(NativeActionKind::Inspect, "chrome.exe", None),
            RiskTier::Read
        );
        assert_eq!(
            classify_action_risk(NativeActionKind::Focus, "chrome.exe", None),
            RiskTier::Read
        );
    }

    #[test]
    fn redline_wins_over_action_kind() {
        // Blocked process target.
        assert_eq!(
            classify_action_risk(NativeActionKind::Click, "cmd.exe", None),
            RiskTier::Redline
        );
        // Privilege-escalation text.
        assert_eq!(
            classify_action_risk(NativeActionKind::Type, "Notepad", Some("sudo rm -rf /")),
            RiskTier::Redline
        );
    }

    #[test]
    fn gate_rejects_redline_actions() {
        assert!(gate_native_action(NativeActionKind::Click, "powershell.exe", None).is_err());
        assert!(
            gate_native_action(NativeActionKind::Type, "Notepad", Some("runas /user:admin"))
                .is_err()
        );
    }

    #[test]
    fn gate_allows_normal_actions_with_tier() {
        let tier = gate_native_action(NativeActionKind::Click, "chrome.exe", None).unwrap();
        assert_eq!(tier, RiskTier::Medium);
    }
}
