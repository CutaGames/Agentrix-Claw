import { test, expect } from '@playwright/test';

const API = 'https://api.agentrix.top/api';

async function gotoDesktopOrSkip(page: Parameters<Parameters<typeof test.beforeEach>[0]>[0]['page']) {
  try {
    await page.goto('http://127.0.0.1:1420', { timeout: 45000, waitUntil: 'domcontentloaded' });
  } catch (error) {
    const message = String(error);
    if (/ERR_CONNECTION_REFUSED|ECONNREFUSED|ERR_ABORTED/i.test(message)) {
      test.skip(true, 'Vite dev server not running');
      return;
    }
    throw error;
  }
}

test.describe('Desktop App API Smoke Tests', () => {
  test('backend health check', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBeLessThan(500);
  });

  test('auth/email/send-code accepts POST', async ({ request }) => {
    const res = await request.post(`${API}/auth/email/send-code`, {
      data: { email: 'smoke-test@example.invalid' },
    });
    // 200, 400, 429 are all acceptable (rate limit, validation, etc.)
    expect([200, 201, 400, 429]).toContain(res.status());
  });

  test('desktop-pair create + poll cycle', async ({ request }) => {
    const sid = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const createRes = await request.post(`${API}/auth/desktop-pair/create`, {
      data: { sessionId: sid },
    });
    expect(createRes.status()).toBeLessThan(500);

    const pollRes = await request.get(`${API}/auth/desktop-pair/poll?session=${sid}`);
    // Should return 200 with empty/null token (not paired yet), or 404
    expect([200, 204, 404]).toContain(pollRes.status());
  });

  test('models endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${API}/openclaw/models`);
    expect([401, 403]).toContain(res.status());
  });

  test('search endpoint exists', async ({ request }) => {
    const res = await request.get(`${API}/search?q=test`);
    // Any non-500 response means the endpoint exists
    expect(res.status()).toBeLessThan(500);
  });

  test('skills endpoint exists', async ({ request }) => {
    const res = await request.get(`${API}/skills`);
    expect(res.status()).toBeLessThan(500);
  });

  test('updater endpoint returns version info', async ({ request }) => {
    const res = await request.get(`${API}/desktop/update/windows-x86_64/x86_64/0.0.1`);
    // 200 (update available) or 204 (up to date) or 404 (no updates configured yet)
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('Desktop Frontend Smoke Tests', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await gotoDesktopOrSkip(page);
  });

  test('login page renders with tabs', async ({ page }) => {
    // Should show the login panel with tab switcher
    await expect(page.locator('text=Agentrix Desktop')).toBeVisible({ timeout: 20000 });
    
    // Check all 3 login tabs exist
    await expect(page.locator('text=扫码')).toBeVisible();
    await expect(page.locator('text=邮箱')).toBeVisible();
    await expect(page.locator('text=第三方')).toBeVisible();
  });

  test('QR code tab shows QR', async ({ page }) => {
    await expect(page.locator('text=Agentrix Desktop')).toBeVisible({ timeout: 20000 });
    // QR tab is default — check for QR SVG
    await expect(page.locator('svg')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=扫一扫')).toBeVisible();
  });

  test('email tab has input and send button', async ({ page }) => {
    await expect(page.locator('text=Agentrix Desktop')).toBeVisible({ timeout: 20000 });
    await page.click('text=邮箱');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('text=Send Verification Code')).toBeVisible();
  });

  test('OAuth tab shows Google and Discord', async ({ page }) => {
    await expect(page.locator('text=Agentrix Desktop')).toBeVisible({ timeout: 20000 });
    await page.click('text=第三方');
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    await expect(page.locator('text=Continue with Discord')).toBeVisible();
  });

  test('guest mode accessible', async ({ page }) => {
    await expect(page.locator('text=Agentrix Desktop')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /Skip as Guest/i })).toBeVisible();
  });

  test('guest mode enters onboarding then chat', async ({ page }) => {
    await expect(page.locator('text=Agentrix Desktop')).toBeVisible({ timeout: 20000 });
    
    // Clear onboarding flag
    await page.evaluate(() => localStorage.removeItem('agentrix_onboarded'));
    
    await page.getByRole('button', { name: /Skip as Guest/i }).dispatchEvent('click');
    
    // Should see onboarding
    await expect(page.locator('text=Welcome to Agentrix')).toBeVisible({ timeout: 5000 });
    
    // Complete onboarding — buttons have arrow suffixes
    await page.getByRole('button', { name: /Get Started/i }).dispatchEvent('click');
    // Step 2: connect → skip
    const skipBtn = page.locator('text=/Skip for now/');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.dispatchEvent('click');
    }
    // Step 3: hotkey → done
    const doneBtn = page.locator('text=/Start Using Agentrix/');
    if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await doneBtn.dispatchEvent('click');
    }
    
    // After onboarding, default view shows FloatingBall — double-click to open Pro Mode
    // Ball has bounce animation, so force:true bypasses Playwright stability check
    const ball = page.locator('[title*="Agentrix"]').first();
    await expect(ball).toBeVisible({ timeout: 5000 });
    await ball.dblclick({ force: true });
    
    // Now chat panel should be visible
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10000 });
  });

  test('slash commands help', async ({ page }) => {
    // Pre-set onboarded + guest flags, then navigate
    await page.evaluate(() => {
      localStorage.setItem('agentrix_onboarded', '1');
    });
    await page.goto('http://localhost:1420', { timeout: 30000 });
    await expect(page.locator('text=Agentrix Desktop')).toBeVisible({ timeout: 20000 });
    
    await page.getByRole('button', { name: /Skip as Guest/i }).dispatchEvent('click');
    
    // After guest login + onboarded, shows FloatingBall — double-click to open Pro Mode
    const ball = page.locator('[title*="Agentrix"]').first();
    await expect(ball).toBeVisible({ timeout: 5000 });
    await ball.dblclick({ force: true });
    
    // Wait for chat panel with textarea
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10000 });
    
    // Type /help command
    await page.fill('textarea', '/help');
    await page.keyboard.press('Enter');
    
    // Should see help output
    await expect(page.locator('text=/Available Commands|commands/i')).toBeVisible({ timeout: 5000 });
  });
});
