# Pet Sprint P-5 round 2 — Light theme contrast deep pass shipped (v0.3.8)

**Date**: 2026-05-22
**Version**: v0.3.7 → v0.3.8
**Build target**: Windows NSIS / MSI

## Why a round 2

User installed v0.3.7 and reported persistent low-contrast areas on
light theme. From the screenshot:

- **SubscriptionBadge "FREE" pill** — `rgba(156,163,175,0.18)` bg with
  `#d1d5db` fg. On light theme this dissolved into the background.
- **TaskWorkbench banner labels and pills** — eyebrow / metric labels
  used `#94a3b8` on near-white card surfaces.
- **WORKSPACE CONTEXT card** — sky-tinted (`rgba(125,211,252,*)`) bg
  with eyebrow text in `#7dd3fc` and body in `#e0f2fe` / `#cbd5e1`.
- **Title-bar action buttons** — light grey on white, often nearly
  invisible.
- **Pre-launch buttons** like "Restore" / "Generate File" — borders in
  `rgba(255,255,255,0.X)` evaporated on light surfaces.
- **Input placeholders** — `--text-dim` was too light on white bg.

Per the user's standing direction ("接受工程妥协 — 用 CSS attribute
selector 全局覆盖硬编码 RGBA, 不要求每个组件 variabilize"), the fix
extends `global.css`'s attribute-selector approach instead of
component-by-component refactor.

## Files changed

### `desktop/src/styles/global.css` — second round of overrides

Added a "Sprint P-5 round 2" section that flips colors for these
hard-coded literals on `html[data-theme="light"]`:

**Slate text colors** → `var(--text)`:
- `#94a3b8`, `#cbd5e1`, `#9ca3af`, `#64748b`, `#d1d5db`
- `#e2e8f0`, `#f1f5f9`, `#e0f2fe`, `#bae6fd`, `#7dd3fc`, `#e5e7eb`

**Tier badge backgrounds** (SubscriptionBadge family):
- `rgba(156,163,175,*)` (free grey) → grey-700 tint with `#1f2937` fg
- `rgba(96,165,250,*)` (lite blue) → blue-700 tint
- `rgba(167,139,250,*)` (plus purple) → purple-700 tint
- `rgba(244,114,182,*)` (pro pink) → pink-700 tint
- `rgba(251,191,36,*)` (elite amber) → amber-800 tint
- `rgba(249,115,22,*)` (enterprise orange) → orange-700 tint
- Matching `#93c5fd / #c4b5fd / #f9a8d4 / #fbbf24 / #fb923c` foreground
  colors get darker variants for legibility on the new tinted bg.

**Sky/cyan WorkspaceContext**:
- `rgba(125,211,252,*)` → muted sky-700 tint with darker stroke.

**Outline buttons with `border: 1px solid rgba(255,255,255,0.X)`**:
- Border flipped to `var(--border-light)` so the button shape becomes
  visible on light theme.

**Title-bar icon buttons**:
- Buttons with only a `title` attribute (no inline bg/color) get a
  darker default fg + a hover affordance using `var(--bg-overlay-medium)`.

**Input placeholders**:
- Bumped from `var(--text-dim)` to `#6b7280` with `0.85` opacity for a
  4.5:1 contrast ratio on light surfaces.

**MM/AA file-change pills in TaskWorkbench banner**:
- Green (rgba(34,197,94,*)), orange (rgba(251,146,60,*)), and blue
  (rgba(96,165,250,*)) backgrounds get matching darker text colors so
  letters remain visible.

### Version bumps (4 files)

- `desktop/package.json` → 0.3.8
- `desktop/src-tauri/Cargo.toml` → 0.3.8
- `desktop/src-tauri/tauri.conf.json` → 0.3.8
- `desktop/tests/e2e/pet-build-smoke.spec.ts` → A-3 + C-1 assert 0.3.8

## Validation

- `npx tsc --noEmit -p tsconfig.json` → clean (CSS-only change, no JS
  diff)
- `npx vitest run` → 13 files / 82 tests passed (no test breakage)
- `npx playwright test tests/e2e/pet-build-smoke.spec.ts` → 9 / 9 passed
- v0.3.8 NSIS + MSI installers produced
  (`Agentrix Desktop_0.3.8_x64-setup.exe` / `_en-US.msi`)

## Known gaps (still deferred to later sprints)

- The attribute-selector strategy covers the most common dark-theme
  RGBA / hex literals shipping in production today, but is not a full
  audit. A new component that introduces, say, `#475569` for slate-600
  text on white background will still need a follow-up override.
- No `prefers-contrast: more` media-query path yet.
- Per-component `var(--*)` variabilization remains a post-launch
  cleanup item (P-7+).

## Next session continuation

If real-device acceptance still surfaces a stubborn contrast issue,
just append another rule to `global.css` matching the failing literal.
The pattern is mechanical: identify the hex/rgba in the screenshot →
add `html[data-theme="light"] [style*="<literal>"] { … !important }`.
