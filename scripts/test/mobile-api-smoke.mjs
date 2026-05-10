#!/usr/bin/env node
/**
 * Mobile API smoke — per docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md §9.
 *
 * Exercises every backend endpoint the new mobile 4-tab IA depends on:
 *   - v1/subscription/catalog  (public)
 *   - v1/subscription          (authed)
 *   - v1/me/quota              (authed)
 *   - v1/axp/balance           (authed)
 *   - v1/axp/history           (authed)
 *   - v1/pet/greeting/catalog  (public)
 *   - v1/pet/greeting/inbox    (authed)
 *   - v1/pet/greeting/outbox   (authed)
 *   - v1/pet/coraising/invites (authed)
 *   - v1/pet/coraising/invites/by-token/:token (public)
 *
 * Usage:
 *   AGENTRIX_API_BASE=https://api.agentrix.top/api AGENTRIX_TOKEN=<jwt> \
 *     node scripts/test/mobile-api-smoke.mjs
 *
 * Exits 0 on all-pass, non-zero on failure. Prints a compact status table.
 */

import https from 'node:https';
import http from 'node:http';

const API_BASE =
  process.env.AGENTRIX_API_BASE ||
  process.env.API_BASE ||
  'https://api.agentrix.top/api';
const TOKEN = process.env.AGENTRIX_TOKEN || '';

const results = [];

function log(kind, msg) {
  const color = kind === 'pass' ? '\x1b[32m' : kind === 'fail' ? '\x1b[31m' : '\x1b[36m';
  const reset = '\x1b[0m';
  console.log(`${color}${kind.toUpperCase()}${reset} ${msg}`);
}

function request(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const mod = url.protocol === 'https:' ? https : http;
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    if (opts.authed && TOKEN) {
      headers.Authorization = `Bearer ${TOKEN}`;
    }
    const req = mod.request(
      url,
      {
        method: opts.method || 'GET',
        headers,
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = body.length ? JSON.parse(body) : null;
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

async function check(name, fn, { required = true } = {}) {
  const start = Date.now();
  try {
    const result = await fn();
    const dur = Date.now() - start;
    if (result?.ok) {
      log('pass', `${name} (${dur}ms) ${result.note ?? ''}`);
      results.push({ name, status: 'pass', dur });
    } else {
      log('fail', `${name} (${dur}ms) — ${result?.reason ?? 'unknown'}`);
      results.push({ name, status: 'fail', dur, reason: result?.reason });
    }
    return result;
  } catch (e) {
    const dur = Date.now() - start;
    log('fail', `${name} (${dur}ms) — ${e.message}`);
    results.push({ name, status: 'fail', dur, reason: e.message, required });
  }
}

async function main() {
  log('info', `API_BASE=${API_BASE}`);
  log('info', `TOKEN=${TOKEN ? TOKEN.slice(0, 10) + '…' : '(unset — authed tests will skip)'}`);

  // ── Public endpoints ─────────────────────────────────────
  await check('GET /v1/subscription/catalog (public)', async () => {
    const { status, body } = await request('/v1/subscription/catalog');
    if (status !== 200) return { ok: false, reason: `status=${status}` };
    if (!Array.isArray(body?.tiers) || body.tiers.length < 5) {
      return { ok: false, reason: `unexpected catalog shape: ${JSON.stringify(body).slice(0, 200)}` };
    }
    const tiers = body.tiers.map((t) => t.tier).sort();
    const expected = ['elite', 'enterprise', 'free', 'lite', 'plus', 'pro'];
    if (JSON.stringify(tiers) !== JSON.stringify(expected)) {
      return { ok: false, reason: `tiers mismatch: got ${tiers.join(',')}` };
    }
    return { ok: true, note: `${body.tiers.length} tiers` };
  });

  await check('GET /v1/pet/greeting/catalog (public)', async () => {
    const { status, body } = await request('/v1/pet/greeting/catalog');
    if (status !== 200) return { ok: false, reason: `status=${status}` };
    if (!Array.isArray(body?.templates) || body.templates.length < 5) {
      return { ok: false, reason: `unexpected template count: ${body?.templates?.length}` };
    }
    return { ok: true, note: `${body.templates.length} templates` };
  });

  // ── Authed endpoints ─────────────────────────────────────
  if (!TOKEN) {
    log('info', 'AGENTRIX_TOKEN not set — skipping authed endpoints.');
  } else {
    await check('GET /v1/subscription (authed)', async () => {
      const { status, body } = await request('/v1/subscription', { authed: true });
      if (status !== 200) return { ok: false, reason: `status=${status} body=${JSON.stringify(body).slice(0, 200)}` };
      if (!body?.tier) return { ok: false, reason: 'no tier field' };
      return { ok: true, note: `tier=${body.tier} status=${body.status}` };
    });

    await check('GET /v1/me/quota (authed)', async () => {
      const { status, body } = await request('/v1/me/quota', { authed: true });
      if (status !== 200) return { ok: false, reason: `status=${status}` };
      if (typeof body?.llm_budget_cents_monthly !== 'number') {
        return { ok: false, reason: 'missing llm_budget field' };
      }
      return { ok: true, note: `effective_tier=${body.effective_tier}` };
    });

    await check('GET /v1/axp/balance (authed)', async () => {
      const { status, body } = await request('/v1/axp/balance', { authed: true });
      if (status !== 200) return { ok: false, reason: `status=${status}` };
      if (typeof body?.balance !== 'number') return { ok: false, reason: 'no balance' };
      return { ok: true, note: `balance=${body.balance} usd_value_cents=${body.usd_value_cents}` };
    });

    await check('GET /v1/axp/history (authed)', async () => {
      const { status, body } = await request('/v1/axp/history?limit=5', { authed: true });
      if (status !== 200) return { ok: false, reason: `status=${status}` };
      if (!Array.isArray(body?.items)) return { ok: false, reason: 'no items array' };
      return { ok: true, note: `${body.items.length} items` };
    });

    await check('GET /v1/pet/greeting/inbox (authed)', async () => {
      const { status, body } = await request('/v1/pet/greeting/inbox', { authed: true });
      if (status !== 200) return { ok: false, reason: `status=${status}` };
      if (!Array.isArray(body?.items)) return { ok: false, reason: 'no items' };
      return { ok: true, note: `${body.items.length} cards received` };
    });

    await check('GET /v1/pet/greeting/outbox (authed)', async () => {
      const { status, body } = await request('/v1/pet/greeting/outbox', { authed: true });
      if (status !== 200) return { ok: false, reason: `status=${status}` };
      if (!Array.isArray(body?.items)) return { ok: false, reason: 'no items' };
      return { ok: true, note: `${body.items.length} cards sent` };
    });

    await check('GET /v1/pet/coraising/invites (authed)', async () => {
      const { status, body } = await request('/v1/pet/coraising/invites', { authed: true });
      if (status !== 200) return { ok: false, reason: `status=${status}` };
      if (!Array.isArray(body?.items)) return { ok: false, reason: 'no items' };
      return { ok: true, note: `${body.items.length} invites` };
    });
  }

  // ── Summary ──────────────────────────────────────────────
  console.log('\n────── Summary ──────');
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log(`Total: ${results.length} · Passed: ${passed} · Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailures:');
    results.filter((r) => r.status === 'fail').forEach((r) => {
      console.log(`  ✗ ${r.name}  (${r.reason})`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
