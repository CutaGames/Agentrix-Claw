# Multi-Agent Collaboration v1 — W3 + W4 Shipped (2026-05-26)

## Summary

W3 (Pet bridge: LivingPet ↔ AgentAccount) + W4 (long-task ball pulse +
mobile push) backend code is implemented, schema migrated on prod
(`paymind` DB), and pushed to `perf/desktop-pre-launch-p1`. Backend
running on `47.130.176.148` PM2 (uptime stable, 401 on protected
endpoints = routing OK).

## Commits

1. `5a90...` (this session) — `feat(multi-agent): W3 pet bridge + W4
   long-task ball/push - shipped` (17 files, 1228 insertions)
2. `39094e7a5` — `fix(multi-agent): drop W3 FK due to varchar/uuid
   type mismatch`

## Schema applied to prod

```
ALTER TABLE living_pets         ADD COLUMN bound_agent_account_id varchar(64);
CREATE INDEX idx_living_pets_bound_agent ON living_pets (bound_agent_account_id);
ALTER TABLE pet_team_members    ADD COLUMN bound_agent_account_id varchar(64);
CREATE INDEX idx_pet_team_members_bound_agent ON pet_team_members (bound_agent_account_id);
INSERT INTO migrations (timestamp, name) VALUES (1797000001000, 'MultiAgentSchemaPart21797000001000');
```

**No FK** because `agent_accounts.id` is uuid but our column is
varchar(64) for mixed-id codepath compat. App layer enforces
existence in `agent-team.service.bindLivingPets`/`unbindLivingPet`.

## What changed in W3

- **Migration** `1797000001000-MultiAgentSchemaPart2.ts`
- **Entity** — `LivingPet.boundAgentAccountId`,
  `PetTeamMember.boundAgentAccountId` (denormalized for fast
  `selectMember` lookup)
- **Backend** — `AgentTeamService.bindLivingPets/unbindLivingPet`
  - `bindLivingPets({ livingPetIds: ["*"] })` sentinel = bind all my pets
  - For each pet: create `AgentAccount` (PERSONAL, owner=user) +
    `PetTeamMember` row + stamp back-reference
  - Role derived from soul template id
    (claw → coder, learn → researcher, media → media, web3 →
    treasury, edu → tutor, ops/qa → qa_ops, fallback general)
  - Idempotent: pets already bound are skipped silently
  - `unbindLivingPet` — soft delete: pet ref cleared, `PetTeamMember`
    status → revoked, `AgentAccount` status → revoked, but rows
    preserved for cost/agent-task history audit
- **Backend** — `AgentTeamController` + 2 new endpoints:
  - `POST /api/agent-teams/bind-pets`
  - `POST /api/agent-teams/unbind-pet/:livingPetId`
- **Backend** — `PetTeamController.updateMemberV2` (no
  parentLivingPetId required) + `pet-team.service.updateMemberV2`
  with tier-based budget cap (R8.7)
  - `PATCH /api/v1/pet/team/:memberId`
  - v1 simplification: tier hard-coded 'free' (cap $2). W5 will
    resolve real workspace.plan
- **Backend** — `agent-task.worker.ts` post-success hooks
  (`runMultiAgentSuccessHooks/FailureHooks`):
  - Bump LivingPet `intimacyXp` + `lastInteractionAt` when
    `target_kind === 'team-member'` (R7.6)
  - Property: pet never punished on failure
- **Backend** — `agent-task-spawn.service.ts` updated to use
  `petMember.boundAgentAccountId` (was unsafe cast)
- **Desktop** — `MemberSettingsModal.tsx` (Pro Mode editor):
  role / displayName / dailyBudgetUsd / scope / status. Tier cap
  surfaced inline. Backend rejects over-cap regardless.
- **Desktop** — `AgentTeamPanel.tsx` "🦊 把我的宠物加入团队" CTA +
  `MemberSettingsModal` wiring. Sends sentinel ["*"] for v1 simplicity.
- **Desktop** — `agentTeam.ts` — `bindLivingPets`/`unbindLivingPet`
  helpers + `AgentTeamMember.dailyBudgetUsd/scope` typed

## What changed in W4

- **Backend** — `agent-task.worker.ts` emits `SubTaskCompleted` on
  every terminal status (`succeeded`/`failed`):
  - `emitSubTaskCompleted({ ok, summary, totalCostUsd, durationMs, ... })`
  - via `desktop-sync.companion-presence` channel
  - Forwarded to socket via existing `websocket.gateway.ts` listener
- **Backend** — new `SubTaskStalledScheduler`
  (`backend/src/modules/multi-agent/sub-task-stalled.scheduler.ts`):
  - `@Cron(EVERY_5_MINUTES)` scans `agent_tasks WHERE status='running'
    AND parent_task_id IS NOT NULL AND now() - started_at > 60min`
  - Emits `emitSubTaskStalled` per row, with 30 min cooldown to
    avoid spam
  - Disable env: `MULTI_AGENT_STALLED_SCHEDULER_DISABLED=1`
- **Backend** — mobile push notification via existing
  `NotificationService.sendPushNotification`:
  - Success title: "🦊 sub-task 完成"
  - Failure title: "⚠️ sub-task 出错"
  - `data.deeplink = agentrix://multi-agent/sub-task/${id}`
  - Best-effort try/catch — never fails worker hot path
- **Desktop** — `PetCompanionWindow.tsx` listens
  `agentrix:socket-event` → renders 1-1.5s pulse ring around the pet
  sprite (green = success, red = failure, amber = stalled). New
  `pulse-ring` keyframes added.
- **Desktop** — tracks unacknowledged completion ids in
  `unackedCompletionsRef` for the W4.7 aggregated chat inject
  (deferred to follow-up commit)

## Verified

- backend tsc --noEmit: multi-agent / pet-team / agent-team scope
  clean (pre-existing rootDir errors untouched)
- desktop tsc --noEmit: 0 errors
- prod pm2 status: online,uptime 46s+ stable
- prod routes:
  - `POST /api/agent-tasks/spawn` → HTTP 401 ✅
  - `POST /api/agent-teams/bind-pets` → HTTP 401 ✅
  - `POST /api/worktree-lanes` → HTTP 401 ✅
  - `PATCH /api/v1/pet/team/:memberId` → HTTP 401 ✅
- prod db schema: `\d living_pets` + `\d pet_team_members` show
  new columns + indexes

## Deferred to follow-ups

- **W4.4** lock-screen-pet emit (requires P9 redesign integration)
- **W4.6** mobile deeplink handler (in mobile spec, not desktop)
- **W4.7** aggregated chat inject on ball click (ChatPanelImpl
  listener + summary fetch — added to backlog)
- **W3.10 + W4.9** real-machine .exe install verification (gate to W5)
- **W3.7** real subscription tier resolution (currently hard-coded
  'free'; W5 will resolve via workspace.plan)
- **AgentTeamPanel** — read inFlightSubTasks per-member from
  `/api/agent-tasks?status=running&groupBy=agentId` (W2 task 2.6
  placeholder still says "W2 will populate this list" — moved to W5
  follow-up)

## Next agent: do this

1. **Build new desktop .exe** with W3+W4 client changes (v0.7.1
   bump). Real-device install + manual checklist (R3.10 + W4.9).
2. **W5** — failure / conflict / cost weekly reports + Property tests
3. Optional cleanup: extract pet role mapping table from soul tier
   into `pet_soul_templates.recommendedRoleTags` jsonb so the
   `deriveRoleFromSoulTemplate` switch can be promoted to a JOIN.
