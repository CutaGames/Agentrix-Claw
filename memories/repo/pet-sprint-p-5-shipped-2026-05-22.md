# Pet Sprint P-5 — Light theme fix + empty-window fix shipped (v0.3.7)

**Date**: 2026-05-22
**Version**: v0.3.6 → v0.3.7
**Build target**: Windows NSIS / MSI

## What this sprint shipped

User feedback after v0.3.6 install:

1. **桌宠右键菜单大面积空白** — only emoji visible, no text. Root cause:
   the v0.3.6 `[role="menu"] { background: white }` light-theme rule had
   no scope guard, so it leaked into the pet companion webview which
   ships its menu with white text on a dark inline-style background. Net
   result: white-on-white, invisible labels.
2. **启动后中央有空白主窗口** — already-onboarded users saw a 1100×820
   empty grey rectangle on launch. After Sprint P-1 retired the
   floating-ball collapsed state, the main window stayed at `panelOpen=false`
   on launch with no auto-hide, leaving a service-host shell visible.
3. **Light 模式整体效果差** — known regression carried over from v0.3.5;
   user accepted a tactical fix (CSS attribute selectors covering the
   most common dark RGBA literals) instead of full per-component
   variabilization.

## Files changed

### `desktop/src/styles/global.css`

- Added `:not([data-pet-window="1"])` scope guard to every
  `[role="dialog"]` / `[role="menu"]` light-theme rule so they never
  match the pet webview.
- Added explicit `html[data-pet-window="1"] [role="menu"]` rule that
  forces `background: rgba(20,20,28,0.96)` + `color: #fff` regardless
  of theme. The pet menu is now ALWAYS dark.
- Added `[data-theme="light"]` block of variables (`--bg-card`,
  `--bg-card-hover`, `--bg-overlay-light`, `--code-bg`, …) for the
  attribute-selector overrides to reference.
- Added attribute selectors flipping the most common hard-coded dark
  RGBA literals on light theme:
  - `rgba(15,23,42,*)` (slate-900) → `var(--bg-card)`
  - `rgba(148,163,184,*)` (slate-400 borders) → `var(--border-light)`
  - `rgba(255,255,255,0.0X)` (glass overlays) → `var(--bg-overlay-light)`
  - `#cbd5e1`/`#94a3b8`/`#e2e8f0`/`#9ca3af` text → `var(--text-dim)`
  - `rgba(13,17,23,*)` (code-block bg) → `var(--code-bg)`
- Inputs, textareas, selects, tables, code blocks, and dark-bg buttons
  all get matching light-theme overrides.
- `[data-task-workbench]` keeps its dark gradient explicitly so the
  task workbench banner looks right on light theme too.

### `desktop/src/App.tsx`

- Added `autoOpenedRef` (useRef boolean, defaults to false).
- Added new useEffect that fires once when `loggedIn && onboarded &&
  windowLabel === "main"`:
  - if `panelOpen` is already true on first render → mark
    `autoOpenedRef = true` (user already in Pro Mode, don't re-open
    later).
  - else → set `autoOpenedRef = true`, then call `openProPanel()` +
    `showMainWindow()`. Result: launch always lands on Pro Mode, never
    on an empty grey rectangle.
- The pre-existing `hasOpenedPanelRef` guard still ensures that
  user-initiated `setPanelOpen(false)` (via close button / Escape /
  Ctrl+Shift+S) hides the main window without re-triggering auto-open.

### `desktop/src/components/PetCompanionWindow.tsx`

- (Already done in earlier P-5 working session) inline menu styles set
  `background: rgba(20,20,28,0.96)` and `color: #fff`, so the new CSS
  rule reinforces what was always intended.

### `docs/PET_FORMS_MOBILE_MIRROR_PLAN_v6.zh-CN.md` (NEW)

- 6-day mobile mirror plan: which sprites apply (11/13, drop cu-mouse —
  no Computer Use on mobile), Reanimated 3 sprite renderer, three
  trigger paths (chat streaming → talk; voice → listen; LLM thinking
  → pro-thinking; risky tool → alert), home-tab placement, perf
  budget. **Not started yet** — kicks off after v0.3.7 desktop real-
  device acceptance.

### `docs/PET_FORMS_DESIGN_v5.zh-CN.md`

- Marked Sprint P-5 as ✅ shipped 2026-05-22 (v0.3.7) with the three
  fixes above.
- Added Sprint P-6 (mobile mirror, planned).
- Renamed prior P-5 polish backlog to "P-7+ deferred" (tray ICO,
  flying transition, wardrobe-specific sprite, festival decorations,
  multi-clan variants).

## Validation

- `npx tsc --noEmit -p tsconfig.json` → clean (exit 0, no output)
- `npx vitest run` → 13 files / 82 tests passed in 29.5 s
- `npx playwright test tests/e2e/pet-build-smoke.spec.ts` (post-build
  artifact verification) — pending build completion.
- v0.3.7 .exe installed on user Windows machine — pending real-device
  acceptance.

## Versioning

All four sources synced to 0.3.7:

| File | Field | Value |
|---|---|---|
| `desktop/package.json` | `.version` | `0.3.7` |
| `desktop/src-tauri/Cargo.toml` | `[package].version` | `0.3.7` |
| `desktop/src-tauri/tauri.conf.json` | `.version` | `0.3.7` |
| `desktop/tests/e2e/pet-build-smoke.spec.ts` | `A-3` / `C-1` assertions | `0.3.7` |

## Caveats / known gaps deferred to P-7+

- The light-theme attribute-selector strategy is intentionally a wide
  net. Components that legitimately want dark surfaces on light theme
  (e.g., a few terminal-style views) get flipped. Acceptable for
  v0.3.7 — full per-component audit lives in a future sprint.
- Tray icon stays as the launcher icon regardless of pet mode.
- No flying transition when Pro Mode opens (instant pop).
- All sprite skins still share `idle.png` — wardrobe variants pending.

## Next session continuation

If anything regresses on light theme in v0.3.7 real-device testing,
extend the attribute selectors in `global.css` rather than refactor
individual components. Same playbook for any new dark RGBA literal
that gets introduced.
