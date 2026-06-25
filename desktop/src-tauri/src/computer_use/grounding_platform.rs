//! 需求 4 — platform-specific grounding + focus.
//!
//! The orchestration in [`super::grounding`] is platform-independent and unit
//! tested; this file wires the real OS providers behind it:
//!
//! - **Windows** — accessibility-tree extraction via UI Automation
//!   (`System.Windows.Automation`) and focus via `SetForegroundWindow`,
//!   both driven through PowerShell to match the existing `commands.rs`
//!   pattern (no extra unsafe FFI surface).
//! - **Other platforms** — honest fallbacks that report `Degraded` /
//!   `unsupported` rather than pretending (Property 8).
//!
//! macOS AX extraction + `activate` focus are left as explicit `unsupported`
//! placeholders so the contract is honest until the AX bridge lands.

use super::grounding::{
    ground_with, AxTreeProvider, GroundingResult, NoOcrProvider, RawElement, WindowFocusResult,
};
use super::{redlines, ComputerUseError};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Run a PowerShell script and return trimmed stdout (Windows only).
#[cfg(target_os = "windows")]
fn run_powershell(script: &str) -> Result<String, String> {
    use std::io::Write as _;

    let mut child = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "-",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(script.as_bytes()).map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !stderr.is_empty() { stderr } else { stdout });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ─────────────────────────────────────────────────────────────────────────
// Accessibility-tree provider
// ─────────────────────────────────────────────────────────────────────────

/// OS accessibility-tree provider (UIA on Windows; `Err` elsewhere so the
/// orchestrator degrades explicitly).
pub struct OsAxProvider;

#[cfg(target_os = "windows")]
const UIA_GROUNDING_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AgentrixGround {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
  $hwnd = [AgentrixGround]::GetForegroundWindow()
  if ($hwnd -eq [IntPtr]::Zero) { '[]'; exit 0 }
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  if ($null -eq $root) { '[]'; exit 0 }
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsControlElementProperty, $true)
  $found = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
  $interactable = @('button','hyperlink','edit','check box','radio button','combo box','list item','menu item','tab item','tree item','split button','slider','spin box')
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($el in $found) {
    if ($items.Count -ge 80) { break }
    try {
      if ($el.Current.IsOffscreen) { continue }
      $rect = $el.Current.BoundingRectangle
      if ([double]::IsInfinity($rect.X) -or $rect.Width -le 0 -or $rect.Height -le 0) { continue }
      $role = $el.Current.LocalizedControlType
      if ([string]::IsNullOrWhiteSpace($role)) { $role = 'control' }
      $isInteractable = $interactable -contains $role.ToLower()
      if (-not $isInteractable) { continue }
      $name = $el.Current.Name
      if ($null -eq $name) { $name = '' }
      $items.Add([pscustomobject]@{
        role = $role.ToLower()
        name = $name.Trim()
        x = [int][math]::Round($rect.X)
        y = [int][math]::Round($rect.Y)
        w = [int][math]::Round($rect.Width)
        h = [int][math]::Round($rect.Height)
        enabled = [bool]$el.Current.IsEnabled
      }) | Out-Null
    } catch { continue }
  }
  if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress -Depth 4 }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
"#;

impl AxTreeProvider for OsAxProvider {
    #[cfg(target_os = "windows")]
    fn extract(&self, _window_id: &str, _app_name: &str) -> Result<Vec<RawElement>, String> {
        let out = run_powershell(UIA_GROUNDING_SCRIPT)?;
        if out.is_empty() || out == "[]" {
            return Ok(Vec::new());
        }
        // ConvertTo-Json emits a bare object for a single element.
        let normalized = if out.trim_start().starts_with('[') {
            out
        } else {
            format!("[{out}]")
        };
        let rows: Vec<PsElement> =
            serde_json::from_str(&normalized).map_err(|e| format!("parse UIA output: {e}"))?;
        Ok(rows
            .into_iter()
            .map(|r| RawElement {
                role: r.role,
                name: r.name,
                bounds: [r.x, r.y, r.w, r.h],
                interactable: r.enabled,
                confidence: 1.0,
            })
            .collect())
    }

    #[cfg(not(target_os = "windows"))]
    fn extract(&self, _window_id: &str, _app_name: &str) -> Result<Vec<RawElement>, String> {
        Err("accessibility-tree grounding not implemented on this platform".to_string())
    }
}

#[cfg(target_os = "windows")]
#[derive(serde::Deserialize)]
struct PsElement {
    role: String,
    name: String,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    enabled: bool,
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry points (used by the Tauri commands)
// ─────────────────────────────────────────────────────────────────────────

/// Ground the current foreground window: extract its accessibility-tree
/// elements as a set-of-marks, degrading explicitly when unavailable.
pub fn ground_active_window() -> GroundingResult {
    let (window_id, app_name) = foreground_identity();
    ground_with(&window_id, &app_name, &OsAxProvider, &NoOcrProvider)
}

/// The foreground window's `(title, process)` — used as `(window_id, app_name)`
/// for grounding. Returns `("", "")` when unknown.
fn foreground_identity() -> (String, String) {
    #[cfg(target_os = "windows")]
    {
        match run_powershell(FOREGROUND_IDENTITY_SCRIPT) {
            Ok(out) if !out.is_empty() => {
                if let Ok(info) = serde_json::from_str::<ForegroundInfo>(&out) {
                    return (
                        info.title.unwrap_or_default(),
                        info.process_name.unwrap_or_default(),
                    );
                }
            }
            _ => {}
        }
    }
    (String::new(), String::new())
}

#[cfg(target_os = "windows")]
#[derive(serde::Deserialize)]
struct ForegroundInfo {
    title: Option<String>,
    process_name: Option<String>,
}

#[cfg(target_os = "windows")]
const FOREGROUND_IDENTITY_SCRIPT: &str = r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class AgentrixFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [AgentrixFg]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { return }
$sb = New-Object System.Text.StringBuilder 2048
[void][AgentrixFg]::GetWindowText($hwnd, $sb, $sb.Capacity)
$procId = 0
[void][AgentrixFg]::GetWindowThreadProcessId($hwnd, [ref]$procId)
$procName = $null
if ($procId -gt 0) { try { $procName = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {} }
[pscustomobject]@{ title = $sb.ToString().Trim(); processName = $procName } | ConvertTo-Json -Compress
"#;

/// Read the foreground window title (used by `window_tree` to set `is_active`).
pub fn foreground_window_title() -> Option<String> {
    let (title, _) = foreground_identity();
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

/// Bring the window whose title contains `title_substr` to the foreground and
/// verify it actually became active (需求 4.3). Red-line targets are refused.
pub fn focus_window_active(title_substr: &str) -> Result<WindowFocusResult, ComputerUseError> {
    #[cfg(target_os = "windows")]
    {
        // 1. Locate candidate window (title + process) WITHOUT focusing yet.
        let candidate = find_window(title_substr)
            .map_err(ComputerUseError::Backend)?
            .ok_or_else(|| {
                ComputerUseError::InvalidArg(format!("no window matching '{title_substr}'"))
            })?;

        // 2. Red-line gate before we touch it.
        redlines::enforce_window_allowed(&candidate.process_name)?;

        // 3. Focus + verify foreground.
        let is_active = set_foreground(&candidate.handle).map_err(ComputerUseError::Backend)?;
        Ok(WindowFocusResult {
            window_id: candidate.handle,
            app_name: candidate.process_name,
            is_active,
            mode: if is_active {
                "set_foreground".to_string()
            } else {
                "failed: foreground not confirmed".to_string()
            },
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (title_substr, redlines::enforce_window_allowed("placeholder"));
        Ok(WindowFocusResult {
            window_id: String::new(),
            app_name: String::new(),
            is_active: false,
            mode: "unsupported: window focus not implemented on this platform".to_string(),
        })
    }
}

#[cfg(target_os = "windows")]
struct Candidate {
    handle: String,
    process_name: String,
}

#[cfg(target_os = "windows")]
fn find_window(title_substr: &str) -> Result<Option<Candidate>, String> {
    let needle = serde_json::to_string(title_substr).map_err(|e| e.to_string())?;
    let script = format!(
        r#"
$needle = {needle} | ConvertFrom-Json
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public delegate bool AgentrixEnumProc(IntPtr hWnd, IntPtr lParam);
public static class AgentrixFind {{
  [DllImport("user32.dll")] public static extern bool EnumWindows(AgentrixEnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder t, int c);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}}
"@
$match = $null
$cb = [AgentrixEnumProc]{{
  param($hwnd, $lp)
  if ($null -ne $match) {{ return $true }}
  if (-not [AgentrixFind]::IsWindowVisible($hwnd)) {{ return $true }}
  $len = [AgentrixFind]::GetWindowTextLength($hwnd)
  if ($len -le 0) {{ return $true }}
  $sb = New-Object System.Text.StringBuilder ($len + 1)
  [void][AgentrixFind]::GetWindowText($hwnd, $sb, $sb.Capacity)
  $title = $sb.ToString()
  if ($title -like "*$needle*") {{
    $procId = 0
    [void][AgentrixFind]::GetWindowThreadProcessId($hwnd, [ref]$procId)
    $procName = $null
    if ($procId -gt 0) {{ try {{ $procName = (Get-Process -Id $procId -ErrorAction Stop).ProcessName }} catch {{}} }}
    $script:match = [pscustomobject]@{{ handle = $hwnd.ToInt64().ToString(); processName = $procName }}
  }}
  return $true
}}
[void][AgentrixFind]::EnumWindows($cb, [IntPtr]::Zero)
if ($null -ne $match) {{ $match | ConvertTo-Json -Compress }}
"#
    );
    let out = run_powershell(&script)?;
    if out.is_empty() {
        return Ok(None);
    }
    #[derive(serde::Deserialize)]
    struct Found {
        handle: String,
        #[serde(rename = "processName")]
        process_name: Option<String>,
    }
    let f: Found = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    Ok(Some(Candidate {
        handle: f.handle,
        process_name: f.process_name.unwrap_or_default(),
    }))
}

#[cfg(target_os = "windows")]
fn set_foreground(handle: &str) -> Result<bool, String> {
    let handle_num: i64 = handle.parse().map_err(|_| "invalid window handle".to_string())?;
    let script = format!(
        r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AgentrixFocus {{
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}}
"@
$hwnd = [IntPtr]::new([int64]{handle_num})
if ([AgentrixFocus]::IsIconic($hwnd)) {{ [void][AgentrixFocus]::ShowWindow($hwnd, 9) }} # SW_RESTORE
[void][AgentrixFocus]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 120
$active = [AgentrixFocus]::GetForegroundWindow()
if ($active -eq $hwnd) {{ 'true' }} else {{ 'false' }}
"#
    );
    let out = run_powershell(&script)?;
    Ok(out.trim() == "true")
}
