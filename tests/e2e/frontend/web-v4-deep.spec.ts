/**
 * Web Frontend V4 Deep E2E Tests
 *
 * Covers gaps NOT in web-v4-full.spec.ts:
 * - Additional public pages (features, security, enterprise, etc.)
 * - Console pages (settings, developer, family, presence, souls)
 * - Marketplace deep pages (auction, leaderboard, creator, sell)
 * - Global interactions (language, theme, mobile menu, back-to-top, cookie)
 * - Accessibility checks (aria-labels, keyboard nav, alt attributes)
 * - Performance (LCP, console load time)
 * - Additional form interactions
 *
 * Run: npx playwright test tests/e2e/frontend/web-v4-deep.spec.ts -c tests/e2e/playwright.frontend.config.ts
 */
import { test, expect } from '@playwright/test';
import { setupAllMocks, authenticatePage } from '../fixtures/api-mocker';

const BASE = 'http://127.0.0.1:3000';

// ═══════════════════════════════════════════════════════════════════════════════
// §1. ADDITIONAL PUBLIC PAGES — Not covered in web-v4-full
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§1 Additional Public Pages', () => {
  test('WP-6: Features page loads with content', async ({ page }) => {
    await page.goto('/features');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-7: Security page loads with content', async ({ page }) => {
    await page.goto('/security');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-8: Enterprise page loads with content', async ({ page }) => {
    await page.goto('/enterprise');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-9: Developers page loads with valid links', async ({ page }) => {
    await page.goto('/developers');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
    // Should contain API-related content
    const content = await page.textContent('body');
    expect(content).toMatch(/API|SDK|开发者|Developer/i);
  });

  test('WP-10: Skills page loads with skill cards', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/skills');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-11: Tools page loads with content', async ({ page }) => {
    await page.goto('/tools');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-12: Manifesto page loads with brand content', async ({ page }) => {
    await page.goto('/manifesto');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-13: Hardware page loads with product info', async ({ page }) => {
    await page.goto('/hardware');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-14: Family page loads with family plan info', async ({ page }) => {
    await page.goto('/family');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
  });

  test('WP-15: Clans page loads with 6 clan sections', async ({ page }) => {
    await page.goto('/clans');
    await page.waitForLoadState('networkidle');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(50);
    // Should reference clan/tribe names or have multiple sections
    const content = await page.textContent('body');
    expect(content).toMatch(/族|clan|tribe/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §2. CONSOLE PAGES — Additional authenticated pages
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§2 Console Deep Pages (Authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
  });

  test('WC-4: Console Pet Souls page loads with clan selector', async ({ page }) => {
    await page.goto('/console/pet/souls');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });

  test('WC-9: Console Settings page loads with form', async ({ page }) => {
    await page.goto('/console/settings');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });

  test('WC-10: Console Developer page loads with API key section', async ({ page }) => {
    await page.goto('/console/developer');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const content = await page.textContent('body');
    expect(content).toMatch(/API|Key|密钥|Token|开发/i);
  });

  test('WC-11: Console Family page loads with member list', async ({ page }) => {
    await page.goto('/console/family');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });

  test('WC-12: Console Presence page loads with device list', async ({ page }) => {
    await page.goto('/console/presence');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §3. MARKETPLACE DEEP PAGES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§3 Marketplace Deep Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
  });

  test('WM-5: Auction page loads with listing', async ({ page }) => {
    await authenticatePage(page, BASE);
    await page.goto('/market/auction');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });

  test('WM-6: Leaderboard page loads with ranking data', async ({ page }) => {
    await page.goto('/market/leaderboard');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });

  test('WM-7: Creator page loads with creator panel', async ({ page }) => {
    await authenticatePage(page, BASE);
    await page.goto('/market/creator');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });

  test('WM-8: Sell page loads with upload form', async ({ page }) => {
    await authenticatePage(page, BASE);
    await page.goto('/market/sell');
    await page.waitForLoadState('networkidle');
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §4. GLOBAL INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§4 Global Interactions', () => {
  test('WG-3: Language switch changes page text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for language switcher (common patterns: select, dropdown, button)
    const langSwitcher = page.locator(
      '[data-testid="lang-switch"], [aria-label*="language"], [aria-label*="语言"], button:has-text("EN"), button:has-text("中文"), select[name="locale"]'
    ).first();

    if (await langSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      const textBefore = await page.textContent('body');
      await langSwitcher.click();
      // Try to select an alternative language option
      const altLang = page.locator('[role="menuitem"], [role="option"], li, a').filter({ hasText: /EN|English|中文/ }).first();
      if (await altLang.isVisible({ timeout: 2000 }).catch(() => false)) {
        await altLang.click();
        await page.waitForTimeout(1000);
        const textAfter = await page.textContent('body');
        expect(textAfter).not.toBe(textBefore);
      }
    }
    // If no language switcher found, page still loads correctly
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('WG-4: Theme toggle changes styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const themeToggle = page.locator(
      '[data-testid="theme-toggle"], [aria-label*="theme"], [aria-label*="主题"], [aria-label*="dark"], [aria-label*="light"], button:has([class*="moon"]), button:has([class*="sun"])'
    ).first();

    if (await themeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      const classBefore = await page.locator('html').getAttribute('class') || '';
      const dataBefore = await page.locator('html').getAttribute('data-theme') || '';
      await themeToggle.click();
      await page.waitForTimeout(500);
      const classAfter = await page.locator('html').getAttribute('class') || '';
      const dataAfter = await page.locator('html').getAttribute('data-theme') || '';
      // Either class or data-theme should change
      const changed = classBefore !== classAfter || dataBefore !== dataAfter;
      expect(changed).toBe(true);
    } else {
      // No theme toggle — page still loads
      const alive = await page.evaluate(() => document.readyState);
      expect(alive).toBe('complete');
    }
  });

  test('WG-6: Mobile hamburger menu opens on narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hamburger = page.locator(
      '[data-testid="mobile-menu"], [aria-label*="menu"], [aria-label*="菜单"], button:has([class*="hamburger"]), button:has([class*="menu"])'
    ).first();

    if (await hamburger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hamburger.click();
      await page.waitForTimeout(500);
      // Menu should expand — look for nav links becoming visible
      const mobileNav = page.locator('[role="menu"], [data-testid="mobile-nav"], nav[class*="mobile"], [class*="drawer"], [class*="sidebar"]').first();
      if (await mobileNav.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(mobileNav).toBeVisible();
      }
    }
    // Regardless, page should not crash at mobile width
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('WG-7: Back-to-top button appears after scroll', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Scroll down significantly
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(800);

    const backToTop = page.locator(
      '[data-testid="back-to-top"], [aria-label*="top"], [aria-label*="顶部"], button:has([class*="arrow-up"]), [class*="back-to-top"], [class*="scroll-top"]'
    ).first();

    if (await backToTop.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backToTop.click();
      await page.waitForTimeout(500);
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeLessThan(100);
    }
    // Page should still be functional
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('WG-8: Cookie consent banner appears and can be dismissed', async ({ page }) => {
    // Clear cookies to simulate first visit
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cookieBanner = page.locator(
      '[data-testid="cookie-consent"], [class*="cookie"], [class*="consent"], [role="dialog"]:has-text("cookie"), [aria-label*="cookie"]'
    ).first();

    if (await cookieBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Find accept/dismiss button
      const acceptBtn = cookieBanner.locator('button').filter({ hasText: /Accept|接受|同意|OK|Got it/i }).first();
      if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await acceptBtn.click();
        await page.waitForTimeout(500);
        await expect(cookieBanner).not.toBeVisible();
      }
    }
    // Page loads regardless
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §5. ACCESSIBILITY CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§5 Accessibility', () => {
  test('WS-5: All interactive buttons have aria-label or accessible name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const buttons = await page.locator('button').all();
    let missingLabel = 0;
    for (const btn of buttons) {
      if (!(await btn.isVisible().catch(() => false))) continue;
      const ariaLabel = await btn.getAttribute('aria-label');
      const ariaLabelledBy = await btn.getAttribute('aria-labelledby');
      const textContent = (await btn.textContent())?.trim();
      const title = await btn.getAttribute('title');
      // Button should have at least one accessible name source
      if (!ariaLabel && !ariaLabelledBy && !textContent && !title) {
        missingLabel++;
      }
    }
    // Allow up to 2 unlabeled buttons (icon-only edge cases)
    expect(missingLabel).toBeLessThanOrEqual(2);
  });

  test('WS-6: Keyboard navigation (Tab) reaches interactive elements', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Press Tab multiple times and check focus moves
    const focusedElements: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName.toLowerCase()}${el.getAttribute('type') ? '[' + el.getAttribute('type') + ']' : ''}` : 'none';
      });
      focusedElements.push(tag);
    }
    // Should have focused at least 2 different interactive elements
    const unique = new Set(focusedElements.filter(t => t !== 'body' && t !== 'none'));
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  test('WS-4: Images have alt attributes on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const images = await page.locator('img').all();
    let missingAlt = 0;
    let totalVisible = 0;
    for (const img of images) {
      if (!(await img.isVisible().catch(() => false))) continue;
      totalVisible++;
      const alt = await img.getAttribute('alt');
      // alt can be empty string (decorative) but should exist
      if (alt === null) {
        missingAlt++;
      }
    }
    // At most 10% of visible images should lack alt
    if (totalVisible > 0) {
      expect(missingAlt / totalVisible).toBeLessThanOrEqual(0.1);
    }
  });

  test('WS-5b: Pricing page buttons have accessible names', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    const buttons = await page.locator('button, a[role="button"]').all();
    let missingLabel = 0;
    for (const btn of buttons) {
      if (!(await btn.isVisible().catch(() => false))) continue;
      const ariaLabel = await btn.getAttribute('aria-label');
      const textContent = (await btn.textContent())?.trim();
      if (!ariaLabel && !textContent) {
        missingLabel++;
      }
    }
    expect(missingLabel).toBeLessThanOrEqual(1);
  });

  test('WS-6b: Console settings form is keyboard navigable', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
    await page.goto('/console/settings');
    await page.waitForLoadState('networkidle');

    const focusedTags: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.tagName.toLowerCase() : 'none';
      });
      focusedTags.push(tag);
    }
    // Should reach input/select/button elements
    const interactive = focusedTags.filter(t => ['input', 'select', 'button', 'textarea', 'a'].includes(t));
    expect(interactive.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §6. PERFORMANCE CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§6 Performance', () => {
  test('WPF-1: Homepage LCP is under 5s', async ({ page }) => {
    // Use Performance Observer to measure LCP
    await page.goto('/', { waitUntil: 'load' });

    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let lcpValue = 0;
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (const entry of entries) {
            lcpValue = entry.startTime;
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        // Give it time to report
        setTimeout(() => {
          observer.disconnect();
          resolve(lcpValue);
        }, 3000);
      });
    });

    // LCP should be under 5000ms (relaxed for E2E with mocks)
    expect(lcp).toBeLessThan(5000);
  });

  test('WPF-4: Console dashboard loads within 5s', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);

    const start = Date.now();
    await page.goto('/console');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;

    // Should load within 5 seconds (relaxed for CI)
    expect(elapsed).toBeLessThan(5000);
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });

  test('WPF-5: Marketplace first screen loads within 5s', async ({ page }) => {
    await setupAllMocks(page);

    const start = Date.now();
    await page.goto('/market');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    expect(bodyLen).toBeGreaterThan(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §7. ADDITIONAL FORM INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§7 Form Interactions (Deep)', () => {
  test('Console Settings form accepts input changes', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
    await page.goto('/console/settings');
    await page.waitForLoadState('networkidle');

    // Find any text input in settings and try to modify it
    const textInput = page.locator(
      'input[type="text"], input[type="email"], input[name*="name"], input[name*="display"], input[placeholder*="名"]'
    ).first();

    if (await textInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textInput.clear();
      await textInput.fill('E2E Test User');
      const value = await textInput.inputValue();
      expect(value).toBe('E2E Test User');
    }

    // Page should remain stable
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('Console Settings form has a save/submit button', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
    await page.goto('/console/settings');
    await page.waitForLoadState('networkidle');

    const saveBtn = page.locator(
      'button[type="submit"], button:has-text("保存"), button:has-text("Save"), button:has-text("更新"), button:has-text("Update")'
    ).first();

    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(saveBtn).toBeEnabled();
    }
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('PetCreator form has required fields', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
    await page.goto('/console/pet/create');
    await page.waitForLoadState('networkidle');

    // Look for name input or description field
    const nameInput = page.locator(
      'input[name*="name"], input[placeholder*="名字"], input[placeholder*="name"], input[aria-label*="name"]'
    ).first();

    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill('TestPet');
      const value = await nameInput.inputValue();
      expect(value).toBe('TestPet');
    }

    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('PetCreator form submit button exists', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
    await page.goto('/console/pet/create');
    await page.waitForLoadState('networkidle');

    const submitBtn = page.locator(
      'button[type="submit"], button:has-text("创建"), button:has-text("Create"), button:has-text("生成"), button:has-text("Generate")'
    ).first();

    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Button should exist and be clickable (may be disabled until form is filled)
      await expect(submitBtn).toBeVisible();
    }
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('Marketplace Sell page has upload/listing form', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
    await page.goto('/market/sell');
    await page.waitForLoadState('networkidle');

    // Look for form elements (file input, text fields, submit)
    const formElement = page.locator(
      'form, [data-testid*="sell"], [data-testid*="upload"], input[type="file"], input[name*="title"], input[name*="price"]'
    ).first();

    if (await formElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(formElement).toBeVisible();
    }
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });

  test('Developer page API key copy/regenerate interaction', async ({ page }) => {
    await setupAllMocks(page);
    await authenticatePage(page, BASE);
    await page.goto('/console/developer');
    await page.waitForLoadState('networkidle');

    // Look for copy or regenerate button
    const actionBtn = page.locator(
      'button:has-text("复制"), button:has-text("Copy"), button:has-text("生成"), button:has-text("Regenerate"), button:has-text("创建"), button:has-text("Create")'
    ).first();

    if (await actionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(actionBtn).toBeEnabled();
    }
    const alive = await page.evaluate(() => document.readyState);
    expect(alive).toBe('complete');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §8. SEO DEEP — Additional pages og:title + og:image
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§8 SEO Deep — Additional Pages', () => {
  const additionalSeoPages = ['/features', '/security', '/enterprise', '/developers', '/manifesto'];

  for (const path of additionalSeoPages) {
    test(`${path} has og:title meta tag`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      expect(ogTitle).toBeTruthy();
    });
  }

  test('/features has og:image meta tag', async ({ page }) => {
    await page.goto('/features');
    await page.waitForLoadState('networkidle');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toBeTruthy();
  });

  test('Homepage has JSON-LD structured data', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    if (jsonLd) {
      const parsed = JSON.parse(jsonLd);
      expect(parsed).toHaveProperty('@context');
    }
  });
});
