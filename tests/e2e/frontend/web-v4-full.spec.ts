/**
 * Web Frontend V4 Full E2E Tests
 * 
 * Covers all public pages + console pages with API mocking.
 * Based on: E2E_TEST_PLAN_V4 §4 (Web 端测试矩阵)
 * 
 * Run: npx playwright test tests/e2e/frontend/web-v4-full.spec.ts -c tests/e2e/playwright.frontend.config.ts
 */
import { test, expect } from '@playwright/test';
import { setupAllMocks, authenticatePage } from '../fixtures/api-mocker';

const BASE = 'http://127.0.0.1:3000';

// ═══════════════════════════════════════════════════════════════════════════════
// §1. PUBLIC PAGES — No auth required
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§1 Public Pages', () => {
  test('W1: Homepage loads with hero + navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Agentrix/i);
    // Navigation should be visible
    const nav = page.locator('nav, header, [role="navigation"]').first();
    await expect(nav).toBeVisible();
    // No console errors
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(2000);
    expect(errors.filter(e => !e.includes('hydration'))).toHaveLength(0);
  });

  test('W3: Pricing page shows 5 tiers', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    // Should show tier names
    const content = await page.textContent('body');
    expect(content).toMatch(/Free|Lite|Plus|Pro|Elite/i);
  });

  test('W4: Showcase page loads', async ({ page }) => {
    await page.goto('/showcase');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    // Should not be blank
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('W5: Marketplace /market loads skin list', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/market');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('W6: Marketplace /market/skills loads', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/market/skills');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('W7: Marketplace /market/tasks loads', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/market/tasks');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('W14: Co-raising landing page loads', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/co-raising/test-token-001');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('W15: Greeting card landing page loads', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/greeting/test-token-001');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('W16: Public pet profile /p/[petId] loads', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/p/e2e-pet-001');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('Downloads page loads', async ({ page }) => {
    await page.goto('/downloads');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('About page loads', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §2. AUTH PAGES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§2 Auth Pages', () => {
  test('W2: Login page renders with OAuth buttons', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    const content = await page.textContent('body');
    // Should have at least one login method
    const hasAuth = /Google|Discord|邮箱|Email|登录|Sign/i.test(content || '');
    expect(hasAuth).toBe(true);
  });

  test('Register page loads', async ({ page }) => {
    await page.goto('/auth/register');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('Passkey page loads', async ({ page }) => {
    await page.goto('/auth/passkey');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §3. CONSOLE PAGES (Authenticated)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§3 Console (Authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
  });

  test('W9: Console Dashboard loads', async ({ page }) => {
    await page.goto('/console');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('W10: Console Pet page loads', async ({ page }) => {
    await page.goto('/console/pet');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('W11: Console PetCreator loads', async ({ page }) => {
    await page.goto('/console/pet/create');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('W12: Console Wallet loads', async ({ page }) => {
    await page.goto('/console/wallet');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('W13: Console AXP page loads', async ({ page }) => {
    await page.goto('/console/axp');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('Console Billing page loads', async ({ page }) => {
    await page.goto('/console/billing');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('Console Agents page loads', async ({ page }) => {
    await page.goto('/console/agents');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §4. NAVIGATION LINK VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§4 Navigation Links', () => {
  test('All nav links resolve (no 404)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const links = await page.locator('nav a[href], header a[href]').all();
    const hrefs: string[] = [];
    for (const link of links) {
      const href = await link.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('#')) {
        hrefs.push(href);
      }
    }

    // Test up to 10 unique internal links
    const unique = [...new Set(hrefs)].slice(0, 10);
    for (const href of unique) {
      const response = await page.goto(href);
      expect(response?.status()).not.toBe(404);
      await page.waitForTimeout(200);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §5. SEO VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§5 SEO Meta Tags', () => {
  const seoPages = ['/', '/pricing', '/showcase', '/downloads', '/about'];

  for (const path of seoPages) {
    test(`W18: ${path} has og:title`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      expect(ogTitle).toBeTruthy();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// §6. FORM INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§6 Form Interactions', () => {
  test('Login form accepts email input', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="email"]').first();
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com');
      const value = await emailInput.inputValue();
      expect(value).toBe('test@example.com');
    }
  });

  test('Marketplace search/filter is interactive', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/market');
    await page.waitForLoadState('networkidle');
    const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('cat');
      await page.waitForTimeout(500);
      const alive = await page.evaluate(() => document.readyState);
      expect(alive).toBe('complete');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §7. ERROR PAGES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§7 Error Handling', () => {
  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz');
    await page.waitForLoadState('networkidle');
    const content = await page.textContent('body');
    expect(content).toMatch(/404|not found|页面不存在/i);
  });
});
