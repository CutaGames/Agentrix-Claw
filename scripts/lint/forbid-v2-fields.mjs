#!/usr/bin/env node
/**
 * Multi-Agent v1 Property 6 lint — forbid writes to v2-reserved schema
 * fields and enum values.
 *
 * Spec: design.md §17 Property 6; tasks.md W5.11
 *
 * Scans backend TypeScript + SQL files for:
 *   - hired_from_user_id / hiredFromUserId being set non-null
 *   - subject_kind being set non-null
 *   - target_kind === 'marketplace-hire' being written (allowed: read +
 *     reject in agent-task-spawn.service.ts dispatch only)
 *   - battle mode in ('task_arena', 'tournament', 'arena_room') being written
 *
 * Returns exit 1 with violation list if any are found.
 *
 * Usage:
 *   npm run lint:forbid-v2
 *   node scripts/lint/forbid-v2-fields.mjs [--strict]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const SCAN_DIRS = [
  'backend/src',
  'shared',
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  'target',
  '__tests__',
]);

const FILE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql']);

// Files / globs that are *allowed* to mention these forbidden tokens
// because they intentionally reject them (defense-in-depth) or document them.
// v2 (W7+) branches add new allow-list entries below.
const ALLOWLIST = [
  'backend/src/modules/agent-task/agent-task.service.ts',           // v1 reject + v2 flag-gated accept
  'backend/src/modules/agent-task/agent-task.module.ts',            // module comment
  'backend/src/modules/agent-task/agent-task.worker.ts',            // v2 W7 marketplace-hire hook
  'backend/src/modules/multi-agent/agent-task-spawn.service.ts',    // v1 reject + v2 W7 dispatcher
  'backend/src/modules/multi-agent/multi-agent-marketplace.service.ts', // v2 W7 marketplace SHIP
  'backend/src/modules/multi-agent/multi-agent-marketplace.controller.ts', // v2 W7 endpoints
  'backend/src/entities/agent-task.entity.ts',                      // schema comment
  'backend/src/migrations/1797000000000-MultiAgentSchemaPart1.ts',  // additive schema (column declaration only)
  'backend/src/migrations/1797000001000-MultiAgentSchemaPart2.ts',
  'backend/src/migrations/1797000002000-MultiAgentSchemaPart3.ts',
  'shared/types/agent-tools.ts',                                    // type union includes marketplace-hire
  'scripts/lint/forbid-v2-fields.mjs',                              // this script itself
];

// Patterns that constitute a *write*. We allow reads / type unions / comments.
const PATTERNS = [
  {
    name: 'hired_from_user_id / hiredFromUserId write',
    re: /\b(hired_from_user_id|hiredFromUserId)\s*[:=]\s*(?!null|undefined)[^,;\n}]+/g,
    // Allow patterns like `hiredFromUserId: null` / `: undefined` / `: NULL`
    isViolation: (match) => !/^\s*(null|undefined|NULL)\b/i.test(match.split(/[:=]/)[1] ?? ''),
  },
  {
    name: 'subject_kind write',
    re: /\bsubject_kind\s*[:=]\s*(?!null|undefined)[^,;\n}]+/g,
    isViolation: (match) => !/^\s*(null|undefined|NULL)\b/i.test(match.split(/[:=]/)[1] ?? ''),
  },
  {
    name: 'target_kind = marketplace-hire write',
    re: /target_kind\s*[:=]\s*['"]marketplace-hire['"]/g,
    isViolation: () => true,
  },
  {
    name: 'targetKind = marketplace-hire write',
    re: /targetKind\s*[:=]\s*['"]marketplace-hire['"]/g,
    isViolation: () => true,
  },
  {
    name: 'battle mode v2 enum write',
    re: /\bmode\s*[:=]\s*['"](task_arena|tournament|arena_room)['"]/g,
    isViolation: () => true,
  },
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(path);
    } else if (st.isFile()) {
      const ext = name.slice(name.lastIndexOf('.'));
      if (FILE_EXT.has(ext)) yield path;
    }
  }
}

function scanFile(absPath) {
  const rel = relative(repoRoot, absPath).replace(/\\/g, '/');
  if (ALLOWLIST.includes(rel)) return [];
  let text;
  try {
    text = readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }
  const violations = [];
  for (const pat of PATTERNS) {
    pat.re.lastIndex = 0;
    let m;
    while ((m = pat.re.exec(text))) {
      if (!pat.isViolation(m[0])) continue;
      const line = text.slice(0, m.index).split('\n').length;
      violations.push({ file: rel, line, snippet: m[0].slice(0, 120), rule: pat.name });
    }
  }
  return violations;
}

function main() {
  const allViolations = [];
  for (const d of SCAN_DIRS) {
    const abs = join(repoRoot, d);
    for (const file of walk(abs)) {
      allViolations.push(...scanFile(file));
    }
  }

  if (allViolations.length === 0) {
    console.log('✅ Property 6 lint passed — no v2 placeholder field writes detected.');
    process.exit(0);
  }

  console.error('❌ Property 6 lint found violations:');
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.snippet}`);
  }
  console.error(
    '\nv2 placeholder fields (hired_from_user_id / subject_kind / target_kind=marketplace-hire / battle mode v2 enums) MUST NOT be written in v1.',
  );
  console.error('See: design.md §17 Property 6 + tasks.md W5.11');
  process.exit(1);
}

main();
