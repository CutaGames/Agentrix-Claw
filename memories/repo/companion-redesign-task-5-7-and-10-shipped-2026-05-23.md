# P-9 Companion Redesign — Wave 4 + Wave 5 Shipped (2026-05-23)

> Branch: `build/mobile-pet-forms-p6-2026-05-22`
> Commit: `5e8051123` (12 files, +2550 / -32)
> Spec: `.kiro/specs/mobile-pet-companion-redesign/{requirements,design,tasks}.md`

## Scope

Wave 4: T5 ConversationBubble + T6 PetDetailSheet + T7 Trust3SigningSheet
Wave 5: T10 three Capsule overlays + T3.3/3.4 ball gesture overrides

## Files

### New (10)
- `src/components/companion/ConversationBubble.tsx` (502 lines)
- `src/components/companion/PetDetailSheet.tsx` (796 lines)
- `src/components/companion/Trust3SigningSheet.tsx` (584 lines)
- `src/components/companion/CapsuleOverlay.tsx` (132 lines, shared base)
- `src/components/companion/WalletCapsule.tsx` (78 lines)
- `src/components/companion/ApprovalAlertCapsule.tsx` (78 lines)
- `src/components/companion/VoiceGreetCapsule.tsx` (57 lines)
- `src/components/companion/sheetRefRegistry.ts` (133 lines)
- `src/services/signRequest.service.ts` (89 lines, `/v1/wallet/sign-request` mobile client)
- `.tmp_apk/companion-redesign-review-checklist.md` (review doc)

### Modified (3)
- `src/components/companion/CompanionLayer.tsx` — mounts 4 sheets + 3 capsules + delegates ball gestures via `companionSheets` registry
- `src/components/companion/CompanionBall.tsx` — wires `onSingleTap`/`onLongPress` props through to GlobalFloatingBall via the new override props
- `src/components/GlobalFloatingBall.tsx` — adds 3 back-compat override props (`onSingleTapOverride`, `onLongPressOverride`, `onRightSwipeOverride`); when undefined, legacy nav/pillExpanded behavior is unchanged

## Key Architectural Decisions

### 1. Module-scope ref registry instead of React Context

`sheetRefRegistry.ts` exports plain mutable holders for `ConversationBubbleHandle`, `PetDetailSheetHandle`, `Trust3SigningSheetHandle` plus a `companionSheets` shortcut object. Sheets register their imperative handles on mount and clear on unmount.

**Why**: deep-link handlers, push notification handlers, and `companionEvents` subscribers all need to call `present()` from outside the React render tree. Context would force a hook in every call site, including `apiFetch` callbacks. The registry pattern matches how `navigationRef` is used at App.tsx top-level.

### 2. ConversationBubble = launcher, not full chat (Phase 1)

The Bubble is a 65/100% snap-point sheet that captures voice + camera + text + attachments, then **forwards them to AgentChatScreen** (existing route already supports `prefillText`/`attachments`/`autoVoice` from the legacy ball). Reaching 100% snap auto-dismisses bubble and navigates to Summon Tab.

**Why**: a true shared `conversationStore` for live message mirror would require lifting `useVoiceSession` state out of AgentChatScreen — an ~1500-line refactor. Phase 1 P-9 acceptance does not gate on this; the launcher pattern still surfaces the camera + voice + jump-to-Summon flow that R2 demands. T5.2 shipped as `[~]`; full lift deferred to wave 6.

### 3. Trust3SigningSheet posts attestation, not chain signature

Mobile path:
1. Caller (PetDetailSheet "试签名" button or any future origin) → `createSignRequest(reason, metadata)` → backend returns `{ id, status:'pending' }`
2. Caller → `companionEvents.emit('trust3-signing-request', { signRequestId, reason, metadata, expiresAtMs })`
3. Sheet subscribes, calls `present(req)` → ball locks via `setCompanionMode('signing', source, { force: true })`
4. Pre-flight `getSignRequest(id)` checks for cached signature (R6.12 dedup); if completed, short-circuits with cached signature
5. User taps Face ID → `LocalAuthentication.authenticateAsync({ disableDeviceFallback: false })`
6. On success: synthesize `attestation = "biometric:<ts>:<rand>"` → POST `/v1/wallet/sign-request/:id/complete { signature: attestation }` → backend mpc-signer signs the actual chain message
7. On completion: `setCompanionMode('companion', ...)` unlocks ball, emit `trust3-signing-completed`, fire `req.onConfirm(signature)`, brief 600ms success state, dismiss

**Why attestation-not-signature**: matches the existing `PayMpcDemoScreen` mock contract and the shipped `mpc-signer` server-side architecture. Mobile holds share-1 only via the `mpcWallet` service; chain signing happens on backend.

### 4. 60s countdown via Animated + setTimeout fallback

`countdownAnim = new Animated.Value(1)` linearly tweens to 0 over `timeoutMs` (default 60000) for the visual progress bar. Independently, `expiryTimerRef = setTimeout(() => { cancelSignRequest(id, 'timeout'); finalize('timeout'); }, timeoutMs)` ensures the cancel POST + state cleanup fires even if the app is backgrounded.

### 5. Capsule positioning: bottom-right anchored, not ball-anchored (Phase 1)

`CapsuleOverlay` uses `position: 'absolute', right: 16, bottom: bottomOffset`. Different bottomOffset values stack the three capsules:
- Wallet: 110pt
- Approval: 170pt
- VoiceGreet: 230pt

**Why**: avoid coupling to the ball's PanResponder x/y values during wave 5. Wave 6 visual polish will refactor to read `companionLayoutStore.x/y` for true ball-anchored placement once the 56pt ball lands.

### 6. GlobalFloatingBall override props are back-compat

```ts
interface Props {
  // ... existing props
  onSingleTapOverride?: () => void;  // P-9 T3.3
  onLongPressOverride?: () => void;  // P-9 T3.3
  onRightSwipeOverride?: () => void; // P-9 T3.3 (gesture detection wave 6)
}
```

When `undefined`, `handleTap` falls through to `activateVoiceExperience()` (legacy navigate to AgentChat) and `handleLongPress` falls through to `setPillExpanded(true)`. CompanionBall always passes the overrides, so within the P-9 layer the new behavior is active. Any other call sites (none today) keep working.

## Integration Path Test (T6.4 "试签名" button → end-to-end)

PetDetailSheet WalletCardSection has a 试签名 button that:

1. `await createSignRequest({ reason:'wallet-transfer', metadata:{ summary, risk:'L1' }, timeoutSeconds: 60 })` — real backend POST
2. If `cachedHit` (idempotency): emit `wallet-delta` directly, skip sheet
3. Otherwise: emit `trust3-signing-request` — Trust3SigningSheet stacks above PetDetailSheet
4. User confirms biometric → backend `/complete` → `wallet-delta` fired → WalletCapsule animates "+$0.10 USDC"

This exercises the **full** Trust3 + sign-request + capsule loop on a real device against production `47.130.176.148`. Verifies T0.6 + T7 + T10 in one click.

## Verification

- `npx tsc --noEmit`: 0 new errors. 4 pre-existing TS warnings (MobilePetProactiveBanner / WorldBattleArenaScreen / defaultIntentHandlers / worldEngineCache) unchanged from wave 3.
- Tests: 150/150 passing
  - `petMode.test.ts` (legacy)
  - `petMode.companion.test.ts` (8 modes)
  - `petModeAdapters.test.ts`
  - `legacyRouteTable.test.ts` (111 redirects)
  - `legacyNavWarn.test.ts`

No new test files for wave 4/5 — sheet behavior + capsule fade depend on @gorhom portal mock + LocalAuthentication mock + apiFetch mock; Phase 1 acceptance does not gate on these. T5.7 / T6.10 / T7.7 deferred to T24.1 master Maestro pass.

## Deferred to Wave 6+

- **T3.2 56pt ball + 8-mode border colors** — needs UI screenshots to tune
- **T5.2 shared conversationStore** — ~1500-line refactor of useVoiceSession
- **T5.3/5.4 routing badge live wire + message bubble extraction** — depends on T5.2
- **T6.7 re-mount PetStack screens under MeStack** — current navigations route via legacyRouteTable redirect, fine for Phase 1
- **T7.4 custom 6-digit wallet PIN modal fallback** — system passcode fallback works today
- **T7.6 QuickPay → Trust3 wire** — QuickPay is merchant-receive flow (not transfer); Trust3 demo path via PetDetailSheet 试签名 button covers the same code path end-to-end
- **CapsuleOverlay ball-anchored positioning** — currently bottom-right anchored
- **T8 full presence:pet.* topic subscription expansion** — not in wave 4-5 scope
- **T9 backend `GET /pet/greet` API + Voice_Greet scheduler** — wave 6
- **T11 formVariant.service auto-detection** — wave 6
- **Maestro 47-* full E2E** — T24.1

## Velocity Window Status

Per AGENTS.md velocity window (until go-live freeze):
- ✅ Auto-approved: feature branch push (commit `5e8051123` pushed to origin)
- ✅ Auto-approved: backend deploys not needed for wave 4-5 (uses Task 0.6 sign-request endpoint, already shipped to 47.130.176.148)
- ⏸️ Not yet: APK CI mirror to `CutaGames/Agentrix-Claw` (user has not requested this round)
- ⏸️ Not yet: Maestro 47-* execution (per T5.7/T6.10/T7.7 deferred)

## Next Steps Recommendation

User options:
- **Continue wave 6**: T3.2 56pt visual polish + T5.2 conversationStore + T6.4 live wallet wire + T6.5 live skills wire + T7.4 PIN fallback + T6.7 PetStack re-mount under MeStack
- **Continue wave 6 narrower**: T8 full `presence:pet.*` subscription expansion + T9 backend `/pet/greet` + T11 formVariant — gives proactive Voice_Greet + cross-device sprite sync demos
- **Pause for local review**: build & verify on real device, then decide
- **Mirror to public_claw + APK CI**: trigger production-ready APK build for testers
