# Pet Sprint P-6 phases 6.1 / 6.2 / 6.3 — Mobile mirror first wave shipped

**Date**: 2026-05-22
**Plan reference**: `docs/PET_FORMS_MOBILE_MIRROR_PLAN_v6.zh-CN.md`
**Phases delivered**: 6.1 (基础架构) + 6.2 (GlobalFloatingBall 接形态)
+ 6.3 partial (chat-streaming trigger)

## What this sprint shipped

Mobile mirror of the desktop pet form-state system — the
GlobalFloatingBall now renders one of 12 sprite forms (the desktop's
`cu-mouse` is dropped — no Computer Use on phone) and switches based
on what the agent is doing, exactly like the desktop pet's title-bar
avatar.

## Files added (NEW)

### `src/services/petMode.ts`

RN-flavored mirror of `desktop/src/services/petMode.ts`. Differences:

- No Tauri cross-webview broadcast — RN runs a single JS context.
- `subscribePetMode()` uses a plain `Set<Listener>` instead of
  `window.dispatchEvent` since RN has no DOM CustomEvent.
- `PetMode` taxonomy drops `'computer-use'` (not applicable on
  mobile); calls passing it are treated as `'idle'`.
- `PET_MODE_TO_SPRITE` degrades `thinking` and `typing` to the `talk`
  sprite per the P-6 plan (mobile has no Pro Mode dedicated UI).
- Extra exports: `resolveSpriteForMode()` for renderers,
  `_internalResetForTests()` for jest.

### `src/components/PetSpriteImage.tsx`

RN sprite-sheet renderer:

- Static `require()` map for all 12 mobile sprites — RN bundler
  resolves at build time, can't take dynamic paths.
- Per-sprite `SPRITE_SPECS` mirror desktop `frames` and `fps`:
  walk 6/8, idle 4/4, sleep 2/1, sit 1/1, jump 4/12, eat 4/6,
  listen 4/5, talk 6/8, pro-thinking 4/5, pro-typing 4/8,
  pro-done 4/8, alert 2/3.
- Animation: outer `<View overflow:hidden>` clips to one frame's
  width, inner `<View>` wraps the full-strip `<Image>` and translates
  by `-frame * size` to scroll through frames. Same trick desktop
  uses with `background-position`, just RN-flavored.
- Non-loop sprites (jump, pro-done) hold the last frame and fire
  `onActionComplete` once.
- `facing="left"` flips horizontally via `scaleX: -1`.

### `src/services/__tests__/petMode.test.ts`

8 jest tests covering: idempotency, ttl auto-revert, unsubscribe,
computer-use → idle remapping, exception isolation, sprite resolution
table. All passing.

## Files modified

### `src/components/GlobalFloatingBall.tsx`

- Imports `PetSpriteImage`, `setPetMode`, `subscribePetMode`,
  `resolveSpriteForMode`.
- Adds local `petMode` state subscribed to the bus.
- Cross-wires existing `ballState` → `setPetMode` so legacy code paths
  that flip the gradient ball state still drive the form system.
- Replaces the inner `<Text>AX</Text>` brand mark with
  `<PetSpriteImage sprite={petSprite} size={BALL_SIZE - 8} />`.
- In capsule mode (listening / speaking), the brand text in the
  header is replaced with a 28×28 `PetSpriteImage` slot — keeps the
  waveform + status text but the sprite is the visual anchor.
- New style: `capsuleBrandSlot` (28 × 28 alignment box).

### `src/screens/AgentChatScreen.tsx`

- Imports `setPetMode` from petMode bus.
- On `sendMessage` start → `setPetMode('speaking', 'agent-chat-send')`.
- On `finally` → `setPetMode('done', 'agent-chat-end', 1200)` (TTL
  auto-reverts to idle after celebration).

### `App.tsx`

- Imports `bootPetModeBus`.
- Calls `bootPetModeBus()` once at module load (next to
  `initLlamaBridge()`). Idempotent — called multiple times is a no-op.

## Validation

- `npx jest src/services/__tests__/petMode.test.ts` → 8 / 8 passed
- `npx tsc --noEmit` → no new errors in the P-6 surface
  (GlobalFloatingBall, PetSpriteImage, petMode, AgentChatScreen, App.tsx
  all clean). Pre-existing repo errors in HomeScreen / WorldEngine
  routing are unrelated and untouched.
- 13 sprite PNGs verified present in `assets/pets/sprites/default/` —
  `cu-mouse.png` is bundled but never referenced by the mobile sprite
  renderer (intentional).

## Coverage vs. plan

| Phase | Item | Status |
|---|---|---|
| 6.1 | petMode.ts mobile bus | ✅ shipped |
| 6.1 | PetSpriteImage component | ✅ shipped |
| 6.1 | SPRITE_SPECS shared parity | ✅ inlined locally (didn't move to shared/ — would have triggered cross-package import churn for marginal benefit at this stage) |
| 6.2 | GlobalFloatingBall subscribes | ✅ shipped |
| 6.2 | mode → sprite swap | ✅ shipped (replaces "AX" mark + capsule brand) |
| 6.2 | gradient color by mode | ⏸ deferred — gradient still keyed off ballState; revisit if user reports visual confusion |
| 6.3 | AgentChatScreen → speaking/done | ✅ shipped |
| 6.3 | wake word / voice → listening | ⏸ deferred (SpeechWakeWordService already calls `setBallState('listening')` which cross-wires to mode bus, so functional but not direct) |
| 6.3 | AXP level-up → done | ⏸ deferred — needs hook in axpCashback service |
| 6.4 | Backend `presence:pet.state` → mode | ⏸ deferred to round 2 |
| 6.5 | Maestro E2E pet form scenarios | ⏸ deferred |

## What this enables

The mobile floating ball, instead of showing a generic "AX" letter
mark with color shifts, now shows the same little kitsune the desktop
pet shows — and it switches forms per agent activity. Agent thinking?
the kitsune is in talk pose. Approval pending? alert pose. Idle? idle
loop. Cross-platform brand consistency without any 3D / Live2D
runtime cost.

## What's NOT done (explicit scope-out per plan)

- ❌ No Pro Mode on mobile — talk sprite serves both speaking and
  thinking states.
- ❌ No Computer Use on mobile — `cu-mouse.png` not bundled into
  `SPRITE_SOURCES` map.
- ❌ No wander engine — ball stays where the user dragged it.
- ❌ No system-level overlay (Android `SYSTEM_ALERT_WINDOW`).

## Next session continuation

Phases 6.4 (backend presence wiring) and 6.5 (E2E + docs) are still
pending. They're independent — backend pushes a `pet.state` event
already; the mobile side just needs `agentPresence.ts` to map that
into `setPetMode(...)`. E2E coverage uses Maestro and goes in
`.maestro/12-home-pet-drawer.yaml` extension or a new `42-mobile-pet-
forms.yaml`.

If the user wants to start that work, the entry points are:

1. `src/services/agentPresenceAccount.ts` — listens to `presence:*`
   server events. Add a case for `pet.state` that maps `mode` field
   to `setPetMode(...)`.
2. `.maestro/` directory — add a new YAML scenario tapping the
   floating ball, asserting capsule mode renders, then triggering a
   chat send and asserting the sprite swaps.
