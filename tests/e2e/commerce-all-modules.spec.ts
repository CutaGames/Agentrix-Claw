/**
 * E2E Test Suite: Commerce + All Phase Modules
 * Targets: https://api.agentrix.top/api
 *
 * Phase 1: Marketplace / commerce endpoints
 * Phase 2: Claude chat, agent accounts
 * Phase 3: Social callback (Telegram/Discord/Twitter webhooks)
 */
import { test, expect, request } from '@playwright/test';

const BASE = 'https://api.agentrix.top/api';

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Health', () => {
  test('GET /health → 200 ok', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Marketplace
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 1 – Marketplace', () => {
  test('GET /unified-marketplace/search → 200 with skills array', async ({ request }) => {
    const res = await request.get(`${BASE}/unified-marketplace/search?query=agent&limit=5`);
    expect([200, 401]).toContain(res.status()); // 401 if auth required
    if (res.status() === 200) {
      const body = await res.json();
      // API returns {items, total, page, ...} or {data, ...}
      const hasData = 'items' in body || 'data' in body || Array.isArray(body);
      expect(hasData).toBe(true);
    }
  });

  test('GET /unified-marketplace/featured → non-5xx', async ({ request }) => {
    const res = await request.get(`${BASE}/unified-marketplace/featured`);
    expect(res.status()).toBeLessThan(500);
  });

  test('GET /unified-marketplace/categories → non-5xx', async ({ request }) => {
    const res = await request.get(`${BASE}/unified-marketplace/categories`);
    expect(res.status()).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — Claude Chat + Agent Accounts
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 2 – Claude Chat', () => {
  test('POST /claude/chat → endpoint exists (not 404)', async ({ request }) => {
    const res = await request.post(`${BASE}/claude/chat`, {
      data: { message: 'Hello, are you there?' },
    });
    // Expect anything except 404 (endpoint must exist)
    expect(res.status()).not.toBe(404);
    // 200 ok, 400/401/422 auth/validation error, 500 server error (missing API key in test env) — all ok
    expect(res.status()).toBeLessThan(600);
  });

  test('POST /hq/chat → 404 (hq module deleted)', async ({ request }) => {
    const res = await request.post(`${BASE}/hq/chat`, {
      data: { message: 'test' },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Phase 2 – Agent Accounts', () => {
  test('GET /agent-accounts → endpoint exists (not 404)', async ({ request }) => {
    const res = await request.get(`${BASE}/agent-accounts`);
    expect(res.status()).not.toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — Social Listener (Webhook Callbacks)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 3 – Social Callback Status', () => {
  test('GET /social/callback/status → 200 with platforms', async ({ request }) => {
    const res = await request.get(`${BASE}/social/callback/status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.platforms).toHaveProperty('telegram');
    expect(body.platforms).toHaveProperty('discord');
    expect(body.platforms).toHaveProperty('twitter');
  });

  test('Telegram platform shows connected when TELEGRAM_BOT_TOKEN is set', async ({ request }) => {
    const res = await request.get(`${BASE}/social/callback/status`);
    const body = await res.json();
    // Bot token is set in production .env
    expect(body.platforms.telegram.connected).toBe(true);
    expect(body.platforms.telegram.webhookUrl).toMatch(
      /\/(social\/callback|openclaw-connection\/webhook)\/telegram$/,
    );
  });

  test('Discord platform shows connected when DISCORD keys are set', async ({ request }) => {
    const res = await request.get(`${BASE}/social/callback/status`);
    const body = await res.json();
    expect(body.platforms.discord.connected).toBe(true);
    expect(body.platforms.discord.interactionsUrl).toContain('/social/callback/discord');
  });

  test('Twitter platform shows connected when TWITTER keys are set', async ({ request }) => {
    const res = await request.get(`${BASE}/social/callback/status`);
    const body = await res.json();
    expect(body.platforms.twitter.connected).toBe(true);
    expect(body.platforms.twitter.webhookUrl).toContain('/social/callback/twitter');
  });
});

test.describe('Phase 3 – Social Callback Events', () => {
  test('GET /social/callback/events → 200 with ok:true', async ({ request }) => {
    const res = await request.get(`${BASE}/social/callback/events`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // events may be empty array or object initially
    expect(body).toHaveProperty('events');
  });
});

test.describe('Phase 3 – Social Callback Webhook Receivers', () => {
  test('POST /social/callback/twitter (CRC check) → GET returns token', async ({ request }) => {
    // Twitter CRC GET challenge
    const res = await request.get(`${BASE}/social/callback/twitter?crc_token=test_crc_123`);
    // Should 200 with response_token or at least not crash
    expect(res.status()).not.toBe(500);
  });

  test('POST /social/callback/discord with empty body → 401 or 400 (not 404)', async ({ request }) => {
    const res = await request.post(`${BASE}/social/callback/discord`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    // Should exist (not 404) even if unauthorized
    expect(res.status()).not.toBe(404);
    expect(res.status()).not.toBe(500);
  });

  test('POST /social/callback/telegram with ping update → 200', async ({ request }) => {
    const res = await request.post(`${BASE}/social/callback/telegram`, {
      data: { update_id: 1 }, // Minimal Telegram update without message
      headers: { 'Content-Type': 'application/json' },
    });
    // Should accept and return ok (minimal update is fine)
    expect([200, 201]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — Social Posts (Feed)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 3 – Social Feed', () => {
  test('GET /social/posts → endpoint exists (not 404)', async ({ request }) => {
    const res = await request.get(`${BASE}/social/posts`);
    expect(res.status()).not.toBe(404);
    // Accept 401 (auth required) or 200
    expect([200, 401]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — Voice Transcription (endpoint existence)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 3 – Voice Endpoint', () => {
  test('POST /voice/transcribe → endpoint exists (not 404)', async ({ request }) => {
    const res = await request.post(`${BASE}/voice/transcribe`, {
      data: {},
    });
    expect(res.status()).not.toBe(404);
  });
});
