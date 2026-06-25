import { expect, test, type Page } from '@playwright/test';

type LocalModelScenarioConfig = {
  modelId?: string;
  replyText?: string;
  supportsVisionInput?: boolean;
  supportsAudioInput?: boolean;
  supportsAudioOutput?: boolean;
};

type CloudCall = {
  url: string;
  method: string;
  body?: string;
};

function byTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`);
}

function activeByTestId(page: Page, testId: string) {
  return byTestId(page, testId).last();
}

function executionModeChip(page: Page, mode: 'local-only' | 'auto' | 'cloud-only') {
  return page.locator(`[aria-label="execution-mode-${mode}"]`).last();
}

async function openChat(page: Page) {
  await page.goto('/?e2e=voice-ui');
  await expect(activeByTestId(page, 'agent-chat-screen')).toBeAttached();
}

async function openVoiceChat(page: Page) {
  await openChat(page);
  await activeByTestId(page, 'chat-voice-mode-toggle').click();
  await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible();
  await skipVoiceOnboardingIfPresent(page);
}

async function skipVoiceOnboardingIfPresent(page: Page) {
  if (await byTestId(page, 'voice-onboarding-tooltip').count()) {
    await activeByTestId(page, 'voice-onboarding-skip').click();
    await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);
  }
}

async function configureLocalModelScenario(page: Page, config: LocalModelScenarioConfig) {
  await page.evaluate((nextConfig) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.configureLocalModelScenario(nextConfig);
  }, config);
}

async function getLocalModelCalls(page: Page) {
  return page.evaluate(() => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    return runtime?.getLocalModelCalls?.() ?? [];
  });
}

async function installCloudFetchSpy(page: Page) {
  await page.evaluate(() => {
    if ((window as any).__TRI_TIER_CLOUD_CALLS__) {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    (window as any).__TRI_TIER_CLOUD_CALLS__ = [];
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const method = (init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
      const normalizedPath = new URL(requestUrl, window.location.origin).pathname.replace(/^\/api/, '');
      if (/^\/(openclaw\/proxy\/e2e-instance-1\/(stream|chat)|claude\/chat)$/.test(normalizedPath)) {
        (window as any).__TRI_TIER_CLOUD_CALLS__.push({
          url: normalizedPath,
          method,
          body: typeof init?.body === 'string' ? init.body : '',
        });
      }
      return originalFetch(input as any, init);
    };
  });
}

async function getCloudCalls(page: Page): Promise<CloudCall[]> {
  return page.evaluate(() => (window as any).__TRI_TIER_CLOUD_CALLS__ ?? []);
}

async function installLocalPayloadCapture(page: Page) {
  await page.evaluate(() => {
    if ((window as any).__TRI_TIER_LOCAL_PAYLOADS__) {
      return;
    }
    (window as any).__TRI_TIER_LOCAL_PAYLOADS__ = [];
    const bridge = (window as any).__AGENTRIX_LOCAL_LLM__;
    if (!bridge || typeof bridge.generateStream !== 'function') {
      return;
    }
    const originalGenerateStream = bridge.generateStream.bind(bridge);
    bridge.generateStream = async (payload: any) => {
      (window as any).__TRI_TIER_LOCAL_PAYLOADS__.push(payload);
      return originalGenerateStream(payload);
    };
  });
}

async function getLocalPayloads(page: Page) {
  return page.evaluate(() => (window as any).__TRI_TIER_LOCAL_PAYLOADS__ ?? []);
}

async function makeLocalStreamHang(page: Page) {
  await page.evaluate(() => {
    const bridge = (window as any).__AGENTRIX_LOCAL_LLM__;
    if (!bridge) {
      return;
    }
    bridge.generateStream = async () => new Promise<string[]>(() => {});
    bridge.generate = async () => new Promise<string>(() => {});
  });
}

async function makeLocalRuntimeUnavailable(page: Page) {
  await page.evaluate(() => {
    const bridge = (window as any).__AGENTRIX_LOCAL_LLM__;
    if (!bridge) {
      return;
    }
    bridge.isAvailable = () => false;
    bridge.getCapabilities = () => ({
      available: false,
      supportsTextGeneration: false,
      supportsStreaming: false,
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });
  });
}

async function setSelectedModel(page: Page, modelId: string) {
  await page.evaluate((nextModelId) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.configureLocalPackageScenario?.({
      modelId: 'gemma-4-2b',
      status: 'ready',
      downloadedArtifactKeys: ['model', 'multimodalProjector'],
      selectedModelId: nextModelId,
    });
  }, modelId);
}

async function holdToTalkWithTranscript(page: Page, transcript: string) {
  await page.evaluate(async () => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    await runtime?.startHoldToTalk?.();
  });
  await expect.poll(async () => page.evaluate(() => !!(window as any).__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__)).toBeTruthy();
  await page.evaluate((nextText) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.emitLiveSpeechFinalTranscript(nextText);
  }, transcript);
  await page.evaluate(async () => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    await runtime?.stopHoldToTalk?.();
  });
}

function collectTelemetry(page: Page) {
  const lines: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[local-inference-telemetry]')) {
      lines.push(text);
    }
  });
  return lines;
}

test.describe('tri-tier execution observations', () => {
  test.setTimeout(120_000);

  test('A1/D1 observed: auto + short prompt prefers local and emits success telemetry', async ({ page }) => {
    const telemetry = collectTelemetry(page);
    await openChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: '本地模型回复：短文本链路已接通。',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });
    await installLocalPayloadCapture(page);

    await executionModeChip(page, 'auto').click();
    await activeByTestId(page, 'chat-text-input').fill('你好，自我介绍');
    await activeByTestId(page, 'chat-send-button').click();

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: '短文本链路已接通' })).toHaveCount(1);
    await expect.poll(async () => (await getLocalModelCalls(page)).length).toBe(1);

    const payloads = await getLocalPayloads(page);
    const systemPrompt = String(payloads[0]?.messages?.[0]?.content || '');
    expect(systemPrompt).toContain('You run locally on the user\'s device via Agentrix runtime.');
    expect(systemPrompt).toContain('Do not claim to be Gemini, Claude, GPT, Bard, or any other assistant.');

    const cloudCalls = await getCloudCalls(page);
    expect(cloudCalls).toHaveLength(0);
    expect(telemetry.some((line) => /"outcome":"success"/.test(line))).toBeTruthy();
  });

  test('A2: auto + picked local model promotes long multi-step prompt to cloud', async ({ page }) => {
    await openChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: '本地模型不应被调用。',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });

    const longPrompt = `先帮我拆解这个问题，再给出逐步执行计划，然后列出风险和备选方案。${'这是一个很长的上下文。'.repeat(40)}`;
    await executionModeChip(page, 'auto').click();
    await activeByTestId(page, 'chat-text-input').fill(longPrompt);
    await activeByTestId(page, 'chat-send-button').click();

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: 'Mock voice UI reply' })).toHaveCount(1);
    const localCalls = await getLocalModelCalls(page);
    expect(localCalls).toHaveLength(0);
    await expect.poll(async () => (await getCloudCalls(page)).length).toBeGreaterThan(0);
  });

  test('A3/D3: local-only + stalled text turn surfaces error and emits stall telemetry', async ({ page }) => {
    const telemetry = collectTelemetry(page);
    await openChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: 'unused',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });
    await makeLocalStreamHang(page);

    await executionModeChip(page, 'local-only').click();
    await activeByTestId(page, 'chat-text-input').fill('你好');
    await activeByTestId(page, 'chat-send-button').click();

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: 'Local model is unavailable or timed out' })).toHaveCount(1, { timeout: 25_000 });
    const cloudCalls = await getCloudCalls(page);
    expect(cloudCalls).toHaveLength(0);
    expect(telemetry.some((line) => /"outcome":"stall"|"outcome":"timeout"/.test(line))).toBeTruthy();
  });

  test('A4: cloud-only bypasses local even when a local model is selected', async ({ page }) => {
    await openChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: '本地模型不应被调用。',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });

    await executionModeChip(page, 'cloud-only').click();
    await activeByTestId(page, 'chat-text-input').fill('你好');
    await activeByTestId(page, 'chat-send-button').click();

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: 'Mock voice UI reply' })).toHaveCount(1);
    const localCalls = await getLocalModelCalls(page);
    expect(localCalls).toHaveLength(0);
    await expect.poll(async () => (await getCloudCalls(page)).length).toBeGreaterThan(0);
  });

  test('A5: local-only + cloud model selection resolves to cloud path', async ({ page }) => {
    await openChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: '本地模型不应被调用。',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });
    await setSelectedModel(page, 'claude-haiku-4-5');

    await executionModeChip(page, 'local-only').click();
    await activeByTestId(page, 'chat-text-input').fill('你好');
    await activeByTestId(page, 'chat-send-button').click();

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: 'Mock voice UI reply' })).toHaveCount(1);
    const localCalls = await getLocalModelCalls(page);
    expect(localCalls).toHaveLength(0);
    await expect.poll(async () => (await getCloudCalls(page)).length).toBeGreaterThan(0);
  });

  test('B1 observed: auto + local hold-to-talk returns local reply with success telemetry', async ({ page }) => {
    const telemetry = collectTelemetry(page);
    await openVoiceChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: '本地模型回复：语音链路已接通。',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });

    await executionModeChip(page, 'auto').click();
    await holdToTalkWithTranscript(page, '天气如何');

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: '语音链路已接通' })).toHaveCount(1, { timeout: 15_000 });
    await expect.poll(async () => (await getLocalModelCalls(page)).length).toBe(1);

    const cloudCalls = await getCloudCalls(page);
    expect(cloudCalls).toHaveLength(0);
    expect(telemetry.some((line) => /"outcome":"success"/.test(line))).toBeTruthy();
  });

  test('B2/D3: local-only + stalled hold-to-talk surfaces error and emits stall telemetry', async ({ page }) => {
    const telemetry = collectTelemetry(page);
    await openVoiceChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: 'unused',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });
    await makeLocalStreamHang(page);

    await executionModeChip(page, 'local-only').click();
    await holdToTalkWithTranscript(page, '请详细分析这个复杂问题');

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: 'Local model is unavailable or timed out' })).toHaveCount(1, { timeout: 25_000 });
    const cloudCalls = await getCloudCalls(page);
    expect(cloudCalls).toHaveLength(0);
    expect(telemetry.some((line) => /"outcome":"stall"|"outcome":"timeout"/.test(line))).toBeTruthy();
  });

  test('B4: cloud-only hold-to-talk bypasses local and reaches cloud reply', async ({ page }) => {
    await openVoiceChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: '本地模型不应被调用。',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });

    await executionModeChip(page, 'cloud-only').click();
    await holdToTalkWithTranscript(page, '简介下 Opus 4.7');

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: 'Mock voice UI reply' })).toHaveCount(1, { timeout: 15_000 });
    const localCalls = await getLocalModelCalls(page);
    expect(localCalls).toHaveLength(0);
    await expect.poll(async () => (await getCloudCalls(page)).length).toBeGreaterThan(0);
  });

  test('D2: local-only + local runtime unavailable shows error and emits telemetry', async ({ page }) => {
    const telemetry = collectTelemetry(page);
    await openChat(page);
    await installCloudFetchSpy(page);
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: 'unused',
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });
    await makeLocalRuntimeUnavailable(page);

    await executionModeChip(page, 'local-only').click();
    await activeByTestId(page, 'chat-text-input').fill('你好');
    await activeByTestId(page, 'chat-send-button').click();

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: 'Local model is unavailable or timed out' })).toHaveCount(1, { timeout: 15_000 });
    const cloudCalls = await getCloudCalls(page);
    expect(cloudCalls).toHaveLength(0);
    expect(telemetry.some((line) => /"outcome":"error"|"outcome":"fallback-to-cloud"/.test(line))).toBeTruthy();
  });
});