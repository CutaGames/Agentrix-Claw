# Companion Redesign Task 0 (pre-flight) shipped — 2026-05-22

> Sprint P-9 wave 0 — backend foundation for the mobile pet companion redesign.
> Production commit `abcfe9db0` deployed to `47.130.176.148`.

## Tasks Done

- Task 0.1 (audit presence topics) ✅
- Task 0.2 (audit activeInstance) ✅
- Task 0.3 (feature flag scaffold pattern verified) ✅
- Task 0.4 (Android SYSTEM_ALERT_WINDOW verified + giant win) ✅
- Task 0.5 (4 new presence topics + emit at producers) ✅ shipped
- Task 0.6 (sign-request queue model) ✅ shipped

## What changed

### shared/types/pet-presence.ts

Added 4 new topic constants:
- `WALLET_DELTA = 'presence:wallet.delta'`
- `WORLD_ENGINE_BATTLE_PENDING = 'presence:world-engine.battle-pending'`
- `WORLD_ENGINE_ASSET_READY = 'presence:world-engine.asset.ready'`
- `SKILL_UPDATE = 'presence:skill.update'`

With strongly-typed `WalletDeltaPayload` / `WorldEngineBattlePendingPayload` / `WorldEngineAssetReadyPayload` / `SkillUpdatePayload` interfaces and additions to `PetPresenceEventMap` discriminated union.

### Backend new files

- `backend/src/modules/desktop-sync/companion-presence.helpers.ts` — typed
  `emitWalletDelta` / `emitWorldEngineBattlePending` / `emitWorldEngineAssetReady` /
  `emitSkillUpdate` wrappers around `emitDesktopSyncEvent`.
- `backend/src/modules/sign-request/sign-request.entity.ts` — Trust3 sheet queue entity.
- `backend/src/modules/sign-request/sign-request.service.ts` — create / findById /
  complete / cancel methods, plus `@Cron(EVERY_5_MINUTES)` sweeper that flips
  expired pending rows to status='expired'. Emits 3 presence events
  (`presence:trust3.signing-request` / `signing-completed` / `signing-cancelled`).
- `backend/src/modules/sign-request/sign-request.controller.ts` — REST: POST /
  GET /:id / POST /:id/complete / POST /:id/cancel, all under `/v1/wallet/sign-request`.
- `backend/src/modules/sign-request/sign-request.module.ts` — module wire-up.
- `backend/src/migrations/1795000000000-CreateSignRequests.ts` — table + 4 indexes.

### Backend modified files (single emit call each)

- `payment/withdrawal.service.ts` — emit wallet.delta on `processWithdrawal` complete.
- `world-engine/controllers/battle.controller.ts` — emit world-engine.battle-pending
  on `createChallenge` after `battleRepo.save`.
- `world-engine/controllers/asset.controller.ts` — emit world-engine.asset.ready
  in `generateCharacter` before return.
- `skill/skill-approval.service.ts` — added `broadcastSkillUpdate(...)` private method
  that queries `claw_installed_skills` for all users with the skill installed
  and emits skill.update to each. Wired into `publishSkills`.
- `app.module.ts` — registers SignRequestModule.

## Production verification

- `npm run build` succeeded (nest reports world-engine TS errors but tsc fallback
  emits dist/main.js — pre-existing, see audit doc).
- Migration ran clean: `Migration CreateSignRequests1795000000000 has been executed successfully.`
- pm2 restart agentrix-backend → uptime 5s + online.
- Schema verified via psql: 11 columns + 4 indexes (PK + user_status + idempotency
  + user_id + expires_pending partial WHERE status='pending').
- Endpoint verified live: `GET /v1/wallet/sign-request/<uuid>` returns HTTP 401
  (Unauthorized) confirming JwtAuthGuard works and route is mounted.
- `count(*) FROM sign_requests` = 0 (clean baseline).
- `migrations` table has the new row.

## Audit findings cached for follow-up tasks

`.tmp_apk/companion-redesign-audit.md` contains the full pre-flight findings.
Key insights for downstream tasks:

1. ⭐ **Android SYSTEM_ALERT_WINDOW already implemented** in
   `AndroidBackgroundWakeWordService.kt` (line 326 uses `TYPE_APPLICATION_OVERLAY`).
   T13 (Android Overlay) reduces from "build new service" to "extract overlay
   logic + add companion sprite UI" — saves ~5 days.
2. ⭐ **WorldEngineFeatureFlagService pattern can be cloned 1-1** for
   `pet_companion_redesign_enabled` flag. Recommendation in T0.3: skip the
   server-side service since this flag is UI-only — just seed an admin_configs
   row + react-query hook.
3. ⭐ **MyAgentsScreen already has `setActiveInstance(id)` flow** — T6.2
   ActivePetPicker is a BottomSheet 50% wrapper around its list logic, not a
   from-scratch component.
4. ⚠️ **mpc-wallet only has signMessage()**, no sign-request queue — that's
   why we built T0.6 (this commit).
5. ⚠️ **`presence:device.list` API does not exist** — T6.3 cross-device emoji
   row should fall back to `authStore.openClawInstances` for Phase 1 then
   extend backend in Phase 2.

## Net Phase 1 timeline impact

Original spec estimated 8-9 weeks. After audit + T0.5 / T0.6 shipped:
- Sprint P-9.1: 2 weeks (unchanged)
- Sprint P-9.2: 1.5 weeks (Trust3 reuses sign-request)
- Sprint P-9.3: 1 week (Android overlay reuses existing service)
- Sprint P-9.4: 2 weeks (unchanged)
- **Total**: 6.5–7.5 weeks (saved 1.5 weeks)

## Gotchas

- nest build warns about pre-existing world-engine TS errors but `dist/main.js`
  emits successfully via tsc fallback. AGENTS.md already notes this.
- `head` and `find` are not PowerShell commands — use `Select-Object -First N`
  or just let output flow. Avoid heredoc-style commit messages on PowerShell.
- Migration timestamp `1795000000000` is post-`world_engine_enabled` to ensure
  it runs after world-engine setup but on a fresh DB it doesn't matter.
- `claw_installed_skills` table uses `installedByUserId` — Phase 1 dedupes by
  user id to broadcast skill.update once per user even if they have multiple
  instances with the same skill.

## Next actions

- Task 1.1 (`@gorhom/bottom-sheet` + `expo-battery` deps) ready to start.
- Task 1.2 (`companionEvents.service.ts`) ready to start.
- Task 1.3 (`petMode` 8-mode transition matrix) ready to start.
- Task 2 (4-tab IA restructure) ready, can run in parallel with T1.

## Files

- New: 6 (backend module + migration + helper)
- Modified: 5 (4 emit-call producers + AppModule)
- Pure type/spec adds: shared/types/pet-presence.ts + .kiro/specs/* + audit doc
- Total commit: 16 files / +4941 insertions
