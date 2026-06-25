# P-9 Companion Redesign — Phase 1 COMPLETE (2026-05-23)

> Branch: `build/mobile-pet-forms-p6-2026-05-22`
> Final commit: `8c8ed2633` (wave 15-16)
> Backend production: live on 47.130.176.148 with all migrations + flag seeded at 0% rollout
> Spec: `.kiro/specs/mobile-pet-companion-redesign/{requirements,design,tasks}.md`
> Runbook: `docs/P9_COMPANION_REDESIGN_GO_LIVE_RUNBOOK.zh-CN.md`

## What This Is

P-9 Phase 1 reshapes the Agentrix mobile app from a 7-tab "Home + Pet + Agent + Wallet + Discover + Team + Today" IA into a 4-tab simple model (World / Summon / Plaza / Me) where the **floating ball IS the pet IS the brand**. Single-tap = chat bubble. Long-press = pet detail sheet. Right-swipe = camera-to-conversation. Trust 3 signing collapses to a single bottom sheet. Cross-device control is one tap inside PetDetailSheet. Agentic Commerce gives the pet bounded autonomy. The whole thing has been delivered behind a feature flag at 0% rollout.

## Final State

### 24 Spec Tasks Status

All 24 main tasks from `.kiro/specs/mobile-pet-companion-redesign/tasks.md` resolved. Status legend:
- ✅ shipped to mobile + backend deployed to production
- 🟡 JS layer shipped + native code deferred to next EAS rebuild

| # | Title | Status |
|---|---|---|
| T0 | Pre-flight audit + backend foundation | ✅ |
| T1 | CompanionEvents bus + 8-mode taxonomy | ✅ |
| T2 | 4-tab IA + WorldStackNavigator + legacyRouteTable | ✅ |
| T3 | CompanionBall (wraps GlobalFloatingBall, cross-tab visibility, signing lock) | ✅ |
| T4 | CompanionLayer global mount + activePet hook | ✅ |
| T5 | ConversationBubble (65/100% sheet) | ✅ |
| T6 | PetDetailSheet 9 sections + 试签名 button → Trust3 demo loop | ✅ |
| T7 | Trust3SigningSheet (70% sheet, 60s countdown, biometric, dedup) | ✅ |
| T8 | Full presence:pet.* (11 topics) + wallet.delta + world-engine.* + skill.update bridges | ✅ |
| T9 | Backend GET /v1/pet/greet (Bedrock + 4-line fallback) + voiceGreetScheduler | ✅ |
| T10 | 3 Capsules (Wallet / Approval / VoiceGreet) | ✅ |
| T11 | formVariant 4-mode resolver + 15min poll watcher | ✅ |
| T12 | iOS Live Activity bridge | 🟡 (JS done, native Phase 2) |
| T13 | Android System Overlay bridge | 🟡 (JS done, native Phase 2) |
| T14 | 5 new system-assistant intents | 🟡 (JS done, native Phase 2) |
| T15 | SkillInstallCard | ✅ |
| T16 | systemAssistantBridge + 5 reverse-call MCP tools (backend + mobile dispatcher) | ✅ |
| T17 | Wake-word suspend module + speechWakeWord guard | ✅ |
| T18 | Cross-device remote-control gateway (backend WebSocket + mobile orchestrator + RemoteControlPanel) | ✅ |
| T19 | Agentic Commerce framework (decision matrix + 11 unit tests + UI + emergency freeze + mcp wire) | ✅ |
| T20 | CompanionSettings 9 sections (4 critical Phase 1 + summary card + 维护 + push channels + voice greet prefs + quiet hours) | ✅ |
| T21 | Mood_Diary_Push backend cron + intent handler | ✅ |
| T22 | Health/Movement (Pedometer + sitting + late reminder + milestones) | ✅ |
| T23 | Brand visual (SplashScreen pet sprite) + notification large icon Phase 2 | 🟡 |
| T24 | Maestro 47-* smoke + companionPerf instrumentation + feature flag rollout SOP | ✅ |

## Total Code Volume

Across 16 waves (commits abcfe9db0 → 8c8ed2633):

| Layer | Files | Lines |
|---|---|---|
| Backend modules | 13 | ~1900 |
| Backend migrations | 2 | ~80 |
| Mobile services | 18 | ~3500 |
| Mobile UI components | 11 | ~3800 |
| Mobile screens | 4 | ~900 |
| Mobile navigation | 3 | ~400 |
| Shared types | 3 | ~280 |
| Tests | 4 | ~600 |
| Maestro flows | 1 | ~80 |
| Documentation | 9 | ~3000 |
| **Total** | **68** | **~14600** |

330/330 jest tests passing. 0 new TypeScript errors (4 pre-existing untouched). Backend deployed via 16 SSH `npm run build + pm2 restart` cycles + 2 migration:run cycles. All 8 backend endpoints return 401 Unauthorized to anonymous smoke tests.

## Backend Production Footprint

```
$ ssh ubuntu@47.130.176.148 'pm2 list | grep agentrix-backend'
agentrix-backend   online   uptime <fresh after each deploy>   mem ~250mb

$ PGPASSWORD=... psql -d paymind -c '\dt' | grep -E 'sign_requests|pet_diary|admin_configs'
sign_requests           | 11 cols + 4 indexes
pet_diary               | 12 cols (3 added in wave 13)
admin_configs           | seeded with pet_companion_redesign_enabled (0% rollout)
```

## Architectural Highlights

1. **companionEvents central bus** — 18 typed events; PII redaction; auto-logged to voiceDiagnostics; subscriptions in 7 modules including Trust3 sheet, capsules, overlay bridges, mcp dispatcher.

2. **Feature flag gating without code-path branches** — bundle ships with both legacy and P-9 IA. Boot-time `fetchCompanionFlag` reads server state once, MMKV-cached for 6h. Rollback = SQL update + 60s + user restart.

3. **Trust3 attestation pattern** — mobile generates biometric attestation token (not a chain signature); backend mpc-signer is the actual chain authority. Client never sees private key. 60s timeout with countdown bar; idempotency-key dedup so retries don't double-sign.

4. **Lazy-require for jest compatibility** — every service that touches `react-native-mmkv` / `react-native AppState` / `expo-sensors` lazy-requires inside boot/eval functions, so jest pure-Node test runner imports the module without crashing on RN dependencies. 

5. **petCompanionSettings/v1 wrapper namespace** — instead of moving the 9 underlying stores (agenticCommerce / reverseCalls / formVariant / pushChannels / quietHours / voiceGreet) into a single Zustand slice, wave 15 ships a thin read+patch wrapper that exposes them as one mental model while preserving the bus + cron + intent wiring of the underlying primitive stores.

6. **MCP reverse calls return "approval-pending"** — backend tools never invoke platform intents directly. Tool execute returns `{ status: 'approval-pending', platform, args }`. Mobile dispatcher catches `system.*` results, runs through user approval gate via ApprovalAlertCapsule + 60s wait, only then dispatches `Linking.openURL`. Outcome feedback flows back to LLM via the next tool result.

7. **Companion ball wraps, doesn't replace, GlobalFloatingBall** — 1084-line legacy ball has 8 months of stable PanResponder + wake-word + capsule logic. CompanionBall is a 200-line wrapper that adds cross-tab visibility logic + signing lock + low-power detect, and forwards single-tap / long-press via new `onSingleTapOverride` / `onLongPressOverride` props (back-compat: undefined = legacy nav behavior).

## Velocity Window Compliance

Per AGENTS.md velocity window policy (until go-live freeze), all of the following were auto-approved without per-action confirmation:
- Backend SSH deploys (16x `git pull + npm run build + pm2 restart`)
- Migrations (`1795000000000` + `1796000000000`)
- Feature branch pushes to `CutaGames/Agentrix`

Manual confirmations (per the policy's `Still requires user confirmation` list) were not invoked because:
- No production data was destroyed
- No `main` push happened
- No financial decision over $500
- No partnership/PII export

## Phase 2 Roadmap (Documented in tasks.md + runbook)

The native code that requires an EAS rebuild stays the only meaningful deferred work:
- T12.1 iOS PetCompanionActivity.swift Live Activity extension
- T13.1/13.2 Android CompanionOverlayService.kt + RN bridge
- T14.1/14.2 native iOS App Intents + Android actions.xml for the 5 new wave-9 intents
- T17.1 native system-wake-word detection that calls `suspendSelfWakeWord(8000)`
- T23.2/23.4 native notification large icon + App icon (商店审核)

Everything else in the spec is shipped behind the flag at 0%, ready to ramp the moment the team chooses.

## Go-Live Decision Surface

The product owner now has 4 lever positions:
- **0%** (current) — All users see legacy IA. Zero risk. Hold here while observing.
- **1%** — Cohort hash buckets ~1% of users into the new IA. Minimum-risk ramp.
- **10%** / **50%** / **100%** — Larger ramps via the SQL one-liner in the runbook.

`CompanionFeatureFlagService.invalidateCache()` exists if a future ops dashboard needs to bypass the 60s cache TTL.
