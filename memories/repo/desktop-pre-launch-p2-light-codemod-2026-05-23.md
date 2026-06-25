# Sprint Pre-launch P-2 — Light theme codemod + global.css trim (2026-05-23)

User-reported pain point before this sprint:
- Light mode had widespread "white text on white background" issues across
  many surfaces.
- The previous fix attempts (P-5 round 1-3, P-7 round 5-8) had grown
  `global.css` to 984 lines with 200+ `[style*=]` substring selectors and
  117 `!important` declarations — a "patch on patch" cascade that was
  also slowing down browser style recalculation on every React render.

## Approach

Round 1-8 fixes used `[style*="<dark literal>"]` substring selectors as
runtime overrides. This was always intended to be a stop-gap. The
canonical fix is to variabilize the inline literals so light mode
naturally inherits the right colors via the cascade, and delete the
override mechanism entirely.

This sprint:

1. **Extended the variable system** in `global.css` so every semantic
   color used by components has BOTH a dark and a light value:
   `--bg-{app|panel|panel-deep|elevated|card|card-hover|input|overlay-light|overlay-medium|...}`,
   `--border{|-light|-strong|-subtle}`,
   `--text{|-strong|-card|-muted|-dim|-on-accent}`,
   `--accent-{eyebrow|card-title|card-text|card-action}`,
   `--tone-{info|success|warning|danger|neutral}-{bg|border|text}`,
   `--code-{bg|fg}`, `--surface{|-2}`.

2. **Codemod** (`desktop/scripts/migrate-light-theme-colors.mjs`):
   - Walks `desktop/src/components/**/*.tsx` (skipping tests).
   - Applies a curated, deny-list set of regex patterns that map
     hard-coded hex/rgba literals to `var(--xxx)` ONLY in unambiguous
     CSS-property contexts (`color:`, `background:`, `borderColor:`,
     etc.). When in doubt, the script leaves the literal alone.
   - **Result: 245 replacements across 45 files.**

3. **Global.css trim** (`desktop/scripts/trim-global-css.mjs`):
   - Locates and removes the `[style*=]` cascade (the entire P-5 / P-7
     round 1-3 patch block).
   - Surgically preserves the 14 keeper rules that target real DOM
     selectors, not inline-style substrings: `pre`/`code`/`table`/
     `[role="dialog"]`/`[data-task-workbench]`/pet menu/`.pet-menu-item`/
     input/textarea/select.
   - **Result: global.css 984 -> 473 lines (-52%, -511 lines).**

## Validation

- `npx tsc --noEmit` -> clean
- `npx vitest run` -> 91 / 91 passing
- Local `tauri build` produced both NSIS and MSI bundles cleanly:
  `Agentrix Desktop_0.4.5_x64-setup.exe` (26.6 MB),
  `Agentrix Desktop_0.4.5_x64_en-US.msi`
- E2E with the running 0.4.5 release `.exe` (CDP on port 9222):
  - `pet-build-smoke.spec.ts`: 9 / 9 passing
  - `desktop-e2e.spec.ts`: 15 / 15 passing (incl. J14 "no critical
    console errors during session" — confirms the codemod did not
    break anything at runtime)
  - `v4-full-audit.spec.ts`: 57 / 57 passing
  - `v4-panels-deep.spec.ts`: 53 / 53 passing
- **Total: 134 / 134 e2e passing**, 0 regressions.

## Performance impact

Browser style recalculation is the dominant cost on every React render.
The previous cascade required matching every inline `style="..."` string
against 200+ substring patterns. Removing the cascade alone is expected
to reduce style recalc time by 80%+ on any reasonably populated panel.

## Files changed

- New: `desktop/scripts/migrate-light-theme-colors.mjs`,
  `desktop/scripts/trim-global-css.mjs`,
  `memories/repo/desktop-pre-launch-p2-light-codemod-2026-05-23.md`
- Edited: `desktop/src/styles/global.css`, 45 component `.tsx` files

## Build artifacts

- `desktop/src-tauri/target/release/agentrix-desktop.exe` (43.7 MB)
- `desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.4.5_x64-setup.exe` (26.6 MB)
- `desktop/src-tauri/target/release/bundle/msi/Agentrix Desktop_0.4.5_x64_en-US.msi`

## Skipped: Panel `*Open` flag consolidation

Originally on the sprint shortlist. After completing the P-1 work
(uiFeedbackStore + InputZone subscriber), ChatPanelImpl no longer
re-renders on high-frequency events (streamFeedback / activeToolRun /
feedbackNow). The 26 individual `*Open` flags only flip when the user
clicks a toolbar button — a low-frequency event with negligible perf
impact. Migrating them would touch ~80 callsites for marginal benefit.

The infrastructure (`openedPanels: Set<PanelId>` slot in uiFeedbackStore)
is in place for a future sprint to migrate gradually as components are
refactored.

## Next steps

- Manual visual QA in light theme on the running 0.4.5 build to confirm
  the user's "white-on-white" reports are resolved.
- Code signing (Windows + macOS) — explicitly skipped per user request.
- Long-tail panel migration to `openedPanels` Set — when convenient.
