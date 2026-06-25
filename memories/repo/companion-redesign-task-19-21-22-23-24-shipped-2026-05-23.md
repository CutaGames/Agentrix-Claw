# P-9 Companion Redesign — Wave 12 + 13 + 14 Shipped (2026-05-23)

> Branch: `build/mobile-pet-forms-p6-2026-05-22`
> Commit: `2cc74c8bc` (13 files, +1102 / -6)
> Backend: production deploy + migration `1796000000000-AddPetDiaryPushTracking` ran successfully (3 columns added to `pet_diary` table, verified via psql)

## Scope

- **Wave 12**: T22 health/movement nudge + T23 SplashScreen pet sprite + T20.3 今日小结 + T20.4 重置 / 导出
- **Wave 13**: T19.2 mcp gating helper + T19.3 wallet-delta+capsule on auto-execute + T21.1/2 Mood_Diary_Push backend cron + T16.3 reverse-call mcp tool manifest
- **Wave 14**: T24.1 Maestro 47-* smoke yaml + T24.2 perf instrumentation (12 budget kinds + Trust3/PetDetailSheet wired)

## New Files (8)

### Backend (3)
- `backend/src/entities/pet-diary-entry.entity.ts` (modified, +13 lines) — added 3 push-tracking columns
- `backend/src/migrations/1796000000000-AddPetDiaryPushTracking.ts` (42 lines) — migration applied to prod
- `backend/src/modules/pet-companion-engine/mood-diary-push.service.ts` (~138 lines) — `@Cron(EVERY_HOUR)` filtering [19, 21] window

### Mobile services (3)
- `src/services/agenticCommerceMcp.ts` (~153 lines) — `gateMcpCommerce(req)` + `notifyAgenticExecuted`
- `src/services/companionHealth.service.ts` (~246 lines) — Pedometer poll + sitting nudge + 18:00 late reminder + milestones
- `src/services/companionPerf.ts` (~119 lines) — 12 budget kinds + beginMark/endMark/timed helpers

### Shared types (1)
- `shared/types/mcp-reverse-tools.ts` (~103 lines) — manifest of 5 reverse-call mcp tools (system.callPhone / openMaps / smartHome / timer / calendar) with JSON schemas

### Maestro (1)
- `.maestro/47-companion-redesign-smoke.yaml` (~82 lines) — master smoke flow

### Modified (5)
- `App.tsx` — SplashScreen renders PetSpriteImage; bootCompanionHealthWatcher composed into AppState dispose
- `backend/src/modules/pet-companion-engine/pet-companion-engine.module.ts` — register MoodDiaryPushService + import NotificationModule + add PetDiaryEntry to TypeORM forFeature
- `src/components/companion/PetDetailSheet.tsx` — wrap present() with `companionPerf.beginMark/endMark('pet-detail-sheet-present')`
- `src/components/companion/Trust3SigningSheet.tsx` — same wrapping for `'trust3-sheet-present'`
- `src/screens/me/CompanionSettingsScreen.tsx` (+174 lines) — TodaySummaryCard + 维护 section (重置 / 导出 / 清空诊断)

## Production Deploy

```
$ ssh ubuntu@47.130.176.148 'cd /home/ubuntu/Agentrix && git pull && cd backend && npm run build && npx typeorm migration:run -d dist/config/data-source.js && pm2 restart agentrix-backend'
✅ Build succeeded: dist/main.js (7884 bytes)
query: ALTER TABLE "pet_diary" ADD "last_viewed_at" timestamptz
query: ALTER TABLE "pet_diary" ADD "last_pushed_at" timestamptz
query: ALTER TABLE "pet_diary" ADD "consecutive_push_misses" smallint NOT NULL DEFAULT 0
Migration AddPetDiaryPushTracking1796000000000 has been executed successfully.
[PM2] [agentrix-backend](3) ✓
agentrix-backend   online   uptime 3s   mem 247.5mb

$ PGPASSWORD=... psql -h localhost -U agentrix -d paymind -c '\d pet_diary'
 last_viewed_at          | timestamp with time zone | nullable
 last_pushed_at          | timestamp with time zone | nullable
 consecutive_push_misses | smallint                 | not null | default 0
```

## Key Architectural Decisions

### 1. companionHealth — lazy require + MMKV daily state

Pedometer module lazy-required so `companionHealth.service.ts` is importable from pure-Node jest (though no test ships yet — too RN-coupled). MMKV under `pet_companion_daily_steps_<yyyymmdd>` tracks `totalSteps / sittingBaseline / lastSittingNudgeMs / announcedMilestones / lateReminderFired` per day; 5000/8000/10000 milestones fire `journey` mode + Voice_Greet milestone scenario once each.

Sitting heuristic: every 60min compare current totalSteps vs sittingBaseline. If delta < 100 → fire nudge mode + "久坐啦,起来走 5 分钟?" voice-greet. Quiet_Hours suppress.

18:00 late reminder: once-per-day if totalSteps < 5000 → fire "今天才 N 步,陪我走会儿?" greet.

### 2. agenticCommerceMcp — pure gating helper

`gateMcpCommerce(req)` runs `evaluateAgenticAction` and returns `{ decision, llmFeedback, signRequestId }`. Caller is responsible for the actual API call:
- `'auto-execute'` → caller proceeds
- `'request-approval'` → helper auto-creates sign-request + emits trust3-signing-request; caller awaits trust3-signing-completed for the signRequestId
- `'block'` → caller passes formatted llmFeedback back to LLM via mcp tool result

`notifyAgenticExecuted` post-hook emits wallet-delta + agentic-commerce events for capsule trail.

### 3. MoodDiaryPushService — server-clock approximation Phase 1

Phase 1 cron filters server hour ∈ [19, 21] to approximate user-local 19-21 push window. Future enhancement reads `user.timezone_offset` (column doesn't exist on User entity yet — wave 15). Per-user dedup via:
- skip if `last_viewed_at` matches today's dateKey
- skip if `last_pushed_at` matches today's dateKey
- ≥7 consecutive misses → weekly backoff (only re-push after 7 days)

Push notification payload includes `agentrix://intent/mood-diary?id=&text=` deeplink so the wave-11 `mood-diary` intent handler runs on tap.

### 4. companionPerf — voiceDiagnostics-backed sampling

`beginMark(kind, context)` returns opaque token, `endMark(token)` records elapsed + budget + overBudget to voiceDiagnostics under scope `companion-perf`. 12 R12.8 budget kinds defined upfront. Wired Trust3SigningSheet.present (P95 200ms) and PetDetailSheet.present (P95 250ms) — these two are the hottest sheet present paths.

### 5. mcp-reverse-tools manifest — backend bind point

Added `shared/types/mcp-reverse-tools.ts` for backend mcp tool registry. Each spec includes JSON inputSchema so LLMs can generate valid args. All 5 tools have `requiresApproval: true` — backend mcp executor must route to mobile via the existing `system.<verb>` tool-call result channel which the wave-8 `systemAssistantBridge.requestReverseCall` handles. Backend registry wiring lands in wave 15 (T16.3 backend half).

## Verification

- TSC: 0 new errors, 4 pre-existing unchanged
- Tests: 330/330 passing
- Migration: applied successfully on prod 47.130.176.148
- pet_diary schema verified: 3 new columns present + migrations table updated

## Deferred to Wave 15+

- T11.2 expo-calendar (EAS rebuild)
- T11.3 expo-health bridge (EAS rebuild)
- T12.1 native iOS Live Activity Swift extension
- T13.1 native Android System Overlay Kotlin
- T14.1/14.2 native iOS App Intents + Android actions.xml
- T16.3 backend mcp tool registry wiring of MCP_REVERSE_TOOLS manifest
- T17 native system wake-word detection trigger of suspendSelfWakeWord
- T20.1 unified petCompanionSettings/v1 namespace
- T21.4 push channel UI in CompanionSettings
- T22.3 movement-relevant Mood_Diary template variant
- T23.2 notification large icon (per-pet sprite hosting)
- T23.4 App icon (Phase 2 — 14d Apple review)
- T24.3 1% cohort rollout
- T24.4 pre-launch manual checklist run-through
- T24.5-24.7 ship procedures

## Phase 1 Completion Status

Across waves 0-14, the P-9 Companion Redesign Phase 1 has shipped:

✅ 4-tab IA (World / Summon / Plaza / Me) with World default
✅ companionEvents 18-event central bus + 8 CompanionMode taxonomy + Local_Action_Wins
✅ Companion ball wrapping legacy GlobalFloatingBall (cross-tab visibility, signing lock, low-power)
✅ ConversationBubble (65/100% snap), PetDetailSheet (85% with 9 sections), Trust3SigningSheet (70%, 60s countdown, biometric)
✅ Three transient capsules (Wallet / Approval / VoiceGreet) on event bus
✅ Full presence:pet.* + wallet.delta + world-engine.* + skill.update subscriptions bridged to companionEvents
✅ Backend `/v1/pet/greet` (Bedrock + 4-line fallback) + voiceGreetScheduler with 5 scenarios
✅ formVariant 4-mode resolver + 15min poll watcher (manual override via CompanionSettings)
✅ iOS Live Activity + Android System Overlay JS bridges (native code Phase 2)
✅ 5 new system intents + SkillInstallCard + Trust3-gated install
✅ Cross-device remote-control gateway (backend + token + WebSocket + RemoteControlPanel)
✅ Agentic Commerce decision matrix + 11/11 unit tests + UI limits panel + emergency freeze
✅ CompanionSettings 4 critical sections + 今日小结 + 重置/导出/清空 buttons
✅ Health/movement nudges (steps + sitting + late reminder + milestones)
✅ Brand SplashScreen pet sprite
✅ MoodDiaryPush backend cron with weekly-backoff + mood-diary intent handler
✅ companionPerf 12-budget instrumentation wired to 2 critical paths
✅ Maestro 47-* master smoke flow
✅ 330/330 jest tests passing, 0 new TS errors

Backend production live: `47.130.176.148` runs all P-9 backend modules (pet-greet / sign-request / mood-diary-push / remote-control + all migrations).

## Velocity Window Status

- ✅ Auto-approved: backend SSH deploy + migration:run + pm2 restart
- ✅ Auto-approved: feature branch push (CutaGames/Agentrix)
- ⏸️ Not requested: APK CI mirror to Agentrix-Claw
- ⏸️ Not requested: 1% feature flag rollout
