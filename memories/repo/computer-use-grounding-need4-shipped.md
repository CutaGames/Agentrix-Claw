# Computer Use 需求 4 — desktop GUI grounding (shipped)

Spec: `.kiro/specs/crypto-native-agent-ops` task 21 (P1).

## What landed
- `desktop/src-tauri/src/computer_use/grounding.rs` — platform-independent core:
  set-of-marks (`m1`,`m2`…) assignment in reading order, `GroundingMode`
  (accessibility_tree / ocr_fallback / **degraded**), `GroundingResult::resolve`
  (refuses to return coords while degraded — Property 8), canvas-app heuristic,
  and tiered-approval risk classification (`classify_action_risk` /
  `gate_native_action`, red-line wins). Fully unit-tested (13 tests).
- `grounding_platform.rs` — Windows accessibility tree via **PowerShell
  UIAutomation** (`System.Windows.Automation`, FromHandle(GetForegroundWindow)),
  focus via `SetForegroundWindow` + verify GetForegroundWindow → truthful
  `is_active`. Non-Windows / macOS return explicit `degraded` / `unsupported`
  (never faked). Mirrors the existing `commands.rs` PowerShell pattern; no extra
  unsafe FFI.
- Tauri commands: `computer_use_ground_active_window`,
  `computer_use_focus_window_active`, `computer_use_native_action_risk`.
- `backend_impl.rs` `window_tree` now sets `is_active` by comparing each title
  to the foreground window title (xcap 0.0.14 has no is_focused()).
- TS: `shared/types/computer-use.ts` (Grounding* types + `resolveMarkCenter`),
  and `desktopToolCalling.ts` exposes `computer_use_ground_active_window` /
  `computer_use_click_mark` (click by mark, coords resolved server-side, routes
  through `requireDesktopActionApproval`) / `computer_use_focus_window_active`.

## Gotchas
- This repo checkout builds for `x86_64-pc-windows-msvc` and the host IS Windows
  (the `d:\wsl\Ubuntu-24.04\...` path is just a folder name). `cargo check` /
  `cargo test` work directly. First clean build of the crate ~2m (tauri+wasmtime).
- OCR/icon fallback is wired (`OcrProvider` trait + `NoOcrProvider`) but no OCR
  engine is integrated yet → canvas apps currently return `degraded` with an
  explicit reason. Drop in a real `OcrProvider` to light up `ocr_fallback`.
- macOS AX extraction + `activate` focus are explicit `unsupported`
  placeholders — implement when the AX bridge lands.
