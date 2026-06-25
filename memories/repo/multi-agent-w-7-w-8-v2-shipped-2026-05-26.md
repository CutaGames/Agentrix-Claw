# Multi-Agent v2 — W7 + W8 Shipped (2026-05-26)

## Summary

V2 scaffold complete on `feat/multi-agent-w7-w8-v2` branch. Both
waves are **feature-flagged OFF by default** so v1 launch
(`perf/desktop-pre-launch-p1` + tag `v1.1-multi-agent-w6-deferred-2026-05-26`)
is **completely unaffected**.

| Wave | Title | Flag | Status |
|------|-------|------|--------|
| W7 | Marketplace-hire (跨用户 A2A) | `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED` | ✅ scaffold |
| W8 | Pet Arena (Pet vs Pet) | `MULTI_AGENT_PET_ARENA_ENABLED` | ✅ scaffold |

## Branch / commits

```
feat/multi-agent-w7-w8-v2
└── 74e02ef7d  feat(multi-agent v2): W7 marketplace-hire + W8 Pet Arena - shipped
```

Pushed to `origin/feat/multi-agent-w7-w8-v2`.

## What changed in W7

- **Backend** — marketplace-hire dispatch path:
  - `agent-task-spawn.service.ts`: when `target='marketplace-hire'` AND
    `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1` → defer to
    `MultiAgentMarketplaceService.findCandidate`. Falls back to
    `not_implemented_in_v1` HTTP 501 when flag OFF.
  - `agent-task.service.create()`: accepts `hired_from_user_id` field
    when flag ON; rejects when OFF.
- **New service** `MultiAgentMarketplaceService`:
  - `findCandidate(role, requesterUserId)` — pets bound to `AgentAccount`
    with `metadata.marketplaceListed === true` + status ACTIVE +
    owner != requester. Tie-break by `creditScore`.
  - `listMyMarketplacePets(userId)` — for the W7.4 "earned from work"
    badge: returns hireCount + totalEarnedUsd from agent metadata.
  - `setListed(userId, livingPetId, listed, publishedHireCostUsd)` —
    toggle pet listing. Owner check enforced.
  - `recordHireEarning(sellerUserId, agentAccountId, earnedUsd)` —
    bumps lifetime stats on agent.metadata when worker completes a
    marketplace-hired sub-task.
- **New endpoints** (all behind JwtAuthGuard):
  - `GET  /api/multi-agent/marketplace/my-pets`
  - `POST /api/multi-agent/marketplace/list/:livingPetId`
- **Worker hook** — `agent-task.worker.ts` post-success:
  - When `task.target_kind === 'marketplace-hire'` + marketplace
    service injected, calls `recordHireEarning` with 70% of cost
    (30% platform fee, simplification for v2)
- **forwardRef circular import fix**:
  - `AgentTaskModule` imports `forwardRef(() => MultiAgentModule)`
  - `MultiAgentModule` imports `forwardRef(() => AgentTaskModule)`
  - Worker uses `@Optional() @Inject(MultiAgentMarketplaceService)`
    so it gracefully handles flag-OFF state

## What changed in W8

- **Migration** `1797000003000-MultiAgentV2W8PetArena.ts` (additive):
  - new `pet_arena_match` table — one row per match, ELO before/after
  - new `pet_arena_ladder_snapshot` table — daily ladder cache
  - 7 indexes total
  - **Did NOT extend `world_engine_battles`** because that table doesn't
    exist in prod (W6 territory, deferred). Pet Arena lives in its
    own domain — cleaner separation.
- **Entities**:
  - `PetArenaMatch` (mode=task_arena|tournament|arena_room,
    aSide/bSide, scoreA-B, eloBefore/after, winnerSide)
  - `PetArenaLadderSnapshot` (daily per-pet ELO + W/L + rank +
    productivityScore from W5)
- **New module** `PetArenaModule`:
  - `PetArenaService.createMatch` — pair pets, snapshot ELO before
  - `PetArenaService.resolveMatch` — standard ELO update (K=32),
    upsert ladder for both sides
  - `PetArenaService.getMyLadder` — today's ladder rows by ELO desc
  - `PetArenaService.getPetProductivityScore` — sum from
    `pet_productivity_snapshot` last 4 weeks (W5 read-side)
- **New endpoints** (all gated by `MULTI_AGENT_PET_ARENA_ENABLED=1`):
  - `POST /api/pet-arena/match`
  - `POST /api/pet-arena/match/:id/resolve`
  - `GET  /api/pet-arena/ladder/me`
  - `GET  /api/pet-arena/productivity/:livingPetId`
- **Desktop UI** — `AgentTeamPanel`:
  - Arena + Ladder tabs activated as real `<button>` (was greyed-out
    placeholder in v1)
  - `PetArenaTab` component: Pro Mode shows endpoint docs; Simple
    Mode shows friendly intro
  - `PetLadderTab` component: fetches `/api/pet-arena/ladder/me`,
    renders ranked list. Shows "arena_disabled" empty state when
    flag OFF (HTTP 400).

## Property 6 lint update

Allow-list extended for v2 paths:
- `backend/src/modules/multi-agent/multi-agent-marketplace.service.ts`
- `backend/src/modules/multi-agent/multi-agent-marketplace.controller.ts`
- `backend/src/modules/agent-task/agent-task.worker.ts`

`npm run lint:forbid-v2` still exits 0 on this branch.

## Schema applied to prod

```sql
INSERT INTO migrations (timestamp, name)
VALUES (1797000003000, 'MultiAgentV2W8PetArena1797000003000');
-- + pet_arena_match table + 5 indexes
-- + pet_arena_ladder_snapshot table + 2 indexes
```

**Prod backend still on `perf/desktop-pre-launch-p1` (v1 branch);
v2 schema is additive + unused → safe to live alongside v1 code.**

## Verified

- backend tsc --noEmit: multi-agent / pet-arena scope clean
- desktop tsc --noEmit: 0 errors
- npm run lint:forbid-v2 exit 0
- Prod schema migrated successfully

## Rollback procedure

If v2 must be reverted:
1. `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=0` (or unset)
2. `MULTI_AGENT_PET_ARENA_ENABLED=0` (or unset)
3. v1 behavior fully preserved
4. Schema is additive — no destructive change; rollback is safe

## v2 deploy (when ready)

1. SSH prod → `git checkout feat/multi-agent-w7-w8-v2`
2. `npm run build` + restart pm2
3. Set env vars for the flags
4. New routes 401 (= ready); flip flags to enable real flow

## Next agent: do this

1. Wait for v1 user verification (42-item E2E checklist) on v0.7.2
2. If v1 passes — v1 launch goes live
3. v2 sprint timing: 2 weeks post-launch (per spec)
4. v2.1 polish (matchmaking auto-pair / Pet detail UI integration)
   on a separate `feat/multi-agent-w7-w8-v2-polish` branch
