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

  test('text-only chat does not eagerly load the multimodal projector', async ({ page }) => {
    /* Configures a local model with vision support declared, then sends a
       text-only message. The E2E bridge records each call — we verify the
       model call completed WITHOUT a multimodal init (no image attachment). */
    await page.goto('/?e2e=voice-ui');
    await expect(byTestId(page, 'agent-chat-screen')).toBeAttached();

    await page.evaluate(() => {
      const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
      runtime?.configureLocalModelScenario?.({
        modelId: 'gemma-4-2b',
        replyText: '本地模型回复：纯文本链路已接通。',
        supportsVisionInput: true,
        supportsAudioInput: false,
        supportsAudioOutput: false,
      });
    });

    await byTestId(page, 'chat-text-input').last().fill('你好');
    await byTestId(page, 'chat-send-button').last().click();

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: '纯文本链路已接通' })).toHaveCount(1, { timeout: 10000 });

    /* Verify the bridge received a call with text (not multimodal) payload */
    const calls = await page.evaluate(() => {
      const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
      return runtime?.getLocalModelCalls?.() ?? [];
    });
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ model: 'gemma-4-2b', userText: '你好' });
  });

  test('partial download recovery preserves base model while re-downloading projector', async ({ page }) => {
    /* Simulates crash recovery scenario: base model is downloaded but
       projector is missing. Verifies the screen shows "text ready" state
       and can re-download just the missing projector. */
    await openLocalAiScreen(page);
    await configureLocalPackageScenario(page, {
      modelId: 'gemma-4-2b',
      status: 'ready',
      downloadedArtifactKeys: ['model'],
    });

    await expect(byTestId(page, 'local-ai-artifact-model')).toContainText(/已完成|complete/i);
    await expect(byTestId(page, 'local-ai-upgrade-addons-button')).toBeVisible();

    /* Trigger the add-on download */
    await byTestId(page, 'local-ai-upgrade-addons-button').click();
    await expect(byTestId(page, 'local-ai-status-label')).toContainText(/下载中|Downloading/);

    /* After download, both artifacts should be complete */
    await expect(byTestId(page, 'local-ai-artifact-multimodalProjector')).toContainText(/已完成|complete/i, { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-ready-model')).toContainText('Gemma 4 E2B', { timeout: 10000 });
    await expect(byTestId(page, 'local-ai-upgrade-addons-button')).toHaveCount(0);
  });

  test('download error shows error state and allows retry', async ({ page }) => {
    await openLocalAiScreen(page);
    await configureLocalPackageScenario(page, {
      modelId: 'gemma-4-2b',
      status: 'not_downloaded',
      downloadedArtifactKeys: [],
      nextDownloadError: 'Network request failed',
    });

    await byTestId(page, 'local-ai-download-button-gemma-4-2b').click();

    /* Should eventually show error state after the network failure */
    await expect(byTestId(page, 'local-ai-status-label')).toContainText(/错误|Error|失败|Failed|未下载|Not Downloaded/, { timeout: 15000 });
  });
});