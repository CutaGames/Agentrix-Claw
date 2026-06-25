import { expect, test, type Page, type Route } from '@playwright/test';

const SOULS = [
  { id: 'claw', clan: 'A_office', display_name: '爪爪', display_name_en: 'Claw', tagline: '默认主宠', archetype: 'ENFP', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'calm', tier: 'free', age_rating: 'all' },
  { id: 'tinker', clan: 'A_office', display_name: '叮当', display_name_en: 'Tinker', tagline: '工坊搭子', archetype: 'ISTP', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'focused', tier: 'high_arpu', age_rating: 'all' },
  { id: 'sentry', clan: 'A_office', display_name: '哨兵', display_name_en: 'Sentry', tagline: '守序执行', archetype: 'ISTJ', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'calm', tier: 'high_arpu', age_rating: 'all' },
  { id: 'owl', clan: 'A_office', display_name: '夜枭', display_name_en: 'Owl', tagline: '深夜研究员', archetype: 'INTJ', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'focused', tier: 'high_arpu', age_rating: '13+' },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function gotoDesktop(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('agentrix_onboarded', '1');
    localStorage.setItem('agentrix_token', 'desktop-e2e-token');
  });
  await page.goto('http://127.0.0.1:1420/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await expect.poll(async () => (await page.content()).length).toBeGreaterThan(100);
}

async function enterGuest(page: Page) {
  await gotoDesktop(page);
  const guestBtn = page.getByRole('button', { name: /Skip as Guest/i });
  if (await guestBtn.isVisible().catch(() => false)) {
    await guestBtn.dispatchEvent('click');
  }
  await expect(page.locator('[title*="Agentrix"]').first()).toBeVisible({ timeout: 10000 });
}

async function openProMode(page: Page) {
  await enterGuest(page);
  await page.locator('[title*="Agentrix"]').first().dblclick({ force: true });
  await expect(page.locator('textarea')).toBeVisible({ timeout: 10000 });
}

async function mockPetRoutes(page: Page, unlockedSoulIds: string[], activeSoulId: string) {
  const state = {
    activeSoulId,
    unlockedSoulIds: [...unlockedSoulIds],
  };

  await page.route('**/api/v1/pet/souls**', async (route) => {
    await json(route, { items: SOULS, access: { plan_level: 'pro' } });
  });

  await page.route('**/api/v1/pet/soul/switch', async (route) => {
    const body = route.request().postDataJSON() as { templateId?: string };
    const templateId = body?.templateId ?? '';
    if (!state.unlockedSoulIds.includes(templateId) && state.unlockedSoulIds.length >= 3) {
      await json(route, { message: 'Pro 套餐最多解锁 3 只灵魂，请升级到 Pro+ 继续解锁' }, 403);
      return;
    }
    if (!state.unlockedSoulIds.includes(templateId)) {
      state.unlockedSoulIds.push(templateId);
    }
    state.activeSoulId = templateId;
    await json(route, { ok: true });
  });

  await page.addInitScript((initialSoulId) => {
    window.addEventListener('DOMContentLoaded', () => {
      window.dispatchEvent(new CustomEvent('agentrix:pet-state', { detail: { soul_template_id: initialSoulId } }));
    });
  }, state.activeSoulId);
}

test.describe('desktop pet soul e2e', () => {
  test('opens the picker and switches to another unlocked soul', async ({ page }) => {
    await mockPetRoutes(page, ['claw'], 'claw');
    await openProMode(page);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('agentrix:open-soul-picker'));
      window.dispatchEvent(new CustomEvent('agentrix:pet-state', { detail: { soul_template_id: 'claw' } }));
    });

    await expect(page.getByTestId('pet-soul-picker')).toBeVisible();
    await page.getByTestId('pet-soul-switch-tinker').click();
    await expect(page.getByTestId('pet-soul-switch-tinker')).toContainText('当前灵魂');
  });

  test('shows backend slot-limit error when pro user attempts a 4th unique soul', async ({ page }) => {
    await mockPetRoutes(page, ['claw', 'tinker', 'sentry'], 'sentry');
    await openProMode(page);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('agentrix:open-soul-picker'));
      window.dispatchEvent(new CustomEvent('agentrix:pet-state', { detail: { soul_template_id: 'sentry' } }));
    });

    await expect(page.getByTestId('pet-soul-picker')).toBeVisible();
    await page.getByTestId('pet-soul-switch-owl').click();
    await expect(page.getByTestId('pet-soul-error')).toContainText('Pro 套餐最多解锁 3 只灵魂');
  });
});