# Companion Redesign T3 + T4 shipped — 2026-05-22

> Sprint P-9 wave 3 — frontend orchestrator + ball wrapper + activePet service.
> Commit `812a453d6` on origin/build/mobile-pet-forms-p6-2026-05-22.

## Tasks done

- T3.1 ✅ (strategy adjusted) — Wrapper pattern instead of rename: `src/components/companion/CompanionBall.tsx` mounts legacy `GlobalFloatingBall.tsx` + adds P-9 cross-tab visibility logic + signing lock + low-power mode. Avoids 1084-line rewrite risk.
- T3.5 ✅ Ball visible in World/Plaza/Me only (Summon hidden). topTab + deep-route checks via `useNavigationState`. Position persists in `companionLayoutStore` (single global, not per-tab).
- T4.1 ✅ `src/components/companion/CompanionLayer.tsx` global mount in App.tsx between NavigationContainer + tab navigator.
- T4.2 ✅ `src/services/activePet.service.ts` exposes `useActivePet()` hook + `setActivePet(id)` + `getActivePet()`. Wraps authStore.activeInstance + auto-emits 'active-pet-changed'.

## Tasks deferred (wave 4 work)

- T3.2 (56pt + per-mode border colors) — needs UI screenshot iteration
- T3.3 (right-swipe + onLongPress wiring) — waits for T6 PetDetailSheet to exist
- T3.4 (Capsule overlay separation) — T10 lifts WalletCapsule/ApprovalAlertCapsule/VoiceGreetCapsule out of GlobalFloatingBall
- T3.6 (Maestro full E2E) — waits for ball polish complete

## Net changes

```
5 files changed, 444 insertions(+), 34 deletions(-)
```

Files:
- new: `src/components/companion/CompanionBall.tsx` (171 lines) — thin wrapper around GlobalFloatingBall
- new: `src/components/companion/CompanionLayer.tsx` (53 lines) — global mount orchestrator
- new: `src/services/activePet.service.ts` (102 lines) — useActivePet hook + setActivePet imperative API
- new: `src/stores/companionLayoutStore.ts` (60 lines) — Zustand store for position/lock/lowPower
- modified: `App.tsx` — adds GestureHandlerRootView wrap + BottomSheetModalProvider + CompanionLayer mount

## Test status

- Unit: `petMode.test.ts` (8) + `petMode.companion.test.ts` (18) + `petModeAdapters.test.ts` (7) = **33 / 33 passing** ✅
- TSC: 0 new errors. Same 4 pre-existing errors (MobilePetProactiveBanner / WorldBattleArenaScreen / defaultIntentHandlers / worldEngineCache) verified unchanged.

## Key design decisions

1. **CompanionBall as wrapper, not rewrite** — The 1084-line GlobalFloatingBall has 8 months of stable PanResponder + wake-word + capsule logic. Rewriting it from scratch is 3-day risk for marginal benefit. Wrapping it with the P-9 cross-tab visibility / lock / low-power layer gets us to "ball works in 3 tabs + locks during signing" in one commit. Visual polish (56pt, 8-mode borders) follows in wave 4 once we have UI feedback.

2. **GestureHandlerRootView** wraps the whole app — required by `@gorhom/bottom-sheet` v5. Added at the very top so future BottomSheets in T5/T6/T7 work without surprises.

3. **CompanionLayer mounts INSIDE NavigationContainer** — children call useNavigationState to detect current route. If we mounted it as a sibling of NavigationContainer, useNavigation would crash (verified by Phase C v0.4.6 hotfix).

4. **`signing` lock is a transparent overlay**, not a PanResponder modification — Cheaper + safer than mutating GlobalFloatingBall's internal PanResponder. The transparent View absorbs all touches above the ball during signing, including drag and tap, but doesn't visually change anything (Trust3SigningSheet renders above it).

5. **expo-battery low-power detection** is wrapped in try/catch — emulators and some iOS dev builds throw on `Battery.getPowerStateAsync()`. We default to `false` (no power saving) on failure rather than blocking ball render.

6. **`companionLayoutStore` persists ONLY `lastCorner`** — live position is in-memory because drag updates it every frame. We don't want 60 fps MMKV writes. Last corner survives launches so user finds the ball where they left it.

## Gotchas

- BottomSheetModalProvider requires `react-native-gesture-handler` peer — already in deps as `~2.28.0`. Verified via `node -e "package.json"`.
- App.tsx now has 4 nested providers: GestureHandlerRootView > SafeAreaProvider > AppErrorBoundary > QueryClientProvider > BottomSheetModalProvider > NavigationContainer. Order matters — gesture handler must be outermost.
- `useNavigationState((s)=>s)` re-runs on every navigation. CompanionBall calls `resolveDeepRoute` + `resolveTopTab` cheap functions, so the re-run cost is acceptable.

## What's NOT done yet — wave 4

- T5 ConversationBubble (BottomSheet 65% half-screen with composer + voice + camera)
- T6 PetDetailSheet (BottomSheet 85% with 9 sections)
- T7 Trust3SigningSheet (depends on T0.6 sign-request backend ✅)
- T10 Capsule overlays (Wallet/Approval/VoiceGreet) lifted out of GlobalFloatingBall
- 56pt visual upgrade + 8-mode border polish
- Maestro 47-* full E2E

T5-T7 can all start now in next session — backend (sign-request, Voice_Greet API) + frontend (CompanionLayer, companionEvents, petMode) are all in place.

## Verification path for next session

```
npx jest src/services/__tests__/petMode.companion.test.ts  # should be 18/18
npx tsc --noEmit  # should report 4 pre-existing errors only
node -e "const fs=require('fs');console.log('App.tsx CompanionLayer:',fs.readFileSync('App.tsx','utf8').includes('<CompanionLayer'))"
# expects: App.tsx CompanionLayer: true
```
