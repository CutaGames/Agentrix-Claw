/**
 * Lighthouse audit runner (Sprint W-2 / W-P1-2).
 *
 * Runs Lighthouse against a list of production URLs and produces a
 * markdown report under tests/reports/LIGHTHOUSE_<date>.md.
 *
 * Requires `lighthouse` CLI globally (or via npx).
 *
 * Usage:
 *   ts-node scripts/lighthouse-audit.ts [--mobile|--desktop] [--ci]
 *
 * Environment:
 *   LIGHTHOUSE_BASE_URL  default https://agentrix.top
 *   LIGHTHOUSE_OUT_DIR   default tests/reports
 *
 * Targets (P0 marketing + key conversion paths):
 *   /              homepage
 *   /pricing       conversion
 *   /download      conversion
 *   /market        marketplace landing
 *   /market/leaderboard
 *   /help/desktop  user manual
 *   /clans         marketing
 *   /showcase      marketing
 *
 * GA targets (per requirements US-G2/W-P1-2):
 *   - Performance score   >= 80
 *   - LCP                 < 2.5s
 *   - TBT                 < 200ms
 *   - CLS                 < 0.1
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const BASE_URL = process.env.LIGHTHOUSE_BASE_URL || 'https://agentrix.top';
const OUT_DIR = process.env.LIGHTHOUSE_OUT_DIR || 'tests/reports';

const TARGETS = [
  '/',
  '/pricing',
  '/download',
  '/market',
  '/market/leaderboard',
  '/help/desktop',
  '/clans',
  '/showcase',
];

interface Score {
  url: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcpMs: number;
  tbtMs: number;
  cls: number;
  ttiMs: number;
}

async function runLighthouse(url: string, formFactor: 'mobile' | 'desktop'): Promise<Score | null> {
  return new Promise((resolve) => {
    const args = [
      '--no-install',
      'lighthouse',
      url,
      '--quiet',
      '--chrome-flags=--headless --no-sandbox',
      '--output=json',
      `--form-factor=${formFactor}`,
      formFactor === 'desktop'
        ? '--preset=desktop'
        : '--preset=perf',
      '--throttling-method=simulate',
    ];
    let json = '';
    let stderr = '';
    const ps = spawn('npx', args, { shell: true });
    ps.stdout.on('data', (d) => (json += d.toString()));
    ps.stderr.on('data', (d) => (stderr += d.toString()));
    ps.on('close', (code) => {
      if (code !== 0) {
        console.error(`[lighthouse] ${url} exited ${code}: ${stderr.slice(-200)}`);
        resolve(null);
        return;
      }
      try {
        const result = JSON.parse(json);
        resolve({
          url,
          performance: Math.round((result.categories?.performance?.score ?? 0) * 100),
          accessibility: Math.round((result.categories?.accessibility?.score ?? 0) * 100),
          bestPractices: Math.round((result.categories?.['best-practices']?.score ?? 0) * 100),
          seo: Math.round((result.categories?.seo?.score ?? 0) * 100),
          lcpMs: Math.round(result.audits?.['largest-contentful-paint']?.numericValue ?? 0),
          tbtMs: Math.round(result.audits?.['total-blocking-time']?.numericValue ?? 0),
          cls: Number((result.audits?.['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
          ttiMs: Math.round(result.audits?.['interactive']?.numericValue ?? 0),
        });
      } catch (e) {
        console.error(`[lighthouse] ${url} parse error: ${(e as Error).message}`);
        resolve(null);
      }
    });
  });
}

function fmt(n: number, suffix = ''): string {
  return `${n}${suffix}`;
}

function status(score: number, target: number): string {
  if (score >= target) return '✅';
  if (score >= target * 0.85) return '🟡';
  return '🔴';
}

async function main() {
  const formFactor = (process.argv.includes('--desktop') ? 'desktop' : 'mobile') as
    | 'mobile'
    | 'desktop';
  const ciMode = process.argv.includes('--ci');

  console.log(`Lighthouse audit · ${formFactor} · ${TARGETS.length} URLs`);
  const scores: Score[] = [];
  for (const path of TARGETS) {
    const url = `${BASE_URL}${path}`;
    process.stdout.write(`  ${path} ... `);
    const s = await runLighthouse(url, formFactor);
    if (s) {
      scores.push(s);
      console.log(`Perf=${s.performance} LCP=${(s.lcpMs / 1000).toFixed(1)}s`);
    } else {
      console.log('FAIL');
    }
  }

  // Build markdown
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Lighthouse Audit · ${formFactor} · ${today}`);
  lines.push('');
  lines.push(`> Base URL: \`${BASE_URL}\`  ·  Form factor: **${formFactor}**`);
  lines.push('');
  lines.push('## GA targets');
  lines.push('');
  lines.push('- Performance score ≥ **80**');
  lines.push('- LCP < **2.5s**');
  lines.push('- TBT < **200ms**');
  lines.push('- CLS < **0.1**');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Path | Perf | A11y | BP | SEO | LCP | TBT | CLS | TTI |');
  lines.push('| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
  for (const s of scores) {
    const path = s.url.replace(BASE_URL, '');
    const lcpStatus = status(2500 - s.lcpMs, 0); // higher is better
    const tbtStatus = status(200 - s.tbtMs, 0);
    const clsStatus = s.cls < 0.1 ? '✅' : s.cls < 0.25 ? '🟡' : '🔴';
    lines.push(
      `| \`${path || '/'}\` | ${status(s.performance, 80)} ${s.performance} | ${s.accessibility} | ${s.bestPractices} | ${s.seo} | ${lcpStatus} ${(s.lcpMs / 1000).toFixed(1)}s | ${tbtStatus} ${s.tbtMs}ms | ${clsStatus} ${s.cls} | ${(s.ttiMs / 1000).toFixed(1)}s |`,
    );
  }

  // Aggregate
  if (scores.length > 0) {
    const avgPerf = Math.round(scores.reduce((s, r) => s + r.performance, 0) / scores.length);
    const avgLcp = scores.reduce((s, r) => s + r.lcpMs, 0) / scores.length;
    const avgTbt = scores.reduce((s, r) => s + r.tbtMs, 0) / scores.length;
    const avgCls = scores.reduce((s, r) => s + r.cls, 0) / scores.length;
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Avg performance: **${avgPerf}** ${status(avgPerf, 80)}`);
    lines.push(`- Avg LCP: **${(avgLcp / 1000).toFixed(2)}s** ${avgLcp < 2500 ? '✅' : avgLcp < 4000 ? '🟡' : '🔴'}`);
    lines.push(`- Avg TBT: **${Math.round(avgTbt)}ms** ${avgTbt < 200 ? '✅' : avgTbt < 600 ? '🟡' : '🔴'}`);
    lines.push(`- Avg CLS: **${avgCls.toFixed(3)}** ${avgCls < 0.1 ? '✅' : avgCls < 0.25 ? '🟡' : '🔴'}`);
  }

  await fs.mkdir(path.resolve(OUT_DIR), { recursive: true });
  const outPath = path.join(OUT_DIR, `LIGHTHOUSE_${formFactor}_${today}.md`);
  await fs.writeFile(outPath, lines.join('\n'), 'utf-8');
  console.log(`\n✓ Wrote ${outPath}`);

  if (ciMode) {
    const failed = scores.filter((s) => s.performance < 80);
    if (failed.length > 0) {
      console.error(`✗ ${failed.length} URLs failed performance gate (>=80)`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
