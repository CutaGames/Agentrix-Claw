# Agentrix Computer Use Guide

> Status: Phase B1+B2+B3+B6+B7 shipped 2026-05-08.
> Branch: `v3-p0-w1-presence-contracts`. Cross-platform: Windows + macOS.

## What it is

Computer Use lets an Agentrix agent see your screen and synthesize mouse,
keyboard, and browser input on your behalf. It's gated behind three layers
of authorization, and a fourth layer of hardcoded red-lines in Rust that
**cannot be overridden** from any UI.

```
┌──────────────────────────────────────────────────────────┐
│ Layer 1: OS permissions (macOS Accessibility / Screen Rec)│
│ Layer 2: User toggle in Settings → Computer Use           │
│ Layer 3: Per-action approval sheet (every click/type)     │
│ Layer 4: Rust red-lines (terminals, sudo, self) — moat    │
└──────────────────────────────────────────────────────────┘
```

## Tools exposed to the LLM

| Tool                              | Risk     | Approval |
| --------------------------------- | -------- | -------- |
| `computer_use_screenshot`         | low      | none     |
| `computer_use_window_tree`        | low      | none     |
| `computer_use_move`               | low      | none     |
| `computer_use_click`              | medium   | per-call |
| `computer_use_type`               | medium   | per-call |
| `computer_use_key`                | medium   | per-call |
| `computer_use_browser_navigate`   | medium   | per-call |
| `computer_use_browser_list_tabs`  | low      | none     |

The browser tools spawn the user's installed Chrome (or Edge) with
`--remote-debugging-port=9222 --user-data-dir=<isolated profile>` and
talk to it over the CDP HTTP endpoints. We deliberately do not embed a
Chromium runtime in the desktop bundle.

## Hardcoded red-lines (Rust)

Any input or focus targeting one of these is refused at the Tauri command
boundary, regardless of UI consent. Source of truth:
[desktop/src-tauri/src/computer_use/redlines.rs](../desktop/src-tauri/src/computer_use/redlines.rs).

- **Blocked apps**: `cmd.exe`, `powershell.exe`, `pwsh.exe`,
  `WindowsTerminal.exe`, `wt.exe`, `Terminal.app`, `iTerm.app`, `iTerm2.app`,
  `Alacritty`, and the Agentrix desktop app itself.
- **Blocked patterns in typed text**: `sudo `, `runas /`, `su -`, `rm -rf /`,
  `format c:`, `diskpart`, `shutdown -s`, `reg delete`, `powershell -enc`,
  `iex (`.

The same blocklist is mirrored in TypeScript at
[shared/types/computer-use.ts](../shared/types/computer-use.ts) so the UI
can grey out blocked windows preemptively.

## Enabling

1. **Settings → Computer Use** → toggle "Allow Agent to control mouse /
   keyboard / screen". Optionally also "Allow Agent to drive an isolated
   Chrome browser".
2. On macOS only: grant **Accessibility** + **Screen Recording** to the
   Agentrix Desktop app in *System Settings → Privacy & Security*.
3. Each tool call surfaces an approval sheet showing the action and target.
   Approving once does **not** persist; every call asks again. (We may add
   "Always allow for this session" for low-risk tools later.)

## Adding a new Computer Use tool

1. Add the schema to `shared/types/computer-use.ts::COMPUTER_USE_TOOLS` with
   a risk tier and `allowRemember` flag.
2. Add the Rust primitive to `computer_use/backend_impl.rs` (or `cdp.rs`
   for browser tools).
3. Wrap as a `#[tauri::command]` in `desktop/src-tauri/src/lib.rs` and
   register in `invoke_handler!`.
4. Add the command name to `desktop/src-tauri/permissions/computer-use.toml`.
5. Add the OpenAI tool schema + executor branch to
   `desktop/src/services/desktopToolCalling.ts` (gate via
   `getActiveDesktopTools()`).
6. If the action is destructive, route through `requireDesktopActionApproval`
   in the executor.

## Validation

- `cd desktop/src-tauri && cargo check` — fast cross-platform compile.
- `cd desktop/src-tauri && cargo test --lib computer_use::redlines` — red-line
  unit tests.
- CI: `.github/workflows/computer-use-check.yml` runs both on Windows and
  macOS for every PR touching `computer_use/`.

## Known limitations

- `focus_window` returns a `Backend` error today because xcap 0.0.14 lacks a
  portable focus API. UIs should fall back to keystroke alt-tab.
- Browser JS evaluation (`computer_use_browser_eval`) is not implemented in
  v1 — it requires a WebSocket transport for CDP and we deliberately deferred
  the `tokio-tungstenite` dependency.
- Linux is not yet supported. The `xcap` + `enigo` combination supports it,
  but we have not validated the OS permission story (Wayland vs X11) yet.
