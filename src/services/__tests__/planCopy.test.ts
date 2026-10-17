/**
 * 我的 → 套餐与模型 (D19, REQ-desktop-055 follow-up): the phone says what the web pricing page says, shows no
 * price, no checkout, no AXP-for-dollars, and opens only the public site.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  AXP_NOTE,
  ESCROW_NOTE,
  NEVER_CHARGED,
  NEVER_CHARGED_TITLE,
  NO_PRICE_NOTE,
  PLAN_HIGHLIGHT_BADGE,
  PLANS,
  planUrl,
} from '../planCopy';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const web = fs.readFileSync(path.join(ROOT, 'frontend/components/marketing/sections/PricingTable.tsx'), 'utf8');
const webCopy = fs.readFileSync(path.join(ROOT, 'frontend/lib/public-site/l3-copy.ts'), 'utf8');
const pair = (c: { zh: string; en: string }) => `{ zh: "${c.zh}", en: "${c.en}" }`;

describe('the same words as the web pricing page (PricingTable.tsx)', () => {
  it('three plans, in the web order, with the same name, price, description and features', () => {
    const webKeys = [...web.matchAll(/^\s{4}key: "([a-z]+)"/gm)].map((m) => m[1]);
    expect(webKeys).toEqual(PLANS.map((p) => p.key));
    for (const plan of PLANS) {
      const block = web.slice(web.indexOf(`key: "${plan.key}"`));
      expect(block).toContain(`name: ${pair(plan.name)}`);
      expect(block).toContain(`price: ${pair(plan.price)}`);
      expect(block).toContain(`zh: "${plan.description.zh}"`);
      expect(block).toContain(`en: "${plan.description.en}"`);
      for (const feature of plan.features) expect(block).toContain(pair(feature));
      if (plan.cta) {
        expect(block).toContain(`cta: ${pair(plan.cta)}`);
        expect(block).toContain(`href: "${plan.path}"`);
      }
    }
    // Same number of features per plan as the web.
    const webFeatureCounts = web
      .slice(web.indexOf('export const PLANS'), web.indexOf('export const NEVER_CHARGED'))
      .split(/^\s{4}key: "/m)
      .slice(1)
      .map((b) => (b.slice(b.indexOf('features: ['), b.indexOf(']')).match(/\{ zh: "/g) ?? []).length);
    expect(webFeatureCounts).toEqual(PLANS.map((p) => p.features.length));
    expect(web).toContain(`"${PLAN_HIGHLIGHT_BADGE.zh}", en: "${PLAN_HIGHLIGHT_BADGE.en}"`);
  });

  it('the never-charged list, word for word and complete', () => {
    const list = web.slice(web.indexOf('export const NEVER_CHARGED'), web.indexOf('export function PricingTable'));
    expect((list.match(/\{ zh: "/g) ?? []).length).toBe(NEVER_CHARGED.length);
    for (const item of NEVER_CHARGED) expect(list).toContain(pair(item));
    expect(web).toContain(pair(NEVER_CHARGED_TITLE));
  });

  it('the no-price note, the AXP note and the escrow note', () => {
    for (const note of [NO_PRICE_NOTE, AXP_NOTE]) {
      expect(web).toContain(`zh: "${note.zh}"`);
      expect(web).toContain(`en: "${note.en}"`);
    }
    const escrow = webCopy.slice(webCopy.indexOf('export const PRICING_ESCROW_NOTE'));
    expect(escrow).toContain(`zh: '${ESCROW_NOTE.zh}'`);
    expect(escrow).toContain(`en: '${ESCROW_NOTE.en}'`);
  });

  it('no price anywhere in the copy', () => {
    const all = JSON.stringify({ PLANS, NEVER_CHARGED, NO_PRICE_NOTE, AXP_NOTE, ESCROW_NOTE });
    expect(all).not.toMatch(/\$\s?\d|US\$|USD|美元|\/mo\b|\/月|返现|cashback|Auto-Earn/i);
  });
});

describe('links', () => {
  it('only the public site, only these paths', () => {
    expect(planUrl('/soul-core/founding-access')).toBe('https://www.agentrix.top/soul-core/founding-access');
    expect(planUrl('/twin')).toBe('https://www.agentrix.top/twin');
    expect(planUrl('/pricing')).toBe('https://www.agentrix.top/pricing');
    expect(PLANS.map((p) => p.path)).toEqual([null, '/soul-core/founding-access', '/twin']);
  });
});

describe('the screen (SubscribePlanScreen.tsx)', () => {
  const screen = fs
    .readFileSync(path.join(ROOT, 'src/screens/me/SubscribePlanScreen.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');

  it('shows no price, no checkout, no AXP discount and no cashback', () => {
    expect(screen).not.toMatch(/\$(?!\{)/); // a dollar sign that is not a template placeholder
    expect(screen).not.toMatch(/formatPrice|monthly_cents|yearly_cents|price_cents|\/mo\b|\/yr\b/);
    expect(screen).not.toMatch(/fetchSubscriptionCatalog|fetchAxpBalance|PanResponder|Slider/);
    expect(screen).not.toMatch(/返现|cashback|Auto-Earn|抵扣|结算|checkout|USD|美元/i);
  });

  it('shows the plan copy from planCopy.ts and opens links only through planUrl', () => {
    for (const name of ['PLANS', 'NEVER_CHARGED', 'NO_PRICE_NOTE', 'AXP_NOTE', 'ESCROW_NOTE']) expect(screen).toContain(name);
    const opens = screen.match(/Linking\.openURL\(([^)]*\)?)\)/g) ?? [];
    expect(opens.length).toBeGreaterThan(0);
    for (const call of opens) expect(call).toMatch(/^Linking\.openURL\(planUrl\(/);
  });
});
