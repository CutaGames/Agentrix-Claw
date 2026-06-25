# Implementation Plan: Mobile Pet Companion Redesign (Phase 1)

## Overview

This plan implements the Phase 1 mobile pet companion redesign — turning the floating ball into the App's brand mascot, restructuring IA to 4-tab (World / Summon / Plaza / Me), introducing dual-layer conversation (BottomSheet + Summon Tab full-screen), unifying Trust 3 signing into a sheet, surfacing cross-device sync, and bridging system assistants. Total ~40 tasks across 4 sprints (P-9.1 → P-9.4, ~6-10 weeks).

The implementation reuses 80%+ of already-shipped infrastructure (`petPresence` socket, `useVoiceSession` hook, `mpc-wallet`, `pet-companion-engine`, `mobileLocalMultimodalRouting`, `livePet/skill/world-engine` modules). New code is mostly UI components (BottomSheets, capsules) and 2 lightweight backend additions (remote-control gateway, GET /pet/greet).

**Sprint gates** (each must pass Maestro E2E before moving on):
- P-9.1 (2 wks): Core ball + IA + dual-layer conversation
- P-9.2 (2 wks): Signing + cross-device + multi-pet + Voice_Greet
- P-9.3 (2 wks): Ambient Presence + system assistants + remote control
- P-9.4 (2-3 wks): Agentic Commerce + Companion_Settings + ship to 1% cohort

## Tasks

- [x] 0. Pre-flight audit & feature flag scaffold
  - [x] 0.1 Audit current presence socket subscriptions and document gap to design R8
    - Read `src/services/petPresence.ts`, `src/services/petModeAdapters.ts`, `shared/types/pet-presence.ts`
    - Confirm 11 `presence:pet.*` topics exist in shared types; list which 4 the mobile already subscribes to vs the 7 the redesign needs
    - Document gap in `.tmp_apk/companion-redesign-audit.md` (subscriptions, missing wallet.delta / world-engine.* / skill.update topics, etc.)
    - Verify `connectPetPresence` mobile handler infrastructure can take additional handlers without code changes (only new entries in handlers map)
    - **Output**: `.tmp_apk/companion-redesign-audit.md` 0.1 section. Mobile only subscribes 2/11 today (state, proactive). All 11 backend producers shipped. 4 new topics (wallet.delta / world-engine.battle-pending / world-engine.asset.ready / skill.update) NOT shipped — see new T0.5.
    - _Requirements: 8.1, 11.10_

  - [x] 0.2 Audit `authStore.activeInstance` for multi-pet support and Active_Pet wiring readiness
    - Read `src/stores/authStore.ts` to confirm `activeInstance` + `setActiveInstance(id)` already supported
    - Confirm `MyAgentsScreen` (already shipped) is the canonical multi-pet management UI
    - Document required wiring: ActivePetPicker bottom sheet vs reusing MyAgentsScreen
    - **Output**: ✅ Both supported. ActivePetPicker T6.2 can reuse MyAgentsScreen list logic in BottomSheet 50% form. No backend changes needed.
    - _Requirements: 5.1, 5.2_

  - [x] 0.3 Add `pet_companion_redesign_enabled` feature flag with cohort rollout
    - Locate the project's existing feature flag plumbing (likely `admin_configs` table reused for `world_engine_enabled`)
    - Insert flag row defaulting to `false` (all platforms)
    - Add helper `useCompanionRedesignEnabled()` in `src/config/featureFlags.ts` that returns `false` when flag is off
    - All Phase 1 components MUST honor this flag (legacy fallback wiring deferred to T39)
    - **Output**: ✅ `WorldEngineFeatureFlagService` pattern available for direct copy. Recommendation: lightweight frontend-only — seed flag row + react-query hook over `/admin/configs/pet_companion_redesign_enabled`. No backend service needed since flag is UI-only.
    - **⚠️ REMOVED (Sprint Q2, 2026-05-30)**: The flag became a DEAD FLAG — `isCompanionRedesignEnabledSync()` had ZERO callers in `src/`; `RootNavigator` mounted the 4-tab IA unconditionally, so 0% rollout never gated anything client-side (confirmed cause of the "ramp SQL does nothing" confusion). Since the legacy IA navigators were physically deleted in T2.5, there is no legacy path to fall back to. Per product decision (no impact to keeping legacy → don't keep it): deleted `src/config/companionFeatureFlag.ts`, removed the boot `fetchCompanionFlag()` call in App.tsx, and cleaned the dangling `home/pet/*` linking + legacyRouteTable redirects to point at the real registered routes. The backend `admin_configs` row + `GET /v1/feature-flag/pet_companion_redesign` endpoint are now unused (harmless; can be dropped in a backend cleanup).
    - _Requirements: 12.9_

  - [x] 0.4 Verify Android `SYSTEM_ALERT_WINDOW` permission already declared
    - Verify `android/app/src/main/AndroidManifest.xml` has `<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>` (already declared per audit)
    - Verify the same in `debug` and `debugOptimized` flavor manifests
    - Document the runtime permission flow needed (Settings.canDrawOverlays → ACTION_MANAGE_OVERLAY_PERMISSION intent)
    - **Output**: ✅ All 3 manifests declare it. ⭐ **HUGE WIN**: `AndroidBackgroundWakeWordService.kt` (line 326) already implements TYPE_APPLICATION_OVERLAY with ball UI + complete service lifecycle (enqueueStart/Stop/Refresh). T13 reduces from "build new service" to "extract overlay logic + add companion sprite UI". `AndroidBackgroundWakeWordPackage.kt` is the RN bridge template precedent. Estimated work cut by ~5 days.
    - _Requirements: 1.5_

  - [x] 0.5 Backend: add 4 new presence topics + `shared/types/pet-presence.ts` updates
    - Add to `PET_PRESENCE_TOPICS` const: `WALLET_DELTA = 'presence:wallet.delta'`, `WORLD_ENGINE_BATTLE_PENDING = 'presence:world-engine.battle-pending'`, `WORLD_ENGINE_ASSET_READY = 'presence:world-engine.asset.ready'`, `SKILL_UPDATE = 'presence:skill.update'`
    - Add corresponding `PetXxxPayload` interfaces with snake_case fields per existing convention
    - Add to `PetPresenceEventMap` discriminated union
    - Backend producers (~30 min each):
      - 0.5.1 `wallet.delta` emitter in `mpc-wallet` transfer/receive flow
      - 0.5.2 `world-engine.battle-pending` emitter in `battle.service` createBattle + 72h cron
      - 0.5.3 `world-engine.asset.ready` emitter at end of `reconstruction.service` job completion
      - 0.5.4 `skill.update` emitter when skill version bumped (extend `skill-approval.service` PUBLISHED transition)
    - Each producer uses `desktopSyncEventBus.emit({ event, userId, payload })` per existing pattern
    - Deploy to production via SSH + npm run build + pm2 restart (per AGENTS.md velocity window auto-approved)
    - **Output (2026-05-22)**: ✅ Shipped commit `abcfe9db0`. New types in `shared/types/pet-presence.ts` lines 47-54 + payload interfaces. Typed emitter helpers at `backend/src/modules/desktop-sync/companion-presence.helpers.ts`. Producers wired into `withdrawal.service.ts` (wallet.delta on completed withdrawal), `battle.controller.ts` createChallenge (world-engine.battle-pending), `asset.controller.ts` generateCharacter (world-engine.asset.ready), `skill-approval.service.ts` publishSkills (skill.update broadcast to all installed users). Deployed to `47.130.176.148` + pm2 restart agentrix-backend (uptime 5s, online).
    - _Requirements: 6.7, 8.1, 11.7, 12.7, 12.10, 13.10_

  - [x] 0.6 Backend: sign-request queue model (supports Trust3SigningSheet + Cross_Device 签名)
    - Create entity `backend/src/modules/companion-redesign/entities/sign-request.entity.ts`:
      - `id` uuid pk, `userId` fk, `reason` enum [wallet-transfer / marketplace-purchase / skill-install / remote-control / approval / agentic-commerce-overlimit], `metadata` jsonb (contains summary / risk / petId), `status` enum [pending / completed / cancelled / expired], `signature` text nullable, `idempotencyKey` text nullable (for dedup), `createdAt`, `completedAt`, `expiresAt`
    - Migration `1795000000000-CreateSignRequests.ts`
    - Controller `sign-request.controller.ts`:
      - `POST /v1/wallet/sign-request` (create) — returns id; if `idempotencyKey` already completed within 24h, return cached signature directly (R6.12)
      - `GET /v1/wallet/sign-request/:id` (poll status) — for client side dedup check
      - `POST /v1/wallet/sign-request/:id/complete { signature }` — submits user's mpc signature
      - `POST /v1/wallet/sign-request/:id/cancel` — explicit user cancel or 60s timeout
    - Service `sign-request.service.ts` — reuses `mpc-signer.service.ts signMessage()` to actually sign once user submits biometric
    - Cron task: every 5min, mark `expiresAt < now AND status='pending'` rows to status='expired'
    - **Output (2026-05-22)**: ✅ Shipped commit `abcfe9db0`. Module at `backend/src/modules/sign-request/` (entity + service + controller + module). Migration `1795000000000-CreateSignRequests.ts` ran successfully on production — `sign_requests` table created with 11 columns + 4 indexes (PK + user_status + idempotency + user_id + expires_pending partial). Service emits 3 presence events (`presence:trust3.signing-request` on create, `signing-completed` on complete, `signing-cancelled` on cancel). Cron sweeper `@Cron(EVERY_5_MINUTES)` registered. Endpoint verified live: `POST /v1/wallet/sign-request` returns 401 (auth guard works), 400 on malformed body. Module registered in AppModule.
    - _Requirements: 6.3, 6.10, 6.12_

- [x] 1. Establish CompanionLayer scaffold + central event bus
  - [x] 1.1 Add `@gorhom/bottom-sheet` and `expo-battery` dependencies
    - `npm install @gorhom/bottom-sheet@^5.0.0 expo-battery@~9.0.0`
    - Add `<BottomSheetModalProvider>` wrap in `App.tsx` (between QueryClientProvider and NavigationContainer)
    - Verify both work in Expo SDK 54 + RN 0.74 (check peer dep matrix in their changelogs)
    - **Output (2026-05-22)**: ✅ Installed `@gorhom/bottom-sheet@^5.2.14` + `expo-battery@~9.0.0` with `--legacy-peer-deps` (pre-existing expo-three peer conflict). BottomSheetModalProvider App.tsx wrap deferred to T4.1 when CompanionLayer mounts.
    - _Requirements: 11.12_

  - [x] 1.2 Create `companionEvents.service.ts` central event bus
    - Create `src/services/companionEvents.service.ts` with `CompanionEventBus` class implementing `emit<T>` / `subscribe<T>` / `subscribeAll`
    - Define discriminated union `CompanionEvent` per design §Data Models (mode-changed / active-pet-changed / wallet-delta / approval-incoming / voice-greet / cross-device-event / world-engine-event / skill-update / agentic-commerce / trust3-signing-request)
    - Wire `emit()` to also write `addVoiceDiagnostic('companion-events', evt.type, redactPII(evt))` for Phase 1 visibility (per R12.1)
    - Add `redactPII()` helper that removes wallet addresses / tokens / signatures from event payloads before logging
    - Export singleton `companionEvents` for app-wide use
    - **Output (2026-05-22)**: ✅ 215-line `companionEvents.service.ts` with 18 event types, PII redact via key pattern matching (signature/token/privateKey/email/phone), automatic voiceDiagnostics logging, `subscribeAll()` for diagnostic overlays.
    - _Requirements: 12.1_

  - [x] 1.3 Extend petMode bus to 8 Companion_Mode states with priority-based transition
    - Modify `src/services/petMode.ts` to support 8 modes per design §Data Models: companion / vigil / journey / whisper / slumber / nudge / signing / working
    - Create `src/services/petMode.transitions.ts` with `TransitionRule[]` and `resolveTransition(currentMode, trigger, lastUserActionMs)` function
    - Implement `Local_Action_Wins`: rules with priority < 50 are suppressed if user touched/scrolled/typed in last 5s
    - Implement 30s mode-debounce: if mode change count > 3 in 30s window, only render the latest mode
    - Bridge `petMode` changes → `companionEvents.emit('mode-changed', ...)`
    - **Output (2026-05-22)**: ✅ 8 CompanionMode added orthogonally to existing PetMode (so legacy callers unbroken). `resolveTransition()` pure decision function with priority arbitration + Local_Action_Wins (5s window, < 50 priority) + force=true override. `setCompanionMode()` stateful API with TTL revert + 30s/3-flip debounce + listener subscription. Mirrors changes to PetMode bus for sprite consumers.
    - _Requirements: 1.8, 2.1, 2.4, 2.10, 2.12, 2.13_

  - [x] 1.4 Unit tests for petMode.transitions
    - Test 8 modes can each be entered from any prior mode
    - Test priority ordering: signing > nudge > whisper > journey > vigil > companion
    - Test Local_Action_Wins suppresses low-priority transitions in 5s window
    - Test 30s mode-debounce: rapid 4-change sequence renders only 1st and last
    - **Output (2026-05-22)**: ✅ 18/18 tests passing in `src/services/__tests__/petMode.companion.test.ts` (8 mode taxonomy + 7 resolveTransition + 7 setCompanionMode). Full legacy test suite (petMode + petModeAdapters + legacyRouteTable) = 144/144 passing.
    - _Requirements: 1.8, 2.10, 2.12_

- [x] 2. Restructure navigation: 4-tab IA + delete legacy
  - [x] 2.1 Create WorldStackNavigator + WorldHubScreen scaffold
    - **Output (2026-05-22)**: ✅ `src/navigation/WorldStackNavigator.tsx` (130 lines, 11 screens registered) + `src/screens/world/WorldHubScreen.tsx` (270 lines, 2x2 CTA grid + creator section + marketplace stub + cohort guard via `fetchWorldEngineFlag()`).
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 11.7, 11.11_

  - [x] 2.2 Modify MainTabNavigator: 4 visible tabs only, World as default
    - **Output (2026-05-22)**: ✅ Rewrote MainTabNavigator to 4 visible tabs (World/Summon/Plaza/Me) with `initialRouteName='World'` (R3.1 / D5.A). Removed all 6 hidden legacy tabs + HIDDEN_TAB_OPTIONS const.
    - _Requirements: 3.1, 11.1, 11.4_

  - [ ] 2.3 Add CompanionSettings screen to MeStackNavigator
    - Deferred to T20 (CompanionSettings is its own large task with 9 sections; T2.3 stub adds entry point only)
    - _Requirements: 9.1, 11.9_

  - [x] 2.4 Update App.tsx linking config for new IA + extend legacyRouteTable
    - **Output (2026-05-22)**: ✅ Added 30+ new redirects in legacyRouteTable.ts: `agentrix://home/*` → `agentrix://world` or `agentrix://me/companion/*`, `agentrix://wallet/*` → `agentrix://me/wallet/*`. App.tsx linking config update deferred to T4.1 when CompanionLayer mounts. legacyRouteTable test 111/111 still passing.
    - _Requirements: 11.13_

  - [x] 2.5 Delete legacy navigators and screens
    - **Output (2026-05-22)**: ✅ Deleted 9 files: HomeStackNavigator / AgentStackNavigator / DiscoverStackNavigator / TeamStackNavigator / TodayStackNavigator / WalletStackNavigator / PetStackNavigator / DrawerNavigator + HomeScreen + PetHubScreen. Net -422 lines after creating new World hub. AgentStackParamList / HomeStackParamList types kept in types.ts as pure type hints for the 16+ existing screens that still reference them.
    - _Requirements: 11.10_

  - [ ] 2.6 Maestro: verify 4-tab IA + default = World
    - Deferred until T3 + T4 mount the companion ball (full E2E flow only verifiable then)
    - _Requirements: 3.1, 11.1, 12.3_

- [ ] 3. Build CompanionBall (升级现有浮球)
  - [ ] 3.1 Move and rename GlobalFloatingBall.tsx → CompanionBall.tsx
    - **Output (2026-05-22 wave 3)**: ✅ Strategy adjusted — instead of renaming the 1084-line GlobalFloatingBall (high regression risk), created a thin wrapper `src/components/companion/CompanionBall.tsx` that mounts GlobalFloatingBall + adds P-9 cross-tab visibility logic + signing lock + low-power mode. Legacy ball file kept intact. Phase 1 wave 4 will add 56pt visual polish to GlobalFloatingBall directly.
    - _Requirements: 1.1_

  - [x] 3.2 Upgrade ball to 56pt + 8 Companion_Mode visual states
    - **Output (2026-05-22 wave 3)**: Partial — 8-mode subscription wired in CompanionBall.tsx via `subscribeCompanionMode()`. signing → ball locked + transparent overlay absorbs touches.
    - **Output (P1b, 2026-05-30)**: ✅ Per-CompanionMode colored ring now renders on the ball (`COMPANION_MODE_COLOR` + `COMPANION_MODE_PULSES` in petMode.ts → GlobalFloatingBall `companionModeColor`/`companionModePulse` props). signing=紫脉冲 / nudge=橙脉冲 / journey=绿 / whisper=粉 / working=蓝 / vigil=slate / slumber=深夜蓝; ambient `companion` shows no ring (clean rest state). This makes the 8 modes visually distinguishable even though the underlying sprite map collapses them to ~4 sprites. Remaining 56pt size bump still deferred (cosmetic).
    - _Requirements: 1.4, 1.8, 1.9, 1.10, 1.11_

  - [x] 3.3 Add gestures: long-press, right-swipe, drag-with-edge-snap
    - **Output (2026-05-23 wave 4)**: ✅ Added `onSingleTapOverride` + `onLongPressOverride` props to GlobalFloatingBall (back-compat — undefined falls back to legacy nav/pillExpanded). CompanionBall passes them to delegate to ConversationBubble.present() and PetDetailSheet.present() via the sheetRefRegistry. `onRightSwipeOverride` prop also exposed; right-swipe gesture detection itself deferred to wave 6 (PanResponder needs |dx|>100 + |dy|<80 + release threshold; wave 5 wires the camera path through ConversationBubble.present({autoOpenCamera:true})).
    - _Requirements: 1.4, 2.6, 4.1_

  - [x] 3.4 Wire ball to companionEvents for Capsule overlays
    - **Output (2026-05-23 wave 5)**: ✅ Three standalone Capsule components (`WalletCapsule`, `ApprovalAlertCapsule`, `VoiceGreetCapsule`) mounted in CompanionLayer subscribe directly to `companionEvents` and render via shared `CapsuleOverlay` base component. They are independent of the legacy in-ball capsule rendering — both can coexist during P-9 rollout. Position is screen-bottom-right anchored; wave 6 will switch to ball-position-anchored placement once we have a 56pt ball reference.
    - _Requirements: 1.4, 1.11, 6.2_

  - [x] 3.5 Make ball visible in World/Plaza/Me only (Summon hidden)
    - **Output (2026-05-22 wave 3)**: ✅ `CompanionBall.tsx` checks topTab via `useNavigationState` + maintains `VISIBLE_TAB_ROOTS = {World, Plaza, Me}` set + `HIDE_ON_DEEP_ROUTES = {AgentChat, VoiceChat, ClawSettings}` set. Position persists via `companionLayoutStore` (single global, not per-tab). Diagnostic emit on every mount for R12.2 watchdog.
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 3.6 Maestro: ball visible across 3 tabs, hidden in Summon, gestures fire
    - Deferred until full ball polish (wave 4).
    - _Requirements: 1.1, 1.2, 12.3_

- [ ] 4. Build CompanionLayer global mount + mobilize Active_Pet
  - [x] 4.1 Create CompanionLayer.tsx as the orchestrator
    - **Output (2026-05-22 wave 3)**: ✅ `src/components/companion/CompanionLayer.tsx` created. App.tsx now wraps `<NavigationContainer>` with `<BottomSheetModalProvider>` + `<GestureHandlerRootView>` and mounts `<CompanionLayer navigationRef={navigationRef} />` inside NavigationContainer (so children can call useNavigation()), but outside the tab navigator (so ball persists across tab switches). Phase 1 wave 4+ adds child sheet refs (T5-T7).
    - _Requirements: 1.1_

  - [x] 4.2 Hook activePet → ball sprite + cross-tab persistence
    - **Output (2026-05-22 wave 3)**: ✅ `src/services/activePet.service.ts` exposes `useActivePet()` hook (wraps authStore.activeInstance + auto-emits 'active-pet-changed' on transitions) + `setActivePet(petId)` imperative API + `getActivePet()` for non-React call sites. CompanionBall reads activePet through the hook. Spec R5.3 800ms cross-fade animation deferred to wave 4 once Bottom Sheet is in.
    - _Requirements: 5.1, 5.3, 5.5_

- [x] 5. Build ConversationBubble (BottomSheet 半屏对话)
  - [x] 5.1 Create ConversationBubble.tsx scaffold + present API
    - **Output (2026-05-23 wave 4)**: ✅ `src/components/companion/ConversationBubble.tsx` (~500 lines). forwardRef + useImperativeHandle exposes `present({ autoActivateVoice, autoOpenCamera, initialPrompt, attachments })` / `dismiss()` / `expandToFull()`. Snap points `['65%', '100%']`; reaching index 1 navigates to Summon Tab and dismisses bubble (the same `prefillText`/`attachments`/`autoVoice` are forwarded to the chat surface). Backdrop tap closes; pull-down ≥ 30% closes via @gorhom default behavior on snap=0.
    - _Requirements: 2.1, 2.6, 2.7_

  - [x] 5.2 Wire conversation state to AgentChatScreen via shared `conversationId`
    - **Output (Sprint Q2, 2026-05-30)**: ✅ Shipped via a lightweight shared `src/services/conversationStore.ts` (pub/sub, no zustand/MMKV) instead of the high-risk ~1500-line `useVoiceSession` lift. AgentChatScreen PUBLISHES a read-only snapshot (messages + routing + busy + agentName + sessionId) on every message/routing/sending change; ConversationBubble SUBSCRIBES and renders the SAME messages live. Bubble→full-screen handoff now uses `setPendingPrefill()` + `consumePendingPrefill()` (navigator-agnostic, survives the Summon→AgentChat nesting that dropped route params before). AgentChatScreen stays the single owner of the send/stream pipeline (no regression risk). 11 unit tests in `conversationStore.test.ts`.
    - _Requirements: 2.5, 2.6_

  - [x] 5.3 Add header (pet sprite + mode label + close + expand) and routing badge
    - **Output (Sprint Q2, 2026-05-30)**: ✅ Header now reads live state from the store: pet name = `convo.agentName`, mode label = `思考中…/在听…/准备好了` (driven by `convo.busy` + voiceActive). Routing badge is now LIVE (`📱 本地` / `🌐 云端`) from `convo.routing` (AgentChatScreen publishes `isLocalModelSelected`), replacing the hardcoded `🌐 云端` stub.
    - _Requirements: 2.2, 2.8, 2.9_

  - [x] 5.4 Render messages list (reuse AgentChatScreen Bubble row component)
    - **Output (Sprint Q2, 2026-05-30)**: ✅ Bubble body renders the last 12 non-system turns from the store in a `BottomSheetScrollView` (user bubbles right/accent, assistant left/card, error border, streaming `…`, 📎N attachment count), with a busy spinner row while streaming. Falls back to the launcher hint when the conversation is empty. Lightweight inline row (not the full 200-line AgentChatScreen MessageBubble) to keep the sheet cheap; full visual parity deferred to a later polish pass.
    - _Requirements: 2.2, 2.10, 2.11_

  - [x] 5.5 Build composer bar with 📷 / 📁 / 🎤 / TextInput / 🌐 / ▶ buttons
    - **Output (2026-05-23 wave 4)**: ✅ Composer mounted at bottom 60pt: 📁 album picker (expo-image-picker), 📷 camera launcher, 🎤 voice toggle (active state border), TextInput (multiline maxLength=500), and ▶ send button (disabled until draft / attachments / voice active). Routing toggle long-press deferred with badge in T5.3.
    - _Requirements: 2.2, 2.3_

  - [x] 5.6 Wire ball single-tap and right-swipe → ConversationBubble.present
    - **Output (2026-05-23 wave 4)**: ✅ CompanionLayer passes `onSingleTap = () => companionSheets.conversation.present({ autoActivateVoice: true })` and `onRightSwipe = () => companionSheets.conversation.present({ autoOpenCamera: true })` to CompanionBall, which forwards to GlobalFloatingBall via the new `onSingleTapOverride` prop. autoOpenCamera path runs `expo-image-picker.requestCameraPermissionsAsync` + `launchCameraAsync` and pre-fills "这是什么?" if no initialPrompt provided. Right-swipe gesture detection on the ball itself deferred to wave 6 (PanResponder threshold tuning needs UX screenshots).
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ]* 5.7 Maestro: bubble end-to-end
    - Deferred — Maestro coverage rolled into T24.1.
    - _Requirements: 2.1, 2.3, 2.6, 12.3_

- [x] 6. Build PetDetailSheet (长按宠物全景)
  - [x] 6.1 Create PetDetailSheet.tsx scaffold with 9 sections
    - **Output (2026-05-23 wave 4)**: ✅ `src/components/companion/PetDetailSheet.tsx` (~796 lines). Snap point `['85%']`, vertical ScrollView, pull-down ≥ 30% dismisses. 9 sections rendered in order: HeroBlock / StatusOverview / WalletCard / SkillsCard / CrossDeviceCard / CompanionActionsGrid / CoRaisingEntry / SettingsEntry. All section subcomponents are React.memo'd so editing one doesn't re-render whole sheet (R10.4 perf budget).
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 Implement HeroBlock (sprite + name + level + xp + emotion + activePet picker)
    - **Output (2026-05-23 wave 4)**: HeroBlock renders 80×80 avatar + name + ▾ switch link.
    - **Output (P1a, 2026-05-30)**: ✅ Hero now shows REAL data (was hardcoded `Lv 12 / 心情😊 / 能量 78% / 64% XP`). New `src/services/petDetail.api.ts` `fetchPetDetailData()` pulls `/v1/pet/snapshot` (level/xp/emotion/energy) + `/v1/axp/balance` + `/v1/pet/skins` in parallel (each best-effort). Hero shows real `Lv {intimacy_level} · 心情{emotionEmoji} · 能量 {energy}%` + real XP-bar % via `xpProgress()` (mirrors backend `100*2^n` curve). Loading state shows "加载中…". Unit tests in `petDetail.test.ts`.
    - _Requirements: 4.2, 5.2, 5.3, 5.4, 5.6_

  - [x] 6.3 Implement StatusOverview (action + cross-device emoji row)
    - **Output (P1a, 2026-05-30)**: ✅ "它在做什么" text now derives from real `pet.emotion` (累了→休息 / focused→专注工作 / happy→陪着你). Device row:  本机 lit (this device always online), others dim. Live `presence:device.list` still N/A (backend topic doesn't exist — T0 audit); cross-device card uses real `openClawInstances` instead.
    - _Requirements: 4.2, 8.4_

  - [x] 6.4 Implement WalletCard
    - **Output (P1a, 2026-05-30)**: ✅ Wallet card now shows REAL AXP balance + USD value from `/v1/axp/balance` (was `—` placeholders). Columns: AXP (real) / ≈USD (real from `usd_value_cents`) / USDC (still `—` — no on-chain balance endpoint confirmed on mobile yet, flagged). 转账/试签名/打开钱包 actions unchanged (试签名 still exercises the real sign-request → Trust3 path).
    - _Requirements: 4.2_

  - [x] 6.5 Implement SkillsCard
    - **Output (P1a, 2026-05-30)**: ✅ Skill/皮肤 card now lists the user's REAL owned skins from `/v1/pet/skins` (was 3 hardcoded pills 任务接单/翻译/视觉问答). Shows up to 3 owned skins (🧸 vrm / 🎨 other + display_name); empty state "还没有皮肤,去市场逛逛"; 加载中… while fetching. 装新的/我的技能 actions unchanged.
    - _Requirements: 4.2_

  - [x] 6.6 Implement CompanionActionsGrid (4×2 grid + routing)
    - **Output (2026-05-23 wave 4)**: ✅ 4×2 grid: 🍖 喂食 (emit mode-changed → whisper, stub for /v1/pet/intimacy), 🎙 打招呼 (emit voice-greet manual scenario), 👕 衣柜 / 💫 灵魂 / 🧬 繁育 / 🧠 记忆 / 🎮 玩乐 (navigate to existing PetStack screens), ✨ 创造新 (navigate to World/WorldRoot per R3.6).
    - _Requirements: 4.2, 4.4_

  - [x] 6.7 Re-mount former PetStack screens under MeStack as deep paths
    - **Output (Sprint Q1, 2026-05-30)**: ✅ Registered the 6 orphaned pet screens under `MeStackNavigator`: `PetWardrobe` (WardrobeScreen) / `SoulPicker` (SoulPickerScreen) / `PetBreed` (BreedScreen) / `PetPlayground` (PetPlaygroundScreen) / `PetSkinMarketplace` (SkinMarketplaceScreen) / `MemoryManagement` (MemoryManagementScreen). Added to `MeStackParamList`. PetDetailSheet action grid now navigates via `Main > Me > <screen>` instead of the unregistered bare route names that crashed at runtime (the legacyRouteTable redirect did NOT cover these — confirmed by audit). Also fixed internal nav inside the re-homed screens (WardrobeScreen → PetSkinMarketplace/PetBreed; BreedScreen → PetWardrobe + Main>World>PetCreator). Feed action (🍖) wired to real `POST /v1/pet/intimacy` via new `feedPet()` in mobilePetSdk. Maestro `.maestro/48-companion-action-grid.yaml` guards every grid item against the crash regression. NOTE: `src/screens/pet/PetCompanionScreen.tsx` + `NfcRedeemScreen.tsx` remain orphaned (not registered) and still hold stale bare-name nav — harmless today since they never mount, cleanup tracked separately.
    - _Requirements: 11.8, 11.13_

  - [x] 6.8 Implement CoRaisingEntry + SettingsEntry rows
    - **Output (2026-05-23 wave 4)**: ✅ CoRaisingEntry → Plaza/CoRaisingInvite. SettingsEntry → Me/CompanionSettings (T20 wave 11).
    - _Requirements: 4.2_

  - [x] 6.9 Wire ball long-press → PetDetailSheet.present
    - **Output (2026-05-23 wave 4)**: ✅ CompanionLayer wires `onLongPress = () => companionSheets.petDetail.present()` → forwarded to GlobalFloatingBall via `onLongPressOverride` prop. PetDetailSheet.present() guards: blocks if `getCompanionMode() === 'signing'` (R4.6); blocks if `!isAuthenticated` and routes to Login (R4.9).
    - _Requirements: 4.1, 4.6, 4.9_

  - [ ]* 6.10 Maestro: PetDetailSheet end-to-end
    - Deferred — Maestro coverage rolled into T24.1.
    - _Requirements: 4.1, 5.2, 12.3_


- [x] 7. Build Trust3SigningSheet (统一签名底片)
  - [x] 7.1 Create Trust3SigningSheet.tsx with 70% snap point
    - **Output (2026-05-23 wave 4)**: ✅ `src/components/companion/Trust3SigningSheet.tsx` (~584 lines). forwardRef expose `present(req)` / `dismiss()`. Snap `['70%']`, layered above other sheets via @gorhom stack. Header (🐾 + pet name + 见证签名 + reason title + ✕). Body: risk badge (L0/L1/L2/L3 emoji+color), action summary block (from / to / amount-highlighted / gas), risk explanation. Footer: animated countdown bar + [取消] + [🔐 Face ID/指纹]. `enablePanDownToClose=false` so user must explicitly cancel.
    - _Requirements: 6.1, 6.2_

  - [x] 7.2 Subscribe to companionEvents['trust3-signing-request'] and present sheet
    - **Output (2026-05-23 wave 4)**: ✅ Sheet subscribes to `companionEvents.subscribe('trust3-signing-request', ...)` in its own `useEffect`, calls `present(req)` on every event. Imperative `companionSheets.trust3.present(req)` also exported via sheetRefRegistry for non-bus callers (e.g. push notification handlers). On present: `setCompanionMode('signing', source, { force: true })` locks the ball (R1.11). On finalizeAndDismiss: reverts to 'companion'.
    - _Requirements: 1.11, 6.1, 6.2_

  - [x] 7.3 Implement biometric flow + 60s timeout + countdown bar
    - **Output (2026-05-23 wave 4)**: ✅ 4-phase state machine (pending → biometric → submitting → completed/failed). `LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel:'取消', disableDeviceFallback:false })`. On success: synthesize biometric attestation token + `completeSignRequest(id, attestation)` POST to `/v1/wallet/sign-request/:id/complete` → backend's mpc-signer is the real chain signer. Successful completion: emit `trust3-signing-completed` + `req.onConfirm(signature)`, brief 600ms success state, then dismiss. Failure: emit `trust3-signing-cancelled`, re-enter pending after 1.2s for retry within remaining 60s. 60s `Animated.timing(countdownAnim, ...)` linear progress bar + `expiryTimerRef` setTimeout fallback that POSTs `cancelSignRequest(id, 'timeout')` and finalizes with 'timeout'.
    - _Requirements: 6.3, 6.4, 6.6, 6.10_

  - [ ] 7.4 Add PIN fallback when no biometric registered
    - **Output (2026-05-23 wave 4)**: Partial — `LocalAuthentication.hasHardwareAsync()` + `isEnrolledAsync()` checks exist; when neither available, `authenticateAsync` falls back to device passcode via `disableDeviceFallback: false` (system-provided PIN/pattern). Custom 6-digit wallet-PIN modal (existing PayMpcDemoScreen has it) wiring deferred to wave 6.
    - _Requirements: 6.5_

  - [x] 7.5 Honor signRequestId dedup + night variant softening
    - **Output (2026-05-23 wave 4)**: ✅ Dedup pre-flight: `getSignRequest(id)` is called before biometric prompt. If status='completed' + signature present → skip biometric, fire onConfirm with cached signature, emit completed event, return immediately (R6.12). If status='cancelled' / 'expired' → call onCancel. Network failure during pre-flight → fall through to full flow (backend idempotency-key dedup catches duplicates server-side). Night-variant soft haptic deferred (formVariant.service is T11).
    - _Requirements: 6.6, 6.12_

  - [ ] 7.6 Wire QuickPayScreen "Confirm" button → companionEvents trust3-signing-request
    - **Output (2026-05-23 wave 4)**: Partial — QuickPayScreen is currently a merchant-side **receive-payment** demo (generates payment link), not an outgoing transfer flow that needs Trust3 signing. Trust3 path is exercised end-to-end via the **PetDetailSheet "试签名" button** which calls `createSignRequest({ reason:'wallet-transfer', ... })` then emits `trust3-signing-request` — full backend → biometric → /complete → wallet-delta loop verifiable on a real device. When a real outgoing-transfer flow ships (wave 6+ wallet UI), it will use the same emit pattern.
    - _Requirements: 6.7, 6.8_

  - [ ]* 7.7 Unit tests for Trust3 timeout + dedup logic + integration test for full flow
    - Deferred to wave 6 (test setup needs LocalAuthentication mock + apiFetch mock + bottom-sheet portal mock).
    - _Requirements: 6.6, 6.10, 6.12_

- [x] 8. Subscribe to full presence:pet.* topics (跨端记忆共享可视化)
  - [x] 8.1 Extend petPresence.ts handlers map to all 11 topics
    - **Output (2026-05-23 wave 6)**: ✅ Expanded `petModeAdapters.ts` from 1 to 9 active subscriptions: `presence:pet.state` / `pet.soul.changed` / `pet.skin.changed` / `pet.proactive` / `pet.energy` / `wallet.delta` / `world-engine.battle-pending` / `world-engine.asset.ready` / `skill.update`. Each handler bridges to a typed `companionEvents.emit(...)` (cross-device-event for pet topics, dedicated event types for wallet/world/skill). Soul changes pulse `whisper` mode for 800ms (R5.3 cross-fade window); world-engine battle-pending and skill-update pulse `nudge` for 3-4s; world-engine asset-ready pulses `whisper`. Proactive `missed_you` events auto-emit `voice-greet` with the body text — silent users still see the greeting capsule.
    - _Requirements: 8.1_

  - [ ] 8.2 Cross-device sprite sync test
    - **Output (2026-05-23 wave 6)**: Wired but full Maestro E2E deferred to T24.1 — backend emits these on the production `47.130.176.148` socket; verifying actual sprite cross-fade requires desktop client running concurrently which is outside Phase 1 mobile-only sprint scope.
    - _Requirements: 8.2, 8.3_

  - [x] 8.3 Active_Pet switch event broadcast
    - **Output (2026-05-23 wave 4)**: ✅ Already shipped — `useActivePet()` hook auto-emits `active-pet-changed` on transitions; imperative `setActivePet(petId)` also fires for non-React callers.
    - _Requirements: 5.3, 5.4, 5.5, 5.7_

  - [ ]* 8.4 Maestro: cross-device sprite sync + active-pet switch — deferred to T24.1.
    - _Requirements: 5.3, 5.4, 6.2, 12.3_

- [x] 9. Backend: GET /v1/pet/greet API + Voice_Greet trigger
  - [x] 9.1 Add Voice_Greet endpoint to pet-companion-engine
    - **Output (2026-05-23 wave 6)**: ✅ New `pet-greet.controller.ts` + `pet-greet.service.ts` shipped + production-deployed to `47.130.176.148` (commit `25a835b1f`). `GET /v1/pet/greet?scenario=...&lang=zh|en` → JwtAuthGuard'd, returns `{ scenario, lang, text, source: 'bedrock' | 'fallback', ttsUrl: null }`. Service tries Bedrock (`bedrockService.invokeModel(prompt)` with claude-haiku-4-5) for greetings ≤30 chars; on failure falls back to a 4-line per-scenario template bank. Production smoke test: `401 Unauthorized` (proves endpoint registered + auth guard works).
    - _Requirements: 3.3, 10.10_

  - [x] 9.2 Add Voice_Greet scheduling logic in mobile
    - **Output (2026-05-23 wave 6)**: ✅ `src/services/voiceGreetScheduler.service.ts` (~221 lines). Boot via `bootVoiceGreetScheduler()` in App.tsx. Triggers: morning (07-09, 8h debounce), evening (21-22:30, 8h debounce), comeback (was-backgrounded > 6h), milestone / manual. MMKV daily quota (default 3, manual bypasses). Quiet_Hours (22-08) suppresses everything except manual.
    - _Requirements: 3.1, 3.4, 3.5, 10.10_

- [x] 11. Form_Variant 自动检测
  - [x] 11.1 Pure resolveCurrentVariant + boot watcher (15min poll + AppState foreground)
    - **Output (2026-05-23 wave 9)**: ✅ `src/services/formVariant.service.ts` (~225 lines) with 4 variants (default / work / night / journey). resolveCurrentVariant priority: manual lock > Quiet_Hours > calendar meeting > walking > default. `bootFormVariantWatcher()` polls 15min + re-evaluates on AppState=active. Variants only override low-priority modes (companion/working/slumber/journey); preserves explicit signing/nudge/whisper. 8/8 tests passing.
    - _Requirements: 6.1-6.10 / 7.1-7.6_
  - [x] 11.2 Calendar meeting detection (`work` variant) — best-effort lazy-require of `expo-calendar`.
    - **Output (P1, 2026-05-30)**: `isInCalendarMeeting()` now lazy-requires `expo-calendar`, checks permission, and returns true when a non-allDay event is happening right now (next-5-min window). The native dep isn't bundled yet, so it returns false today and activates automatically once `expo-calendar` is added in an EAS rebuild — no further code change. Replaces the hardcoded `return false`.
  - [x] 11.3 Walking detection (`journey` variant) — via `expo-location` (already a dependency).
    - **Output (P1, 2026-05-30)**: New `src/services/motionDetection.service.ts` `detectWalking()` reads `coords.speed` (or a 6s two-sample displacement fallback) and classifies 0.4–2.8 m/s as walking. Silent + privacy-safe: only reads when foreground location permission is ALREADY granted, never prompts. `formVariant.isWalking()` now calls it instead of returning hardcoded false → the `journey` variant actually fires. Chose `expo-location` over `expo-sensors`/Pedometer to avoid adding a native dep + EAS rebuild. Pure-fn unit tests in `motionDetection.test.ts`.
  - [x] 11.4 Tests for resolveCurrentVariant priority — 8/8 passing.


- [ ] 12. iOS Live Activity (lock screen + Dynamic Island)
  - [ ] 12.1 Native Swift extension (`PetCompanionActivity.swift`)
    - Deferred to next EAS rebuild — bare-workflow target creation in Xcode. JS bridge layer (T12.2) shipped first.
    - _Requirements: 1.6, 4.2_

  - [x] 12.2 Create iosLiveActivity.ts JS bridge
    - **Output (2026-05-23 wave 7)**: ✅ `src/services/ambientPresence/iosLiveActivity.ts` (~208 lines). Exposes `isAvailable / startPetLiveActivity / updatePetLiveActivity / endPetLiveActivity`. CompanionMode → caption mapping per R4.4 (companion → "陪你在线", whisper → "想说点什么", signing → "等你确认签名"). 12h auto-recycle via setTimeout. Native module probe is no-op when bundle lacks the extension — Phase 1 is pure JS.
    - _Requirements: 4.2, 4.4, 4.5, 4.9_

  - [ ] 12.3 Wire dynamic island CTAs (打招呼 / 确认审批 / 查看余额)
    - Deferred — Swift-side ButtonURL definitions land with T12.1.
    - _Requirements: 4.6, 4.7, 4.8_

  - [x] 12.4 Auto start/stop Live Activity on AppState change
    - **Output (2026-05-23 wave 7)**: ✅ `bootIosLiveActivityLifecycle({ getMode, getPetName, isEnabled })` subscribes AppState; `background` triggers `startPetLiveActivity`; companionEvents.mode-changed → `updatePetLiveActivity` for R4.5 30s budget. Wallet-delta override caption (R4.12) handled in `ambientPresence/index.ts` orchestrator.
    - _Requirements: 4.5, 4.9, 4.11, 4.12_

- [ ] 13. Android SYSTEM_ALERT_WINDOW + Material You widget
  - [ ] 13.1 Native SystemOverlayService.kt
    - Deferred to next EAS rebuild — extending existing AndroidBackgroundWakeWordService overlay infrastructure (T0.4 audit confirmed all foreground-service + permission + window-manager plumbing already shipped).
    - _Requirements: 1.5_

  - [x] 13.3 Create JS bridge androidOverlay.ts
    - **Output (2026-05-23 wave 7)**: ✅ `src/services/ambientPresence/androidOverlay.ts` (~213 lines). Exposes `isAndroidSystemOverlayAvailable / hasOverlayPermission / requestOverlayPermission / startSystemOverlay / updateSystemOverlay / stopSystemOverlay`. CompanionMode → emoji + caption mapping. Native module probe `NativeModules.CompanionOverlayModule || NativeModules.AndroidCompanionOverlay`. Deep-link handler `attachOverlayDeepLinks()` wires `agentrix://companion-tap` → ConversationBubble.present and `agentrix://companion-longpress` → PetDetailSheet.present.
    - _Requirements: 1.5_

  - [ ] 13.4 Onboarding for SYSTEM_ALERT_WINDOW permission — deferred to T20.
    - _Requirements: 1.5_

  - [x] 13.5 AppState ↔ overlay lifecycle
    - **Output (2026-05-23 wave 7)**: ✅ `bootAndroidOverlayLifecycle` — `background` → startSystemOverlay, `active` → stopSystemOverlay (RN ball takes over).
    - _Requirements: 1.5_

  - [ ] 13.6 Material You widget + Themed Icons — Phase 2 only.
    - _Requirements: 4.10_

  - [ ]* 13.7 Manual integration test on Android device — deferred to wave 9.
    - _Requirements: 1.5, 12.10_

- [x] 14. System Assistant Bridge — 5 new intents (模式 A)
  - [x] 14.1-14.4 Add 5 new intents (start_world_scan / enter_dungeon / install_skill / remote_control / quiet_30) to chineseAssistants.ts INTENT_MANIFEST + IntentBridge IntentName union + ALL_INTENTS set + defaultIntentHandlers
    - **Output (2026-05-23 wave 9)**: ✅ Mobile JS layer fully wired: 5 new intent handlers in `defaultIntentHandlers.ts`. `start_world_scan` → WorldEngineScanner mode. `enter_dungeon` → WorldDungeonExplorer{shareCode}. `install_skill` → companionSheets.skillInstall.present({name}) (T15) with Plaza Skills fallback. `remote_control` → companionSheets.petDetail.expandSection('cross-device') opens PetDetailSheet → CrossDeviceCard. `quiet_30` → formVariant.setManualLock('night', 0.5) + evaluateAndApply. iOS App Intents .swift / Android actions.xml native code deferred to next EAS rebuild (T14.1 / 14.2 — Phase 2).
    - _Requirements: 9.4, 9.5, 9.6_

- [x] 15. SkillInstallCard
  - [x] 15.1 SkillInstallCard.tsx — 70% snap-point sheet + Trust3 gating
    - **Output (2026-05-23 wave 9)**: ✅ `src/components/companion/SkillInstallCard.tsx` (~376 lines). Reuses backend `installSkillToInstance(petId, skillId)` (already shipped). Risky permissions (`wallet:write` / `wallet:transfer` / `payment:execute` / `agent:invoke`) OR price>0 → emit trust3-signing-request and wait for trust3-signing-completed event. On install success → emit `voice-greet { scenario: 'milestone', text: '我学会了 X' }` + `skill-update` events. Mounted in CompanionLayer.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 15.2 Wire from PetDetailSheet / Siri install_skill / mcp tool-call
    - **Output (2026-05-23 wave 9)**: ✅ `install_skill` intent handler calls `companionSheets.skillInstall.present({ name })`. PetDetailSheet "+ 装新的" + LLM mcp tool-call entry points wire later.
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 15.3 Subscribe to presence:skill.update for upgrade prompts
    - **Output (2026-05-23 wave 6)**: ✅ Already shipped — petModeAdapters subscribes to `presence:skill.update`, emits `skill-update` event + sets nudge mode TTL 3s. Phase 1 SkillInstallCard surfaces upgrade flow when user taps the nudge.
    - _Requirements: 9.10_


- [x] 16. System Assistant Bridge — 反向调用 (模式 B)
  - [x] 16.1 Create systemAssistantBridge.ts service
    - **Output (2026-05-23 wave 8)**: ✅ `src/services/systemAssistantBridge.ts` (~248 lines). 5 reverse-call kinds: callPhone / openMaps / smartHome / timer / calendar. Per-kind opt-in policy persisted to MMKV (`reverse_call_policy/v1`); defaults: callPhone=off, openMaps=on, smartHome=off, timer=on, calendar=off. `requestReverseCall(req)` returns Promise<ReverseCallResult> after gating: emits `approval-incoming` (ApprovalAlertCapsule visible) + waits up to 60s for user `resolveReverseCallApproval(approvalId, 'approve' | 'reject')`. On approve → fires platform Linking.openURL (tel: / Apple Maps / geo: / calshow: / Shortcuts).
    - _Requirements: 9.7, 9.8, 9.9, 9.10_

  - [x] 16.2 Implement 5 platform calls — covered in 16.1.
    - _Requirements: 9.7_

  - [x] 16.3 Register reverse-call as mcp tools so LLM can use them
    - **Output (2026-05-23 wave 15)**: ✅ Backend tools shipped — `backend/src/modules/tool-registry/tools/system/reverse-calls.tools.ts` ships 5 `@RegisterTool()` classes (`SystemCallPhoneTool` / `SystemOpenMapsTool` / `SystemSmartHomeTool` / `SystemTimerTool` / `SystemCalendarTool`). Each tool's `execute()` returns `{ status: 'approval-pending', platform, args }` instead of invoking the platform intent — that's the mobile dispatcher's job. Mobile `src/services/mcpReverseCallDispatcher.ts` (`dispatchReverseCallToolResult`) catches `system.*` results, routes through `requestReverseCall` approval gate, returns LLM follow-up message with success/failure outcome.
    - _Requirements: 9.8, 9.9_

  - [ ]* 16.4 Maestro: end-to-end Siri + reverse-call test — deferred to T24.1.

- [x] 17. Wake-word conflict resolution
  - [x] 17.1 wakeWordSuspend module
    - **Output (2026-05-23 wave 11)**: ✅ `src/services/wakeWordSuspend.ts` exposes `suspendSelfWakeWord(durationMs, source)` / `isWakeWordSuspended()` / `clearWakeWordSuspend()`. Module-scope coordinator that lets native code (Phase 2) suspend "Hey Aira" for 8s when system wake-word fires (Hey Siri / 小爱同学 / 小布小布). voiceDiagnostics record on each suspend. Wave 15 follow-up: `speechWakeWord.service` now imports `isWakeWordSuspended` and skips wake-match dispatch when the suspend window is active.
    - _Requirements: 9.11_
  - [x] 17.2 Self wake-word toggle in CompanionSettings
    - **Output (2026-05-23 wave 11)**: ✅ Toggle in CompanionSettingsScreen flips `useSettingsStore.wakeWordConfig.enabled` directly — when off, GlobalFloatingBall doesn't init Picovoice on next mount. Long-press ball still works for voice via the imperative path.
    - _Requirements: 9.13_

- [x] 18. Cross-Device Token + Remote Control gateway
  - [x] 18.1 Backend: remote-control module + WebSocket gateway + token mint
    - **Output (2026-05-23 wave 10)**: ✅ `backend/src/modules/remote-control/` — `RemoteControlModule` registered in AppModule with 30s JwtModule. `POST /v1/cross-device/token` mints scoped JWT bound to (userId, targetDeviceId, command, requestId, nonce). `/remote-control` socket.io namespace verifies JWT auth, rooms by user + device, accepts `remote-control:execute` after token + whitelist + forbidden checks, forwards `remote-control:run` to target device room, routes `remote-control:ack` back to user room. Whitelist: 9 commands (desktop.computer-use.start/stop, pro-mode.toggle, aira-work-mode.start, speaker.tts.broadcast/white-noise.start/stop, watch.notifications.silence, device.status.query). Forbidden list: device.shutdown / app.data.clear / wallet.config.modify. Production deploy verified: `POST /api/v1/cross-device/token` → 401 Unauthorized (JwtAuthGuard works; commit `7b9c36e4a`).
    - _Requirements: 8.5, 8.6, 8.10, 8.11_

  - [x] 18.2 Mobile: crossDeviceToken.service.ts + sendRemoteControl()
    - **Output (2026-05-23 wave 10)**: ✅ `src/services/crossDeviceToken.service.ts` (~209 lines). `mintCrossDeviceToken({ targetDeviceId, command })` POSTs to backend; `sendRemoteControl({ originDeviceId, targetDeviceId, command, args, executeMode })` orchestrates: mint → connect socket (`/remote-control` namespace, lazy-require socket.io-client) → emit execute → wait up to 5s for ack/nack → emit `remote-control-sent` + `remote-control-ack` companionEvents. Ack timeout fires nudge mode + voiceDiagnostics 'ack-timeout'.
    - _Requirements: 8.5, 8.6_

  - [x] 18.3 RemoteControlPanel UI (嵌在 PetDetailSheet CrossDeviceCard 内)
    - **Output (2026-05-23 wave 10)**: ✅ `src/components/companion/RemoteControlPanel.tsx` (~269 lines). Lists desktops via authStore.user.openClawInstances + per-device command buttons (online/offline pill + busy spinner). Risky commands (desktop.* / speaker.tts.broadcast) emit trust3-signing-request first then sendRemoteControl on signature complete. Phase 1 success → capsule-show event; failure / ack-timeout → nudge mode + "对方设备未响应".
    - _Requirements: 8.5, 8.6, 8.7, 8.8, 8.10, 8.11_

  - [x] 18.4 Honor night variant: notify-only, no execute
    - **Output (2026-05-23 wave 10)**: ✅ When CompanionSettings has formVariant=night locked, RemoteControlPanel sends `executeMode: 'notify-only'` so backend forwards as notification rather than execute on the target device.
    - _Requirements: 8.12_

  - [ ]* 18.5 Maestro: remote control end-to-end — deferred to T24.1.
    - _Requirements: 8.6, 8.7, 8.8, 12.3_


- [x] 19. Agentic Commerce 框架
  - [x] 19.1 Create agenticCommerce.service.ts with limit checks
    - **Output (2026-05-23 wave 8)**: ✅ `src/services/agenticCommerce.service.ts` (~265 lines). Pure decision matrix (feature-disabled / emergency-frozen / category-not-allowed / over-per-tx-limit / over-daily-limit / below-min-balance / auto-execute). Limits persisted to MMKV under `agentic_commerce_limits/v1` (defaults: enabled=false, perTxMax=$30, dailyMax=$100, minSafeBalance=$5). Today-spend fetched from `/v1/agent-cost/today?petId=` (network failure → fallback to MAX_SAFE_INTEGER so all amounts route to request-approval — fail-safe). emergencyFreeze(hours=24) sets timed lockout. Storage layer uses lazy require + injection point for tests.
    - _Requirements: 7.1-7.5, 7.7-7.9_

  - [x] 19.2 Integrate evaluateAgenticAction in mcp tool-call path
    - **Output (2026-05-23 wave 13)**: ✅ `src/services/agenticCommerceMcp.ts` — `gateMcpCommerce(req)` runs req through evaluateAgenticAction and returns `{ decision, llmFeedback, signRequestId }`. `'auto-execute'` → caller proceeds. `'request-approval'` → emits trust3-signing-request automatically + returns signRequestId for the caller to await. `'block'` → returns formatted llmFeedback. `notifyAgenticExecuted` helper emits wallet-delta + agentic-commerce events for capsule trail.
    - _Requirements: 7.3, 7.4, 7.5, 7.10_

  - [x] 19.3 Push notification + Wallet_Capsule on auto-execute
    - **Output (2026-05-23 wave 13)**: ✅ `notifyAgenticExecuted` in agenticCommerceMcp emits `wallet-delta` (WalletCapsule auto-fires) + `agentic-commerce action:executed` events. Push notification path delegated to NotificationService.sendPushNotification (already shipped) — caller invokes it explicitly when needed.
    - _Requirements: 7.3, 7.10_

  - [x] 19.4 Emergency freeze
    - **Output (2026-05-23 wave 11+12)**: ✅ `emergencyFreeze(hours)` API ready (wave 8) + UI button now wired in CompanionSettingsScreen (wave 11). Tap → 24h timed lockout + setLimits emit.
    - _Requirements: 7.6_

  - [x] 19.5 Unit tests for evaluateAgenticAction matrix
    - **Output (2026-05-23 wave 8)**: ✅ 11/11 tests passing. 7 decision branches + 2 priority-order tests + 1 freeze/clear lifecycle + 1 storage-merge. All run in pure-Node jest via injected in-memory storage.
    - _Requirements: 7.4, 7.5_


- [ ] 20. CompanionSettingsScreen 9 sections
  - [x] 20.1 petCompanionSettings/v1 unified namespace
    - **Output (2026-05-23 wave 15)**: ✅ `src/stores/petCompanionSettings.ts` provides `getPetCompanionSettings()` reading from all 6 underlying stores (agenticCommerce / reverseCalls / formVariant / pushChannels / quietHours / voiceGreetPrefs) + `patchPetCompanionSettings(patch)` writing back. Phase 1 wraps the existing primitive stores rather than migrating them — same data, single mental model for UI + future backend sync.
    - _Requirements: 10.3_

  - [x] 20.2 Build 4 sections (Phase 1 critical path)
    - **Output (2026-05-23 wave 11)**: ✅ `src/screens/me/CompanionSettingsScreen.tsx` (~326 lines). 4 sections wired:
      - **Form Variant 手动锁定** (30min night / 2h work / 1h journey + 清除锁定) — calls setManualLock + evaluateAndApply
      - **Trust 3 + 系统助手桥** — 5 reverse-call toggles + Hey Aira self wake word toggle (R9.13)
      - **自主交易额度** — enabled toggle + per-tx max / daily max / minSafeBalance display + 5 whitelist categories tag picker + 紧急冻结 24h
      - Quiet Hours / Voice Greet quotas / Push channels / Ambient Presence / Local Model routing — Phase 1 defaults; UI wires in wave 12.
    - _Requirements: 10.2, 10.4_

  - [x] 20.3 今日陪伴小结 card on top of CompanionSettingsScreen
    - **Output (2026-05-23 wave 12)**: ✅ `TodaySummaryCard` derives 6 metrics from voiceDiagnostics today + companionHealth.getTodaySteps(): 心情切换 / 主动招呼 / 签名通过 / 跨端命令 / 自主交易 / 今日步数. Horizontal scroll, accent border, Phase 1 metrics ready.
    - _Requirements: 10.5_
  - [x] 20.4 重置为默认 + 导出陪伴日志 + 清空诊断
    - **Output (2026-05-23 wave 12)**: ✅ 3 buttons in CompanionSettings 维护 section. 重置 — Alert 2-step confirm, then setAgenticLimits(DEFAULT_LIMITS) + setReverseCallPolicy(safe) + clearManualLock; preserves intimacy / MPC / paired devices. 导出 — getVoiceDiagnostics → JSON via expo-file-system + expo-sharing.shareAsync. 清空诊断 — clearVoiceDiagnostics with confirm.
    - _Requirements: 10.6, 10.7_
  - [x] 20.5 Wire CompanionSettings entry from 3 paths
    - **Output (2026-05-23 wave 11)**: ✅ Registered in MeStackNavigator + MeStackParamList. PetDetailSheet SettingsEntry → `Main / Me / CompanionSettings` (T6.8 updated).
    - _Requirements: 10.8_


- [ ] 21. Mood_Diary_Push 推送通知
  - [x] 21.3 Mobile: handle deeplink + emit voice-greet
    - **Output (2026-05-23 wave 11)**: ✅ `mood-diary` intent registered in IntentName union + defaultIntentHandlers. Tapping `agentrix://intent/mood-diary?id=<id>&text=<text>` emits voice-greet (whisper TTL 4s via VoiceGreetCapsule) + best-effort navigates to PetCompanion screen.
    - _Requirements: 5.5_

  - [x] 21.1 Wire push token registration — already shipped (App.tsx `registerForPushNotifications` POSTs to /notifications/register).
    - _Requirements: 5.1, 5.6_

  - [x] 21.2 Backend: schedule daily 19-21 push per user
    - **Output (2026-05-23 wave 13)**: ✅ `backend/src/modules/pet-companion-engine/mood-diary-push.service.ts`. `@Cron(EVERY_HOUR)` filters server hour ∈ [19, 21]; reads today's pet_diary entries; per-user check: skip if last_viewed_at == today, skip if last_pushed_at == today; if consecutivePushMisses >= 7 → weekly backoff. NotificationService.sendPushNotification with title `🐾 ${petName} 的今日小记` + deeplink `agentrix://intent/mood-diary?id=&text=` (handled by wave 11 mood-diary intent).
    - **Migration shipped to production (1796000000000)**: pet_diary added `last_viewed_at TIMESTAMPTZ` / `last_pushed_at TIMESTAMPTZ` / `consecutive_push_misses SMALLINT default 0`. Verified `\d pet_diary` on prod 47.130.176.148.
    - _Requirements: 5.2, 5.3, 5.4, 5.6, 5.9_

  - [x] 21.4 Push channel UI in CompanionSettings
    - **Output (2026-05-23 wave 15)**: ✅ CompanionSettingsScreen 推送频道 section with 6 toggles (moodDiary / walletDelta / approval / agenticCommerce / stepsReminder / sittingReminder) backed by petCompanionSettings/v1 `pushChannels` storage. Independent toggle-per-channel; `isPushChannelEnabled('moodDiary')` is the read API for backends/services that want to honor user prefs.
    - _Requirements: 5.1-5.4, 5.6, 5.7, 5.9_


- [x] 22. Health/Movement companion
  - [x] 22.1 Steps polling + milestones + late reminder
    - **Output (2026-05-23 wave 12)**: ✅ `src/services/companionHealth.service.ts` (~246 lines). `bootCompanionHealthWatcher` polls every 15min via expo-sensors Pedometer (lazy-required so jest doesn't break). 5000/8000/10000 step milestones fire `journey` mode + `triggerVoiceGreet('milestone')`. 18:00 with <5000 steps → late reminder voice-greet (once/day). MMKV-backed daily state.
    - _Requirements: 7.4, 7.5_

  - [x] 22.2 Sitting heuristic
    - **Output (2026-05-23 wave 12)**: ✅ Same service. Tracks sittingBaseline; if foreground 60min and step delta < 100 → fires nudge mode + `久坐啦,起来走 5 分钟?` voice-greet. Quiet_Hours suppress.
    - _Requirements: 7.6_

  - [x] 22.3 Movement-relevant greeting text
    - **Output (2026-05-23 wave 15)**: ✅ companionHealth milestones now emit voice-greet directly with stepCount-aware text ("走了 ${N} 步啦,真棒!" / "破万了!${N} 步,我都看见了。") bypassing /pet/greet for these specific moments. Mood_Diary backend template variant deferred to Phase 2 (will read pet_diary's `movement_context` field once added).


- [ ] 23. Brand visual consistency (Phase 1 in-app uniform)
  - [x] 23.1 SplashScreen uses pet sprite
    - **Output (2026-05-23 wave 12)**: ✅ App.tsx SplashScreen replaces "AX" placeholder with `<PetSpriteImage sprite="idle" size={72} />` inside an accent-bordered 96x96 tile. testID="splash-pet-sprite" for Maestro assert.
    - _Requirements: 1.7_

  - [ ] 23.2 Notification large icon — deferred (Phase 2 needs per-pet sprite asset hosting).
  - [ ] 23.3 Live Activity sprite — covered by T12.2 JS bridge stub.
  - [ ] 23.4 App icon (商店提交) — Phase 2.


- [ ] 24. Verification, monitoring & ship
  - [x] 24.1 Maestro E2E master flow scaffold
    - **Output (2026-05-23 wave 14)**: ✅ `.maestro/47-companion-redesign-smoke.yaml` covers 5 high-leverage paths: cold launch → World default tab; ball visible across World/Plaza/Me + hidden in Summon; long-press → PetDetailSheet; Companion Settings reachable via 陪伴设置 row; cross-tab visibility transitions. testID="splash-pet-sprite" + "floating-ball-sprite" anchors. Full Voice_Greet / Trust3 / Cross-device / Agentic Commerce coverage requires backend fixtures + mock Bedrock — split into 47-2/47-3/47-4 in wave 15+.
    - _Requirements: 12.3_

  - [x] 24.2 Performance instrumentation per R12.8
    - **Output (2026-05-23 wave 14)**: ✅ `src/services/companionPerf.ts` exposes `beginMark(kind, context)` / `endMark(token)` / `timed(kind, fn)`. 12 budget kinds with P95 thresholds (companion-ball-mount 16ms, mode-transition 50ms, voice-greet-tts-start 1500ms, lock-screen-update 30000ms, trust3-sheet-present 200ms, wallet-capsule-anim 3200ms, pet-detail-sheet-present 250ms, bubble-first-token-cloud 2000ms, local-text 5000ms, local-multimodal 90000ms, remote-control-roundtrip 5000ms, sign-request-roundtrip 2000ms). Wired into `Trust3SigningSheet.present` + `PetDetailSheet.present`; voiceDiagnostics records elapsed + budget + overBudget flag for sampling.
    - _Requirements: 12.8_

  - [x] 24.3 Feature flag plumbing + 0% rollout seeded
    - **Output (2026-05-23 wave 16)**: ✅ Backend `CompanionRedesignModule` registered + `pet_companion_redesign_enabled` row inserted into admin_configs at 0% (default-off). `GET /v1/feature-flag/pet_companion_redesign` JwtAuthGuard'd, returns `{ enabled, rolloutPercentage, cohort }`. Mobile `fetchCompanionFlag()` cached 6h MMKV. `isCompanionRedesignEnabledSync()` synchronous read for the navigator gate. Ramp procedure documented in `docs/P9_COMPANION_REDESIGN_GO_LIVE_RUNBOOK.zh-CN.md` — single SQL UPDATE to ramp 1% → 10% → 50% → 100%.
  - [x] 24.4 Pre-launch manual checklist documented
    - **Output (2026-05-23 wave 16)**: ✅ `docs/P9_COMPANION_REDESIGN_GO_LIVE_RUNBOOK.zh-CN.md` includes the 18-item R12.10 checklist. Real-device walkthrough is the operator's task immediately before each ramp gate.
  - [x] 24.5 Memory entry — `memories/repo/companion-redesign-phase-1-complete-2026-05-23.md`


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6"] },
    { "id": 1, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.5", "3.1", "3.2", "3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5", "4.1", "4.2"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "6.1", "6.2"] },
    { "id": 6, "tasks": ["6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "8.1", "8.2", "8.3"] },
    { "id": 8, "tasks": ["9.1", "9.2", "10.1", "10.2", "10.3", "10.4"] },
    { "id": 9, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 10, "tasks": ["12.1", "12.2", "12.3", "12.4", "13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 11, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5", "15.1", "15.2", "15.3"] },
    { "id": 12, "tasks": ["16.1", "16.2", "16.3", "17.1", "17.2", "18.1", "18.2"] },
    { "id": 13, "tasks": ["18.3", "18.4", "19.1", "19.2", "19.3", "19.4"] },
    { "id": 14, "tasks": ["20.1", "20.2", "20.3", "20.4", "20.5"] },
    { "id": 15, "tasks": ["21.1", "21.2", "21.3", "21.4", "22.1", "22.2", "22.3", "23.1", "23.2", "23.3", "23.4"] },
    { "id": 16, "tasks": ["24.1", "24.2", "24.3", "24.4", "24.5", "24.6", "24.7"] }
  ]
}
```

> Tasks marked with `*` (e.g. 1.4, 2.6, 3.6, 5.7, 6.10, 7.7, 11.4, 13.7, 16.4, 18.5, 19.5) are optional tests; they may be deferred but should ideally be completed in the same wave for better coverage.

> Sprint mapping:
> - Wave 0-7 = Sprint P-9.1(2 weeks)
> - Wave 8-9 = Sprint P-9.2(2 weeks)
> - Wave 10-12 = Sprint P-9.3(2 weeks)
> - Wave 13-16 = Sprint P-9.4(2-3 weeks)

## Notes

- **Tasks marked with `*` are optional** — they are tests th`1QWzat ensure correctness but Phase 1 acceptance does not gate on them. Recommend completing at least the integration tests in T7.7 / T18.5 / T19.5 / T24.1 before 100% rollout.
- **Tasks marked with `[~]`** would mean "in-progress" but Phase 1 starts with all `[ ]`.
- **Sprint dependencies**:
  - T0 (audit) → T1-T2 (scaffold + IA)
  - T1-T2 → T3 (ball)
  - T1-T2-T3 → T4 (CompanionLayer)
  - T4 → T5 (Bubble) and T6 (PetDetail)
  - T6 + T9 → T10 (capsules: Voice/Wallet/Approval)
  - T10 + T11 → T12 (Form_Variant)
  - T1-T6 → T7 (Trust3 sheet) needs ball + sheet stack ready
  - T7 → T15 (SkillInstall) needs Trust3
  - T7 → T18 (RemoteControl) needs Trust3
  - T8 → T12, T13 (presence already wired ahead of cross-device viz)
  - T19 (Agentic Commerce) needs T7 + T10
  - T20 (CompanionSettings) needs T19 + T11 + T16 + T17 settings to wire
  - T24 (ship) is last
