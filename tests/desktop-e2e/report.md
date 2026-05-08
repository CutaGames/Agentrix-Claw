# Agentrix Desktop — Automated E2E Report

- **Generated:** 2026-05-08 07:41:51 UTC
- **Build:** `agentrix-desktop.exe` v0.1.1
- **Total:** 10 scenarios
- **Passed:** 10
- **Failed:** 0
- **Duration:** 1056 ms total

## Baseline Screenshot

![baseline](screenshots/baseline.png)

## Scenarios

| Domain | Scenario | Result | Duration | Detail |
|---|---|---|---|---|
| lifecycle | `app.launch` | ✅ PASS | 51 ms | found running instance |
| lifecycle | `window.present` | ✅ PASS | 48 ms | found Agentrix Desktop@"Agentrix" |
| system | `screen.baseline` | ✅ PASS | 831 ms | 1280x720 png (600169 bytes) → screenshots/baseline.png |
| computer-use | `mouse.move-roundtrip` | ✅ PASS | 84 ms | before=(990, 578) target=(1015, 578) after=(1015, 578) dx=0px |
| computer-use | `keyboard.text-input` | ✅ PASS | 0 ms | Enigo::text() backend reachable (no-op send) |
| guardrails | `redline.priv-escalation-blocked` | ✅ PASS | 0 ms | blocked: 'please run sudo rm -rf /tmp/foo' |
| guardrails | `redline.normal-text-allowed` | ✅ PASS | 0 ms | allowed: 'Hello, please summarize this doc.' |
| guardrails | `redline.terminal-app-blocked` | ✅ PASS | 0 ms | blocked terminal app: cmd.exe |
| system | `monitors.enumerate` | ✅ PASS | 0 ms | 1 monitor(s): 1920x1080 |
| system | `windows.enumerate` | ✅ PASS | 42 ms | 10 top-level windows |

## Coverage matrix

| Surface | Covered | How |
|---|---|---|
| App launch / re-attach | ✅ | spawn + xcap window scan |
| Tray menu present | ⚠️ partial | tray icons aren't enumerable via xcap; visual smoke only via baseline screenshot |
| Floating ball render | ⚠️ partial | included in baseline screenshot, no pixel diff yet |
| Multi-monitor screen capture | ✅ | xcap::Monitor::all + capture_image |
| Mouse move (Computer Use) | ✅ | enigo round-trip |
| Keyboard text (Computer Use) | ✅ | enigo backend reachable |
| Red-line guardrails | ✅ | priv-escalation, normal text, terminal app |
| Window enumeration | ✅ | xcap::Window::all |
| In-app chat / plan / memory / pet | ❌ TODO | requires Tauri WebDriver bridge or in-page Playwright (out of scope for outside-in run) |
