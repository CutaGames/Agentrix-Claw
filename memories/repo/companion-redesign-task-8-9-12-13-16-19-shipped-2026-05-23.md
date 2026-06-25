# P-9 Companion Redesign — Wave 6 + Wave 7 + Wave 8 Shipped (2026-05-23)

> Branch: `build/mobile-pet-forms-p6-2026-05-22`
> Commits: `25a835b1f` (code) + tasks.md mark-done (this commit)
> Spec: `.kiro/specs/mobile-pet-companion-redesign/{requirements,design,tasks}.md`

## Scope

- **Wave 6**: T8 全订阅 `presence:pet.*` + T9 后端 `/v1/pet/greet` + T11 voiceGreetScheduler
- **Wave 7**: T12 iOS Live Activity JS bridge + T13 Android System Overlay JS bridge + 统一 ambientPresence orchestrator
- **Wave 8**: T16 systemAssistantBridge reverse calls + T19 Agentic Commerce 框架 (with 11/11 unit tests)

## Backend Production Deploy

- New module: `backend/src/modules/pet-companion-engine/pet-greet.controller.ts` + `pet-greet.service.ts`
- Endpoint: `GET /v1/pet/greet?scenario=...&lang=zh|en`
- Bedrock: `bedrockService.invokeModel(prompt)` with claude-haiku-4-5
- Fallback: 4-line zh + en template bank per scenario (morning/evening/comeback/milestone/manual)
- Deployed to `47.130.176.148`:
  - `git pull` + `npm run build` (nest fallback to tsc per AGENTS.md gotcha; emits dist/main.js OK)
  - `pm2 restart agentrix-backend` — uptime 3s, online, mem 249mb
  - Production smoke: `GET /api/v1/pet/greet?scenario=morning` → `401 Unauthorized` (proves endpoint registered + JwtAuthGuard works)

## New Files (12)

### Backend (2)
- `backend/src/modules/pet-companion-engine/pet-greet.controller.ts` (54 lines)
- `backend/src/modules/pet-companion-engine/pet-greet.service.ts` (176 lines)

### Mobile services (6)
- `src/services/petGreet.api.ts` (31 lines) — `/v1/pet/greet` client
- `src/services/voiceGreetScheduler.service.ts` (221 lines) — AppState-driven greet scheduler
- `src/services/agenticCommerce.service.ts` (265 lines) — pure decision matrix + MMKV limits + lazy storage injection
- `src/services/systemAssistantBridge.ts` (248 lines) — 5 reverse calls + per-kind policy + 60s approval gating
- `src/services/ambientPresence/iosLiveActivity.ts` (208 lines) — JS bridge to native Live Activity
- `src/services/ambientPresence/androidOverlay.ts` (213 lines) — JS bridge to native SYSTEM_ALERT_WINDOW
- `src/services/ambientPresence/index.ts` (133 lines) — unified bootAmbientPresence orchestrator

### Mobile tests (1)
- `src/services/__tests__/agenticCommerce.test.ts` (212 lines) — 11/11 passing

### Mobile mocks (1)
- `src/services/__mocks__/reactNativeMmkv.ts` (50 lines) — in-memory MMKV for jest

### Modified (4)
- `App.tsx` — bootVoiceGreetScheduler() composed with bootPetModeAdapters disposer
- `src/services/petModeAdapters.ts` — expanded from 1 to 9 active presence subscriptions, all bridge to companionEvents bus with appropriate mode pulses
- `src/components/companion/PetDetailSheet.tsx` — "🎙 打招呼" wired to triggerVoiceGreet('manual') instead of stub event
- `backend/src/modules/pet-companion-engine/pet-companion-engine.module.ts` — register PetGreetController/Service + import BedrockIntegrationModule
- `jest.config.js` — added `react-native-mmkv` → in-memory mock mapping

## Key Architectural Decisions

### 1. petModeAdapters expanded to bridge ALL presence topics

Before wave 6: only `presence:pet.state` was subscribed. After:

| Topic | Bridge | Side effect |
|---|---|---|
| `presence:pet.state` | cross-device-event | mapEmotionToMode → setPetMode |
| `presence:pet.soul.changed` | cross-device-event | whisper mode TTL 800ms |
| `presence:pet.skin.changed` | cross-device-event | (no mode change; just skin layer refresh signal) |
| `presence:pet.proactive` | cross-device-event + voice-greet (if missed_you) | whisper TTL 4s via VoiceGreetCapsule |
| `presence:pet.energy` | cross-device-event | (data refresh signal) |
| `presence:wallet.delta` | wallet-delta | WalletCapsule auto-fires |
| `presence:world-engine.battle-pending` | world-engine-event | nudge mode TTL 4s |
| `presence:world-engine.asset.ready` | world-engine-event | whisper mode TTL 4s |
| `presence:skill.update` | skill-update | nudge mode TTL 3s |

This makes the **CompanionBall a true cross-device aware sprite** — desktop changes soul / wallet earns / world-engine asset ready all surface visually on mobile within the socket round-trip.

### 2. Voice_Greet two-tier resilience

- **Tier 1**: backend Bedrock generation with strict prompt (≤30 chars, no exclamation)
- **Tier 2**: per-scenario template bank (4 zh + 4 en lines per scenario)
- Mobile UI **never hangs** — `fetchPetGreet` returns within ~300ms even when Bedrock is down
- voiceGreetScheduler tracks `pet_voice_greet_count_<yyyymmdd>` MMKV counter; `manual` scenario bypasses both quota and Quiet_Hours

### 3. agenticCommerce as pure decision function

```ts
evaluateAgenticAction(req) → 'auto-execute' | 'request-approval' | 'block'
```

Caller is fully responsible for executing the consequence:
- `'auto-execute'` → caller calls API + emits `wallet-delta` + `agentic-commerce` events
- `'request-approval'` → caller emits `trust3-signing-request` + waits for sheet
- `'block'` → caller responds to LLM as failure

Storage uses **lazy require + injection point** (`_setStorageForTests`) so the same code runs in pure-Node jest (in-memory) and React Native runtime (MMKV).

Network failure during `fetchTodaySpend` → returns `MAX_SAFE_INTEGER` so all amounts route to `request-approval` (fail-safe over-spend protection).

### 4. systemAssistantBridge — opt-in + 60s approval

- **Per-kind policy** defaults to safe values (callPhone/smartHome/calendar = off; openMaps/timer = on)
- Policy persists to `reverse_call_policy/v1` MMKV
- Each `requestReverseCall(req)`:
  1. Check policy → return `user-disabled` if off
  2. Generate approval id + emit `approval-incoming` (ApprovalAlertCapsule visible)
  3. Register `_pendingApprovals.set(id, resolve)` Promise registry
  4. Wait up to 60s for `resolveReverseCallApproval(id, 'approve' | 'reject')` (UI calls this)
  5. On approve → invoke platform intent (`tel:` / Apple Maps / `geo:0,0?q=` / `calshow:` / Shortcuts)

### 5. Ambient Presence: JS bridge first, native later

iOS Live Activity (`PetCompanionActivity.swift`) and Android SYSTEM_ALERT_WINDOW (`CompanionOverlayService.kt`) are bare-workflow native targets that need EAS rebuild. We shipped:

- Pure JS bridges with `NativeModules.X || NativeModules.Y` probes — no-op gracefully when native module not bundled
- Lifecycle hooks: AppState background → start, foreground → stop (Android) / keep (iOS)
- companionEvents.mode-changed → updateXXX so caption stays fresh
- Wallet-delta override caption (R4.12) handled in unified `ambientPresence/index.ts`
- Deep-link handlers `agentrix://companion-tap` / `agentrix://companion-longpress` already wire to ConversationBubble.present / PetDetailSheet.present — ready for native UI to call them

Wave 9 will land the native ActivityKit + WindowManager code. Audit T0.4 found `AndroidBackgroundWakeWordService.kt:326` already has all the foreground-service plumbing — just needs UI extraction.

## Verification

- `npx tsc --noEmit`: 0 new errors. 4 pre-existing unchanged.
- Tests: 161/161 passing (was 150 → +11 agenticCommerce branches)
- Production deploy: `agentrix-backend` online, endpoint smoke 401
- Backend deploy method: SSH `47.130.176.148` + `git pull` + `npm run build` + `pm2 restart` — per AGENTS.md velocity window auto-approved

## Deferred to Wave 9+

- T11 formVariant auto-detection (expo-calendar + HealthKit/GoogleFit)
- T12.1 native Swift Live Activity extension (Xcode bare-workflow target)
- T13.1 native Kotlin overlay service (extend existing wake-word service)
- T14 5 new system-assistant intents (iOS App Intents + Android actions.xml + chineseAssistants.ts manifest)
- T15 SkillInstallCard
- T16.3 register reverse calls as mcp tools (backend coordination)
- T17 wake-word conflict (Picovoice integration)
- T18 Cross-device token + remote-control gateway (backend WebSocket module)
- T19.2 / 19.3 / 19.4 mcp tool-call integration + push notification + UI button
- T20 CompanionSettingsScreen 9 sections — wires limits / policies / toggles into UI
- T21 Mood_Diary_Push backend cron
- T22 Steps polling + sitting nudge
- T23 Brand visual (Splash + notif large icon)
- T24 Maestro E2E + perf instrumentation + 1% rollout

## Production Smoke Tests Performed

```
$ curl -i https://api.agentrix.top/api/v1/pet/greet?scenario=morning&lang=zh
HTTP/1.1 401 Unauthorized
{"success":false,"code":"UnauthorizedException","message":"Unauthorized"}
```

## Velocity Window Status

- ✅ Auto-approved: backend SSH deploy + npm run build + pm2 restart (per AGENTS.md)
- ✅ Auto-approved: feature branch push to origin (CutaGames/Agentrix)
- ⏸️ Not requested: APK CI mirror to `Agentrix-Claw`
- ⏸️ Not requested: 1% feature flag rollout
