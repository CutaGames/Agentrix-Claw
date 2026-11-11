// Sprint Pre-launch P-2 (2026-05-23) — Trim the [style*=] cascade from
// global.css.
//
// After the codemod replaces hard-coded literals with CSS variables, the
// 200+ `[style*=]` substring selectors in global.css are obsolete: there
// are no more matching literals. Removing them:
//
//   - Cuts style recalculation time dramatically (each [style*=] selector
//     forces the browser to substring-match every inline style).
//   - Eliminates "I patched this once already, why doesn't it stick"
//     debugging cycles (round 1-8 of the prior light audit).
//
// What we keep:
//   - The :root and [data-theme="light"] variable definitions
//   - General-purpose [data-theme="light"] rules that target real selectors
//     (pre, code, table, [role="dialog"], [data-task-workbench], pet menu)
//   - Pet window keepalive, scrollbars, animations, .md-body, .hljs
//
// What we remove:
//   - Every `html[data-theme="light"] [style*="..."]` rule
//   - The "FREE button fallback" / "outline button" / "uppercase eyebrow"
//     fallbacks that depended on the same substring matching mechanism
//   - The legacy intermediate variable extension block (the new top of the
//     file already defines all of these in both themes)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const cssPath = path.join(repoRoot, 'desktop', 'src', 'styles', 'global.css');

const original = fs.readFileSync(cssPath, 'utf8');

// Walk rule-by-rule and decide which to keep. We split on top-level
// `}` followed by newline, which is sufficient for this file's flat
// structure (no media queries / @-blocks containing component rules
// between the trim boundaries).

// First, isolate the prologue (up to the end of [data-theme="light"] block
// that opens with `[data-theme="light"] {`). We keep everything up to and
// including the first selector that follows that block, which is the
// `[data-theme="light"] body, [data-theme="light"] #root` rule.

// Marker A: just past the top-level theme variable definitions.
// Marker B: at the start of the global `*` reset (universal selector
// rules) — everything we want to KEEP after the cascade trim begins
// at this line.

// Detect line ending used by the file so our markers and inserted snippets
// match. Windows builds typically save with CRLF.
const EOL = original.includes('\r\n') ? '\r\n' : '\n';

const PROLOGUE_END_MARKER =
  `/*${EOL} * Sprint P-5 (2026-05-22) — Light theme comprehensive readability patch.`;
const RESET_START_MARKER = `* {${EOL}  margin: 0;${EOL}  padding: 0;${EOL}  box-sizing: border-box;${EOL}}`;

const prologueIdx = original.indexOf(PROLOGUE_END_MARKER);
if (prologueIdx === -1) {
  console.error('FATAL: prologue end marker not found. Aborting trim.');
  process.exit(1);
}
const resetIdx = original.indexOf(RESET_START_MARKER);
if (resetIdx === -1) {
  console.error('FATAL: reset-block start marker not found. Aborting trim.');
  process.exit(1);
}

// Region we cull: from the start of the P-5 audit comment to the start of
// the global `*` reset. We keep the prologue (variable definitions) and
// the epilogue (reset, html/body/root, pet window, scrollbars, animations,
// markdown body, hljs).

const prologue = original.slice(0, prologueIdx);
const culled = original.slice(prologueIdx, resetIdx);
const epilogue = original.slice(resetIdx);

// Inject a single line of "body color" rule into the prologue so the body
// still picks up var(--text) on light theme. (This was the rule that lived
// just before the [style*=] cascade.)
const KEPT_BODY_RULE = `
[data-theme="light"] body,
[data-theme="light"] #root {
  color: var(--text);
}
`.replaceAll('\n', EOL);

// From the culled region, surgically extract the rules we want to keep
// using anchored regex matches against well-known selectors that target
// real DOM (not inline-style substrings).

const KEEPERS = [
  // pre / code unified styling on light theme (used by markdown)
  /html\[data-theme="light"\] pre,\s*\n\s*html\[data-theme="light"\] code\s*\{[^}]*\}\s*\n/m,
  /html\[data-theme="light"\] pre code\s*\{[^}]*\}\s*\n/m,
  // tables
  /html\[data-theme="light"\] table\s*\{[^}]*\}\s*\n/m,
  /html\[data-theme="light"\] table th,\s*\n\s*html\[data-theme="light"\] table td\s*\{[^}]*\}\s*\n/m,
  // task workbench banner forced dark
  /html\[data-theme="light"\] \[data-task-workbench\]\s*\{[^}]*\}\s*\n/m,
  /html\[data-theme="light"\] \[data-task-workbench\] \*[^}]*\}\s*\n/m,
  // dialog modals on light
  /html\[data-theme="light"\]:not\(\[data-pet-window="1"\]\) \[role="dialog"\]\s*\{[^}]*\}\s*\n/m,
  // [role="menu"] pet menu rules + .pet-menu-item rules
  /\[role="menu"\]:not\(\[data-keep-light\]\)\s*\{[^}]*\}\s*\n/m,
  /\[role="menu"\]:not\(\[data-keep-light\]\) \[role="menuitem"\],\s*\n\s*\[role="menu"\]:not\(\[data-keep-light\]\) > div\s*\{[^}]*\}\s*\n/m,
  /\[role="menu"\]:not\(\[data-keep-light\]\) \[role="menuitem"\]:hover\s*\{[^}]*\}\s*\n/m,
  /\.pet-menu-item,\s*\n\.pet-menu-item \*,\s*\n\[role="menu"\] \.pet-menu-item,\s*\n\[role="menu"\] \.pet-menu-item \*\s*\{[^}]*\}\s*\n/m,
  /\.pet-menu-item\[data-danger\],\s*\n\.pet-menu-item\[data-danger\] \*\s*\{[^}]*\}\s*\n/m,
  // input / textarea / select on light theme — these target real selectors
  /html\[data-theme="light"\] input,\s*\n\s*html\[data-theme="light"\] textarea,\s*\n\s*html\[data-theme="light"\] select\s*\{[^}]*\}\s*\n/m,
  /html\[data-theme="light"\] input::placeholder,\s*\n\s*html\[data-theme="light"\] textarea::placeholder\s*\{[^}]*\}\s*\n/m,
];

const kept = KEEPERS.flatMap((rx) => {
  const m = culled.match(rx);
  return m ? [m[0].trim()] : [];
});

const TRIM_HEADER = `
/*
 * Sprint Pre-launch P-2 (2026-05-23) — Light theme rules.
 *
 * After the codemod migrated all hard-coded inline literals to CSS
 * variables (see desktop/scripts/migrate-light-theme-colors.mjs), the
 * giant [style*=] cascade that used to live here was no longer needed.
 *
 * The remaining rules below target real DOM selectors (not inline-style
 * substrings) and survive because they:
 *   - Apply general typography (pre/code/table)
 *   - Force the task-workbench banner dark on light theme by design
 *   - Provide the pet right-click menu its always-dark styling
 *   - Set up form input contrast on light theme
 */
`;

const rebuilt = `${prologue}${KEPT_BODY_RULE}\n${TRIM_HEADER}\n${kept.join('\n\n')}\n\n${epilogue}`;

// Sanity check: file should be MUCH shorter than before.
const originalLines = original.split('\n').length;
const newLines = rebuilt.split('\n').length;
const reduction = originalLines - newLines;

if (reduction < 300) {
  console.error(`FATAL: trim reduced only ${reduction} lines (expected 500+). Aborting to avoid silent regression.`);
  process.exit(1);
}

fs.writeFileSync(cssPath, rebuilt, 'utf8');
console.log(`global.css: ${originalLines} -> ${newLines} lines (-${reduction})`);
console.log(`Kept ${kept.length} of ${KEEPERS.length} keeper rules.`);
if (kept.length < KEEPERS.length) {
  console.warn('Warning: some KEEPERS regexes did not match. Inspect output for missing rules.');
}
