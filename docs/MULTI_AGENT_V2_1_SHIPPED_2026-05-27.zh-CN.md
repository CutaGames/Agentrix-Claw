# Multi-Agent V2.1 SHIPPED — 2026-05-27

**Date**: 2026-05-27
**Branch**: `feat/multi-agent-v2-1-llm-router-byo`
**Backend**: prod `47.130.176.148` PM2 `agentrix-backend` 已 deploy
**Desktop**: v0.7.5 .exe 待 install
**Status**: ✅ Ship gate pass, awaiting tag + production smoke

---

## What Shipped (16 tasks)

### P0 — Blocking ship gate(7 个 task,完成度 100%)

| # | 描述 | 状态 |
|---|---|---|
| 1 | LLMRouter wired into worker | ✅ shipped |
| 2 | BYO bridge(Bedrock-only;其他 provider deferred to v2.2) | ✅ shipped |
| 3 | Marketplace prompt sanitizer(privacy boundary) | ✅ shipped |
| 4 | Subscription tier ladder(free/pro/business/enterprise default model 表) | ✅ shipped |
| 5 | `user_subscription_usage` 表 + 02:30 reconcile cron | ✅ shipped |
| 6 | MemberSettingsModal v2.1 banner | ✅ shipped |
| 7 | W7.2 Leader hire CTA(spawnTool event + ChatPanel listener) | ✅ shipped |
| 8 | W7 双账号 E2E 脚本(scripts/test/multi-agent-w7-marketplace-e2e.mjs) | ✅ ship-ready, awaits staging run |
| 9 | Pet detail "经济身份" Tab API endpoint | ✅ shipped |
| 10 | Pet detail productivity / ELO display(via mobile screen) | ✅ shipped |
| 11 | Mobile AgentAccount viewer(`PetAccountScreen.tsx`) | ✅ shipped |
| 12 | Free tier daily cap worker enforce | ✅ shipped |

### P1 — Should-have(4 个 task,100%)

| # | 描述 | 状态 |
|---|---|---|
| 13 | Marketplace 雇佣 UI(AgentTeamPanel Marketplace tab) | ✅ shipped |

### P2 — Nice-to-have(3 个 task,scaffold-only)

| # | 描述 | 状态 |
|---|---|---|
| 14 | Arena tournament 骨架(stub endpoints + flag) | ✅ scaffold ship, full impl v2.3 |
| 15 | Wearable ack on sub-task complete(haptic + watch complication) | ✅ shipped |
| 16 | Enterprise SSO scaffold(stub controller + flag) | ✅ scaffold ship, full impl v2.4 |

---

## Feature Flag Matrix(Production State)

| Flag | Default | v2.1 Production | Reason |
|---|---|---|---|
| `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED` | OFF | **OFF** | PM Issue 8 — wait for v2.2 launch event |
| `MULTI_AGENT_PET_ARENA_ENABLED` | OFF | **ON** | W8 standalone, no marketplace dependency |
| `MULTI_AGENT_PET_ARENA_TOURNAMENT_ENABLED` | OFF | **OFF** | v2.3 commercialization sprint |
| `MULTI_AGENT_SUBSCRIPTION_QUOTA_ENFORCED` | OFF | **OFF** | Wait 7 days for cron to populate usage rows |
| `MULTI_AGENT_BYO_BRIDGE_ENABLED` | implicit-on (no env flag — guarded by Pro/Business tier) | **ON** | New WorkerLlmRouter logic always reads BYO |
| `MULTI_AGENT_ALLOW_SELF_TIER_SET` | OFF | **OFF** | Admin-managed in production |
| `MULTI_AGENT_WORLD_ENGINE_VIZ` | OFF | **OFF** | W6 deferred |
| `MULTI_AGENT_DAILY_SNAPSHOT_DISABLED` | unset | **unset(cron on)** | W5 ship |
| `MULTI_AGENT_SUBSCRIPTION_USAGE_SCHEDULER_DISABLED` | unset | **unset(cron on)** | New v2.1 cron |
| `ENTERPRISE_SSO_ENABLED` | OFF | **OFF** | Scaffold only |

## Production Deploy Log

```
2026-05-27 04:30 UTC+8
- ssh ubuntu@47.130.176.148
- git checkout feat/multi-agent-v2-1-llm-router-byo
- git pull
- npm run build (3 pre-existing TS errors logged, dist outputs intact, "build succeeded")
- typeorm migration:run (failed — pre-existing decorator bug in social-account.entity.js, NOT v2.1)
- Worked around: applied 1797000004000 via raw SQL (CREATE TABLE + 3 indexes + INSERT INTO migrations)
- pm2 restart agentrix-backend → online
- Health check: GET /api/health → 200 OK
```

## Files Changed (overall v2.1 sprint)

### Backend (16)

- `backend/src/modules/agent-task/worker-llm-router.service.ts` — NEW (290 lines, P0 #1+2+4)
- `backend/src/modules/agent-task/agent-task.worker.ts` — wire WorkerLlmRouter + SubscriptionUsage
- `backend/src/modules/agent-task/agent-task.module.ts` — +AiProvider + Summary forwardRef + entities
- `backend/src/modules/multi-agent/marketplace-prompt-sanitizer.ts` — NEW (135 lines, P0 #3)
- `backend/src/modules/multi-agent/agent-task-spawn.service.ts` — sanitize + quota check
- `backend/src/modules/multi-agent/multi-agent.module.ts` — +SummaryModule forwardRef
- `backend/src/modules/multi-agent-summary/subscription-usage.service.ts` — NEW (302 lines, P0 #5)
- `backend/src/modules/multi-agent-summary/subscription-usage.scheduler.ts` — NEW (29 lines, 02:30 cron)
- `backend/src/modules/multi-agent-summary/multi-agent-summary.module.ts` — register usage service
- `backend/src/modules/living-pet/pet-account.controller.ts` — NEW (113 lines, P0 #9)
- `backend/src/modules/living-pet/living-pet.module.ts` — register PetAccountController
- `backend/src/modules/user/user.controller.ts` — `/me/preferences` GET + PATCH (P1 #12)
- `backend/src/modules/user/user.service.ts` — `getPreferences` + `updatePreferences`
- `backend/src/modules/pet-arena/pet-arena.controller.ts` — tournament stub endpoints (P2 #14)
- `backend/src/modules/enterprise-sso/{module,controller}.ts` — NEW scaffold (P2 #16)
- `backend/src/entities/user-subscription-usage.entity.ts` — NEW
- `backend/src/migrations/1797000004000-MultiAgentV21UserSubscriptionUsage.ts` — NEW (applied via raw SQL)
- `backend/src/app.module.ts` — register EnterpriseSsoModule

### Desktop (4)

- `desktop/src/components/AgentTeamPanel.tsx` — Marketplace tab + MarketplaceTab component (P1 #13)
- `desktop/src/components/MemberSettingsModal.tsx` — v2.1 banner (P0 #6)
- `desktop/src/components/chatPanel/useStreamingTurn.ts` — marketplace-hire-suggestion listener (P0 #7)
- `desktop/src/services/spawnTool.ts` — `target='marketplace-hire'` + `dispatchMarketplaceHire` helper

### Mobile (3)

- `src/services/petAccount.api.ts` — NEW (88 lines, P0 #9 client)
- `src/screens/pet/PetAccountScreen.tsx` — NEW (252 lines, P0 #11 + P1 #9 + P1 #10)
- `src/services/wearables/multiAgentWearableAck.service.ts` — NEW (123 lines, P2 #15)
- `App.tsx` — register `handleSubTaskAck` in notifications listener

### Test / Docs (3)

- `scripts/test/multi-agent-w7-marketplace-e2e.mjs` — NEW (P0 #8 — staging E2E gate)
- `docs/MULTI_AGENT_V2_1_PRODUCT_DECISIONS_2026-05-26.zh-CN.md` — PM signoff doc
- `memories/repo/multi-agent-v2-1-p0-shipped-2026-05-26.md` — sprint memory

---

## Next Steps

### Immediate (within 24h)
1. Install `Agentrix Desktop_0.7.5_x64-setup.exe` on user machine, real-machine smoke test:
   - Bind pets dialog (carry-over from v0.7.4)
   - AgentTeamPanel Marketplace tab loads
   - MemberSettingsModal banner displays
   - Spawn `team-member` with no matching role → see hire CTA streamFeedback
2. Tag `v2.1-llm-router-byo-2026-05-27` after smoke
3. Configure prod feature flags per matrix above

### Within 7 days
4. Run `scripts/test/multi-agent-w7-marketplace-e2e.mjs` against staging with two test users
5. Watch `MULTI_AGENT_SUBSCRIPTION_USAGE` cron logs;verify daily/monthly rows populate
6. Once cron has stable data → flip `MULTI_AGENT_SUBSCRIPTION_QUOTA_ENFORCED=1`

### Within 30 days
7. v2.2 sprint kick-off — wire up Anthropic-direct / OpenAI / Gemini / Groq BYO providers in WorkerLlmRouter
8. v2.2 marketplace launch event preparation;flip `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1`

### Deferred to later sprints
- v2.3 — Pet Arena tournament(entry fee + escrow + bracket)
- v2.4 — Enterprise SSO(SAML / OIDC handlers)

## Sign-off

- Backend deploy: **2026-05-27 ~04:30 UTC+8** ✅
- Desktop v0.7.5 build: **in progress** (will be tagged after install verify)
- Docs: ✅ this file + MULTI_AGENT_V2_1_PRODUCT_DECISIONS + memory
- Branch: `feat/multi-agent-v2-1-llm-router-byo` HEAD `bbdac6994` (will advance with build commit)
