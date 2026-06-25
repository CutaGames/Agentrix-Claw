/**
 * E2E Test Suite: Voice Optimizations (P0-P2)
 * Targets: https://api.agentrix.top/api
 *
 * Validates voice TTS endpoint, rate parameter, voice persona,
 * transcribe endpoint, and health.
 */
import { test, expect } from '@playwright/test';

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
// VOICE TTS — Basic
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Voice TTS – Basic', () => {
  test('GET /voice/tts → endpoint exists (not 404)', async ({ request }) => {
    const res = await request.get(`${BASE}/voice/tts?text=hello`);
    expect(res.status()).not.toBe(404);
  });

  test('GET /voice/tts with Chinese text → audio response', async ({ request }) => {
    const res = await request.get(`${BASE}/voice/tts?text=${encodeURIComponent('你好世界')}&lang=zh`);
    expect(res.status()).not.toBe(404);
    if (res.status() === 200) {
      const ct = res.headers()['content-type'] || '';
      expect(ct).toMatch(/audio|octet-stream/i);
    }
  });

  test('GET /voice/tts with English text → audio response', async ({ request }) => {
    const res = await request.get(`${BASE}/voice/tts?text=hello+world&lang=en`);
    expect(res.status()).not.toBe(404);
    if (res.status() === 200) {
      const ct = res.headers()['content-type'] || '';
      expect(ct).toMatch(/audio|octet-stream/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE TTS — Rate parameter (P2-1)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Voice TTS – Rate param', () => {
  test('GET /voice/tts?rate=1.5 → accepted, not 400', async ({ request }) => {
    const res = await request.get(`${BASE}/voice/tts?text=fast+speech&rate=1.5`);
    expect(res.status()).not.toBe(400);
    expect(res.status()).not.toBe(404);
  });

  test('GET /voice/tts?rate=0.75 → accepted for slow speech', async ({ request }) => {
    const res = await request.get(`${BASE}/voice/tts?text=slow+speech&rate=0.75`);
    expect(res.status()).not.toBe(400);
    expect(res.status()).not.toBe(404);
  });

  test('GET /voice/tts?rate=abc → gracefully handled', async ({ request }) => {
    const res = await request.get(`${BASE}/voice/tts?text=test&rate=abc`);
    // Should not crash (500) — either ignore bad rate or return audio
    expect(res.status()).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE TTS — Voice Persona (P2-2)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Voice TTS – Voice Persona', () => {
  const personas = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  for (const voice of personas) {
    test(`GET /voice/tts?voice=${voice} → accepted`, async ({ request }) => {
      const res = await request.get(`${BASE}/voice/tts?text=hello&voice=${voice}`);
      expect(res.status()).not.toBe(404);
      expect(res.status()).toBeLessThan(500);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE TTS — Combined rate + voice
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Voice TTS – Combined rate + voice', () => {
  test('GET /voice/tts?rate=1.2&voice=nova → accepted', async ({ request }) => {
    const res = await request.get(`${BASE}/voice/tts?text=combined+test&rate=1.2&voice=nova`);
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE TRANSCRIBE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Voice Transcribe', () => {
  test('POST /voice/transcribe → endpoint exists (not 404)', async ({ request }) => {
    const res = await request.post(`${BASE}/voice/transcribe`, {
      multipart: {
        audio: { name: 'test.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF') },
      },
    });
    // Endpoint exists — 400 (bad audio) or 401 (auth) is fine, just not 404
    expect(res.status()).not.toBe(404);
  });
});
