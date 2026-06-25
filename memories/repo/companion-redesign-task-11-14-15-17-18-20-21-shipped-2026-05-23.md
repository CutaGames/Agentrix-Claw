# P-9 Companion Redesign — Wave 9 + 10 + 11 Shipped (2026-05-23)

> Branch: `build/mobile-pet-forms-p6-2026-05-22`
> Commit: `7b9c36e4a` (22 files, +2154 / -3)
> Backend: production deploy via SSH + npm run build + pm2 restart agentrix-backend (uptime 3s, 401 smoke pass on `/v1/cross-device/token`)

## Scope

- **Wave 9**: T11 formVariant 自动检测 + T14 5 个新系统助手 intents + T15 SkillInstallCard
- **Wave 10**: T18 Cross-device + remote-control gateway 后端 + 前端 + RemoteControlPanel
- **Wave 11**: T20 CompanionSettings 4 sections (Phase 1 critical path) + T17 wake-word suspend + T21 mood-diary deeplink handler

## New Files (12)

### Backend (5)
- `backend/src/modules/remote-control/cross-device-token.service.ts` (51 lines) — JWT mint + verify keyed by JWT_SECRET, 30s expiry
- `backend/src/modules/remote-control/remote-control.controller.ts` (59 lines) — `POST /v1/cross-device/token`
- `backend/src/modules/remote-control/remote-control.gateway.ts` (167 lines) — `/remote-control` socket.io namespace
- `backend/src/modules/remote-control/remote-control.module.ts` (34 lines) — module wiring
- `shared/types/remote-control.ts` (70 lines) — whitelist + forbidden + typed payloads

### Mobile services (5)
- `src/services/formVariant.service.ts` (~225 lines) — pure resolver + AppState/15min poll watcher
- `src/services/crossDeviceToken.service.ts` (~209 lines) — mintCrossDeviceToken + sendRemoteControl orchestrator
- `src/services/wakeWordSuspend.ts` (~41 lines) — module-scope suspend coordinator (R9.11)

### Mobile UI (3)
- `src/components/companion/SkillInstallCard.tsx` (~376 lines) — 70% sheet + Trust3 gating + announce learned
- `src/components/companion/RemoteControlPanel.tsx` (~269 lines) — embedded in PetDetailSheet CrossDeviceCard
- `src/screens/me/CompanionSettingsScreen.tsx` (~326 lines) — 4 critical sections

### Mobile tests (1)
- `src/services/__tests__/formVariant.test.ts` (66 lines) — 8/8 priority resolution tests

### Modified (10)
- `App.tsx` — bootFormVariantWatcher() composed into AppState dispose chain
- `backend/src/app.module.ts` — register RemoteControlModule
- `src/components/companion/CompanionLayer.tsx` — mount SkillInstallCard
- `src/components/companion/PetDetailSheet.tsx` — embed RemoteControlPanel + Settings → CompanionSettings
- `src/components/companion/sheetRefRegistry.ts` — add SkillInstallCardHandle + skillInstallCardRef
- `src/navigation/MeStackNavigator.tsx` — register CompanionSettings screen
- `src/navigation/types.ts` — add `CompanionSettings: undefined` to MeStackParamList
- `src/services/intents/chineseAssistants.ts` — add 5 intents + ask_aira to AgentrixIntentName union
- `src/services/intents/defaultIntentHandlers.ts` — 6 new handlers (5 wave 9 + mood-diary wave 11)
- `src/services/intents/intentBridge.ts` — IntentName union + ALL_INTENTS set extended with 6 new entries

## Key Architectural Decisions

### 1. formVariant — pure resolver + lazy require for jest

`resolveCurrentVariant(ctx)` is a pure function exported for tests; production `bootFormVariantWatcher()` lazy-requires `react-native` AppState so the file imports cleanly into pure-Node jest. Variants only override low-priority modes (companion/working/slumber/journey) — explicit signing/nudge/whisper modes are preserved.

### 2. Remote control: JWT-bound short-lived tokens

Phase 1 simplification: backend signs the cross-device token with `JWT_SECRET` directly (instead of user's MPC share-1) keyed by (userId, targetDeviceId, command, requestId, nonce). Verifies on every execute. 30s expiry per spec R8.5.

Mobile flow: mint → connect socket on `/remote-control` namespace → emit execute → wait 5s for ack/nack → emit `remote-control-sent` + `remote-control-ack` companionEvents. Ack timeout fires nudge mode + voiceDiagnostics 'ack-timeout'.

### 3. SkillInstallCard — defer-then-resolve pattern

When skill requires Trust3 (price > 0 OR risky permissions), card emits `trust3-signing-request` + subscribes to `trust3-signing-completed` for the same signRequestId. Subscription resolves in-place: when user passes biometric → backend completes the sign-request → mobile receives event → card calls `installSkillToInstance` and emits `voice-greet milestone "我学会了 X"`.

### 4. mood-diary intent — text passed via deeplink

Backend Mood_Diary_Push (T21.2 still deferred) will use `agentrix://intent/mood-diary?id=<id>&text=<diaryText>`. Mobile handler emits `voice-greet { scenario: 'manual', text }` + best-effort navigates to PetCompanion. The text travels in the deeplink itself so we don't need an extra round-trip after foregrounding.

### 5. CompanionSettings — store-per-feature + UI mirror

Instead of a single big `petCompanionSettings/v1` namespace, Phase 1 wires UI sections directly to per-service stores (agenticCommerce / reverse_call_policy / form_variant MMKV keys + useSettingsStore.wakeWordConfig). The unified namespace migration is wave 12 once we know which keys actually need persistence sync.

### 6. RemoteControlPanel respects night mode

When `formVariant=night` is locked, panel sends `executeMode: 'notify-only'` so backend forwards as a notification rather than executing on target device — user agrees the next morning. Ties together formVariant (wave 9) + RemoteControl (wave 10).

## Production Deploy

```
$ ssh ubuntu@47.130.176.148 'cd /home/ubuntu/Agentrix && git pull && cd backend && npm run build && pm2 restart agentrix-backend'
✅ Build succeeded: dist/main.js (7884 bytes)
[PM2] [agentrix-backend](3) ✓
agentrix-backend   online   uptime 3s   mem 249.2mb

$ curl -i -X POST -H 'Content-Type: application/json' \
    -d '{"targetDeviceId":"abc","command":"desktop.pro-mode.toggle"}' \
    https://api.agentrix.top/api/v1/cross-device/token
HTTP/1.1 401 Unauthorized
```

## Verification

- `npx tsc --noEmit`: 0 new errors. 4 pre-existing unchanged.
- Tests: 330/330 passing (full suite, was 161 → +8 formVariant + everything else picked up by glob)
- Backend deploy verified via 401 smoke

## Deferred to Wave 12+

- T11.2 expo-calendar meeting detection — needs EAS rebuild
- T11.3 expo-health step polling — needs EAS rebuild
- T12.1 native iOS Live Activity Swift extension
- T13.1 native Android System Overlay Kotlin service
- T14.1 / T14.2 native iOS App Intents + Android actions.xml
- T16.3 register reverse-call as mcp tools — backend coordination
- T17 native system-wake-word detection trigger of suspendSelfWakeWord
- T20.1 unified petCompanionSettings/v1 namespace
- T20.3 今日陪伴小结 metrics card
- T20.4 重置为默认 + 导出陪伴日志 buttons
- T21.1 / T21.2 backend Mood_Diary_Push cron
- T21.4 push channel UI in CompanionSettings
- T22 health/movement nudge
- T23 brand visual SplashScreen pet sprite + notification large icon
- T24 Maestro E2E + perf instrumentation + 1% rollout

## Velocity Window Status

- ✅ Auto-approved: backend SSH deploy + npm run build + pm2 restart
- ✅ Auto-approved: feature branch push to origin (CutaGames/Agentrix)
- ⏸️ Not requested: APK CI mirror to Agentrix-Claw
- ⏸️ Not requested: 1% feature flag rollout
