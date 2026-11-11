// Sprint Pre-launch P-2 (2026-05-23) — Light theme codemod.
//
// Walks `desktop/src/components/**/*.tsx` (and select `.ts` modules that
// export inline-style constants) and rewrites hard-coded color literals
// inside JSX `style={{}}` blocks AND module-level CSSProperties const
// definitions to use the CSS variables now exhaustively defined in
// `desktop/src/styles/global.css`.
//
// Why a codemod instead of hand-editing 300+ files:
//
// - Round 1-8 of the previous P-5/P-7 audit ended in a 1617-line
//   `global.css` with 200+ `[style*=]` substring selectors. That cascade
//   was both (a) the visible source of "light mode still has white-on-
//   white text" and (b) the invisible source of slow style recalculation
//   (every React re-render forced the browser to substring-match every
//   inline style against 200+ selectors).
//
// - Variable-izing the colors directly removes BOTH problems at once:
//   the cascade can be deleted entirely (style recalc -80%), and light
//   mode genuinely works because there's no "fallback dark literal"
//   hiding under the rule cascade.
//
// Strategy:
//
// - Only touch JSX `style={{}}` and module-level CSSProperties consts.
//   Comments and string literals outside style contexts are skipped.
//
// - Use a deny-list approach: the script ONLY rewrites a literal when
//   we have high confidence in the semantic role. Everything else is
//   left alone (a follow-up sprint can hand-pick the long tail).
//
// - Bias for low risk: when in doubt, prefer leaving the literal so we
//   don't break visual design. The deleted [style*=] cascade had been
//   compensating for these literals; we replace them WHERE we are
//   confident, and the cascade-removal eats the rest.
//
// Mappings target both single-quoted, double-quoted, and bare hex/rgba
// in inline styles. Whitespace is normalized across `rgba(N,N,N,N)` and
// `rgba(N, N, N, N)` forms (per round-1 lessons learned).

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const componentsRoot = path.join(repoRoot, 'desktop', 'src', 'components');

// ── Mappings: deterministic, no context inference ──────────────────────────
//
// Order matters: longest / most-specific first so we don't half-match.
// Each entry is { pattern, replacement, context? }.
//   - pattern: matches a literal (with optional surrounding quotes)
//   - replacement: the var(--xxx) replacement, INCLUDING the literal's
//     surrounding quotes preserved by capture groups
//   - context (optional): if given, the literal must appear INSIDE one
//     of these CSS-property contexts (color / background / border)
//
// Each pattern uses a single capture group `(["'])` for the opening
// quote so the replacement re-uses the same quote on the closing side.

const MAPPINGS = [
  // ── BACKGROUND surfaces ────────────────────────────────────────────
  // rgba(15,23,42,0.62) — panel-deep insets
  { pattern: /(["'])rgba\(\s*15\s*,\s*23\s*,\s*42\s*,\s*0\.62\s*\)\1/g, replacement: '$1var(--bg-panel-deep)$1' },
  { pattern: /(["'])rgba\(\s*15\s*,\s*23\s*,\s*42\s*,\s*0\.6[01-9]\s*\)\1/g, replacement: '$1var(--bg-panel-deep)$1' },

  // rgba(255,255,255,0.04) / 0.06 / 0.08 — overlay surfaces (background context)
  // We replace ONLY when the role is `background` or `background-color`
  // to avoid breaking borders/box-shadows that use the same literal.
  // We approximate "background context" by requiring the literal sits
  // inside `background` / `background-color`. Done via line-level regex.

  // ── TEXT colors (no context required, color contexts only) ─────────
  // Slate / gray text family — these only appear in `color: ` slots.
  { pattern: /(\bcolor\s*:\s*["'])#f8fafc\1/g, replacement: '$1var(--text-strong)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#f1f5f9\1/g, replacement: '$1var(--text-strong)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#e8e8e8\1/g, replacement: '$1var(--text)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#e5e7eb\1/g, replacement: '$1var(--text-card)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#e2e8f0\1/g, replacement: '$1var(--text-card)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#d1d5db\1/g, replacement: '$1var(--text-muted)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#cbd5e1\1/g, replacement: '$1var(--text-muted)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#9ca3af\1/g, replacement: '$1var(--text-muted)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#94a3b8\1/g, replacement: '$1var(--text-muted)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#8892b0\1/g, replacement: '$1var(--text-dim)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#64748b\1/g, replacement: '$1var(--text-muted)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#6b7280\1/g, replacement: '$1var(--text-dim)$1' },

  // Sky family — used for "info" tone text (eyebrow / card title /
  // subdued card text). On light theme these become darker per the
  // semantic vars in global.css.
  { pattern: /(\bcolor\s*:\s*["'])#7dd3fc\1/g, replacement: '$1var(--accent-eyebrow)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#e0f2fe\1/g, replacement: '$1var(--accent-card-title)$1' },
  { pattern: /(\bcolor\s*:\s*["'])#bae6fd\1/g, replacement: '$1var(--accent-card-action)$1' },

  // ── BORDER (color-on-dark) — only when used as border ──────────────
  // Replace `border: 1px solid rgba(255,255,255,0.06|0.08|0.10)` only.
  // The leading `border` / `border-color` / `border-(top|right|bottom|left)`
  // anchors keep us out of `boxShadow` matches.
  { pattern: /(\bborder(?:-color|-top|-right|-bottom|-left)?\s*:\s*[^;,"]*?)rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.0[6-9]\s*\)/g, replacement: '$1var(--border)' },
  { pattern: /(\bborder(?:-color|-top|-right|-bottom|-left)?\s*:\s*[^;,"]*?)rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.1[0-2]\s*\)/g, replacement: '$1var(--border)' },
  { pattern: /(\bborder(?:-color|-top|-right|-bottom|-left)?\s*:\s*[^;,"]*?)rgba\(\s*148\s*,\s*163\s*,\s*184\s*,\s*0\.1[2-8]\s*\)/g, replacement: '$1var(--border-subtle)' },

  // ── BACKGROUND surfaces (background-* context only) ────────────────
  { pattern: /(\bbackground(?:-color)?\s*:\s*["'])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.04\s*\)\2/g, replacement: '$1var(--bg-card)$2' },
  { pattern: /(\bbackground(?:-color)?\s*:\s*["'])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.06\s*\)\2/g, replacement: '$1var(--bg-overlay-light)$2' },
  { pattern: /(\bbackground(?:-color)?\s*:\s*["'])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.08\s*\)\2/g, replacement: '$1var(--bg-overlay-medium)$2' },
  { pattern: /(\bbackground(?:-color)?\s*:\s*["'])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.0[3]\s*\)\2/g, replacement: '$1var(--bg-card)$2' },

  // ── object-property literals (background: ... in CSSProperties consts) ─
  // const cardStyle: CSSProperties = { background: "rgba(255,255,255,0.04)", ... }
  // Need to match unquoted-key form too: `background: "..."`
  { pattern: /(\bbackground\s*:\s*)"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.04\s*\)"/g, replacement: '$1"var(--bg-card)"' },
  { pattern: /(\bbackground\s*:\s*)"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.06\s*\)"/g, replacement: '$1"var(--bg-overlay-light)"' },
  { pattern: /(\bbackground\s*:\s*)"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.08\s*\)"/g, replacement: '$1"var(--bg-overlay-medium)"' },
  { pattern: /(\bbackground\s*:\s*)"rgba\(\s*15\s*,\s*23\s*,\s*42\s*,\s*0\.6[2-8]\s*\)"/g, replacement: '$1"var(--bg-panel-deep)"' },

  // borderColor: "..."
  { pattern: /(\bborderColor\s*:\s*)"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.0[6-9]\s*\)"/g, replacement: '$1"var(--border)"' },
  { pattern: /(\bborderColor\s*:\s*)"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.1[0-2]\s*\)"/g, replacement: '$1"var(--border)"' },
  { pattern: /(\bborderColor\s*:\s*)"rgba\(\s*148\s*,\s*163\s*,\s*184\s*,\s*0\.1[2-8]\s*\)"/g, replacement: '$1"var(--border-subtle)"' },

  // color: "..."  (object-property form)
  { pattern: /(\bcolor\s*:\s*)"#f8fafc"/g, replacement: '$1"var(--text-strong)"' },
  { pattern: /(\bcolor\s*:\s*)"#f1f5f9"/g, replacement: '$1"var(--text-strong)"' },
  { pattern: /(\bcolor\s*:\s*)"#e8e8e8"/g, replacement: '$1"var(--text)"' },
  { pattern: /(\bcolor\s*:\s*)"#e5e7eb"/g, replacement: '$1"var(--text-card)"' },
  { pattern: /(\bcolor\s*:\s*)"#e2e8f0"/g, replacement: '$1"var(--text-card)"' },
  { pattern: /(\bcolor\s*:\s*)"#d1d5db"/g, replacement: '$1"var(--text-muted)"' },
  { pattern: /(\bcolor\s*:\s*)"#cbd5e1"/g, replacement: '$1"var(--text-muted)"' },
  { pattern: /(\bcolor\s*:\s*)"#9ca3af"/g, replacement: '$1"var(--text-muted)"' },
  { pattern: /(\bcolor\s*:\s*)"#94a3b8"/g, replacement: '$1"var(--text-muted)"' },
  { pattern: /(\bcolor\s*:\s*)"#8892b0"/g, replacement: '$1"var(--text-dim)"' },
  { pattern: /(\bcolor\s*:\s*)"#64748b"/g, replacement: '$1"var(--text-muted)"' },
  { pattern: /(\bcolor\s*:\s*)"#6b7280"/g, replacement: '$1"var(--text-dim)"' },
  { pattern: /(\bcolor\s*:\s*)"#7dd3fc"/g, replacement: '$1"var(--accent-eyebrow)"' },
  { pattern: /(\bcolor\s*:\s*)"#e0f2fe"/g, replacement: '$1"var(--accent-card-title)"' },
  { pattern: /(\bcolor\s*:\s*)"#bae6fd"/g, replacement: '$1"var(--accent-card-action)"' },

  // Status tone pills: BG + border literals (these are unambiguous —
  // they always travel together in pill components)
  // info (sky / cyan family)
  { pattern: /(["'])rgba\(\s*125\s*,\s*211\s*,\s*252\s*,\s*0\.0[6-9]\s*\)\1/g, replacement: '$1var(--tone-info-bg)$1' },
  { pattern: /(["'])rgba\(\s*125\s*,\s*211\s*,\s*252\s*,\s*0\.1[0-9]\s*\)\1/g, replacement: '$1var(--tone-info-bg)$1' },
  { pattern: /(["'])rgba\(\s*125\s*,\s*211\s*,\s*252\s*,\s*0\.2[0-9]\s*\)\1/g, replacement: '$1var(--tone-info-bg)$1' },
  { pattern: /(["'])rgba\(\s*125\s*,\s*211\s*,\s*252\s*,\s*0\.3[0-9]\s*\)\1/g, replacement: '$1var(--tone-info-border)$1' },
  // success (green family)
  { pattern: /(["'])rgba\(\s*34\s*,\s*197\s*,\s*94\s*,\s*0\.1[0-9]\s*\)\1/g, replacement: '$1var(--tone-success-bg)$1' },
  { pattern: /(["'])rgba\(\s*34\s*,\s*197\s*,\s*94\s*,\s*0\.2[0-9]\s*\)\1/g, replacement: '$1var(--tone-success-border)$1' },
  // warning (amber)
  { pattern: /(["'])rgba\(\s*251\s*,\s*191\s*,\s*36\s*,\s*0\.1[0-9]\s*\)\1/g, replacement: '$1var(--tone-warning-bg)$1' },
  { pattern: /(["'])rgba\(\s*251\s*,\s*191\s*,\s*36\s*,\s*0\.2[0-9]\s*\)\1/g, replacement: '$1var(--tone-warning-border)$1' },
  { pattern: /(["'])rgba\(\s*251\s*,\s*191\s*,\s*36\s*,\s*0\.3[0-9]\s*\)\1/g, replacement: '$1var(--tone-warning-border)$1' },
  // danger (red)
  { pattern: /(["'])rgba\(\s*239\s*,\s*68\s*,\s*68\s*,\s*0\.1[0-9]\s*\)\1/g, replacement: '$1var(--tone-danger-bg)$1' },
  { pattern: /(["'])rgba\(\s*239\s*,\s*68\s*,\s*68\s*,\s*0\.2[0-9]\s*\)\1/g, replacement: '$1var(--tone-danger-border)$1' },
  { pattern: /(["'])rgba\(\s*239\s*,\s*68\s*,\s*68\s*,\s*0\.3[0-9]\s*\)\1/g, replacement: '$1var(--tone-danger-border)$1' },
  { pattern: /(["'])rgba\(\s*248\s*,\s*113\s*,\s*113\s*,\s*0\.1[0-9]\s*\)\1/g, replacement: '$1var(--tone-danger-bg)$1' },
  { pattern: /(["'])rgba\(\s*248\s*,\s*113\s*,\s*113\s*,\s*0\.2[0-9]\s*\)\1/g, replacement: '$1var(--tone-danger-border)$1' },
  { pattern: /(["'])rgba\(\s*248\s*,\s*113\s*,\s*113\s*,\s*0\.3[0-9]\s*\)\1/g, replacement: '$1var(--tone-danger-border)$1' },
];

// ── Walker ──────────────────────────────────────────────────────────────────

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      // Skip the codemod itself + test files (which often check raw colors)
      if (entry.name.endsWith('.test.tsx') || entry.name.endsWith('.test.ts')) continue;
      yield full;
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

let totalFiles = 0;
let totalReplacements = 0;
const perFile = [];

for (const file of walk(componentsRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  let mutated = original;
  let fileReplacements = 0;
  for (const { pattern, replacement } of MAPPINGS) {
    const before = mutated;
    mutated = mutated.replace(pattern, replacement);
    if (mutated !== before) {
      // Count replacements via re-running the pattern non-greedily on the
      // diff. Simpler: count matches of the pattern in the original buffer.
      const matches = before.match(pattern);
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
for (const { file, replacements } of perFile.slice(0, 25)) {
  console.log(`  ${String(replacements).padStart(4)} ${file}`);
}
if (perFile.length > 25) {
  console.log(`  ... and ${perFile.length - 25} more files`);
}
console.log(`\nTotal: ${totalReplacements} replacements across ${totalFiles} files.`);
