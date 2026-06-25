import { expect, test, type Page, type Route } from '@playwright/test';

type PetPlanLevel = 'free' | 'pro' | 'pro_plus';

const SOULS = [
  { id: 'claw', clan: 'A_office', display_name: '爪爪', display_name_en: 'Claw', tagline: '默认主宠', archetype: 'ENFP', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'calm', tier: 'free', age_rating: 'all', required_plan: 'free' },
  { id: 'tinker', clan: 'A_office', display_name: '叮当', display_name_en: 'Tinker', tagline: '工坊搭子', archetype: 'ISTP', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'focused', tier: 'high_arpu', age_rating: 'all', required_plan: 'pro' },
  { id: 'sentry', clan: 'A_office', display_name: '哨兵', display_name_en: 'Sentry', tagline: '守序执行', archetype: 'ISTJ', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'calm', tier: 'high_arpu', age_rating: 'all', required_plan: 'pro' },
  { id: 'owl', clan: 'A_office', display_name: '夜枭', display_name_en: 'Owl', tagline: '深夜研究员', archetype: 'INTJ', marketing_hook: '', recommended_skin_tags: [], default_idle_emotion: 'focused', tier: 'high_arpu', age_rating: '13+', required_plan: 'pro' },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockPetRoutes(page: Page, plan: PetPlanLevel, unlockedSoulIds: string[], activeSoulId: string) {
  const state = {
    plan,
    activeSoulId,
    unlockedSoulIds: [...unlockedSoulIds],
  };

  await page.route('**/api/v1/pet/state', async (route) => {
    await json(route, {
      pet_id: 'web-pet-1',
      user_id: 'web-user-1',
      emotion: 'happy',
      emotion_intensity: 2,
      emotion_since: Date.now(),
      emotion_decay_at: Date.now() + 60_000,
      intimacy_level: 4,
      intimacy_xp: 180,
      recent_memory_snippets: [],
      unlocked_soul_template_ids: state.unlockedSoulIds,
      primary_agent_id: 'web-agent-1',
      engine_switching: false,
      soul_template_id: state.activeSoulId,
      active_skin_id: null,
      updated_at: Date.now(),
    });
  });

  await page.route('**/api/v1/pet/souls**', async (route) => {
    const items = state.plan === 'free' ? SOULS.filter((item) => item.id === 'claw') : SOULS;
    await json(route, { items, access: { plan_level: state.plan } });
  });

  await page.route('**/api/v1/pet/soul/switch', async (route) => {
    const body = route.request().postDataJSON() as { templateId?: string };
    const templateId = body?.templateId ?? '';
    if (state.plan === 'free' && templateId !== 'claw') {
      await json(route, { message: '免费套餐只能切换到 Claw（爪爪），升级到 Pro 可解锁更多灵魂' }, 403);
      return;
    }
    if (state.plan === 'pro' && !state.unlockedSoulIds.includes(templateId) && state.unlockedSoulIds.length >= 3) {
      await json(route, { message: 'Pro 套餐最多解锁 3 只灵魂，请升级到 Pro+ 继续解锁' }, 403);
      return;
    }
    if (!state.unlockedSoulIds.includes(templateId)) {
      state.unlockedSoulIds.push(templateId);
    }
    state.activeSoulId = templateId;
    await json(route, {
      pet_id: 'web-pet-1',
      user_id: 'web-user-1',
      emotion: 'happy',
      emotion_intensity: 2,
      emotion_since: Date.now(),
      emotion_decay_at: Date.now() + 60_000,
      intimacy_level: 4,
      intimacy_xp: 180,
      recent_memory_snippets: [],
      unlocked_soul_template_ids: state.unlockedSoulIds,
      primary_agent_id: 'web-agent-1',
      engine_switching: false,
      soul_template_id: state.activeSoulId,
      active_skin_id: null,
      updated_at: Date.now(),
    });
  });
}

async function authenticateConsole(page: Page) {
  await page.context().addCookies([
    {
      name: 'agentrix_token',
      value: 'frontend-pet-soul-e2e-token',
      url: 'http://127.0.0.1:3000',
    },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'frontend-pet-soul-e2e-token');
    localStorage.setItem('user_roles', JSON.stringify(['user']));
  });
}

test.describe('web pet soul console', () => {
  test('switches souls through the shared contract', async ({ page }) => {
    await mockPetRoutes(page, 'pro', ['claw'], 'claw');
    await authenticateConsole(page);
    await page.goto('/console/pet/souls');

    await expect(page.getByTestId('pet-soul-console-page')).toBeVisible();
    await expect(page.getByTestId('pet-soul-current-id')).toContainText('爪爪');
    await expect(page.getByTestId('pet-soul-plan-badge')).toContainText('Pro');

    await page.getByTestId('pet-soul-switch-tinker').click();
    await expect(page.getByTestId('pet-soul-current-id')).toContainText('叮当');
  });

  test('surfaces pro slot-limit errors instead of silently switching', async ({ page }) => {
    await mockPetRoutes(page, 'pro', ['claw', 'tinker', 'sentry'], 'sentry');
    await authenticateConsole(page);
    await page.goto('/console/pet/souls');

    await page.getByTestId('pet-soul-switch-owl').click();
    await expect(page.getByTestId('pet-soul-error')).toContainText('Pro 套餐最多解锁 3 只灵魂');
    await expect(page.getByTestId('pet-soul-current-id')).toContainText('哨兵');
  });
});