# Spec: Mobile Pet Companion Upgrade (Phase C)

> **Goal**: Bring the mobile pet experience to feature-parity with the desktop
> Phase A/B "living pet"—multi-frame sprite animation, real micro-interactions,
> proactive companionship, and emotion-driven behaviour—so the mobile app
> stops feeling like a static avatar.

## Status

- **Created**: 2026-05-18
- **Phase**: C (mobile + cross-platform polish)
- **Lead**: Pet Companion squad
- **Source**: User request — _"推动 phase C，包括移动端等也要把宠物部分完善优化"_
- **Predecessors**:
  - `memories/repo/sprint-w-1-w-2-w-3-shipped-2026-05-16.md` — backend pet engine
    is already shipped (10 emotions, intimacy XP, proactive engine, social visit).
  - Phase A (desktop wander + idle micro-actions) — shipped 2026-05-17 (`6183fb23`).
  - Phase B (desktop multi-frame sprite + cursor follow + jump + feed) —
    shipped 2026-05-18 (`51ac249c` + `a1c2c8fa`).
  - Mobile Sprint W1-W3 — already wired `getPetState` to `HomeScreen.tsx` and
    added the global `MobilePetProactiveBanner.tsx` (in-flight commit `d2705bac`).
- **Implementation status (2026-05-18 22:35 SGT)**: ✅ ALL C-1..C-10 SHIPPED
  in commit `2f74bda1`. Production backend deployed at `47.130.176.148`,
  `pet_diary` migration ran clean, smoke tests on `/v1/pet/diary` +
  `/v1/pet/diary/recent` returned valid Chinese/English diary entries.
  No mobile binary rebuild needed — JS-only, hot-reload via Expo dev menu.

## Why

The backend already emits 11 pet presence topics (state, soul, skin, proactive,
energy, achievement, memory, breeding ×3, social visit). On the desktop the
companion window now renders 6 sprite actions (walk/idle/sleep/sit/jump/eat),
follows the cursor, jumps spontaneously and accepts feeding.

On mobile we still render a **single emoji on a gradient circle**. The
`PetCompanionScreen` exposes 4 V4 CTAs (wardrobe / soul / market / breed) but
no animation, no idle micro-actions, no feeding, no haptics, no diary.

The asymmetry breaks the "same pet, every device" promise from
`docs/agentrix-cross-platform-prd-v4.md` §4.2 (Pet Continuity).

## Scope (in)

| Area | Mobile target | Reference (desktop) |
| --- | --- | --- |
| C-1 ✅ 3D model regeneration (single character, 3 variants) | done — `pet_3d_regen_v4.json` already replaces v2 GLBs in-place | n/a |
| C-2 ✅ HomeScreen → real pet state | done — `useQuery({ queryFn: getPetState, refetchInterval: 30_000 })` | `desktop/src/services/petSdk.ts` |
| C-3a ✅ Emotion-driven breathing + idle wiggle on `GradientFallback` | done | `PetCompanionWindow.tsx::idleAction` |
| C-3b ✅ Global `MobilePetProactiveBanner` slide-down on `presence:pet.proactive` | done | `desktop/src/components/PetProactiveBubble.tsx` |
| **C-4** Mobile sprite animator (Skia or `react-native-reanimated`) — walk/idle/sleep/sit/jump/eat 6 actions | ✅ shipped — `src/components/pet/PetSpriteAnimator.tsx` reuses `desktop/public/pets/sprites/default/*.png` (copied to `assets/pets/sprites/default/`). RAF-driven, paused on AppState background. | `desktop/src/components/PetSpriteCanvas.tsx` |
| **C-5** `PetCompanionScreen` upgrade — sprite renderer + facing direction + tap haptic + feed action | ✅ shipped — `src/screens/pet/PetCompanionScreen.tsx` rewritten. Tap=light haptic + chirp + +1XP; long-press=heavy haptic + purr + +5XP; feed=medium haptic + crunch + eat clip + +1XP; periodic random facing flip. | `PetCompanionWindow.tsx` |
| **C-6** Real-feel mini-game — replace random scoring with a tappable target / coin-catch loop that earns XP on hits | ✅ shipped — `src/components/pet/PetTapGameModal.tsx`. 30s tap-the-falling-food reaction game; submits to `/v1/pet/minigames/submit` (game_key=`feed`), so server-side anti-cheat clamps the score and awards XP. | new (no desktop counterpart) |
| **C-7** Pet diary — daily 1-sentence summary surfaced in `PetCompanionScreen` (server-generated, mobile renders) | ✅ shipped — backend `pet-diary.service.ts` + `pet-diary.controller.ts` + migration `1792000000000-CreatePetDiary.ts`. Mobile `PetDiaryCard.tsx` flips between last 7 days. Smoke test on prod returned `今天我很开心,因为你来陪我了。` | new |
| **C-8** Long-absence "missed you" emotion — server flips emotion to `sad`/`tired` after 24h+ no interaction; client renders unique sprite + bubble | ✅ shipped — `pet-companion-engine.service.ts` adds `missed_you` proactive kind + dedicated `tickMissedYou` cron sweep every 6h. Targets users absent 24h–7d, flips emotion to `sad` (intensity 1–2 by absence length), broadcasts proactive bubble through existing presence channel. | server-only feature, mobile shares logic |
| **C-9** Audio cues — chirp on tap, purr on long-press, snore loop while `sleepy` (`expo-av`, optional toggle) | ✅ shipped — `src/services/petInteractionFx.ts` lazy-loads `expo-av`, gracefully no-ops when audio assets are missing. Mute persisted via AsyncStorage. Sound asset slots ready under `assets/pets/sounds/*.m4a` (drop-in when designer ships them). | new |
| **C-10** Haptic feedback — `expo-haptics` light/medium/heavy mapped to interaction type | ✅ shipped — same `petInteractionFx.ts` wraps `Haptics.impactAsync(Light/Medium/Heavy)` and `notificationAsync(Success)` for cheer. | new |

## Scope (out)

- Wear-OS / smart-toy renderers — tracked in `docs/wearable-prd-v4.md` and
  `docs/toy-prd-v4.md`, separate spec.
- Web frontend pet experience — already feature-complete in
  `frontend/components/agent/UnifiedAgentChat.tsx`.
- VRM 3D rendering on phones — out of scope for this phase (battery / memory),
  keep the existing `PetVrmRenderer` lazy-load path as-is.
- Backend changes for diary / missed-you — separate backend mini-task tracked
  inline in C-7 / C-8.

## Acceptance criteria

1. Cold-start `App.tsx` → tab to `PetCompanionScreen` shows a multi-frame
   walking pet within 1 s on a Pixel 5 / iPhone 12.
2. Tapping the pet plays a haptic + chirp + earns ≥1 intimacy XP
   (server-confirmed via `PUT /v1/pet/intimacy`).
3. Server emits `presence:pet.proactive { kind: "missed_you" }` after 24h
   inactivity → mobile banner appears with the right copy + CTA.
4. Mini-game launches from `PetCompanionScreen`, hit-rate maps to XP, no random
   scoring left in the codebase.
5. Pet diary shows at least one entry per day on the screen, fetched from
   `GET /v1/pet/diary?date=today`.
6. All mobile changes pass `npm run lint` + `npx tsc --noEmit` and at least
   one Maestro flow exercises the new tap-haptic-XP path.

## Risks

- **Battery / CPU**: sprite RAF + 4 Hz socket polling on mobile may drain
  battery. Mitigation: pause animations when app backgrounded
  (`AppState` listener) and gate frame rate at 30 fps.
- **Asset bundle size**: 6 sprite sheets total ≈ 1.2 MB. Mitigation: ship as
  `assets/pets/sprites/default/*.png` (Expo asset pipeline) and lazy-load on
  first navigation to the pet screen.
- **Audio on iOS silent mode**: respect the silent switch, default chirp/purr
  to `Audio.setAudioModeAsync({ playsInSilentModeIOS: false })`.
- **Backend diary cost**: GPT call per user per day → ~$0.01/user/day on cheap
  models. Mitigation: cache result in `pet_diary` table, only regenerate after
  emotion change > 1 intensity step.

## Owners

- Mobile: `src/screens/pet/`, `src/components/pet/`, `App.tsx`
- Backend: `backend/src/modules/living-pet/`,
  `backend/src/modules/pet-companion-engine/`
- Shared types: `shared/types/pet-presence.ts`

## Decision: entry point (please pick one)

This spec is **gated on the user picking an entry point** before any
implementation begins. Per `.kiro` workflow, no code changes happen until
the choice is made.

| Option | Means | Rough effort |
| --- | --- | --- |
| **A. Quick Plan + Just Build It** (recommended) | I implement C-4 → C-10 directly using the existing desktop reference and the acceptance criteria above as my contract. No requirements/design docs—the spec.md you're reading is the contract. | 2-3 sessions |
| **B. Requirements first** | Write `requirements.md` (numbered user stories with EARS-style acceptance), iterate until you sign off, then design + tasks. | +1 session before any code |
| **C. Design first** | Write `design.md` (architecture, data flow, component diagrams) first (skip requirements). | +1 session before any code |
| **D. Pick scope subset** | Tell me which of C-4 / C-5 / C-6 / C-7 / C-8 / C-9 / C-10 to ship now and I'll skip the rest. | varies |

(Note: the C-1 / C-2 / C-3 work is already shipped in the in-flight commit
`d2705bac`, so it is **not** included in any of the entry-point options.)
