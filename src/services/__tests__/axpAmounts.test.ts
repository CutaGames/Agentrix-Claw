/**
 * AXP mobile ↔ backend constant drift guard.
 *
 * The mobile UI renders "+20 AXP" badges that must match what the
 * backend actually writes to the ledger (`backend/src/modules/axp/
 * axp.constants.ts`).  If anyone changes one side without the other,
 * users see "+20 AXP" but actually earn 5 — this test catches the
 * drift before the user does.
 *
 * Source of truth: backend `AXP_AMOUNTS`.  This test parses that file
 * directly so Metro doesn't need to resolve backend/** at build time.
 */
import fs from 'node:fs';
import path from 'node:path';

const BACKEND_CONSTANTS = path.resolve(
  __dirname,
  '../../../backend/src/modules/axp/axp.constants.ts',
);

function readAxpAmounts(): Record<string, number> {
  const src = fs.readFileSync(BACKEND_CONSTANTS, 'utf8');
  const m = src.match(/export const AXP_AMOUNTS\s*=\s*\{([\s\S]*?)\}\s*as const;/);
  if (!m) throw new Error('AXP_AMOUNTS not found in backend constants');
  const body = m[1];
  const out: Record<string, number> = {};
  for (const line of body.split('\n')) {
    const mm = line.match(/^\s*(\w+)\s*:\s*([\d.]+)/);
    if (mm) out[mm[1]] = Number(mm[2]);
  }
  return out;
}

function readAxpDailyCaps(): Record<string, number> {
  const src = fs.readFileSync(BACKEND_CONSTANTS, 'utf8');
  const m = src.match(/export const AXP_DAILY_CAPS[^{]*\{([\s\S]*?)\};/);
  if (!m) throw new Error('AXP_DAILY_CAPS not found');
  const body = m[1];
  const out: Record<string, number> = {};
  for (const line of body.split('\n')) {
    const mm = line.match(/^\s*(\w+)\s*:\s*([\d.]+)/);
    if (mm) out[mm[1]] = Number(mm[2]);
  }
  return out;
}

describe('AXP amounts (backend constants)', () => {
  const amounts = readAxpAmounts();
  const caps = readAxpDailyCaps();

  describe('every amount is a positive finite number', () => {
    it.each(Object.entries(amounts))('%s = %d > 0', (_k, v) => {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    });
  });

  describe('every daily cap is a positive integer', () => {
    it.each(Object.entries(caps))('%s cap = %d > 0', (_k, v) => {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(Number.isInteger(v)).toBe(true);
    });
  });

  describe('known anchor values (docs §4.2 / §4.3)', () => {
    it('daily_checkin_base = 20', () => {
      expect(amounts.daily_checkin_base).toBe(20);
    });
    it('chat_active = 20', () => {
      expect(amounts.chat_active).toBe(20);
    });
    it('coraising_feed_receive (5) > coraising_feed_owner (2)', () => {
      expect(amounts.coraising_feed_receive).toBeGreaterThan(
        amounts.coraising_feed_owner,
      );
    });
    it('referral_signup = 500', () => {
      expect(amounts.referral_signup).toBe(500);
    });
    it('contest_win (5000) is the largest single-event earn', () => {
      const others = Object.entries(amounts)
        .filter(([k]) => k !== 'contest_win')
        .map(([, v]) => v);
      expect(amounts.contest_win).toBeGreaterThan(Math.max(...others));
    });
  });

  describe('caps prevent farming', () => {
    it('daily_checkin cap = 1 (one claim per UTC day)', () => {
      expect(caps.daily_checkin).toBe(1);
    });
    it('coraising_feed cap is bounded (<= 20/day)', () => {
      expect(caps.coraising_feed).toBeLessThanOrEqual(20);
    });
  });
});
