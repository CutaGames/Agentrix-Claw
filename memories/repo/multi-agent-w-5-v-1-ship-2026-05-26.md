# Multi-Agent Collaboration v1 — W5 Shipped + V1 Ship Gate (2026-05-26)

## V1 SHIP STATE

**multi-agent v1 = R1-R12 全部 ship,W1-W5 完成**

| Wave | Title                                               | Status |
|------|-----------------------------------------------------|--------|
| W0   | Pre-flight audit                                    | ✅      |
| W1   | Schema / services / UI / badge                      | ✅      |
| W2   | Spawn dispatcher + agent_run + timeline             | ✅      |
| W3   | Pet bridge (LivingPet ↔ AgentAccount)               | ✅      |
| W4   | Long-task ball pulse + push                         | ✅      |
| W5   | Economy + reliability + summary                     | ✅      |

Pushed to `perf/desktop-pre-launch-p1`. Prod backend deployed, schema
migrated, all v1 routes return 401 (routing OK).

## W5 commits

- `feat(multi-agent): W5 economy + reliability + summary - V1 SHIP`
- desktop bumped to v0.7.1

## W5 schema applied to prod

```sql
ALTER TABLE agent_cost_records ADD COLUMN parent_task_id uuid;
ALTER TABLE agent_cost_records ADD COLUMN event_type varchar(32);
CREATE INDEX idx_acr_parent_task ON agent_cost_records (parent_task_id, created_at DESC);
CREATE INDEX idx_acr_event_type ON agent_cost_records (event_type, created_at DESC);
CREATE TABLE pet_productivity_snapshot (...);
CREATE INDEX idx_pps_user_date / idx_pps_pet_date;
INSERT migrations (timestamp, name) VALUES (1797000002000, 'MultiAgentSchemaPart31797000002000');
```

## What changed in W5

- **Migration Part 3** (additive): cost record links + per-pet snapshot table
- **AgentCostRecord** entity extended with `parentTaskId / eventType`
- **PetProductivitySnapshot** new entity (rolling 7-day per-pet metrics)
- **CostTrackerService** AsyncLocalStorage propagation:
  - `runWithSubTaskContext(parentTaskId, fn)` wrapper used by worker
  - `recordCost` reads ALS when caller doesn't pass parentTaskId
  - `writeSubTaskCompleteRow` sums llm_call rows + writes summary
- **agent-task.worker** wraps execution in `runWithSubTaskContext`,
  writes summary row before setStatus, falls back to executor cost
  on DB outage (R10.4)
- **Daily budget gate**: 80% / 100% events emitted by worker, spawn
  service rejects HTTP 402 `budget_exhausted` at >= cap. Cap from env
  `AGENTRIX_DAILY_BUDGET_USD` (default $5)
- **MultiAgentSummaryModule**:
  - `GET /api/multi-agent/weekly-summary`
  - `GET /api/multi-agent/team-activity-report?format=csv&days=30`
  - `MultiAgentDailySnapshotScheduler @Cron('0 18 * * *')` daily 02:00
    UTC+8 → upsert `pet_productivity_snapshot`
- **TeamWeeklyCard** Pro/Simple split:
  - Pro: total subtasks + cost USD, top 3 pets, top 3 expensive
    sub-tasks, Open Full Report + Export CSV
  - Simple: 1-line "本周阿喵帮你完成了 N 件事 ✨" (R11.5,no USD/token)
- **scripts/lint/forbid-v2-fields.mjs**: AST-style scan for v2
  placeholder field writes (Property 6). `npm run lint:forbid-v2`

## Deferred to follow-ups

- **W5.10** out-of-scope detection: v1 worker is LLM-text-only, no
  workspace_paths violation possible. Activates when worker integrates
  PlanRunner / WorktreeLane file writes.
- **W5.13** jest backend tests for cost log + budget gate (not in
  v1 ship scope; Property tests in W5.12 cover behavior end-to-end)
- **W5.8/9** lane conflict + ConflictResolverModal — WorktreePanel
  hasn't migrated to backend lanes yet (lives in localStorage),
  conflict detection is N/A in v1
- **W4.4** lock-screen-pet emit (P9 redesign integration)
- **W4.6** mobile deeplink (mobile spec)
- **W4.7** aggregated chat inject on ball click

## V1 Ship Gate verification (R5)

### Schema verification

- [x] All 3 migrations applied to prod paymind DB
- [x] `migrations` table contains:
  - 1797000000000 MultiAgentSchemaPart1
  - 1797000001000 MultiAgentSchemaPart2
  - 1797000002000 MultiAgentSchemaPart3

### Build verification

- [x] backend tsc --noEmit (multi-agent scope clean)
- [x] desktop tsc --noEmit 0 errors
- [x] cargo check 0 errors / 3 pre-existing warnings
- [x] npm run lint:forbid-v2 → exit 0

### Routes verification (HTTP 401 = routing OK)

- [x] `POST /api/agent-tasks/spawn` (W2)
- [x] `POST /api/worktree-lanes` (W1)
- [x] `POST /api/agent-teams/bind-pets` (W3)
- [x] `POST /api/agent-teams/unbind-pet/:id` (W3)
- [x] `PATCH /api/v1/pet/team/:memberId` (W3)
- [x] `GET /api/multi-agent/weekly-summary` (W5)
- [x] `GET /api/multi-agent/team-activity-report` (W5)

### Active background workers

- [x] `AgentTaskWorker` (max_parallel=2, 5s poll)
- [x] `SubTaskStalledScheduler` (every 5 min)
- [x] `MultiAgentDailySnapshotScheduler` (daily 02:00 UTC+8)

## v1 → v2 firewall (Property 6)

`npm run lint:forbid-v2` is now enforced in CI. v2 placeholder fields
that v1 must NEVER write:

- `agent_tasks.target_kind = 'marketplace-hire'`
- `agent_tasks.hired_from_user_id` non-null
- `world_engine_battles.subject_kind` non-null (table doesn't exist
  in v1; deferred to W6)
- `world_engine_battles.mode in ('task_arena' | 'tournament' | 'arena_room')`

## Next agent: do this

1. Wait for `npm run tauri build` to finish → `.exe` at
   `desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.7.1_x64-setup.exe`
2. **V1 E2E test plan** is in `docs/MULTI_AGENT_V1_E2E_2026-05-26.zh-CN.md`
3. Real-machine install + run the 12-item checklist
4. After verification: tag `v1-multi-agent-ship-2026-05-26` on the commit
5. Open W6 World Engine integration spec or accept v1 as launch-ready
