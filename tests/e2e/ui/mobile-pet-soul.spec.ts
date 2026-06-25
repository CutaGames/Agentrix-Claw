import { expect, test, type Page } from '@playwright/test';

function byTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`);
}

test.describe('mobile pet soul expo e2e', () => {
  test('switches souls on the real mobile screen code path', async ({ page }) => {
    await page.goto('/?e2e=pet-soul&plan=pro&activeSoul=claw&unlocked=claw');

    await expect(byTestId(page, 'pet-soul-screen')).toBeVisible();
    await expect(byTestId(page, 'pet-soul-switch-claw')).toContainText('当前灵魂');

    await byTestId(page, 'pet-soul-switch-tinker').click();
    await expect(byTestId(page, 'pet-soul-switch-tinker')).toContainText('当前灵魂');
  });

  test('surfaces free/pro gating errors from the shared contract', async ({ page }) => {
    await page.goto('/?e2e=pet-soul&plan=pro&activeSoul=sentry&unlocked=claw,tinker,sentry');

    await expect(byTestId(page, 'pet-soul-screen')).toBeVisible();
    await byTestId(page, 'pet-soul-switch-owl').click();
    await expect(byTestId(page, 'pet-soul-error')).toContainText('Pro 套餐最多解锁 3 只灵魂');

    await page.goto('/?e2e=pet-soul&plan=free&activeSoul=claw&unlocked=claw');
    await expect(byTestId(page, 'pet-soul-card-claw')).toBeVisible();
    await expect(byTestId(page, 'pet-soul-card-tinker')).toHaveCount(0);
  });
});