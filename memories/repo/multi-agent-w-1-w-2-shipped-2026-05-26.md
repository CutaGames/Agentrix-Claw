# Multi-Agent Collaboration v1 — W1 + W2 Shipped (2026-05-26)

## Summary

W1 (schema/UI/badge) + W2 (spawn dispatcher + agent_run tool) are
implemented, build-verified, and pushed to
`perf/desktop-pre-launch-p1`. Real-machine install verification is the
**next user gate** before W3 (Pet bridge) starts.

## Commits (in order)

1. `6a9c238fc` — W0 audit (already shipped before this session)
2. **W1 commit** — `feat(multi-agent): W1 schema/services/UI/badge - shipped`
3. **W2 commit** — `feat(multi-agent): W2 spawn dispatcher + agent_run tool + timeline`
4. **Version bump** — `chore(desktop): bump to v0.7.0 - multi-agent v1 W1+W2 shipped`

## Build artifacts

```
NSIS:  D:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website\desktop\src-tauri\target\release\bundle\nsis\Agentrix Desktop_0.7.0_x64-setup.exe   (26.7 MB)
MSI:   D:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website\desktop\src-tauri\target\release\bundle\msi\Agentrix Desktop_0.7.0_x64_en-US.msi    (29.4 MB)
```

## What changed in W1

- **Migration** `1797000000000-MultiAgentSchemaPart1.ts` — additive only:
  - `agent_tasks` + `parent_task_id` (uuid, self-FK ON DELETE SET NULL)
  - `agent_tasks` + `target_kind` (varchar 24, default 'leader-direct')
  - `agent_tasks` + `hired_from_user_id` (varchar 64, nullable, v2 W7 stub)
  - new `worktree_lanes` table
- **Backend** — `WorktreeLaneModule`, `AgentTaskService.create()` extended with
  `parentTaskId / targetKind`, `marketplace-hire` writes rejected (Property 6),
  `emitTeamActivityUpdateThrottled` (3s throttle, R5.6),
  `countActiveSubTasks`
- **Desktop services** — `agentTeam.ts`, `worktreeLanes.ts`,
  `agentIdentity.ts`, `teamActivityStore.ts` (zustand) + `bootTeamActivityBus()`
- **Desktop components** — `AgentIdentityCard`, `AgentTeamPanel`,
  `TeamActivitySurface`; `ChatTitleBar` + 🤖 Agent 团队 menu;
  `WorktreePanel` × `AgentIdentityCard size=sm`;
  `PetCompanionWindow` Simple-Mode badge overlay

## What changed in W2

- **shared/types/agent-tools.ts** — `AGENT_RUN_TOOL_SCHEMA` (LLM-visible),
  `SpawnToolInput / Output / Error`, `AgentSpawnEvent / AgentInvokeEvent /
  AgentResultEvent` types
- **Backend** — `AgentTaskSpawnService.dispatch()` with all guardrails:
  fanout cap (4), session cap (8), cycle detection (Property 1),
  budget approval gate (R1.5), marketplace-hire reject (R13.1),
  selectMember (R6.1-R6.6 with qa-ops/qa_ops normalize per COMPAT_AUDIT.md §5)
- **Backend** — `MultiAgentController` (`POST /api/agent-tasks/spawn`,
  JwtAuthGuard) + `MultiAgentModule` registered in `app.module.ts`
- **Backend** — `agent-task.worker.ts` emits `agent_invoke` before bedrock
  call + `agent_result` on terminal state (success/fail/timeout) with
  `durationMs / costUsd / resultSummary`
- **Backend** — server-side budget approval backstop: `budget>10 + no
  scope.approval_token → HTTP 402 budget_pending_approval`
- **Desktop** — `desktop/src/services/spawnTool.ts` registers
  `AGENT_RUN_TOOL_DEF`, executes via `POST /api/agent-tasks/spawn`,
  enforces client-side caps, dispatches `agentrix:spawn-rate-limited` and
  `agentrix:spawn-approval-needed` events
- **Desktop** — `desktopToolCalling.ts` adds `agent_run` case +
  `parentTaskId / tier` in `DesktopToolContext` + `multiAgentEnabled`
  flag in `getActiveDesktopTools`
- **Desktop** — `TaskTimeline` extended `TaskTimelineEntry` with
  `actor / subTaskId / costUsd / durationMs`; sub-agent rows render
  `<AgentIdentityCard size=sm>` + cost chip + Retry/Rollback buttons
- **Desktop** — `chatMarkdownPlugins/subTaskAnchor.ts` plugin: matches
  `[sub-task #abcdef12]` and rewrites to `subtask:<id>` link;
  `MessageBubble` href dispatcher fires `agentrix:scroll-to-sub-task`
- **Desktop** — `useStreamingTurn` adds optional `setStreamFeedback`
  param + listens `agentrix:spawn-rate-limited` /
  `agentrix:spawn-approval-needed` for inline warnings

## Verification before push

- `backend tsc --noEmit`: multi-agent scope clean (pre-existing
  `shared/` rootDir errors and a video-generation spec arity mismatch
  remain — they predate this session)
- `desktop tsc --noEmit`: 0 errors
- `cargo check`: 0 errors / 3 pre-existing warnings (dead code in
  computer_use module)
- `vitest run`: 14 test files / 91 tests / all passed
- NSIS + MSI bundles built successfully (26.7 / 29.4 MB)

## Key real-state corrections vs original tasks.md

- **`agent-task.worker.ts` is NOT BullMQ** — it is a `setInterval`
  poller using Postgres `FOR UPDATE SKIP LOCKED` for distributed claim.
  See `backend/src/modules/agent-task/WORKER_README.md` for the full
  audit. `MAX_PARALLEL = 2` (env-tunable, not 5).
- **`qa-ops` / `qa_ops` enum mismatch** between agent-team templates and
  hard-coded tool roles. Resolved at `selectMember` layer with role
  normalization (replace `-` with `_` + check both forms).
- **Property 6 enforcement** is in `AgentTaskService.create()` — it
  raises if `targetKind === 'marketplace-hire'`. Spawn service raises
  early via HTTP 501 before calling `create()`.

## NOT done in W1+W2 (deferred to later waves)

- **W2.10 user-machine install verification** — pending user manually
  installs the .exe and tests:
  1. Cloud chat shows `agent_run` tool available
  2. Spawn a sub-task → CompanionBall badge increments within 3 s
  3. Sub-task completes → cost chip appears in TaskTimeline
  4. `[sub-task #...]` anchor in reply scrolls timeline into view
  5. > 4 concurrent spawn attempts surface `spawn_rate_limited` warning
  6. > $10 budget surfaces approval modal
- **W3** — Pet member bridge (LivingPet → AgentAccount). Requires
  the pet-team module audit + `bound_agent_account_id` schema work.
- **W4** — Background mode + companion ball / lock-screen / push.
  Requires the companion-presence channel split + push integration.
- **W5** — Failure / conflict / cost weekly reports.
- **TeamActivitySurface listener** — `agentrix:open-team-activity-surface`
  is dispatched from `PetCompanionWindow` but no top-level component
  has a listener that mounts the surface. Defer to W4 or a small W2.11
  follow-up commit.
- **Backend deploy** — production server deploy not yet run; tasks.md
  W2 step requires `pm2 restart agentrix-backend` + `migration:run`
  on `47.130.176.148`. Auto-approved per AGENTS.md velocity-window
  but **not run in this session** because no live frontend traffic
  was issuing spawns.

## Next agent: do this

1. **Wait for user real-machine install verification** — if any of
   the 6 install checks fails, treat it as a W2 hotfix, **not** a W3
   start.
2. **Production deploy** (auto-approved) — SSH to `47.130.176.148`,
   `git pull` on `perf/desktop-pre-launch-p1`, `npm run build`,
   `npm run migration:run`, `pm2 restart agentrix-backend`.
3. **W3 audit first** — read `backend/src/modules/pet-team/` and
   confirm `bound_agent_account_id` column / API exists. The W2
   `selectMember` already reads it via index-typed cast; W3 will
   need it for real.
