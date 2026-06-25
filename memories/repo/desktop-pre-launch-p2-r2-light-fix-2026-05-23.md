# Sprint Pre-launch P-2 round 2 — Light theme codemod follow-up (2026-05-23)

User QA on the running 0.4.5 release exe (post P-2 round 1) flagged that
several surfaces were STILL dark in light theme:

1. Markdown `<pre>` code blocks (the user's screenshot showed a deep-blue
   block listing "ChatPanelImpl.tsx 148KB ..." in a chat message).
2. Task Workbench banner intentionally forced dark by design.
3. Various card surfaces in WorktreePanel / SkillCanvasPanel.
4. Approval sheet, pet menu, floating ball context menu, etc.

## Root cause

Round 1's codemod mapping table only matched a small set of well-known
alpha values (`0.04`, `0.06`, `0.08`). The dark-blue / dark-slate triplets
ACTUALLY used in the codebase span dozens of alphas:

```
rgba(15, 23, 42, 0.28..0.96)
rgba(2, 8, 23, 0.44..0.62)
rgba(13, 17, 23, 0.6..0.85)   // markdown <pre>, terminal output
rgba(20, 20, 28, 0.94..0.96)  // pet menu, proactive bubble
rgba(22, 33, 62, 0.95..0.98)  // floating ball menu/toast
rgba(9, 14, 24, 0.58)         // worktree backdrop
rgba(18, 24, 37, 0.98) / (11, 16, 26, 0.98)  // gradient stops
```

These dark surfaces stayed dark even with `data-theme="light"` on the
root element because the inline style had a literal value, not a CSS var.

## Fixes shipped

### 1. Round-2 codemod — `desktop/scripts/migrate-light-theme-colors-v2.mjs`

Enumerates ALL dark-blue/slate triplets and rewrites them to one of:
- `var(--bg-card)` for alpha < 0.5
- `var(--bg-panel-deep)` for alpha 0.5-0.75
- `var(--bg-elevated)` for alpha >= 0.76

Also covers:
- `rgba(148,163,184, *)` border alphas across the FULL range (round 1 only
  did 0.12-0.18; ~30 sites use 0.22-0.28).
- `rgba(255,255,255, *)` glass overlays for alpha 0-0.20 mapped to
  `var(--bg-card | bg-overlay-light | bg-overlay-medium)`.

**Result: 125 additional replacements across 43 files.**

### 2. Task Workbench banner unhardcoded

Round 1 of P-5 had a deliberate override:

```css
html[data-theme="light"] [data-task-workbench] {
  background: linear-gradient(180deg, #2d3138, #353a44) !important;
  color: #fff !important;
}
```

User QA explicitly flagged this band as "an intrusion in an otherwise
light-mode UI". Replaced with theme-following tokens
(`var(--bg-elevated) → var(--bg-card-hover)`, `color: var(--text)`).

### 3. Light-mode highlight.js palette

The `:root` palette ships GitHub Dark Dimmed colors which are unreadable
on a light bg. Appended a complete `html[data-theme="light"] .hljs-*`
override block using the GitHub Light palette.

### 4. New e2e: `desktop/tests/e2e/light-theme-smoke.spec.ts`

Switches the live app to `data-theme="light"` via DOM mutation, then
asserts using computed style luminance:

- LT-1: `data-theme="light"` actually applied
- LT-2: html / root / body — at least one has light bg (lum >= 180)
- LT-3: largest panel surface under #root is light
- LT-4: NO `<pre>` block has a dark bg (would catch the markdown
  regression that motivated round 2)
- LT-5: WORKSPACE CONTEXT card text contrasts (lum < 100)
- LT-6: title bar text reads dark
- **LT-7: NO surface > 5000 px² has lum < 60** — this is the regression
  guard that would have failed on round 1 because of `<pre>` and
  WorktreePanel cards.

### 5. desktop-e2e.spec.ts hardening

Two pre-existing test bugs surfaced once the multi-spec run grew bigger:

- The CDP page picker grabbed `view:pet-companion` (transparent overlay,
  innerText=0) instead of `view:main` (the actual chat surface).
- J3's `Ctrl+Shift+S` toggle could leave the main window hidden, after
  which J1/J2 of subsequent reruns failed because the page wasn't there.

Fixed by:
- `beforeAll` actively invokes `desktop_bridge_open_chat_panel` if no
  `view:main` is found, then waits for that page to register.
- `beforeEach` runs `ensureMainPageReady()` which probes
  `document.body.innerText.length > 0` and re-invokes the bridge if the
  body is empty.

## Validation

- `npx tsc --noEmit` clean
- `npx vitest run` — 91 / 91
- `npx tauri build --bundles nsis` — `Agentrix Desktop_0.4.5_x64-setup.exe` produced
- E2E with the running 0.4.5 release exe (CDP on port 9222), all 5 specs:

| Spec | Passed |
|------|--------|
| pet-build-smoke | 9 / 9 |
| desktop-e2e | 15 / 15 |
| v4-full-audit | 57 / 57 |
| v4-panels-deep | 53 / 53 |
| **light-theme-smoke** (new) | **5 / 5** (2 skipped, no-target-element gates) |
| **Total** | **139 / 141** (2 conditional skips, 0 failed) |

## Files changed

- New: `desktop/scripts/migrate-light-theme-colors-v2.mjs`,
  `desktop/tests/e2e/light-theme-smoke.spec.ts`,
  `memories/repo/desktop-pre-launch-p2-r2-light-fix-2026-05-23.md`
- Edited: 43 component .tsx files (125 replacements via codemod),
  `desktop/src/styles/global.css`,
  `desktop/tests/e2e/desktop-e2e.spec.ts`
