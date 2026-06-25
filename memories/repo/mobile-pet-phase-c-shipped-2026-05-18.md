# Mobile Pet Phase C — Shipped 2026-05-18

> Living-pet companion experience on mobile reaches feature-parity with the
> desktop Phase A/B "wandering pet" window.

## Commit

`2f74bda1` on `main` — pushed and SSH-deployed to `47.130.176.148` (prod).
Backend rebuilt with `npm run build` + migration `CreatePetDiary1792000000000`
ran clean, `agentrix-backend` PM2 process restarted.

## What shipped

### Mobile (React Native / Expo SDK 54)

- `src/components/pet/PetSpriteAnimator.tsx` — multi-frame sprite renderer
  (walk 6f@8fps, idle 4f@4fps, sleep 2f@1fps, sit 1f, jump 4f@12fps no-loop,
  eat 4f@6fps). RAF-driven, automatically pauses on `AppState != active`.
  Mirrors `desktop/src/components/PetSpriteCanvas.tsx` behaviour.
- `src/screens/pet/PetCompanionScreen.tsx` — full rewrite. Live sprite +
  emotion-driven action selection + facing direction flip + 3 action buttons
  (feed / talk / play) + diary card + V4 CTA row. Tap=+1 XP, long-press=+5 XP,
  feed=+1 XP via `/v1/pet/intimacy`.
- `src/components/pet/PetTapGameModal.tsx` — real 30 s tap-the-falling-food
  reaction game (replaces the random-score stub). Submits to
  `/v1/pet/minigames/submit` with `game_key=feed`, so server clamps + applies
  anti-cheat.
- `src/components/pet/PetDiaryCard.tsx` + `src/services/petDiarySdk.ts` —
  fetches `/v1/pet/diary/recent?limit=7`, lets user flip between last 7 days.
- `src/services/petInteractionFx.ts` — centralised `expo-haptics` +
  `expo-av` audio cue layer with AsyncStorage mute toggle. Audio assets are
  optional (lazy-required, no-op when missing).
- `src/components/pet/MobilePetProactiveBanner.tsx` — bug fix: previous code
  passed `{ auth: { token } }` but `connectPetPresence` actually expects
  flat `{ token, deviceId, handlers }`. Banner was always degrading to noop.
- `assets/pets/sprites/default/{walk,idle,sleep,sit,jump,eat}.png` — 6 sprite
  sheets (~3 MB total) copied from `desktop/public/pets/sprites/default/`.

### Backend (NestJS)

- `backend/src/entities/pet-diary-entry.entity.ts` — new `pet_diary` table.
  One row per (user_id, date_key in Asia/Shanghai). Unique index on
  (user_id, date_key) → upsert friendly.
- `backend/src/modules/living-pet/pet-diary.service.ts` — template-based
  diary renderer (no LLM call → zero latency, zero cost). Stable per-user
  hash so the same user sees the same line all day. Has `invalidateToday`
  hook for re-rendering when emotion intensity changes.
- `backend/src/modules/living-pet/pet-diary.controller.ts` — endpoints:
  - `GET /v1/pet/diary` (or `?date=YYYY-MM-DD`) → today's entry
  - `GET /v1/pet/diary/recent?limit=N` → last N days (default 7, max 30)
- `backend/src/modules/living-pet/pet-diary.service.spec.ts` — 6 unit tests
  covering cache hit, future date null, intimacy suffix, regeneration, etc.
- `backend/src/modules/pet-companion-engine/pet-companion-engine.service.ts`:
  - New proactive kind `missed_you` (intimacy gate lv 1, dedupe 24h, prio 6).
  - New `tickMissedYou` cron sweep every 6 h: targets users absent 24h–7d
    (the main `tick()` only sees recently-active users so absent users would
    never reach the evaluator otherwise).
  - `markAbsentMood()` flips emotion to `sad` (intensity 1 for 1-3d absence,
    2 for >3d), broadcasts `presence:pet.state`. Idempotent — only flips
    once per day per user.
- `backend/src/migrations/1792000000000-CreatePetDiary.ts` — runs on next
  `migration:run`.

### Spec / docs

- `.kiro/specs/mobile-pet-companion-upgrade/spec.md` — Quick Plan format,
  C-1..C-10 acceptance criteria, all marked ✅ shipped.

### 3D models (regen for character unification)

- `deliverables/pet_3d_regen_v4.json` — Hunyuan3D regen manifest (3 variants
  using `灵狐` reference image). Output GLB binaries (~22 MB each) live under
  `deliverables/pets_v3/`; copies were also dropped in-place over the
  existing `deliverables/pets_v2/kitsune-{A,B,C}-*.glb` filenames so DB
  `model_url` references auto-pick up the new geometry on next thumbnail
  download. Binary GLBs are NOT committed (gitignored), JSON manifest is.

## How to test

Mobile (after Expo reload):

1. Open the app, navigate to the Pet tab → see the live sprite (walk/idle).
2. Tap pet → light haptic + +1 XP toast.
3. Long-press → heavy haptic + +5 XP.
4. Tap "🍖 喂食" → eat sprite plays for ~1.6 s + medium haptic.
5. Tap "🎮 小游戏" → 30 s tap-the-food modal; reach 50+ score → ≥ 25 XP.
6. Diary card under intimacy panel shows today's Chinese sentence.
7. Hide app for 24 h → next launch shows pet emotion=sad + missed_you bubble.

Backend (smoke test, run on prod):

```bash
TOK=$(node /tmp/gen-token-c7.js)  # or any user's JWT
curl -H "Authorization: Bearer $TOK" \
  https://api.agentrix.top/api/v1/pet/diary
# → { "entry": { "date":"2026-05-18", "emotion":"happy", ... } }
```

Already verified on prod — see commit message + this file's accompanying
ssh-test session (returned `今天我很开心,因为你来陪我了。 你了解我,我也了解你。`
for `zhouyachi2023` user at intimacy lv 7).

## Known follow-ups

- **Audio assets**: `petInteractionFx` is wired but `assets/pets/sounds/`
  is empty — designer needs to drop in `chirp.m4a / crunch.m4a / purr.m4a /
  snore.m4a / cheer.m4a`. Until then haptics fire alone (no sound), which is
  graceful.
- **Sprite asset transparency**: Doubao output had white background, auto
  white-key may have nibbled the white fur in some frames. Run a side-by-side
  visual check on PetCompanionScreen before user-facing launch.
- **3D GLB swap not propagated to CDN**: `deliverables/pets_v2/*.glb` is the
  source-of-truth filename, but production marketplace serves
  `https://agentrix.top/downloads/pets/<id>.png` (PNG only) and pet skin
  records reference `model_url` columns we did not update. The regen unifies
  the visual style of the *thumbnail*; whether the 3D pipeline rebuilds VRM
  from these new GLBs is a separate task, not in C-1..C-10.
- Mobile diary refresh is currently REST-poll on `refreshKey`; could be
  upgraded to socket-push via a new `presence:pet.diary.regenerated` event,
  but day-grain refresh doesn't justify it.

## Files of interest

- `src/components/pet/PetSpriteAnimator.tsx`
- `src/components/pet/PetTapGameModal.tsx`
- `src/components/pet/PetDiaryCard.tsx`
- `src/components/pet/MobilePetProactiveBanner.tsx`
- `src/screens/pet/PetCompanionScreen.tsx`
- `src/services/petInteractionFx.ts`
- `src/services/petDiarySdk.ts`
- `assets/pets/sprites/default/*.png`
- `backend/src/entities/pet-diary-entry.entity.ts`
- `backend/src/modules/living-pet/pet-diary.{controller,service,service.spec}.ts`
- `backend/src/modules/pet-companion-engine/pet-companion-engine.service.ts`
- `backend/src/migrations/1792000000000-CreatePetDiary.ts`
- `.kiro/specs/mobile-pet-companion-upgrade/spec.md`
