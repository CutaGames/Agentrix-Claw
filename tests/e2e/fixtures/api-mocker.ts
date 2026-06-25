/**
 * API route mocker for Playwright E2E tests.
 * Intercepts backend API calls and returns mock data.
 */
import { type Page, type Route } from '@playwright/test';
import {
  MOCK_PET_STATE,
  MOCK_SOULS,
  MOCK_SKINS,
  MOCK_AXP_BALANCE,
  MOCK_AXP_TRANSACTIONS,
  MOCK_AXP_REDEEM_CATALOG,
  MOCK_SUBSCRIPTION_TIERS,
  MOCK_MARKET_SKINS,
  MOCK_MARKET_SKILLS,
  MOCK_CHAT_RESPONSE,
  MOCK_DEVICES,
  MOCK_CHECKIN_STATUS,
  MOCK_CHECKIN_RESULT,
  MOCK_CORAISING_INVITE,
  MOCK_GREETING_TEMPLATES,
  TEST_USER,
} from './mock-data';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Set up all API mocks for a full E2E test session.
 */
export async function setupAllMocks(page: Page) {
  // Auth
  await page.route('**/api/v1/auth/me', (route) => json(route, { user: TEST_USER }));
  await page.route('**/api/v1/auth/verify', (route) => json(route, { valid: true, user: TEST_USER }));

  // Pet state
  await page.route('**/api/v1/pet/state', (route) => json(route, MOCK_PET_STATE));
  await page.route('**/api/v1/pet/souls**', (route) => json(route, { items: MOCK_SOULS, access: { plan_level: 'pro' } }));
  await page.route('**/api/v1/pet/soul/switch', (route) => json(route, { ...MOCK_PET_STATE, soul_template_id: 'tinker' }));

  // Skins / Wardrobe
  await page.route('**/api/v1/pet/skins', (route) => json(route, { items: MOCK_SKINS }));
  await page.route('**/api/v1/pet/skin/activate', (route) => json(route, { success: true }));

  // AXP
  await page.route('**/api/v1/axp/balance', (route) => json(route, MOCK_AXP_BALANCE));
  await page.route('**/api/v1/axp/transactions**', (route) => json(route, { items: MOCK_AXP_TRANSACTIONS, total: 4 }));
  await page.route('**/api/v1/axp/redeem/catalog', (route) => json(route, { items: MOCK_AXP_REDEEM_CATALOG }));
  await page.route('**/api/v1/axp/redeem', (route) => json(route, { success: true, new_balance: 1950 }));
  await page.route('**/api/v1/axp/checkin', (route) => json(route, MOCK_CHECKIN_RESULT));
  await page.route('**/api/v1/axp/checkin/status', (route) => json(route, MOCK_CHECKIN_STATUS));

  // Subscription
  await page.route('**/api/v1/subscription/catalog', (route) => json(route, { tiers: MOCK_SUBSCRIPTION_TIERS }));
  await page.route('**/api/v1/subscription/current', (route) => json(route, { tier: 'pro', expires_at: '2026-06-12' }));

  // Marketplace
  await page.route('**/api/v1/market/skins**', (route) => json(route, { items: MOCK_MARKET_SKINS, total: 3 }));
  await page.route('**/api/v1/market/skills**', (route) => json(route, { items: MOCK_MARKET_SKILLS, total: 3 }));

  // Chat (streaming mock — return a simple JSON for non-streaming tests)
  await page.route('**/api/v1/chat/send', (route) => json(route, MOCK_CHAT_RESPONSE));

  // Devices
  await page.route('**/api/v1/clawcore/devices', (route) => json(route, { items: MOCK_DEVICES }));

  // Co-Raising
  await page.route('**/api/v1/co-raising/invite**', (route) => json(route, MOCK_CORAISING_INVITE));

  // Greeting
  await page.route('**/api/v1/greeting/templates', (route) => json(route, { items: MOCK_GREETING_TEMPLATES }));

  // Pet generation
  await page.route('**/api/v1/pet-generation/submit', (route) => json(route, { task_id: 'gen-task-001', status: 'queued' }));
  await page.route('**/api/v1/pet-generation/tasks', (route) => json(route, { items: [] }));

  // Notifications
  await page.route('**/api/v1/notifications**', (route) => json(route, { items: [], unread_count: 0 }));
}

/**
 * Authenticate a page by injecting token cookies/localStorage.
 */
export async function authenticatePage(page: Page, baseURL: string) {
  await page.context().addCookies([
    { name: 'agentrix_token', value: TEST_USER.token, url: baseURL },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'e2e-mock-jwt-token-2026');
    localStorage.setItem('user_roles', JSON.stringify(['user']));
    localStorage.setItem('user_plan', 'pro');
  });
}
