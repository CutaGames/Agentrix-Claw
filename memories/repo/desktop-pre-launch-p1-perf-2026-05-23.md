# Sprint Pre-launch P-1 — desktop performance refactor (2026-05-23)

User-reported pain points before this sprint:
- Approval modal felt frozen (1-2 s lag clicking Approve)
- Typing in the chat textarea stuttered while a turn was streaming
- 30+ secondary panel toggles all caused full ChatPanelImpl re-renders

## Root cause

**The 3708-line `ChatPanelImpl.tsx` is an "上帝组件"**: it owned 30+
`useState` flags (one per secondary panel), `streamFeedback`,
`activeToolRun`, `sendStartedAt`, `feedbackNow` (a 2 s tick), and
`approvalSubmitting`. Every `setStreamFeedback` / `setActiveToolRun` call
from `useStreamingTurn.ts` (which fires on every tool start/progress/
result and every approval lifecycle event) re-rendered the entire panel,
which then reconciled every panel mount and walked the giant `[style*=]`
selector cascade in `global.css` (1617 lines, 200+ substring selectors,
117 `!important`).

The 2 s `feedbackNow` interval added a guaranteed 30 forced re-renders
per minute even at idle. The in-source comment already flagged this as
"a major source of typing lag". Plus all 51 sync `#[tauri::command]`
functions ran on the **main thread** (per Tauri v2 docs, only
`#[tauri::command(async)]` or `async fn` go to the runtime thread pool),
so any IPC could stall the UI for 100 ms-10 s depending on the work.

## Fixes shipped

### 1. New `uiFeedbackStore` (zustand) — `desktop/src/components/chatPanel/uiFeedbackStore.ts`

- Hosts `streamFeedback`, `activeToolRun`, `sendStartedAt`,
  `approvalSubmitting`, `feedbackNow`, plus a `Set<PanelId>` for the
  panel registry.
- Fine-grained selector hooks (`useStreamFeedback`, `useActiveToolRun`,
  ...) so consumers re-render only when their specific slice changes.
- `uiFeedbackActions.*` for non-component callers (e.g. `useStreamingTurn`).

### 2. `useFeedbackTimer.ts` — centralized 2 s tick

- `useFeedbackTickDriver()` runs the interval but ChatPanelImpl no
  longer reads `feedbackNow`.
- `useVisibleStreamFeedback()` derives the elapsed-second display and
  is consumed inside `<StreamFeedbackBanner>` (a tiny new memoized
  subcomponent inside InputZone). Only that 2-line banner re-renders
  every 2 s now.

### 3. ChatPanelImpl uses store setters only (not values)

- `setStreamFeedback` / `setActiveToolRun` / `setSendStartedAt` are
  pulled from store; the actual values are NOT subscribed by
  ChatPanelImpl. Result: `useStreamingTurn` can fire 50+ setStreamFeedback
  calls per turn without ChatPanelImpl re-rendering at all.
- `feedbackNow`, `feedbackElapsedSeconds`, and `visibleStreamFeedback`
  useMemo blocks deleted (now derived inside the banner subscriber).

### 4. App.tsx decomposition

- `desktop/src/app/useWindowManager.ts` (325 lines) — owns
  panelOpen/panelMode, hide/show window, resize, in-webview keyboard
  shortcuts, OS-level Tauri global shortcuts, idle-15 min compact
  fallback, app-mode broadcast, auto-open Pro Mode on launch.
- `desktop/src/app/useServiceBootstrapper.ts` (208 lines) — owns service
  bootstrap with **idle batching**:
  - Priority 1 (sync, on first frame): network/clipboard/analytics +
    sessionSync + presenceSocket + desktopAgentSync.
  - Priority 2 (`requestIdleCallback` after 800 ms): petSdk, petAssets,
    petModeBus, updater, crashReport.
  - Priority 3 (after 2500 ms): chatMilestone, axpRemoteSync,
    skinSaleNotifier, visionPerception.
- App.tsx shrunk **962 → 543 lines** (-43%) and is now a thin view router.

### 5. Rust: 51 sync commands → `#[tauri::command(async)]`

- `desktop/scripts/async-tauri-commands.ps1` — UTF-8-safe regex bulk
  replace from `#[tauri::command]\nfn` to `#[tauri::command(async)]\nfn`.
- Used `(async)` attribute instead of converting `fn` -> `async fn` so
  the existing `std::sync::Mutex<...>` globals (BALL_POS, WORKSPACE_DIR,
  SUSPEND_CANCEL, CHAT_PANEL_OPENING, CHAT_PANEL_PENDING_PRO_MODE) don't
  need to be reworked across `.await` points.
- Per Tauri v2 docs (https://v2.tauri.app/develop/calling-rust/#async-commands):
  > "Commands without the async keyword are executed on the main thread
  > unless defined with `#[tauri::command(async)]`."

## Validation

- `npx tsc --noEmit -p tsconfig.json` → exit 0
- `npx vitest run` → 91 / 91 passing
- `cargo check` → success (only pre-existing dead_code warnings)
- Chinese comments in lib.rs preserved (UTF-8 BOM-less)

## Files

- New: `uiFeedbackStore.ts`, `useFeedbackTimer.ts`,
  `app/useWindowManager.ts`, `app/useServiceBootstrapper.ts`,
  `scripts/async-tauri-commands.ps1`
- Edited: `App.tsx`, `ChatPanelImpl.tsx`, `chatPanel/InputZone.tsx`,
  `src-tauri/src/lib.rs`

## Not done in this sprint (logged for follow-up)

- Light theme codemod (Step #2 of the audit recommendation): the 200+
  `[style*=]` selectors in `global.css` are a separate full-day task.
- 30+ panel `*Open` flag consolidation into the new `openedPanels: Set<PanelId>`
  (the store slot exists but ChatPanelImpl still uses individual useState
  flags — migrating each callsite is mechanical but ~150 spots).
- Code signing (Windows + macOS) — explicitly skipped per user request.
