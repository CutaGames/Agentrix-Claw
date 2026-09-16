/**
 * Greeting-card template drift guard.
 *
 * Mobile UI `GreetingCardComposeScreen` chooses templates by `key` and
 * displays `axp_cost` / `premium`. If the backend template list ever
 * mutates, the UI would show stale prices or broken asset_keys.
 *
 * Source of truth: `backend/src/modules/pet-greeting/pet-greeting.constants.ts`
 */
import fs from 'node:fs';
import path from 'node:path';

const BACKEND_CONSTANTS = path.resolve(
  __dirname,
  '../../../backend/src/modules/pet-greeting/pet-greeting.constants.ts',
);

interface TemplateShape {
  key: string;
  premium: boolean;
  axp_cost: number;
  category: string;
  asset_key: string;
}

function readTemplates(): TemplateShape[] {
  const src = fs.readFileSync(BACKEND_CONSTANTS, 'utf8');
  const block = src.match(/GREETING_TEMPLATES\s*:\s*GreetingTemplate\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (!block) throw new Error('GREETING_TEMPLATES not found');
  const body = block[1];
  const rows: TemplateShape[] = [];
  const lineRe = /\{\s*key:\s*'(\w+)'[^}]*category:\s*'(\w+)'[^}]*premium:\s*(true|false)[^}]*axp_cost:\s*(\d+)[^}]*asset_key:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(body)) !== null) {
    rows.push({
      key: m[1],
      category: m[2],
      premium: m[3] === 'true',
      axp_cost: Number(m[4]),
      asset_key: m[5],
    });
  }
  return rows;
}

describe('Greeting templates (backend constants)', () => {
  const templates = readTemplates();

  it('parsed at least 10 templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(10);
  });

  it.each(templates)('"$key" has a non-negative integer axp_cost', (t) => {
    expect(Number.isInteger(t.axp_cost)).toBe(true);
    expect(t.axp_cost).toBeGreaterThanOrEqual(0);
  });

  it.each(templates)('"$key" premium flag matches axp_cost sign', (t) => {
    if (t.premium) expect(t.axp_cost).toBeGreaterThan(0);
    else expect(t.axp_cost).toBe(0);
  });

  it('every template key is unique', () => {
    const keys = templates.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every asset_key is unique', () => {
    const assets = templates.map((t) => t.asset_key);
    expect(new Set(assets).size).toBe(assets.length);
  });

  it('every asset_key uses the card.<key>.v<n> pattern', () => {
    const re = /^card\.[a-z_]+\.v\d+$/;
    for (const t of templates) {
      expect(t.asset_key).toMatch(re);
    }
  });

  it('at least 4 free templates exist (zero-friction onboarding)', () => {
    const free = templates.filter((t) => !t.premium);
    expect(free.length).toBeGreaterThanOrEqual(4);
  });

  it('premium template prices are in a sane range (100..5000 AXP)', () => {
    for (const t of templates.filter((x) => x.premium)) {
      expect(t.axp_cost).toBeGreaterThanOrEqual(100);
      expect(t.axp_cost).toBeLessThanOrEqual(5000);
    }
  });

  it('category set is limited to {holiday, milestone, casual, emotion}', () => {
    const allowed = new Set(['holiday', 'milestone', 'casual', 'emotion']);
    for (const t of templates) {
      expect(allowed.has(t.category)).toBe(true);
    }
  });
});
