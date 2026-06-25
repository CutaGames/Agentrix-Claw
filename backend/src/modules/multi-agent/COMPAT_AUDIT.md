# Multi-Agent v1 Schema Compatibility Audit

> **Spec**: `multi-agent-collaboration-2026-06`
> **Wave**: W0 (Pre-flight audit) — Task 0.1
> **Date**: 2026-05-26
> **Auditor**: Dev Agent
> **Status**: ✅ Passed — no field collisions, no shared FK risks
>
> Direct verification of every field referenced by `design.md §2`
> against current `backend/src/entities/` source.

## 1. Existing entities surveyed

All 4 entities re-read from disk on 2026-05-26 (matches design.md §2.1):

| Entity File | Key Fields Confirmed |
|-------------|----------------------|
| `agent-task.entity.ts` | `id`, `userId`, `agentId` (string nullable), `instanceId`, `title`, `prompt`, `status`, `progress`, `tier`, `costUsd`, `resultSummary`, `errorMessage`, `startedAt`, `completedAt`, `createdAt`, `updatedAt` |
| `agent-task-log` (same file) | `taskId`, `kind` (varchar 32), `message`, `payload jsonb`, `createdAt` |
| `agent-team-template.entity.ts` | `slug` (unique), `roles[]: AgentRoleDefinition`, `teamSize`, `creatorId`, `usageCount`, `visibility` |
| `pet-team-member.entity.ts` | `parentLivingPetId`, `userId`, `role` (PetTeamRole), `soulTemplateId`, `displayName`, `scope jsonb`, `dailyBudgetUsd`, `walletAddress`, `status`, `createdAt`, `updatedAt` |
| `agent-cost-record.entity.ts` | `userId`, `sessionId`, `agentId`, `instanceId`, `model`, `provider`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `costUsd`, `routingReason`, `tier`, `createdAt` |
| `living-pet.entity.ts` | (referenced by FK from migration; not modified directly except W3) |

## 2. v1 migration field-add safety

For each new column W1/W3/W5 will add, verified:

### W1 (W1.1 migration `2026-06-01-multi-agent-schema-part1.ts`)

| Column | Table | Existing Conflict? | Safe? |
|--------|-------|-------------------|-------|
| `parent_task_id uuid NULL` | `agent_tasks` | None | ✅ |
| `target_kind varchar(24)` | `agent_tasks` | None | ✅ |
| `hired_from_user_id varchar(64)` | `agent_tasks` | None | ✅ — v2 schema-only |
| `worktree_lanes` table | NEW | None (does not exist) | ✅ |

Indexes: `idx_agent_tasks_parent`, `idx_agent_tasks_target_kind` — verified no name collision with existing indexes (grep `backend/src/migrations/`).

### W3 (W3.1 migration `2026-06-15-multi-agent-schema-part2.ts`)

| Column | Table | Existing Conflict? | Safe? |
|--------|-------|-------------------|-------|
| `bound_agent_account_id varchar(64) NULL` | `living_pets` | None | ✅ |

FK: `REFERENCES agent_accounts(id)` — `agent_accounts.id` is varchar(64) per existing entity (verified). Type matches.

### W5 (W5.1 migration `2026-07-01-multi-agent-schema-part3.ts`)

| Column | Table | Existing Conflict? | Safe? |
|--------|-------|-------------------|-------|
| `parent_task_id uuid NULL` | `agent_cost_records` | None | ✅ |
| `event_type varchar(32) NULL` | `agent_cost_records` | None | ✅ |
| `pet_productivity_snapshot` table | NEW | None | ✅ |
| `task_arena` / `tournament` / `arena_room` | `world_engine_battles.mode` enum | Existing `mode` enum has only `'duel'` per audit | ✅ — additive |
| `subject_kind varchar(16) NULL` | `world_engine_battles` | None | ✅ — schema-only in v1 |

## 3. FK collision risk

All new FKs verified to **not** clash with existing inverse refs:

- `agent_tasks.parent_task_id → agent_tasks.id` — self-ref, no risk
- `living_pets.bound_agent_account_id → agent_accounts.id` — agent_accounts has no inverse FK to living_pets, safe
- `worktree_lanes.agent_task_id → agent_tasks.id` — agent_tasks has no inverse field to worktree_lanes, safe (lane is "weak" pointer)

## 4. Quota / slot configuration single source of truth

Per task 0.1 acceptance:

- ✅ `WorkspacePlan.maxAgents` (FREE=3 / PRO=10 / BUSINESS=50 / ENTERPRISE=200) confirmed in `backend/src/modules/workspace/workspace.service.ts`
- ✅ Pet Quota for multi-agent v1 reuses same plan limits — pet_team_members count + agent_team members count combined cap = `WorkspacePlan.maxAgents`
- ✅ Per-pet daily budget cap (FREE=$2 / PRO=$20 / BUSINESS=$200 / ENTERPRISE=∞) is **new** in v1, NOT in workspace.service yet — to be added in W3.7 backend PATCH handler

## 5. agent_team_templates roles[] vs pet_team_members.role enum check

Verified 11 codenames match 1:1:

| `agent_team_templates.roles[].codename` | `pet_team_members.role` (PetTeamRole) |
|----------------------------------------|---------------------------------------|
| ceo | ceo ✅ |
| dev | dev ✅ |
| qa-ops | qa_ops ⚠️ — hyphen vs underscore mismatch |
| growth | growth ✅ |
| ops | ops ✅ |
| media | media ✅ |
| ecosystem | ecosystem ✅ |
| community | community ✅ |
| brand | brand ✅ |
| hunter | hunter ✅ |
| treasury | treasury ✅ |

⚠️ **Mismatch found**: `qa-ops` (template) vs `qa_ops` (PetTeamRole). W1 task 0.1 follow-up:

- Either normalize template to `qa_ops` (changes existing data — risky)
- Or implement role-codename normalization in `selectMember()` (safer — substring match per R6.1 already case-insensitive, but explicit normalization helps)
- **Decision**: handle in `selectMember()` via `s/-/_/g` normalization on both sides (W2 task 2.3)

## 6. BullMQ queue audit (for W0.3)

`agent-task.worker.ts` declares queue `agent-tasks` with concurrency 5
(verified). Sub-task jobs in W2 will reuse this queue with payload
`{ taskId, parentTaskId }` — extension is non-breaking (additional
field, existing workers ignore unknown fields).

## 7. desktop-sync.companion-presence channel audit (for W0.2)

Channel-based event emission verified. New event types W1-W5 will add:

- `team-activity-update` (W1 task 1.9)
- `SubTaskCompleted` (W4 task 4.2)
- `SubTaskStalled` (W4 task 4.2)

All payloads JSON-serializable, channel infrastructure does not type-
check payloads strictly — additive-safe.

## 8. agent-presence.scheduler audit (for W4 + W5)

Existing cron registered (verified `backend/src/modules/agent-presence/`).
New cron entries W1-W5 will add:

- 5-min sub-task stalled scanner (W4 task 4.2)
- Daily 02:00 weekly summary aggregation (W5 task 5.5)
- Daily reset of `agent_run_refused` flag (W5 task 5.4)

All additive — no existing cron modification.

## 9. Zero-touch coexistence checklist

Verified by code reading (no automated test required for audit):

- [x] No existing entity field is renamed
- [x] No existing column is dropped
- [x] No existing FK constraint is altered
- [x] No existing index is dropped (only new ones added)
- [x] No existing endpoint URL is changed
- [x] No existing API response shape breaks (only new optional fields)
- [x] Existing `agent-team` template provisioning flow unchanged
- [x] Existing `pet-team` `listMembers()` returns same shape (W3 only adds `bound_agent_account_id` to LivingPet, not member)

## 10. Conclusion

✅ **W0.1 audit passes**. v1 W1-W5 migrations are all **additive +
nullable**. No data migration needed (only schema additive changes).

One follow-up: W2 task 2.3 `selectMember()` must normalize role
codename (`-` ↔ `_`) for the qa-ops/qa_ops mismatch.

Tasks 0.2-0.4 audit results are documented inline in the relevant
modules (companion-presence README, BullMQ worker README, feature-flag
README) per their respective task acceptance criteria.
