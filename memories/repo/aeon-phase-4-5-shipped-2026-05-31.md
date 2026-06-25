# Aeon Phase 4 + Phase 5 shipped + deployed (2026-05-31)

## What shipped (commit `47c96d7d9` on `feat/multi-agent-v2-1-llm-router-byo`)
Phase 4 (留存与共建) + Phase 5 (打磨) + Property tests P.1-P.4. 31 files, +2188.
spec `agentrix-world` now 100% checked (Phase 0-5 + P.1-P.4).

### Phase 4 backend (all under backend/src/modules/aeon/)
- `build/build.service.ts` + `build/build.controller.ts` — BuildItem place/move/remove,
  catalog (10 模块化建筑 emoji 占位), boundary+overlap+permission(owner/grantee) checks.
  Routes `v1/aeon/plots/:plotId/build*` + `v1/aeon/build/catalog`.
- `fill/agent-fill.service.ts` — cold-start fill (owner/optin agent + world NPC),
  HUMAN_ACTIVE_THRESHOLD=3 / FILL_TARGET=6 / idle 5min downshift, opt-out, NPC iron-rule badge.
- `inbox/async-inbox.controller.ts` — digest API `v1/aeon/inbox` (+ /read). (service was Phase 2)
- `news/world-news.service.ts` + controller — template headlines + OPTIONAL Bedrock micro-story
  (graceful fallback) + ledger-backed leaderboard. Routes `v1/aeon/news` + `/leaderboard` (public).
- `reality/reality-loop.service.ts` + controller — wallet bridge (AxpService.earn via new
  aeon_* earn sources) + reality reward + Assistant intent builder. `v1/aeon/reality/{reward,fill-optout}`.
- Wired emergent World_News events + wallet payout into OrgService (company_founded/hire/wage)
  and TaskContractService (bounty_posted/task_accepted/task_completed + AXP payout bridge).
- `entities/aeon-build-item.entity.ts` + `aeon-plot.entity.ts` gained `config` jsonb (buildGrantees).
- Migration `1800200000000-AeonWorldPhase4` (aeon_build_items table + aeon_plots.config column).
- AXP: registered earn sources `aeon_wage/aeon_bounty/aeon_task/aeon_market_sale/aeon_reality_reward`
  in `backend/src/modules/axp/axp.constants.ts` (the long-noted wallet-bridge wiring point — DONE).

### Phase 4/5 mobile
- `src/screens/aeon/AeonBuildScreen.tsx` — tap-to-place build UI (select catalog → tap empty cell;
  tap existing → remove). Registered in WorldStackNavigator as `AeonBuild`.
- `src/components/aeon/AeonTutorialOverlay.tsx` + `useAeonTutorial` — single onboarding framework
  reusing the battle "怎么玩" AsyncStorage seen-flag pattern. Wired into AeonSceneScreen (first-enter
  + 怎么玩 button + CTA). storageKey `aeon_tutorial_scene_v1`.
- `src/services/aeon/aeonApi.ts` — +build/news/inbox/reality/leaderboard client fns.
- FIXED latent bug: AeonSceneScreen called `useNavigation` without importing it (unused) — removed.

### Phase 5 docs/tests
- `docs/AEON_CONCEPT_ART_REVIEW_2026-05-31.zh-CN.md` — art gate doc (emoji→texture interface ready;
  art is external dependency, NOT yet commissioned — gate intentionally blocks mass production).
- `.maestro/60-aeon-world-closed-loop.yaml` — E2E (map→claim→scene+badge→build→company/task entries),
  optional asserts to not break existing CI.
- Property tests (fast-check) `backend/src/modules/aeon/__tests__/aeon-{economy,state-machine,identity,world-scope}.property.spec.ts`.
  Pure logic extracted so service uses the SAME rules being tested:
  - `economy/ledger-model.ts` (conservation + non-negative, P.1)
  - `task/task-state-machine.ts` (legal transitions, P.2/P.4) — TaskContractService now imports it
  - identityFromControl + ComplianceGateService (P.3), toGridCell + EpochService (P.4)

## Deploy (prod 47.130.176.148, pm2 agentrix-backend :3000)
- git pull hit a conflict: prod package.json/package-lock.json had local changes from the earlier
  `npm install bullmq`. Resolved: `git checkout -- package.json` (incoming commit content identical),
  `git stash push -- package-lock.json` → pull → `git stash pop` (kept prod's REAL resolved lockfile).
- rebuilt dist, ran `1800200000000-AeonWorldPhase4` via compiled data-source
  (`node ./node_modules/typeorm/cli.js migration:run -d dist/config/data-source.js` — the src ts-node
  path still crashes on 220 stray .entity.js, same as Phase 3). pm2 restart, stable (no crash loop).
- Smoke: `/api/v1/aeon/build/catalog` 200 (returns 10 catalog items), `/news` 200, `/news/leaderboard`
  200, `/inbox` 401, `/reality/reward` 401. All correct.

## STILL latent / TODO
- bullmq lockfile: prod node_modules patched + prod package-lock.json updated, but the REPO
  package-lock.json is NOT updated (can't npm install on Windows stub). CI clean-build still needs
  `npm install --legacy-peer-deps` to regen lockfile in WSL/CI. package.json IS committed.
- expo-sensors / MapLibre still not in package.json (mobile native dep; needs WSL expo install + EAS).
- Concept art not commissioned (Phase 5.1 gate doc explains; renders use emoji placeholders).
- jest not run locally (Windows stub) — property tests diagnostics-clean only; real `jest` run = WSL/CI.
- Remaining真实接线 (deferred, documented in tasks.md): task_post/task_search real search,
  Trust3 high-risk sign串联 for agent spends, world-sim event-stream → World_News auto-publish hook,
  abilitySnapshot buff mapping render layer.


## 2026-05-31 (later) — jest + lockfile + E2E verified on prod
- **Property tests RAN on prod**: installed `fast-check@4.8.0` (devDep, was missing — other
  world-engine fast-check specs never ran on prod either). `npx jest src/modules/aeon/__tests__`
  → **4 suites / 16 tests PASS** in ~12s. (minor-blocked WARN logs are P.3 compliance fallback,
  expected.) ts-jest warns about stray `shared/types/aeon-world.js` (allowJs) — harmless.
- **Lockfile validated**: `npm ci` (bare) FAILS on prod due to pre-existing langchain/zod/stagehand
  peer conflict; `npm ci --legacy-peer-deps` PASSES (added 1528 pkgs, bullmq+fast-check resolved
  from lockfile). Pulled prod's validated package.json + package-lock.json back into repo
  (commit `a35e9a0e7`). **CI MUST use `npm ci --legacy-peer-deps`.**
- **E2E closed-loop**: `backend/scripts/aeon-e2e-closed-loop.mjs` (signs JWT for 2 real DB users,
  walks full HTTP loop with assertions). First run found a REAL BUG → fixed → **22/22 PASS**.
- **BUG FOUND + FIXED (commit `8df1c22e4`)**: escrow used sentinel STRING `'__escrow__'` as
  `payee_user_id`/`payer_user_id`, but those are `uuid` columns → Postgres 500
  `invalid input syntax for type uuid`. Bounty post never worked against real DB before. Fixed with
  `AeonEconomyService.ESCROW_ACCOUNT = '00000000-0000-4000-8000-0000000e5c70'` (fixed sentinel UUID).
  Lesson: the Phase 3 escrow path had NO integration coverage; property tests used the string as a
  pure key so didn't catch it. E2E against real DB is what caught it.
- E2E coverage verified: epochs→claim→enter→room→can-enter→company→fund→bounty(escrow)→list→accept
  →submit→(non-initiator verify 403)→verify→completed→(re-accept 400)→build catalog→place→
  (overlap 409)→(oob 400)→layout persists→world news (4 emergent kinds)→inbox→leaderboard.
- **Minor gap (not a bug)**: bounty payout via escrow-release does NOT push an inbox notification to
  the acceptor (only OrgService.payWage does). acceptor inbox unread=0 after bounty. Consider adding
  a wage_paid inbox push on task verify payout in a follow-up.
- prod stable after all (restart count steady, :3000 online).


## 2026-05-31 (later 2) — B5 agent-driven + B7 Trust3 gate + art brief + go-live checklist
- Commit `f46f9d443`, deployed to prod (boots clean, E2E still 22/22, no regression).
- **B5** `realtime/aeon-agent-worker.service.ts`: clock-in registers agent employee into an
  autonomous turn loop. runOneTurn: if has in-progress KPI task → Bedrock decideWork() → submit
  + animate thinking/typing/done + move; else accept an open KPI task. tickAll() for batch.
  decideWork() is the swappable seam to OpenClaw SSE (kept decoupled from 4000-line
  OpenClawProxyService to avoid circular deps). ClockInService wires register/runOneTurn on
  clock-in, unregister on clock-out.
- **B7** `economy/aeon-high-risk-gate.service.ts`: reuses `SignRequestService` (Trust3). agent/
  copilot spend >=500 AXP OR any digital currency → create sign-request (reason
  'agentic-commerce-overlimit') → poll 65s until completed/cancelled/expired → reject/timeout
  throws Forbidden WITHOUT ledger write (R11.4). manual state bypasses. Degrades (log+pass) if
  SignRequestService absent. Wired into AeonEconomyService.transfer({controlState}); SignRequestModule
  imported into AeonModule.
- **Docs**: `docs/business/AEON_ART_DOUBAO_BRIEF.zh-CN.md` (Doubao prompts: CA-1/2/3 concept +
  10 catalog buildings + 5 room backgrounds + consistency workflow);
  `docs/AEON_GO_LIVE_CHECKLIST_2026-05-31.zh-CN.md` (A硬阻断/B体验/C运营 with real status).
- **Go-live blockers remaining**: A1 art production (external/Doubao), A2 MapLibre+expo-sensors
  +EAS APK+Maestro real-device, A4 KYC/AML wiring (keep digital currency OFF, AXP-only until then),
  C3 UGC moderation + report path. B5/B7 DONE. B6/B8 optional enhancements.
- **B5/B7 remaining wiring**: agent-worker spend path should pass controlState:'agent' to transfer
  (currently real-user flows default manual); optional @Interval tickAll() for periodic progress
  (now clock-in triggers one turn). decideWork() can later swap Bedrock→OpenClaw.
