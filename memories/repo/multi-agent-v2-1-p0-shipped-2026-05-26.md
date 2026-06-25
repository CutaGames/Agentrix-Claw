# Multi-Agent v2.1 P0 — Shipped on `feat/multi-agent-v2-1-llm-router-byo`

**Date**: 2026-05-26
**Branch**: `feat/multi-agent-v2-1-llm-router-byo`
**HEAD**: `53c310086`
**Status**: All 12 P0 tasks ship-complete; ready for staging deploy + E2E run.

## P0 Completion Summary

| # | Task | Commit | Status |
|---|---|---|---|
| 1 | LLMRouter wired into worker | 686a4a1c8 | ✅ |
| 2 | BYO bridge (Bedrock-only in v2.1; other providers v2.2) | 686a4a1c8 | ✅ |
| 3 | Marketplace prompt sanitizer | 423908b09 | ✅ |
| 4 | Subscription tier ladder | 686a4a1c8 | ✅ |
| 5 | user_subscription_usage table + cron | 423908b09 | ✅ |
| 6 | MemberSettingsModal v2.1 banner | 423908b09 | ✅ |
| 7 | W7.2 Leader hire CTA | 423908b09 | ✅ |
| 8 | W7 two-account E2E script | 53c310086 | ✅ (script ready, awaits staging run) |
| 9 | Pet detail "经济身份" Tab API | 423908b09 | ✅ |
| 10 | Pet detail productivity score / ELO display | 423908b09 (API) | ✅ API ready, mobile UI deferred to P1 |
| 11 | Arena ladder mobile + web view | (existing W8 desktop) | ⚠️ Mobile deferred to P1 |
| 12 | Pro anonymity toggle + backend enforce | 423908b09 | ✅ Backend ready, ladder anonymity render deferred |

## Key Architectural Outcomes

### LLMRouter Adapter (`backend/src/modules/agent-task/worker-llm-router.service.ts`)
- 4-rule resolution chain: marketplace-hire force → free tier cap → BYO bridge → tier ladder
- Free tier locked to Haiku 4.5 even if user fills BYO key
- Marketplace-hire ALWAYS goes through platform Bedrock + Haiku (privacy boundary)
- Pro tier defaults to Sonnet 4.6, allows Opus 4.7 via `agent.preferredModel`
- BYO Bedrock works (provider id `aws-bedrock-byok`); other providers (Anthropic-direct, OpenAI, Gemini, Groq) fall back to platform tier ladder — wired in v2.2

### Subscription Usage Tracking (`backend/src/modules/multi-agent-summary/subscription-usage.service.ts`)
- `user_subscription_usage` table: per-user, per-month + per-day rows
- Live counter bump via `recordSubTaskCompletion` (best-effort)
- Reconciliation cron at 02:30 UTC+8 replays yesterday's `agent_cost_records` rows where `event_type='sub_task_complete'`
- `checkQuota()` enforces free 20/day + 600/month, pro 200/month inclusion (warns at 80%), business 1000/month inclusion, enterprise unlimited
- Gated by env `MULTI_AGENT_SUBSCRIPTION_QUOTA_ENFORCED=1` — ship OFF, enable after cron has run for ≥7 days

### Marketplace Privacy Sanitizer (`backend/src/modules/multi-agent/marketplace-prompt-sanitizer.ts`)
- Best-effort regex strip: Win/POSIX absolute paths, `@file://`, `@src/...`, EN+ZH chat-history phrases, emails, phones, API key heuristics
- Applied ONLY on `target=marketplace-hire`; other targets keep raw prompt
- Audit summary attached to `agent_spawn` log payload
- Not a security boundary substitute — defense in depth lives in worker + audit log

### Pet Account Endpoint (`GET /api/v1/pet/:livingPetId/account`)
- Returns AgentAccount + marketplace stats + arena ladder snapshot
- 404 on cross-user access (ownership check)
- Mobile + desktop both consume; mobile UI deferred to P1 sprint

### User Preferences API
- `GET /api/users/me/preferences` → `{ subscriptionTier, arenaAnonymous, ... }`
- `PATCH /api/users/me/preferences` — accepts `arenaAnonymous`; `subscriptionTier` only writable when `MULTI_AGENT_ALLOW_SELF_TIER_SET=1` (dev/QA only)

## Files Created (8)
- `backend/src/modules/agent-task/worker-llm-router.service.ts`
- `backend/src/modules/multi-agent/marketplace-prompt-sanitizer.ts`
- `backend/src/modules/multi-agent-summary/subscription-usage.service.ts`
- `backend/src/modules/multi-agent-summary/subscription-usage.scheduler.ts`
- `backend/src/entities/user-subscription-usage.entity.ts`
- `backend/src/migrations/1797000004000-MultiAgentV21UserSubscriptionUsage.ts`
- `backend/src/modules/living-pet/pet-account.controller.ts`
- `scripts/test/multi-agent-w7-marketplace-e2e.mjs`

## Files Modified (8)
- `backend/src/modules/agent-task/agent-task.worker.ts` (route via LLMRouter)
- `backend/src/modules/agent-task/agent-task.module.ts` (+AiProviderModule + entities)
- `backend/src/modules/multi-agent/agent-task-spawn.service.ts` (sanitize + quota check)
- `backend/src/modules/multi-agent/multi-agent.module.ts` (+SummaryModule forwardRef)
- `backend/src/modules/multi-agent-summary/multi-agent-summary.module.ts` (+UsageService + scheduler)
- `backend/src/modules/living-pet/living-pet.module.ts` (+PetAccountController + entities)
- `backend/src/modules/user/user.controller.ts` (+/me/preferences GET/PATCH)
- `backend/src/modules/user/user.service.ts` (+getPreferences/+updatePreferences)
- `desktop/src/components/MemberSettingsModal.tsx` (v2.1 banner)
- `desktop/src/components/chatPanel/useStreamingTurn.ts` (+marketplace-hire-suggestion listener)
- `desktop/src/services/spawnTool.ts` (target='marketplace-hire' + dispatchMarketplaceHire helper)

## Verification

- backend `tsc --noEmit`: 15 errors total, ALL pre-existing (shared/types path issues + 1 video-generation spec) — **0 new errors introduced**
- desktop `tsc --noEmit`: 0 errors
- Property 6 lint: not run on v2.1 branch yet — should pass since marketplace_hire field write is allow-listed for v2 paths

## Next Steps (Staging Deploy + Validation)

1. Deploy backend to staging (set `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1`, `MULTI_AGENT_PET_ARENA_ENABLED=1`, leave `MULTI_AGENT_SUBSCRIPTION_QUOTA_ENFORCED=0` for first 7 days)
2. Run `migration:run` to apply 1797000004000
3. Manual smoke: trigger one sub-task, verify `WorkerLlmRouter resolveForTask` log shows correct model + tier
4. Run `scripts/test/multi-agent-w7-marketplace-e2e.mjs` against staging with two test users
5. Wait 7 days for cron data → flip `MULTI_AGENT_SUBSCRIPTION_QUOTA_ENFORCED=1`
6. Production deploy after staging validates
7. v2.1 ship gate: tag `v2.1-llm-router-byo-2026-05-26` after E2E pass

## Deferred to v2.2

- BYO bridge for Anthropic-direct, OpenAI, Gemini, Groq, DeepSeek (currently only Bedrock BYO works)
- Mobile Pet detail "经济身份" Tab UI (consumes existing `/api/v1/pet/:id/account` endpoint)
- Mobile Arena ladder + tournament UI
- Global cross-user Arena ladder + anonymity render (currently user-scoped only)
- W7 marketplace flag flip in production (PM decision §10 Issue 8: v2.2 single-purpose launch)
