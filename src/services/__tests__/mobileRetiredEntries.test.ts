/**
 * M0-b (2026-09-27) — negative tests: retired betting entries (D22) and AXP
 * fiat purchase are unreachable from the phone.
 *
 * Two layers:
 *   1. Source guard over `src/` + `App.tsx`: no navigator, deep link, chat
 *      intent, market segment or share link reaches LSM / prediction screens,
 *      and no client names an AXP fiat product.
 *   2. Runtime: AXP purchase attempts and retired market searches are refused
 *      before any network call.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const apiFetch = jest.fn() as jest.MockedFunction<
  (path: string, options?: RequestInit) => Promise<any>
>;
jest.mock('../api', () => ({
  apiFetch: (p: string, options?: RequestInit) => apiFetch(p, options),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({
  createURL: (p: string) => `agentrix://${p}`,
  parse: () => ({ path: '' }),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

import {
  AXP_FIAT_PURCHASE_BLOCKED,
  assertNoAxpFiatPurchase,
  isAxpFiatProduct,
  isAxpIapPackage,
} from '../axpFiatPolicy';
import { createCheckoutSession, createPaymentIntent } from '../stripeCheckout.service';
import { purchasePackage, withoutAxpPackages } from '../iap.service';
import {
  AGG_CATEGORY_ORDER,
  isRetiredAggregatedListing,
  searchAggregatedOpportunities,
} from '../aggregatedMarket.api';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const FILES = [...listSourceFiles(SRC_ROOT), path.join(REPO_ROOT, 'App.tsx')].map((file) => ({
  rel: path.relative(REPO_ROOT, file).split(path.sep).join('/'),
  text: fs.readFileSync(file, 'utf8'),
}));

/**
 * The retired LSM / prediction cluster. These files stay in the tree for now
 * (data and backend are kept, D22), but nothing outside the cluster may
 * import them. The two legacy Discover / Events screens only link into the
 * cluster and are themselves unmounted.
 */
const RETIRED_MODULES = [
  'src/screens/LeverageSportsMarketScreen',
  'src/screens/discover/PredictScreen',
  'src/screens/world/PredictionMarketScreen',
  'src/screens/discover/DiscoverScreen',
  'src/screens/world/EventsCenterScreen',
  'src/components/lsm/LsmCards',
  'src/components/lsm/OrderTicket',
  'src/components/lsm/OddsHistoryChart',
  'src/components/lsm/ResponsibleGamblingPanel',
  'src/components/lsm/WorldCupHero',
  'src/services/lsmChatIntent',
  'src/services/lsmToolCard',
  'src/services/lsm.api',
];
const RETIRED_SET = new Set(RETIRED_MODULES);

/** Known non-entry dependency: aggregated market reads LSM chain token config. */
const ALLOWED_IMPORTS = new Set(['src/services/aggregatedMarket.api.ts -> src/services/lsm.api']);

function resolveImport(fromRel: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const abs = path.normalize(path.join(path.dirname(fromRel), spec));
  return abs.split(path.sep).join('/').replace(/\.(tsx?|jsx?)$/, '');
}

function importsOf(file: { rel: string; text: string }): string[] {
  const specs: string[] = [];
  const patterns = [/\bfrom\s+['"]([^'"]+)['"]/g, /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const pattern of patterns) {
    for (const match of file.text.matchAll(pattern)) specs.push(match[1]);
  }
  return specs.map((spec) => resolveImport(file.rel, spec)).filter((spec): spec is string => !!spec);
}

function moduleOf(rel: string): string {
  return rel.replace(/\.(tsx?|jsx?)$/, '');
}

describe('D22 retired betting entries — source guard', () => {
  it('scans a real source tree including App.tsx', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((file) => file.rel === 'App.tsx')).toBe(true);
    for (const mod of RETIRED_MODULES) {
      expect(FILES.some((file) => moduleOf(file.rel) === mod)).toBe(true);
    }
  });

  it('nothing outside the retired cluster imports a retired module', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      if (RETIRED_SET.has(moduleOf(file.rel))) continue;
      for (const target of importsOf(file)) {
        if (RETIRED_SET.has(target) && !ALLOWED_IMPORTS.has(`${file.rel} -> ${target}`)) {
          offenders.push(`${file.rel} -> ${target}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no navigator registers or links a retired route', () => {
    expect(
      FILES.filter((file) => /name=["'](Prediction|PredictionMarket|Predict|Lsm|LeverageSportsMarket)["']/.test(file.text)).map((f) => f.rel),
    ).toEqual([]);
    const app = FILES.find((file) => file.rel === 'App.tsx')!;
    expect(app.text).not.toMatch(/\b(Prediction|Lsm):\s*['"]/);
  });

  it('no mounted file navigates to a retired route', () => {
    const offenders = FILES.filter(
      (file) => !RETIRED_SET.has(moduleOf(file.rel)) && /navigate\(\s*['"](Prediction|PredictionMarket|Predict|Lsm)['"]/.test(file.text),
    ).map((file) => file.rel);
    expect(offenders).toEqual([]);
  });

  it('no share link points at the retired prediction subdomain', () => {
    const offenders = FILES.filter(
      (file) => !RETIRED_SET.has(moduleOf(file.rel)) && /polymarket\.agentrix\.top/.test(file.text),
    ).map((file) => file.rel);
    expect(offenders).toEqual([]);
  });

  it('Plaza market has no sports-prediction segment and chat has no LSM path', () => {
    const market = FILES.find((file) => file.rel === 'src/screens/market/MarketplaceScreen.tsx')!;
    expect(market.text).not.toMatch(/'predictions'/);
    const claw = FILES.find((file) => file.rel === 'src/screens/market/ClawMarketplaceScreen.tsx')!;
    expect(claw.text).not.toMatch(/'lsm'/);
    const chat = FILES.find((file) => file.rel === 'src/screens/agent/AgentChatScreen.tsx')!;
    expect(chat.text).not.toMatch(/detectLsmIntent|LsmCards|lsmApi|lsmToolResultToCard|return 'prediction'/);
  });

  it('no client names an AXP fiat product (outside comments)', () => {
    // Doc comments may mention the retired ids; code must not.
    const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const offenders = FILES.filter(
      (file) =>
        file.rel !== 'src/services/axpFiatPolicy.ts' && /['"`](axp_topup|axp_pack[^'"`]*)['"`]/.test(stripComments(file.text)),
    ).map((file) => file.rel);
    expect(offenders).toEqual([]);
  });
});

describe('AXP is never sold — runtime', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ session_id: 's', url: 'https://checkout.example.test', client_secret: 'c' });
  });

  it.each(['axp_topup', 'axp_pack_1000', 'AXP-Topup', 'com.agentrix.axp.pack1000', 'axppack500', 'axp'])(
    'recognises %s as an AXP product',
    (ref) => {
      expect(isAxpFiatProduct(ref)).toBe(true);
      expect(() => assertNoAxpFiatPurchase([ref])).toThrow(AXP_FIAT_PURCHASE_BLOCKED);
    },
  );

  it.each(['skin', 'skill', 'task_bounty', 'pro_monthly', 'maxpower', '', null, 42])('does not flag %p', (ref) => {
    expect(isAxpFiatProduct(ref)).toBe(false);
  });

  it('Stripe checkout refuses an AXP top-up line item before the network', async () => {
    await expect(
      createCheckoutSession({ mode: 'payment', line_items: [{ type: 'axp_topup' as any, resource_id: 'axp-1000' }] }),
    ).rejects.toMatchObject({ code: AXP_FIAT_PURCHASE_BLOCKED });
    await expect(
      createCheckoutSession({
        mode: 'payment',
        line_items: [
          { type: 'skin', resource_id: 'skin-1' },
          { type: 'axp_topup' as any, resource_id: 'axp-1000' },
        ],
      }),
    ).rejects.toMatchObject({ code: AXP_FIAT_PURCHASE_BLOCKED });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('Stripe payment intent refuses AXP before the network', async () => {
    await expect(createPaymentIntent({ type: 'axp_topup' as any, resource_id: 'axp-1000' })).rejects.toMatchObject({
      code: AXP_FIAT_PURCHASE_BLOCKED,
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('Stripe checkout still works for a skin', async () => {
    await createCheckoutSession({ mode: 'payment', line_items: [{ type: 'skin', resource_id: 'skin-1' }] });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe('/v1/checkout/session');
  });

  it('IAP refuses an AXP pack before touching the store SDK', async () => {
    await expect(purchasePackage({ identifier: '$rc_custom', product: { identifier: 'axp_pack_1000' } })).rejects.toMatchObject({
      code: AXP_FIAT_PURCHASE_BLOCKED,
    });
    await expect(purchasePackage({ identifier: 'axp_pack_500' })).rejects.toMatchObject({ code: AXP_FIAT_PURCHASE_BLOCKED });
  });

  it('IAP offerings drop AXP packs and keep subscriptions', () => {
    const monthly = { identifier: '$rc_monthly', product: { identifier: 'pro_monthly' } };
    const axp = { identifier: '$rc_custom_axp', product: { identifier: 'axp_pack_1000' } };
    const filtered = withoutAxpPackages({ identifier: 'default', availablePackages: [monthly, axp], monthly, lifetime: axp }) as any;
    expect(filtered.availablePackages).toEqual([monthly]);
    expect(filtered.monthly).toBe(monthly);
    expect(filtered.lifetime).toBeNull();
    expect(isAxpIapPackage(monthly)).toBe(false);
    expect(withoutAxpPackages(null)).toBeNull();
  });
});

describe('D22 retired market category — runtime', () => {
  beforeEach(() => apiFetch.mockReset());

  it('prediction is no longer an offered category', () => {
    expect(AGG_CATEGORY_ORDER).not.toContain('prediction');
  });

  it('searching the prediction category returns nothing and makes no request', async () => {
    await expect(searchAggregatedOpportunities({ category: 'prediction' })).resolves.toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('prediction / polymarket / kalshi listings are dropped from mixed results', async () => {
    apiFetch.mockResolvedValueOnce({
      results: [
        { identifier: 'urn:air:agentrix.io:task:t-1', displayName: 'Task', score: 80, source: 'internal', data: { category: 'task' } },
        { identifier: 'urn:air:polymarket.com:prediction:p-1', displayName: 'Will X win?', score: 90, source: 'polymarket', data: { category: 'prediction', source: 'polymarket' } },
        { identifier: 'urn:air:kalshi.com:resource:k-1', displayName: 'Odds feed', score: 70, data: { category: 'resource', source: 'kalshi' } },
        { identifier: 'urn:air:ext.io:skill:s-1', displayName: 'Skill', score: 60, source: 'agenton', data: { category: 'skill', source: 'agenton' } },
      ],
    });
    const listings = await searchAggregatedOpportunities({ text: 'anything' });
    expect(listings.map((listing) => listing.displayName)).toEqual(['Task', 'Skill']);
  });

  it('retired-source matching is segment based', () => {
    expect(isRetiredAggregatedListing({ category: 'task', source: 'polymarket.com' })).toBe(true);
    expect(isRetiredAggregatedListing({ category: 'task', source: 'agenton' })).toBe(false);
    expect(isRetiredAggregatedListing({ category: 'resource', source: 'realmsmarket' })).toBe(false);
    expect(isRetiredAggregatedListing({ category: 'prediction', source: 'internal' })).toBe(true);
  });
});
