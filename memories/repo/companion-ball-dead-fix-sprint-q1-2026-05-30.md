# P-9 Companion — "Dead Ball" fix + Sprint Q1 (2026-05-30)

> Context: audit of mobile pet system found the floating companion ball was
> "dead" on device — wrong image (🦊 emoji, not the 灵狐 sprite), couldn't be
> dragged, tap did nothing, no form/sprite changes. Plus the PetDetailSheet
> action grid navigated to unregistered routes → runtime crash.

## Root causes (code-level, no device needed)

1. **Single shared ErrorBoundary swallowed the whole companion subtree.**
   `CompanionLayer` wrapped the ball + 4 bottom-sheets + 3 capsules in ONE
   `CompanionErrorBoundary`. If ANY sheet threw on mount (e.g. a
   @gorhom/bottom-sheet v5 ⇄ reanimated worklet hiccup), the boundary swapped
   EVERYTHING — including the healthy ball — for `CompanionFallbackBall`: a
   static `🦊` emoji, fixed corner, non-draggable, tap only navigates. That is
   EXACTLY the "dead ball" the user saw.
   - Fix: added `IsolatedBoundary` around EACH child. A crashing sheet now
     renders null in isolation; the ball keeps full drag + sprite + mode
     behavior. Top-level `CompanionFallbackBall` now also renders the real
     `idle` sprite (灵狐) instead of a generic emoji.

2. **Legacy ball booted minimized + parked off-screen.**
   `GlobalFloatingBall` started with `isMinimized = true` at
   `x = screenW - MINIMIZED_REVEAL` (18px sliver). First tap only
   un-minimized; auto re-minimized after 8s. Felt dead.
   - Fix: boot `isMinimized = false`, park fully on-screen at
     `x = screenW - BALL_SIZE - EDGE_MARGIN`.

## Sprint Q1 (audit P0) also shipped this pass

- **Orphaned pet screens re-homed (T6.7).** `WardrobeScreen` / `SoulPickerScreen`
  / `BreedScreen` / `PetPlaygroundScreen` / `SkinMarketplaceScreen` /
  `MemoryManagementScreen` registered under `MeStackNavigator` as
  `PetWardrobe` / `SoulPicker` / `PetBreed` / `PetPlayground` /
  `PetSkinMarketplace` / `MemoryManagement`. Added to `MeStackParamList`.
- **PetDetailSheet action grid fixed.** 衣柜/灵魂/繁育/玩乐/记忆 now navigate
  via `Main > Me > <screen>` (were unregistered → crash). 喂食 now calls real
  `POST /v1/pet/intimacy { xp:5 }` via new `feedPet()` in `mobilePetSdk.ts`
  (was a stub that only emitted a mode-change). Feed/greet act in-place
  (don't dismiss the sheet).
- **Internal nav in re-homed screens fixed.** WardrobeScreen → `PetSkinMarketplace`
  / `PetBreed`; BreedScreen → `PetWardrobe` + `Main>World>PetCreator`.
- **Maestro** `.maestro/48-companion-action-grid.yaml` taps every grid item and
  asserts no crash.

## Still open (flagged, NOT done this pass)

- **Babel plugin suspicion (UNVERIFIED).** Stack is reanimated@~4.1.1 +
  react-native-worklets@0.5.1 + newArchEnabled. `babel.config.js` still uses
  the deprecated `react-native-reanimated/plugin` re-export. Reanimated 4 docs
  say the plugin moved to `react-native-worklets/plugin`. This CAN cause
  worklet init failures that crash bottom-sheet v5 on mount → all sheets fall
  to their IsolatedBoundary null (ball survives but tap/long-press open
  nothing). COULD NOT verify locally — node_modules on the Windows checkout is
  a stub (real install is in WSL), so no `tsc`/bundler run possible. NEXT
  AGENT: on a real build env, try switching babel to
  `'react-native-worklets/plugin'` (must be LAST in plugins[]), rebuild, and
  confirm the bottom-sheets mount without hitting IsolatedBoundary
  (check `globalThis.__companionChildErrors`).
- `isCompanionRedesignEnabledSync()` is a DEAD FLAG — zero callers in src;
  RootNavigator mounts 4-tab IA unconditionally. 0% rollout does nothing on
  client. (Audit P0 #2 — needs product decision, not done.)
- ConversationBubble still launcher-only (T5.2/5.4). formVariant work/journey
  never auto-fire (hardcoded false). Rive renderer is placeholder gradient.
  Only `default` clan sprite sheet bundled.

## Verify status

- getDiagnostics clean on all edited files. Could NOT run tsc/jest locally
  (node_modules stub). Needs a real build env (WSL) to run
  `npx tsc --noEmit` + jest + APK build before shipping.

## Files touched

- `src/components/companion/CompanionLayer.tsx` (IsolatedBoundary per child + sprite fallback)
- `src/components/GlobalFloatingBall.tsx` (boot visible + on-screen)
- `src/components/companion/PetDetailSheet.tsx` (grid nav + real feed)
- `src/services/mobilePetSdk.ts` (feedPet)
- `src/navigation/MeStackNavigator.tsx` + `types.ts` (re-home 6 screens)
- `src/screens/pet/WardrobeScreen.tsx`, `BreedScreen.tsx` (internal nav names)
- `.maestro/48-companion-action-grid.yaml` (new)


---

## Session 2 (2026-05-30) — dead-flag removal + Q2 conversation bubble + crash capture

### 1. Dead flag REMOVED (user: "if not keeping legacy has no impact, don't keep it")
- Confirmed `isCompanionRedesignEnabledSync()` had ZERO callers in src → 0% rollout
  gated nothing client-side. Legacy IA navigators already deleted (T2.5) → no fallback.
- Deleted `src/config/companionFeatureFlag.ts`; removed boot `fetchCompanionFlag()` in App.tsx.
- Removed dangling `Home` linking block in App.tsx (referenced deleted PetStack screens);
  added real `me/pet/*` linking paths for the Q1 re-homed screens.
- Rewrote legacyRouteTable: `pet/*` + `agent/*` + second-layer `home/pet/*` redirects now
  point at REAL registered routes (single-hop resolver — chained redirects don't work).
  Updated `legacyRouteTable.test.ts` expectations accordingly.
- Backend `admin_configs` row + `/v1/feature-flag/pet_companion_redesign` now unused
  (harmless; drop in a future backend cleanup).

### 2. Sprint Q2 — ConversationBubble live message mirror (T5.2/5.3/5.4 done)
- New `src/services/conversationStore.ts` — lightweight pub/sub (NO zustand/MMKV),
  mirrors {messages, routing, busy, agentName, sessionId} + a pendingPrefill handoff
  channel. Chose this over the ~1500-line useVoiceSession lift to avoid voice/stream
  regression risk.
- AgentChatScreen PUBLISHES snapshot on message/routing/sending change (one useEffect)
  + consumes `consumePendingPrefill()` on focus (navigator-agnostic; fixes the dropped
  prefill across Summon→AgentChat nesting).
- ConversationBubble SUBSCRIBES: header agentName + live mode label, LIVE routing badge
  (📱本地/🌐云端 from convo.routing), and a BottomSheetScrollView rendering last 12
  non-system turns (user/assistant/error/streaming/📎count). Empty → launcher hint.
- 11 unit tests in `conversationStore.test.ts` (pure-Node).

### 3. Ball crash capture (root-cause hunt aid)
- Added `recordCompanionCrash()` in CompanionLayer → writes BOTH `globalThis.__companionBallError`
  / `__companionChildErrors` AND `addVoiceDiagnostic('companion-crash', slot, {message,stack})`
  so the actual mount-throw shows in the IN-APP Diagnostics viewer on the next APK. All 3
  boundaries (layer / ball / per-child) use it. THIS is how we finally pin the real throw.

### Files (session 2)
- DELETED `src/config/companionFeatureFlag.ts`
- `App.tsx` (remove flag boot + Home linking; add me/pet/* linking)
- `src/navigation/legacyRouteTable.ts` + `__tests__/legacyRouteTable.test.ts`
- `src/services/conversationStore.ts` (new) + `__tests__/conversationStore.test.ts` (new)
- `src/screens/agent/AgentChatScreen.tsx` (publish + consume prefill)
- `src/components/companion/ConversationBubble.tsx` (live mirror + routing badge + msg list)
- `src/components/companion/CompanionLayer.tsx` (recordCompanionCrash → voiceDiagnostics)

### Still NOT done
- Ball real mount-throw root cause: STILL unidentified in code — needs the new APK +
  reading `companion-crash` diagnostics on device. Defensive fixes (BallBoundary fallback,
  PetSpriteImage hardening, boot-visible) mean the ball is usable regardless.
- HomeStackParamList type still in types.ts (CoRaisingLandingScreen imports it as a type
  hint) — harmless, left for a cleanup pass.
- formVariant work/journey auto-detect; Rive real assets; per-clan sprites; native ambient.

### APK
- Push build branch to trigger Claw APK CI so operator can read companion-crash diagnostics.


---

## Session 3 (2026-05-30) — remaining P1 fixes

### formVariant work/journey now actually fire (was hardcoded false)
- NEW `src/services/motionDetection.service.ts` — `detectWalking()` via `expo-location`
  (ALREADY a dep; avoided adding expo-sensors + EAS rebuild). Uses coords.speed or a 6s
  two-sample displacement; 0.4–2.8 m/s = walking. Silent: only reads when foreground
  location permission ALREADY granted, never prompts. Pure-fn unit tests.
- `formVariant.isWalking()` → calls detectWalking() (was `return false`).
- `formVariant.isInCalendarMeeting()` → best-effort lazy-require `expo-calendar`
  (not bundled yet → false today, auto-activates once dep added in EAS rebuild).
- Note: `expo-sensors` is NOT a declared dep, so companionHealth.service's Pedometer
  path ALSO silently no-ops on device (step milestones never fire). Out of scope this
  pass; flagged for a future EAS rebuild that adds expo-sensors.

### Clan dual-track unified (A..F vs A_office..F_family)
- Added `clanShortCode()` + `PetClanShortCode` to `shared/types/pet.ts` — the ONE
  authoritative bridge from canonical slugs → single-letter renderer codes.
- `activePet.service.ts` uses it (was unsafe `as 'A'|'B'|'C'` cast that always yielded
  'A' since OpenClawInstance has no clan field; now derives from clan|soul_template_id).
- `PetRiveRenderer.PetClan` re-based on `PetClanShortCode` (back-compat export name kept).
- Unit tests in `clanShortCode.test.ts`.

### Files (session 3)
- NEW `src/services/motionDetection.service.ts` + `__tests__/motionDetection.test.ts`
- NEW `src/services/__tests__/clanShortCode.test.ts`
- `src/services/formVariant.service.ts` (isWalking/isInCalendarMeeting real impl)
- `shared/types/pet.ts` (clanShortCode + PetClanShortCode)
- `src/services/activePet.service.ts` (use clanShortCode)
- `src/components/pet/PetRiveRenderer.tsx` (PetClan = PetClanShortCode)

### P1 still NOT done (lower priority / needs native rebuild)
- ConversationBubble true single-engine (still launcher+mirror, not one useVoiceSession).
- expo-sensors Pedometer (step milestones / sitting nudge) silently no-op until dep added.
- PetCompanionScreen still redefines local PetState/PetEmotion — but it's ORPHANED
  (not registered), so zero runtime impact; cleanup when/if it's re-homed.
- Rive real .riv assets; per-clan sprite sheets (only default bundled).


---

## Session 4 (2026-05-30) — ROOT CAUSE FOUND (build349 feedback)

User installed build349: ball showed BUT (a) two stacked icons (🦊 emoji +
kitsune sprite), (b) couldn't drag, (c) on ALL 4 tabs, (d) tap → World not
Summon. ALL of these = the `CompanionFallbackBall` was showing → the REAL
GlobalFloatingBall was STILL throwing on mount.

### THE root cause (finally)
`GlobalFloatingBall` + `PetDetailSheet` + `ConversationBubble` +
`ApprovalAlertCapsule` all called **`useNavigation()`** at mount. But
CompanionLayer mounts as a SIBLING of AppNavigator — inside
`<NavigationContainer>` but OUTSIDE any Stack/Tab navigator. In React
Navigation v7 `useNavigation()` THROWS ("Couldn't find a navigation object")
when there's no navigator context. The wave-17 hotfix had removed
`useNavigationState` but LEFT `useNavigation()` — so the ball threw every
mount, BallBoundary caught it, and showed the dead fallback. This is why
clean-install + 6h-cache theories never panned out: it was a deterministic
mount throw the whole time.

### Fix
- NEW `src/navigation/navigationRef.ts` — shared `createNavigationContainerRef`
  + `navRefNavigate(...)` (no navigator context needed).
- App.tsx now imports + uses it on `<NavigationContainer ref={navigationRef}>`
  (replaced its local module-scope ref).
- GlobalFloatingBall / PetDetailSheet / ConversationBubble / ApprovalAlertCapsule:
  replaced `const navigation = useNavigation()` with a `navRefNavigate`-backed
  object. Removed the `useNavigation` imports.
- Fallback ball simplified to a SINGLE icon (IsolatedBoundary now takes a
  `fallback` prop: sprite, → 🦊 emoji only if sprite render throws). No more
  two stacked icons.

### Expected after this APK (build > 349, commit 558cde33 / ea7712813)
- Real ball mounts: draggable, single sprite, hidden in Summon + only on
  World/Plaza/Me, single-tap → ConversationBubble (not World).
- If it STILL shows fallback, read in-app Diagnostics `companion-crash` scope
  (recordCompanionCrash now logs the exact throwing component + message).

### Lesson
useNavigation() is NOT safe anywhere under NavigationContainer — it needs a
Stack/Tab navigator ancestor. Anything mounted as a NavigationContainer
sibling MUST use the shared navigationRef. The old CompanionLayer doc comment
claimed "children can call useNavigation" — that was wrong and is now corrected.


---

## Session 5 (2026-05-30) — P1a real data + P1b mode colors + P2 clan infra

User challenged that PetDetailSheet / modes / bubble were stubs. Honest re-audit
confirmed: hero/wallet/skills/devices were HARDCODED; modes work but visually
collapse to ~4 sprites; bubble Q2 code only in unshipped 558cde33.

### P1a — PetDetailSheet real data (was all hardcoded)
- NEW `src/services/petDetail.api.ts`: `fetchPetDetailData()` parallels
  `/v1/pet/snapshot` (level/xp/emotion/energy) + `/v1/axp/balance` + `/v1/pet/skins`,
  each best-effort (Promise.allSettled). + `xpProgress()` (mirrors backend
  100*2^n curve) + `emotionEmoji()`. Unit tests petDetail.test.ts.
- PetDetailSheet: `loadDetail()` on present() → passes `detail` to sections.
  - Hero: real Lv/emotion-emoji/energy% + real XP bar (was Lv 12/😊/78%/64%).
  - StatusOverview: action text derived from real emotion; 📱本机 online.
  - WalletCard: real AXP balance + ≈USD (was USDC/AXP/BTC all `—`). USDC still
    `—` (no mobile on-chain balance endpoint confirmed — flagged).
  - SkillsCard: real owned skins from /v1/pet/skins (was 3 hardcoded pills).
  - CrossDevice: real openClawInstances (presence:device.list still N/A).

### P1b — ball mode color ring (modes now visible)
- petMode.ts: `COMPANION_MODE_COLOR` + `COMPANION_MODE_PULSES`.
- GlobalFloatingBall: new `companionModeColor`/`companionModePulse` props →
  animated `companionModeRing` (pulse loop for signing/nudge). `companion`
  default passes undefined → no ring (clean rest).
- CompanionBall passes `COMPANION_MODE_COLOR[mode]` (mode!=='companion').
- Colors: signing=紫脉冲 nudge=橙脉冲 journey=绿 whisper=粉 working=蓝
  vigil=slate slumber=深夜.

### P2 — per-clan sprite infra (code only; art not produced)
- PetSpriteImage: `DEFAULT_SPRITE_SOURCES` + empty `CLAN_SPRITE_SOURCES`
  registry + `resolveSpriteSource(clan,key)` fallback chain + new `clan` prop.
  GlobalFloatingBall threads `spriteClan` from `activePet.clan`. Today all
  clans fall back to default (only `default` art bundled); adding clan B art =
  drop PNGs under assets/pets/sprites/B/ + one registry entry.
- expo-sensors NOT added: would need package-lock sync (can't npm install
  here) — declaring it without lock risks breaking `npm ci` in APK CI. Operator
  must run `npx expo install expo-sensors` in WSL to enable step-driven journey
  mode + health milestones. Left as explicit follow-up.

### Files (session 5)
- NEW src/services/petDetail.api.ts + __tests__/petDetail.test.ts
- src/components/companion/PetDetailSheet.tsx (real data wiring)
- src/services/petMode.ts (COMPANION_MODE_COLOR/PULSES)
- src/components/GlobalFloatingBall.tsx (mode ring + spriteClan)
- src/components/companion/CompanionBall.tsx (pass color/pulse/clan)
- src/components/PetSpriteImage.tsx (per-clan registry + resolveSpriteSource)

### Still open
- USDC on-chain balance endpoint for mobile (wallet card shows `—`).
- expo-sensors dep (needs WSL npm install + EAS rebuild).
- 6-clan sprite ART (design/content task — infra ready).
- ConversationBubble live mirror only verifiable on the new APK (558cde33+).
