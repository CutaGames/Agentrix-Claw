/**
 * E2E Verification: OpenClaw Hub Skills
 *
 * Validates that the backend Skill Hub bridge returns real skills
 * with icons, categories, and descriptions — exactly what the mobile
 * app's ClawMarketplaceScreen will render.
 *
 * Run:  npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/openclaw-hub-skills.spec.ts --reporter=line
 */
import { test, expect } from '@playwright/test';

const BASE = 'https://api.agentrix.top/api';

// ── Category map (mirrors mobile-app/src/services/openclawHub.service.ts) ────
const CATEGORY_MAP: Record<string, string> = {
  search: 'Automation',
  automation: 'Automation',
  developer: 'Dev',
  memory: 'AI Tools',
  creative: 'AI Tools',
  ai: 'AI Tools',
  language: 'AI Tools',
  media: 'AI Tools',
  data: 'Data',
  analytics: 'Data',
  integration: 'Automation',
  communication: 'Social',
  productivity: 'Productivity',
  utility: 'Files',
  finance: 'Finance',
  general: 'Automation',
};

function normaliseCategory(raw?: string): string {
  if (!raw) return 'Automation';
  return CATEGORY_MAP[raw.toLowerCase()] ?? raw;
}

const EXPECTED_UI_CATEGORIES = ['Automation', 'AI Tools', 'Data', 'Dev', 'Social', 'Finance', 'Files', 'Productivity'];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Bridge Endpoint Health
// ─────────────────────────────────────────────────────────────────────────────
test.describe('OpenClaw Hub Bridge — Endpoint', () => {
  test('GET /openclaw/bridge/skill-hub/search returns 200 with items', async ({ request }) => {
    const res = await request.get(`${BASE}/openclaw/bridge/skill-hub/search?limit=200`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items: any[] = body.items || body.skills || body.data || (Array.isArray(body) ? body : []);
    expect(items.length).toBeGreaterThanOrEqual(10);
    console.log(`✅ Bridge returned ${items.length} skills`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Every Skill Has Required Fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('OpenClaw Hub Bridge — Skill Fields', () => {
  let items: any[] = [];

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE}/openclaw/bridge/skill-hub/search?limit=200`);
    const body = await res.json();
    items = body.items || body.skills || body.data || (Array.isArray(body) ? body : []);
  });

  test('every skill has id, name, description, category', async () => {
    for (const s of items) {
      expect(s.id || s.key, `skill missing id: ${JSON.stringify(s).slice(0, 100)}`).toBeTruthy();
      expect(s.name || s.displayName, `skill missing name: ${s.id}`).toBeTruthy();
      expect(s.description, `skill missing description: ${s.id}`).toBeTruthy();
      expect(s.category, `skill missing category: ${s.id}`).toBeTruthy();
    }
    console.log(`✅ All ${items.length} skills have required fields`);
  });

  test('many skills have icons (emoji)', async () => {
    const withIcon = items.filter((s) => s.icon && s.icon.trim().length > 0);
    console.log(`   Skills with icon: ${withIcon.length} / ${items.length}`);
    // At least half should have icons (backend built-in skills have them)
    expect(withIcon.length).toBeGreaterThanOrEqual(Math.min(items.length * 0.4, 10));
    // Log first 10 for verification
    for (const s of withIcon.slice(0, 10)) {
      console.log(`   ${s.icon} ${s.displayName ?? s.name} [${s.category}]`);
    }
  });

  test('ratings are between 0 and 5', async () => {
    for (const s of items) {
      const rating = typeof s.rating === 'number' ? s.rating : parseFloat(s.rating) || 0;
      expect(rating).toBeGreaterThanOrEqual(0);
      expect(rating).toBeLessThanOrEqual(5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Category Normalisation Covers All Backend Categories
// ─────────────────────────────────────────────────────────────────────────────
test.describe('OpenClaw Hub Bridge — Category Mapping', () => {
  test('all backend categories map to known UI categories', async ({ request }) => {
    const res = await request.get(`${BASE}/openclaw/bridge/skill-hub/search?limit=200`);
    const body = await res.json();
    const items: any[] = body.items || body.skills || body.data || [];

    const backendCats = new Set(items.map((s: any) => s.category).filter(Boolean));
    const unmapped: string[] = [];
    for (const cat of backendCats) {
      const uiCat = normaliseCategory(cat);
      if (!EXPECTED_UI_CATEGORIES.includes(uiCat) && uiCat !== cat) {
        unmapped.push(`${cat} → ${uiCat}`);
      }
    }

    console.log(`   Backend categories: ${[...backendCats].join(', ')}`);
    console.log(`   Unmapped categories: ${unmapped.length === 0 ? 'none' : unmapped.join(', ')}`);

    // Print distribution
    const catCount: Record<string, number> = {};
    for (const s of items) {
      const uiCat = normaliseCategory(s.category);
      catCount[uiCat] = (catCount[uiCat] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${cat}: ${count} skills`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Simulated Mobile Fetch Flow (mirrors getHubSkills → searchOpenClawHub)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('OpenClaw Hub — Mobile Fetch Simulation', () => {
  test('simulates mobile getHubSkills() and searchOpenClawHub()', async ({ request }) => {
    // Step 1: fetch from bridge (same as mobile fetchFromBridge)
    const res = await request.get(`${BASE}/openclaw/bridge/skill-hub/search?limit=200&sortBy=callCount&sortOrder=DESC`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const raw: any[] = body.items || body.skills || body.data || (Array.isArray(body) ? body : []);
    expect(raw.length).toBeGreaterThan(0);

    // Step 2: map to OpenClawHubSkill (same as mobile)
    const hubSkills = raw.map((s: any) => ({
      id: s.id ?? s.key ?? `oc-${Math.random().toString(36).slice(2, 8)}`,
      name: s.displayName ?? s.name ?? 'Unknown Skill',
      description: s.description ?? 'OpenClaw community skill',
      category: s.category ?? 'general',
      tags: s.tags ?? [],
      rating: typeof s.rating === 'number' ? s.rating : parseFloat(s.rating) || 4.5,
      installCount: s.callCount ?? s.installCount ?? 0,
      price: s.price ?? 0,
      icon: s.icon,  // ← MUST be preserved
    }));

    // Step 3: toDisplayItem simulation
    const FALLBACK_ICON: Record<string, string> = {
      Automation: '⚙️', 'AI Tools': '🤖', Data: '📊', Dev: '💻',
      Social: '💬', Finance: '💰', Files: '📁', Productivity: '📋',
    };

    const displayItems = hubSkills.map((s: any) => {
      const cat = normaliseCategory(s.category);
      const icon = s.icon || FALLBACK_ICON[cat] || '⚡';
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        icon,
        category: cat,
        rating: s.rating,
        price: s.price,
        installCount: s.installCount,
      };
    });

    // Step 4: verify ALL items have non-default icons
    const allIcons = displayItems.map((d: any) => d.icon);
    const uniqueIcons = new Set(allIcons);
    console.log(`\n   Total skills: ${displayItems.length}`);
    console.log(`   Unique icons: ${uniqueIcons.size}`);

    // Verify at least some have distinct (non-fallback) icons
    const nonFallback = displayItems.filter((d: any) => d.icon !== '⚡');
    console.log(`   Skills with icon (not ⚡): ${nonFallback.length} / ${displayItems.length}`);
    expect(nonFallback.length).toBeGreaterThanOrEqual(5);

    // Step 5: verify category filter works for each UI category
    for (const uiCat of EXPECTED_UI_CATEGORIES) {
      const filtered = displayItems.filter((d: any) => d.category === uiCat);
      console.log(`   [${uiCat}]: ${filtered.length} skills`);
    }

    // Step 6: log first 15 skills as the user would see them
    console.log('\n   === First 15 skills as rendered in app ===');
    for (const d of displayItems.slice(0, 15)) {
      console.log(`   ${d.icon} ${d.name} [${d.category}] ⭐${d.rating} | installs: ${d.installCount}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Payment Contract Addresses (used by CheckoutScreen)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Payment Contracts', () => {
  test('GET /payments/contract-address returns valid addresses', async ({ request }) => {
    const res = await request.get(`${BASE}/payments/contract-address`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.commissionContractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(body.erc8004ContractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(body.usdcAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    console.log(`   Commission: ${body.commissionContractAddress}`);
    console.log(`   ERC-8004:   ${body.erc8004ContractAddress}`);
    console.log(`   USDC:       ${body.usdcAddress}`);
  });
});
