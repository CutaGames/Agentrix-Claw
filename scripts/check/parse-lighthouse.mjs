#!/usr/bin/env node
/**
 * Parse a single Lighthouse JSON report and emit a one-line summary.
 *
 * Usage: node scripts/check/parse-lighthouse.mjs <path-to-json>
 */
import * as fs from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('usage: parse-lighthouse.mjs <json>');
  process.exit(2);
}
const raw = await fs.readFile(file, 'utf8');
const r = JSON.parse(raw);
const cat = r.categories || {};
const a = r.audits || {};
const out = {
  url: r.finalDisplayedUrl || r.requestedUrl,
  fetchTime: r.fetchTime,
  formFactor: r.configSettings?.formFactor,
  perf: Math.round((cat.performance?.score ?? 0) * 100),
  a11y: Math.round((cat.accessibility?.score ?? 0) * 100),
  bp: Math.round((cat['best-practices']?.score ?? 0) * 100),
  seo: Math.round((cat.seo?.score ?? 0) * 100),
  lcpMs: Math.round(a['largest-contentful-paint']?.numericValue ?? 0),
  fcpMs: Math.round(a['first-contentful-paint']?.numericValue ?? 0),
  tbtMs: Math.round(a['total-blocking-time']?.numericValue ?? 0),
  cls: Number((a['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
  ttiMs: Math.round(a.interactive?.numericValue ?? 0),
  totalBytes: a['total-byte-weight']?.numericValue ?? 0,
  domNodes:
    a['dom-size']?.details?.items?.find?.((i) => i.statistic?.includes?.('Total'))?.value
      ?.value ?? null,
};
console.log(JSON.stringify(out, null, 2));
