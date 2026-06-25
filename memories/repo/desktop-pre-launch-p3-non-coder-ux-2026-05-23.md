# Sprint Pre-launch P-3 — non-coder UX shipping (2026-05-23)

Per the team-alignment doc `docs/agentrix-positioning-2026-05.zh-CN.md`,
Agentrix's target users are non-coders (40%), PMs/designers (30%), and
general users (20%) — NOT professional programmers. Cursor / Windsurf /
Cline already serve programmers well. We do NOT compete on IDE editor;
we compete on the chat-box-plus-agent layer used by everyone.

This sprint ships the 9-task list called out in the audit conversation,
all aimed at making the desktop chat surface usable to L1 (first-time)
non-coder users while preserving full depth for L2/L3 power users.

## Tasks shipped

### 1. Simple / Standard / Pro mode

- New: `desktop/src/services/userMode.ts` — zustand store, persists to
  localStorage `agentrix_user_mode`. Default `simple`.
- Settings panel adds a 3-button picker (Simple / Standard / Pro).
- Components subscribe via `useIsSimpleMode` to hide complexity by
  default. See callsites in ChatTitleBar (tier selector + microcopy)
  and InputZone (Ask/Agent/Plan rail).

### 2. Approval modal — plain-language risk copy

`ApprovalSheet.tsx` now picks copy by mode:
- Simple: "安全 / 需要你确认 / 危险" + 中文 description per level + 按钮
  "同意 / 拒绝".
- Pro: keeps the engineering-friendly "L0/L1/L2/L3 / Approve / Reject".

### 3. `@` and `/` autocomplete dropdown

- New: `desktop/src/components/chatPanel/MentionAutocomplete.tsx`
- Detects trigger (`@` or `/`) at word boundary in the chat textarea.
- `@`: prelude (`@web` / `@docs`) + workspace top-level files/dirs.
- `/`: 8 slash commands (`/explain` `/fix` `/test` `/refactor` `/doc`
  `/summary` `/redo` `/continue`).
- Keyboard: ↑↓ navigate, Tab/Enter accept, Esc dismiss.
- Mouse: hover highlights + onMouseDown applies (prevents textarea blur).
- Anchored above the textarea via `position: fixed` + caret-rect helper.
- Wired into `InputZone` after `ChatInputComposer`.

### 4. Per-turn summary footer + "see screen" button

- New: `desktop/src/components/chatPanel/TurnSummaryFooter.tsx`
- Renders below the LAST settled assistant message (Simple mode only).
- "✓ 刚才" line: counts file edits / commands / git ops / screenshots /
  browser actions, formats as "改了 N 个文件、运行了 M 条命令…".
- "→ 下一步" line: rule-based suggestion (review at Workbench, look at
  command output, commit, etc.).
- "📸 看一下当前屏幕" button: calls `captureScreen()`, dispatches
  `agentrix:turn-screenshot` event; ChatPanelImpl listens and attaches
  the dataURL as a `verify_screenshot` artifact on the message.
- Integrated into MessageList via `<TurnSummaryFooterConnected>` which
  reads `workspaceChanges` from runtime store.

### 5. Plan / tool calls inline default-expanded

- `MessageBubble.tsx::ThinkBlock` now defaults to OPEN while `streaming`
  so users see the agent thinking in real time.
- `TOOL_CHIP_COLLAPSE_THRESHOLD` bumped from 3 → 6 so a typical 3-5
  tool turn shows ALL chips without forcing expand. Above 6 still
  collapses.

### 6. Ambient Memory HUD

- New: `desktop/src/components/AmbientMemoryHUD.tsx`
- Bottom-left floating pill: "💭 我记得 <snippet>" / "✨ 我记下了" pulse
  on save_memory.
- Calls `recallMemorySlots()` every 60 s, cycles snippets every 8 s.
- Listens for `agentrix:memory-saved` (dispatched from
  `useStreamingTurn.ts` when a `save_memory` tool result arrives).
- Click: dispatches `agentrix:open-memory` (Pro) or
  `agentrix:open-memory-readonly` (Simple/Standard).
- Mounted in `App.tsx` chat-panel view next to AxpCornerIndicator and
  SubscriptionBadge.

### 7. Today's changes panel + one-click revert

- New: `desktop/src/components/TodaysChangesPanel.tsx`
- Filters `workspaceBackups` (zustand) by `createdAt >= startOfToday`.
- Per-row "撤销" calls `revertWorkspaceFileBackup`. Footer "撤销今天
  全部 N 个改动" iterates.
- Entry button (⏪ icon) added to ChatTitleBar — visible in all modes.
- Listens for `agentrix:open-todays-changes` event in ChatPanelImpl.

### 8. Auto-verify screenshot

Sub-feature of (4): the "📸 看一下当前屏幕" button is the lightweight
"verify" implementation. Full auto-verify (auto detect dev server,
auto screenshot post-turn) deferred to a follow-up sprint.

### 9. Background tasks scaffolding

- New: `desktop/src/services/backgroundTasks.ts` — front-end stub for a
  job-queue. Defines `BackgroundTask`, `submitBackgroundTurn`,
  `cancelBackgroundTask`, `getRunningTasks`. Persists to localStorage
  for offline visibility.
- New: `desktop/src/components/BackgroundTasksBanner.tsx` — info-tone
  banner above HandoffBanner: "⏳ 后台还有 N 个任务 · 关闭桌面端不会
  中断" + "查看 / 取消" buttons.
- Real backend endpoint (POST /v1/background-tasks etc.) lands in a
  follow-up sprint. The TS stub keeps the contract stable.

## Validation

- `npx tsc --noEmit` clean
- `npx vitest run` — 91 / 91 passing
- `npx tauri build --bundles nsis` — `Agentrix Desktop_0.4.5_x64-setup.exe`
  produced (Defender briefly held the file; bundle generation succeeded)
- E2E with the rebuilt 0.4.5 release exe (CDP on port 9222), all 5 specs:

| Spec | Result |
|------|--------|
| pet-build-smoke | 9 / 9 |
| desktop-e2e | 15 / 15 |
| v4-full-audit | 57 / 57 |
| v4-panels-deep | 53 / 53 |
| light-theme-smoke | 5 / 5 (2 conditional skips) |
| **Total** | **139 / 141 passing**, 0 failed |

`light-theme-smoke.spec.ts` was hardened with the same
`ensureMainPageReady` shim that desktop-e2e uses, since cross-spec test
order can leave the main window hidden after a Ctrl+Shift+S toggle.

## Files

- New (8):
  - `docs/agentrix-positioning-2026-05.zh-CN.md`
  - `desktop/src/services/userMode.ts`
  - `desktop/src/services/backgroundTasks.ts`
  - `desktop/src/components/AmbientMemoryHUD.tsx`
  - `desktop/src/components/TodaysChangesPanel.tsx`
  - `desktop/src/components/BackgroundTasksBanner.tsx`
  - `desktop/src/components/chatPanel/MentionAutocomplete.tsx`
  - `desktop/src/components/chatPanel/TurnSummaryFooter.tsx`
- Edited (10):
  - `desktop/src/App.tsx` (mount AmbientMemoryHUD)
  - `desktop/src/components/ApprovalSheet.tsx` (mode-aware copy)
  - `desktop/src/components/ChatPanelImpl.tsx` (events, panels, banner)
  - `desktop/src/components/MessageBubble.tsx` (think open + chip threshold)
  - `desktop/src/components/SettingsPanel.tsx` (UserModeRow)
  - `desktop/src/components/chatPanel/ChatTitleBar.tsx` (tier hide,
    today's-changes button)
  - `desktop/src/components/chatPanel/InputZone.tsx` (mode rail hide,
    MentionAutocomplete mount, workspaceDir prop)
  - `desktop/src/components/chatPanel/MessageList.tsx` (TurnSummaryFooter)
  - `desktop/src/components/chatPanel/useStreamingTurn.ts` (memory-saved
    event)
  - `desktop/tests/e2e/light-theme-smoke.spec.ts` (ensureMainPageReady)

## Follow-up tasks (next sprint)

- Backend job queue + WebSocket subscribe → fully implement
  `submitBackgroundTurn` so it survives desktop close.
- Auto-verify v1: detect dev server (Vite/Next/CRA on 5173/3000/etc),
  auto-screenshot after the first FE-affecting turn.
- Self-evolution dashboard: surface week-over-week accuracy + tokens
  saved, currently invisible to users.
- IDE bridge UI (`services/ideBridge.ts`) — make "Open in Cursor" /
  "Open in VS Code" first-class affordances on workspace changes.
