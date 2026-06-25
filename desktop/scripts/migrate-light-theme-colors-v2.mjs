// Sprint Pre-launch P-2 round 2 (2026-05-23) — Light theme codemod EXTENDED.
//
// Round 1 (`migrate-light-theme-colors.mjs`) only handled a small set of
// well-known alpha values (0.04 / 0.06 / 0.08). User QA on the running 0.4.5
// build still showed dark backgrounds for:
//   - Markdown <pre> blocks (rgba(13,17,23,0.85) / 0.6 / 0.75)
//   - Approval sheet (rgba(15,23,42,0.96|0.92|0.6))
//   - WorktreePanel / SkillCanvasPanel hundreds of card surfaces
//     (rgba(15,23,42,0.28..0.88), rgba(2,8,23,0.44..0.62))
//   - PetProactiveBubble / PetCompanionWindow menu (rgba(20,20,28,0.94|0.96))
//   - FloatingBall toast/menu (rgba(22,33,62,0.95|0.98))
//
// Round 2 enumerates the FULL set of dark-blue / dark-slate literals and
// rewrites them as `var(--bg-{card|panel-deep|elevated})`. Every dark-blue
// rgba in the codebase falls into one of these buckets:
//
//   alpha < 0.5  -> --bg-card               (subtle inset)
//   alpha 0.5-0.75 -> --bg-panel-deep        (medium inset / overlay)
//   alpha >= 0.76 -> --bg-elevated           (solid card)
//
// On light theme these vars are #fafbfc / #f9fafb / #ffffff which gives
// the right "lift" without any forced dark.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const componentsRoot = path.join(repoRoot, 'desktop', 'src', 'components');

// Dark blue / slate triplets used as "panel/card" surfaces in dark theme.
// Each will be rewritten to var(--bg-card) / --bg-panel-deep / --bg-elevated
// based on alpha.
const DARK_RGB_TRIPLETS = [
  '13,\\s*17,\\s*23',     // GitHub Dark Dimmed
  '15,\\s*23,\\s*42',     // slate-900
  '2,\\s*8,\\s*23',       // slate-950
  '20,\\s*20,\\s*28',     // pet menu bg
  '22,\\s*33,\\s*62',     // legacy floating ball / voice card
  '9,\\s*14,\\s*24',      // worktree backdrop
  '18,\\s*24,\\s*37',     // worktree gradient stop
  '11,\\s*16,\\s*26',     // worktree gradient stop
];

function bucketFor(alphaStr) {
  const a = parseFloat(alphaStr);
  if (a >= 0.76) return 'var(--bg-elevated)';
  if (a >= 0.5) return 'var(--bg-panel-deep)';
  return 'var(--bg-card)';
}

function buildRules() {
  const rules = [];
  for (const triplet of DARK_RGB_TRIPLETS) {
    // Matches: rgba(R,G,B,A) inside a string literal "..." used in any context.
    // We ignore unquoted form (rare in inline objects). Capture group 1 is
    // the opening quote, group 2 is the alpha string.
    const rx = new RegExp(`(["'])rgba\\(\\s*${triplet}\\s*,\\s*(0?\\.\\d+|0|1)\\s*\\)\\1`, 'g');
    rules.push({ rx, replace: (_, q, alpha) => `${q}${bucketFor(alpha)}${q}` });
  }
  return rules;
}

const RULES = buildRules();

// Border-color rgba(148,163,184,*) — slate-400 alpha. Round 1 only covered
// 0.12-0.18; many sites use 0.22 / 0.24 / 0.28. Migrate the full range.
RULES.push({
  rx: /(["'])rgba\(\s*148,\s*163,\s*184,\s*(0?\.\d+|0|1)\s*\)\1/g,
  replace: (_, q, alpha) => {
    const a = parseFloat(alpha);
    if (a >= 0.22) return `${q}var(--border-strong)${q}`;
    return `${q}var(--border-subtle)${q}`;
  },
});

// Light-on-dark glass overlays used as borders/bg with alpha > 0.10. Round 1
// only handled 0.04-0.10. Catch 0.10+ as well.
RULES.push({
  rx: /(["'])rgba\(\s*255,\s*255,\s*255,\s*(0?\.\d+)\s*\)\1/g,
  replace: (_, q, alpha) => {
    const a = parseFloat(alpha);
    // alpha < 0.05 => bg-card (subtle)
    // alpha 0.05-0.12 => bg-overlay-light
    // alpha 0.12-0.20 => bg-overlay-medium
    // alpha > 0.20 => leave alone (e.g. a tooltip with bright bg) — these
    // are usually NOT theme-sensitive (e.g. on top of an accent gradient)
    if (a < 0.05) return `${q}var(--bg-card)${q}`;
    if (a < 0.12) return `${q}var(--bg-overlay-light)${q}`;
    if (a < 0.20) return `${q}var(--bg-overlay-medium)${q}`;
    return _;
  },
});

// Walk and apply.
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      if (entry.name.endsWith('.test.tsx') || entry.name.endsWith('.test.ts')) continue;
      yield full;
    }
  }
}

let totalFiles = 0;
let totalReplacements = 0;
const perFile = [];

for (const file of walk(componentsRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  let mutated = original;
  let fileReplacements = 0;
  for (const { rx, replace } of RULES) {
    const before = mutated;
    mutated = mutated.replace(rx, replace);
    if (mutated !== before) {
      // Approximate count: rerun rx against `before`.
      const matches = before.match(rx);
      if (matches) fileReplacements += matches.length;
    }
  }
  if (mutated !== original) {
    fs.writeFileSync(file, mutated, 'utf8');
    totalFiles += 1;
    totalReplacements += fileReplacements;
    perFile.push({ file: path.relative(repoRoot, file), replacements: fileReplacements });
  }
}

perFile.sort((a, b) => b.replacements - a.replacements);
for (const { file, replacements } of perFile.slice(0, 30)) {
  console.log(`  ${String(replacements).padStart(4)} ${file}`);
}
if (perFile.length > 30) {
  console.log(`  ... and ${perFile.length - 30} more files`);
}
console.log(`\nRound 2 total: ${totalReplacements} replacements across ${totalFiles} files.`);
