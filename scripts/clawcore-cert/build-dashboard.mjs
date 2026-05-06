#!/usr/bin/env node
/**
 * Phase 5 HW-12.4 — Cert dashboard JSON exporter.
 *
 * Runs the ClawCore certification jest suite with the JSON reporter, then
 * shapes the result into the schema consumed by frontend/pages/developers/cert.tsx
 * and writes it to frontend/public/clawcore-cert.json.
 *
 * Usage:
 *   node scripts/clawcore-cert/build-dashboard.mjs
 *   (CI calls this on every commit to v3-* branches.)
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const backend = resolve(repoRoot, 'backend');
const outDir = resolve(repoRoot, 'frontend', 'public');
const outFile = resolve(outDir, 'clawcore-cert.json');

console.log('==> Running cert suite via jest --json …');
const proc = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['jest', 'src/modules/device-registry/clawcore-cert.suite', '--json'],
  { cwd: backend, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
if (proc.status !== 0 && !proc.stdout) {
  console.error('jest run failed:', proc.stderr);
  process.exit(1);
}

const json = JSON.parse(proc.stdout);

// jest --json: testResults[i].assertionResults = [{ ancestorTitles, title, status }]
const groups = new Map();
for (const file of json.testResults) {
  for (const t of file.assertionResults || []) {
    const groupRaw = t.ancestorTitles[t.ancestorTitles.length - 1] || 'Other';
    const id = (t.title.match(/^(CERT-\d{3})/) || [, 'CERT-???'])[1];
    if (!groups.has(groupRaw)) groups.set(groupRaw, []);
    groups.get(groupRaw).push({
      id,
      title: t.title.replace(/^CERT-\d{3}:\s*/, ''),
      status: t.status, // 'passed' | 'failed' | 'todo' | 'skipped'
    });
  }
}

const summary = {
  generated_at: new Date().toISOString(),
  total: 0,
  passed: 0,
  failed: 0,
  todo: 0,
  groups: [],
};
for (const [name, items] of groups) {
  const passed = items.filter((i) => i.status === 'passed').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const todo = items.filter((i) => i.status === 'todo' || i.status === 'pending').length;
  summary.total += items.length;
  summary.passed += passed;
  summary.failed += failed;
  summary.todo += todo;
  summary.groups.push({ name, total: items.length, passed, failed, todo, items });
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(
  `==> Wrote ${outFile} — total=${summary.total}, passed=${summary.passed}, failed=${summary.failed}, todo=${summary.todo}`,
);
