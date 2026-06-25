# Pet Sprint P-5 round 3 + P-6 phases 6.4 / 6.5 shipped (v0.3.9)

**Date**: 2026-05-22
**Versions**: desktop v0.3.8 → v0.3.9, mobile P-6 phases 6.4 / 6.5
**Build target**: Windows NSIS / MSI

## Part A — Desktop light theme round 3 (v0.3.9)

### Why

Round 2's sky-tint override used `rgba(2, 132, 199, 0.10)` which proved
too transparent — the WORKSPACE CONTEXT card and TASK WORKBENCH
banner still rendered nearly invisible on light theme. Real-device
screenshot also exposed:

- Sky text colors `#7dd3fc` / `#bae6fd` / `#e0f2fe` were mapped to
  `var(--text)` (round 2) but the cards have a sky-tinted background
  → text needed to be a *darker sky* (sky-900 family), not a generic
  dark slate.
- "审批 / 暂停 / 云端" pill bar uses an inline linear-gradient with
  `#1e293b` / `#0f172a` literals → had no light-theme override.
- Title-bar icon buttons use `rgba(255,255,255,0.04..0.10)` bg which
  only round 1 covered partially.
- Outline accent buttons (Generate File family) use
  `border: 1px solid var(--accent)` but no fill → easy to miss.
- `var(--text-dim)` raw callers were not bumped on light.

### Files changed

#### `desktop/src/styles/global.css`

Added a "Sprint P-5 round 3" block:

- **Sky tint** bumped from `0.10` → `0.18` opacity, border `0.45` → `0.55`.
- **Sky text** (`#7dd3fc` / `#bae6fd` / `#e0f2fe`) → forced to sky-900
  (`#0c4a6e`) for cards/banners; uppercase eyebrow with `#7dd3fc` →
  sky-800 (`#075985`) + `font-weight: 800`.
- **Cyan/sky family** (`rgba(34,211,238,*)` / `rgba(56,189,248,*)`) →
  cyan-700 (`#0891b2`) tint with `#164e63` text.
- **Action-bar gradient pills** (linear-gradient with `#1e293b` /
  `#0f172a`) → flipped to a light grey gradient
  (`#f3f4f6` → `#e5e7eb`) with darker text + visible border.
- **Title-bar icon buttons** (`rgba(255,255,255,0.04|0.06|0.08|0.10)`
  bg) → swapped to `rgba(15,23,42,0.06)` + `#1f2937` fg.
- **`var(--text-dim)` raw callers** → `#4b5563` (gray-600) on light.
- **Outline buttons with `var(--accent)` border** → filled in (accent
  bg + white fg) for clear primary-action affordance.
- **`rgba(0,0,0,0.X)` border** → bumped to `0.22` opacity so borders
  always show.
- **Pill buttons** (`borderRadius: 999` + `rgba(255,255,255,*)` bg) get
  a `box-shadow: 0 0 0 1px rgba(15,23,42,0.18)` ring.

#### Version bump (4 files)

`package.json` / `Cargo.toml` / `tauri.conf.json` / `pet-build-smoke.spec.ts`
all → `0.3.9`.

### Validation

- `npx tsc --noEmit -p tsconfig.json` → clean
- `npx vitest run` → 13 / 82 still passing
- `npx tauri build --bundles nsis,msi` → bundles in 3:38
- `npx playwright test pet-build-smoke.spec.ts` → 9 / 9

## Part B — Mobile P-6 phases 6.4 + 6.5

### Phase 6.4 — Backend presence wiring

#### `src/services/petModeAdapters.ts` (NEW)

- Pure `mapEmotionToMode(emotion)` helper (table-driven) and
  `celebratePet(source, ttlMs)` shortcut at module top — both pure JS,
  jest-friendly.
- `bootPetModeAdapters({ token, deviceId, deviceName?, appVersion? })`:
  - Lazy-requires `react-native` + `./petPresence` so static imports
    from jest don't pull RN runtime.
  - Connects pet-presence socket; `presence:pet.state` payload's
    `emotion` field gets translated via `mapEmotionToMode` and pushed
    to `setPetMode(...)`.
  - `'idle'` mappings short-circuit (don't override local action).
  - Subscribes to `DeviceEventEmitter.presence:approval:wrist-trigger`
    → `setPetMode('approval', ttl 4000)`.
  - Returns disposer that cleans up both subscriptions.

#### `App.tsx`

- New top-level import `bootPetModeAdapters`.
- New auth-gated `useEffect`: after login, reads device id from
  AsyncStorage (same key as MobilePetProactiveBanner) and calls
  `bootPetModeAdapters({ token, deviceId })`. Returns the disposer
  from cleanup. No-op when not authenticated.

#### `src/components/pet/PetTapGameModal.tsx`

- After `playPetFx('cheer')` on `level_up=true`, also calls
  `celebratePet('axp-level-up', 1500)` to fire the `done` sprite for
  1.5 seconds.

### Phase 6.5 — E2E + user manual

#### `.maestro/44-mobile-pet-forms.yaml` (NEW)

- Asserts `floating-ball-sprite` testID is present on Home (sprite
  renderer mounted, not legacy text).
- Triggers Summon CTA → captures post-action screenshot.
- Asserts sprite still mounted after pet drawer scroll.
- Three takeScreenshot frames for visual regression review.

#### `docs/USER_MANUAL_MOBILE_PETS.zh-CN.md` (NEW)

- 中文用户手册:13 形态触发说明,12 形态在移动端启用(去 `cu-mouse`,
  thinking/typing 降级到 talk),后端 emotion → mode 映射表,跨平台对照
  (桌面 / 移动 / 手表 / 玩具)。

### Tests

#### `src/services/__tests__/petModeAdapters.test.ts` (NEW)

7 jest tests: emotion-to-mode mapping for all 10 emotion values + 1
undefined default + celebratePet ttl behavior + default ttl. All
passing.

#### Combined run

```
npx jest src/services/__tests__/petMode.test.ts \
         src/services/__tests__/petModeAdapters.test.ts
```

Result: **15 tests / 15 passed** (8 from petMode.test + 7 from
petModeAdapters.test).

## Files touched summary

| File | Change |
|---|---|
| `desktop/src/styles/global.css` | Round 3 light-theme overrides |
| `desktop/package.json` | 0.3.8 → 0.3.9 |
| `desktop/src-tauri/Cargo.toml` | 0.3.8 → 0.3.9 |
| `desktop/src-tauri/tauri.conf.json` | 0.3.8 → 0.3.9 |
| `desktop/tests/e2e/pet-build-smoke.spec.ts` | 0.3.8 → 0.3.9 + label P-5 r3 |
| `App.tsx` | Add bootPetModeAdapters useEffect on login |
| `src/services/petModeAdapters.ts` | NEW — emotion mapper, celebrate helper, lazy RN boot |
| `src/services/__tests__/petModeAdapters.test.ts` | NEW — 7 tests |
| `src/components/pet/PetTapGameModal.tsx` | Hook celebratePet on level_up |
| `.maestro/44-mobile-pet-forms.yaml` | NEW — pet form mounting E2E |
| `docs/USER_MANUAL_MOBILE_PETS.zh-CN.md` | NEW — user-facing manual |
| `docs/PET_FORMS_MOBILE_MIRROR_PLAN_v6.zh-CN.md` | Phase 6.4 / 6.5 marked shipped |
| `docs/PET_FORMS_DESIGN_v5.zh-CN.md` | P-5 r3 + P-6 status updates |

## Sprint P-6 status after this session

| Phase | Status |
|---|---|
| 6.1 基础架构 | ✅ shipped |
| 6.2 GlobalFloatingBall 接形态 | ✅ shipped |
| 6.3 触发源接入 | ✅ shipped (chat + AXP level-up) |
| 6.4 后端 presence 联动 | ✅ shipped |
| 6.5 测试 + 文档 | ✅ shipped |

**Sprint P-6 全部完成**.

## Next session continuation

- Real-device test the v0.3.9 desktop installer for any remaining
  light-mode contrast issues; if found, just append more attribute
  selectors to `global.css` matching the failing literals.
- Mobile build: push to `CutaGames/Agentrix-Claw` branch to trigger
  APK CI when ready to ship the pet-form mirror to users.
- If users report the pet form switching feels "off" on mobile (e.g.
  lingering speaking after chat ends, never going to sleep), add
  more explicit setPetMode calls at the relevant lifecycle points
  rather than relying on emotion fallback.
