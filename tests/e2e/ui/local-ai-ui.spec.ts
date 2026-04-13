import { expect, test, type Page } from '@playwright/test';

type LocalPackageScenario = {
  modelId?: string;
  status?: 'not_downloaded' | 'downloading' | 'ready' | 'error';
  downloadedArtifactKeys?: Array<'model' | 'multimodalProjector' | 'audioOutputModel' | 'vocoder'>;
  nextDownloadError?: string | null;
};

function byTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`);
}

async function configureLocalPackageScenario(page: Page, config: LocalPackageScenario) {
  await page.evaluate((nextConfig) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.configureLocalPackageScenario?.(nextConfig);
  }, config);
}

async function openLocalAiScreen(page: Page) {
  await page.goto('/?e2e=voice-ui&screen=local-ai');
  await expect(byTestId(page, 'local-ai-model-screen')).toBeAttached();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });
});

test.describe('local AI model user flows', () => {
  test('downloads a full Gemma package through the Local AI screen', async ({ page }) => {
    await openLocalAiScreen(page);
    await configureLocalPackageScenario(page, {
      modelId: 'gemma-4-2b',
      status: 'not_downloaded',
      downloadedArtifactKeys: [],
    });

    await expect(byTestId(page, 'local-ai-status-label')).toContainText(/未下载|Not Downloaded/);
    await byTestId(page, 'local-ai-download-button-gemma-4-2b').click();

    await expect(byTestId(page, 'local-ai-current-artifact')).toBeVisible();
    await expect(byTestId(page, 'local-ai-status-label')).toContainText(/下载中|Downloading|已就绪|Ready|文本已就绪|Text Ready/);
    await expect(byTestId(page, 'local-ai-artifact-model')).toContainText(/已完成|complete/i, { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-artifact-multimodalProjector')).toContainText(/已完成|complete/i, { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-ready-model')).toContainText('Gemma 4 E2B', { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-active-button-gemma-4-2b')).toBeVisible();
  });

  test('upgrades a partial package by downloading the remaining add-on only', async ({ page }) => {
    await openLocalAiScreen(page);
    await configureLocalPackageScenario(page, {
      modelId: 'gemma-4-2b',
      status: 'ready',
      downloadedArtifactKeys: ['model'],
    });

    await expect(byTestId(page, 'local-ai-upgrade-addons-button')).toBeVisible();
    await byTestId(page, 'local-ai-upgrade-addons-button').click();

    await expect(byTestId(page, 'local-ai-status-label')).toContainText(/下载中|Downloading/);
    await expect(byTestId(page, 'local-ai-artifact-multimodalProjector')).toContainText(/已完成|complete/i, { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-ready-model')).toContainText('Gemma 4 E2B', { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-upgrade-addons-button')).toHaveCount(0);
  });

  test('runtime-blocked package can be repaired with a re-download', async ({ page }) => {
    await openLocalAiScreen(page);
    await configureLocalPackageScenario(page, {
      modelId: 'gemma-4-2b',
      status: 'error',
      downloadedArtifactKeys: ['model', 'multimodalProjector'],
    });

    await expect(byTestId(page, 'local-ai-runtime-blocked-message')).toBeVisible();
    await expect(byTestId(page, 'local-ai-repair-button')).toBeVisible();
    await byTestId(page, 'local-ai-repair-button').click();

    await expect(byTestId(page, 'local-ai-status-label')).toContainText(/下载中|Downloading/);
    await expect(byTestId(page, 'local-ai-ready-model')).toContainText('Gemma 4 E2B', { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-status-label')).toContainText(/已就绪|Ready/);
    await expect(byTestId(page, 'local-ai-runtime-blocked-message')).toHaveCount(0);
  });
});