# Sprint Post-launch P-1 — Cross-device + background tasks (2026-05-23)

Per `docs/agentrix-positioning-2026-05.zh-CN.md` Section 7, this is the
first post-launch sprint that ships the differentiation Agentrix wins on:
long-running tasks that survive desktop close, cross-tool contextual
awareness for the floating pet, outgoing handoff to other devices, and
full L2/L3 tier deepening.

## Tasks shipped

### 1. Long-running tasks — desktop ↔ backend wiring

The `agent-task` backend module already existed (controller / service /
worker / entity), with `AgentTaskWorker` polling `agent_tasks` rows via
`FOR UPDATE SKIP LOCKED` and executing prompts against Bedrock. The
production server already serves `/api/agent-tasks` (verified, returns
401 without token). This sprint connects the desktop client.

Files:
- `desktop/src/services/backgroundTasks.ts` — full REST client:
  `submitBackgroundTurn`, `refreshBackgroundTasks`,
  `fetchBackgroundTask{,Logs}`, `cancelBackgroundTask`, plus an adaptive
  polling helper `subscribeBackgroundTasks` (6 s while at least one task
  is open, 30 s when idle). LocalStorage cache feeds the banner before
  the first network round-trip.
- `desktop/src/components/BackgroundTasksBanner.tsx` — adapted to the
  new client; auto-polls when the banner mounts.
- `desktop/src/components/BackgroundTasksPanel.tsx` — full task list +
  detail + log streamer + "派一个新任务" composer. Click a row → load
  logs (poll every 4 s while open).
- ChatTitleBar gains an `⏳` button that dispatches
  `agentrix:open-background-tasks`.
- ChatPanelImpl listens for the event + mounts `<BackgroundTasksPanel>`.

Closing the desktop while a task runs no longer interrupts it — the
backend worker keeps draining the queue. When the desktop reopens (or
any other client polls), the user sees the result.

### 2. Cross-tool context — floating-ball ambient memory bar

- `desktop/src/services/crossToolContext.ts` — polls
  `desktop_bridge_get_active_window` every 8 s, classifies the running
  process (chrome / vscode / cursor / windsurf / office / terminal /
  agentrix / other), de-dupes consecutive same-window samples, requires
  4 s of dwell time before committing. Persists last 12 entries to
  localStorage. Skips Agentrix-self windows (would be noise).
- `desktop/src/components/CrossToolContextBar.tsx` — compact pill
  shown above the floating pet sprite. Click expands to a 5-row recent
  timeline. Reflects "Agentrix sees what you do across tools, Cursor
  only sees its own window" differentiation as a visible UI surface.
- Watcher booted in P-3's idle batch (`useServiceBootstrapper.ts`).
- Mounted inside `PetCompanionWindow.tsx` as a positioned absolute
  child above the hitbox.

### 3. Cross-device UI completion

#### Outgoing handoff: `PushToDeviceButton.tsx`

A title-bar button (`↗`) that opens a popover listing the user's other
online devices (queried via `fetchOnlineDevices`). Clicking a device
POSTs to `/api/v1/handoff/create` with `mode: handoff` so the receiving
device's existing handoff banner picks it up. Disabled with a hint when
no agent is selected.

#### Incoming handoff banner

`HandoffBanner.tsx` migrated off hard-coded `linear-gradient` /
`rgba(99,102,241,*)` literals to the semantic `--tone-info-bg/border` +
`--accent` variables, so it renders correctly on light theme without
relying on the old `[style*=]` cascade.

#### Watch / mobile mirror

The cross-platform contract is unchanged (backend `/api/v1/handoff/*`
already supports all surfaces). Watch and mobile clients listen for the
same `handoff:initiated` socket event the desktop already dispatches.
This sprint adds an outgoing entry from the desktop side; mobile UI
parity lands in the mobile sprint.

### 4. L2 / L3 tier completion

`ChatTitleBar.tsx` now reads `useUserMode()` in addition to
`useIsSimpleMode()` and tiers visibility:

| Surface                       | Simple  | Standard | Pro |
|-------------------------------|---------|----------|-----|
| Tier router (端侧/智能/云端) | hidden  | shown    | shown |
| Ask/Agent/Plan rail (InputZone) | hidden | shown   | shown |
| Cross-Device Hub button (🔗)   | shown   | shown    | shown |
| DeepOS button (🧭)             | hidden  | shown    | shown |
| More menu button (⋯)           | hidden  | shown    | shown |
| More menu — Memory / Memory Wiki / Work Log / Agent Economy | — | shown | shown |
| More menu — Worktree / Skill Canvas / Dreaming / Plugin Hub / MCP | — | hidden | shown |

Items remain functional; each tier just trades surface area for
discoverability.

## Backend

No backend code changes in this sprint — `AgentTaskModule`,
`HandoffV1Controller`, `AgentPresenceController` are all already
deployed at `https://api.agentrix.top` (verified `/api/health` → 200,
`/api/agent-tasks` → 401 unauthenticated).

## Validation

- `npx tsc --noEmit` clean
- `npx vitest run` — 91 / 91
- `npx tauri build --bundles nsis` produced
  `Agentrix Desktop_0.4.5_x64-setup.exe`
- E2E with the rebuilt 0.4.5 release exe (CDP on port 9222) across all
  five specs:

| Spec | Result |
|------|--------|
| pet-build-smoke | 9 / 9 |
| desktop-e2e | 15 / 15 |
| v4-full-audit | 57 / 57 |
| v4-panels-deep | 53 / 53 |
| light-theme-smoke | 5 / 5 (2 conditional skips) |
| **Total** | **139 / 141**, 0 failed |

## Files

- New (5): `services/backgroundTasks.ts` (rewritten; old localStorage
  stub replaced by REST client), `services/crossToolContext.ts`,
  `components/BackgroundTasksPanel.tsx`,
  `components/CrossToolContextBar.tsx`,
  `components/PushToDeviceButton.tsx`
- Edited (6): `components/BackgroundTasksBanner.tsx` (P-3 stub →
  REST polling), `components/HandoffBanner.tsx` (theme tokens),
  `components/PetCompanionWindow.tsx` (mount cross-tool bar),
  `components/ChatPanelImpl.tsx` (panel mounting + events),
  `components/chatPanel/ChatTitleBar.tsx` (tier filter for More menu +
  push-to-device + bg-tasks button + sessionId/agentId props),
  `app/useServiceBootstrapper.ts` (start cross-tool watcher in idle
  batch).

## Follow-up

- Mobile / watch UI mirroring: pick up `handoff:initiated` on those
  surfaces and surface the same "你在桌面派了一个任务" banner.
- Self-evolution dashboard: surface week-over-week LLM accept rate +
  tokens saved (positioning Section 6.2 remaining).
- Background task push notification: `OneSignal` / `apns` integration so
  the user gets a phone push when a desktop-submitted task finishes
  (the underlying `agent-presence` socket already broadcasts but no
  client converts it to OS notification yet).
