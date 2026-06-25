import { expect, test, type Page } from '@playwright/test';

type LocalModelScenarioConfig = {
  modelId?: string;
  replyText?: string;
  supportsVisionInput?: boolean;
  supportsAudioInput?: boolean;
  supportsAudioOutput?: boolean;
};

type LocalModelCall = {
  model?: string;
  userText: string;
  messageCount: number;
};

function byTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`);
}

function activeByTestId(page: Page, testId: string) {
  return byTestId(page, testId).last();
}

async function setLiveSpeechPermission(page: Page, state: 'granted' | 'denied') {
  await page.evaluate((nextState) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.setLiveSpeechPermission(nextState);
  }, state);
}

async function triggerWakeWord(page: Page) {
  await page.evaluate(() => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.triggerWakeWord();
  });
}

async function emitRealtimeFinalTranscript(page: Page, text: string) {
  await page.evaluate((nextText) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.emitRealtimeFinalTranscript(nextText);
  }, text);
}

async function emitRealtimeAssistantChunk(page: Page, chunk: string) {
  await page.evaluate((nextChunk) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.emitRealtimeAssistantChunk(nextChunk);
  }, chunk);
}

async function emitLiveSpeechFinalTranscript(page: Page, text: string) {
  await page.evaluate((nextText) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.emitLiveSpeechFinalTranscript(nextText);
  }, text);
}

async function configureLocalModelScenario(page: Page, config: LocalModelScenarioConfig) {
  await page.evaluate((nextConfig) => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.configureLocalModelScenario(nextConfig);
  }, config);
}

async function getLocalModelCalls(page: Page): Promise<LocalModelCall[]> {
  return page.evaluate(() => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    return runtime?.getLocalModelCalls?.() ?? [];
  });
}

async function startHoldToTalk(page: Page) {
  await page.evaluate(async () => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    await runtime?.startHoldToTalk?.();
  });
}

async function stopHoldToTalk(page: Page) {
  await page.evaluate(async () => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    await runtime?.stopHoldToTalk?.();
  });
}

async function completeRealtimeAssistantResponse(page: Page) {
  await page.evaluate(() => {
    const runtime = (window as any).__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
    runtime?.completeRealtimeAssistantResponse();
  });
}

async function skipVoiceOnboardingIfPresent(page: Page) {
  if (await byTestId(page, 'voice-onboarding-tooltip').count()) {
    await activeByTestId(page, 'voice-onboarding-skip').click();
    await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);
  }
}

async function holdToTalkWithTranscript(page: Page, transcript: string) {
  await startHoldToTalk(page);
  await expect.poll(async () => page.evaluate(() => !!(window as any).__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__)).toBeTruthy();
  await emitLiveSpeechFinalTranscript(page, transcript);
  await stopHoldToTalk(page);
}

async function openVoiceChat(page: Page) {
  await page.goto('/?e2e=voice-ui');
  await expect(activeByTestId(page, 'agent-chat-screen')).toBeAttached();
  /* v4.0: Chat is the home screen — enter voice mode via toggle button */
  await activeByTestId(page, 'chat-voice-mode-toggle').click();
  await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible();
}

test.describe('voice ui regression', () => {
  test('voice mode shows onboarding, drawer works, and onboarding does not re-appear', async ({ page }) => {
    await openVoiceChat(page);

    await expect(activeByTestId(page, 'voice-onboarding-tooltip')).toBeVisible();
    await expect(activeByTestId(page, 'voice-onboarding-step-indicator')).toHaveText('1/3');

    await activeByTestId(page, 'voice-onboarding-next').click();
    await expect(activeByTestId(page, 'voice-onboarding-step-indicator')).toHaveText('2/3');

    await activeByTestId(page, 'voice-onboarding-next').click();
    await expect(activeByTestId(page, 'voice-onboarding-step-indicator')).toHaveText('3/3');

    await activeByTestId(page, 'voice-onboarding-next').click();
    await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);

    /* Toggle voice off and back on — onboarding should not re-appear */
    await activeByTestId(page, 'chat-voice-mode-toggle').click();
    await expect(byTestId(page, 'voice-status-bar')).toHaveCount(0);

    await activeByTestId(page, 'chat-voice-mode-toggle').click();
    await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible();
    await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);
  });

  test('voice chat exposes controls and settings toggles', async ({ page }) => {
    await openVoiceChat(page);

    if (await byTestId(page, 'voice-onboarding-tooltip').count()) {
      await activeByTestId(page, 'voice-onboarding-skip').click();
      await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);
    }

    const sessionState = activeByTestId(page, 'voice-session-state');
    const actionButton = activeByTestId(page, 'chat-voice-action-button');
    const voiceToggle = activeByTestId(page, 'chat-voice-mode-toggle');

    /* v4.0: voice toggle enters basic (PTT) mode */
    await expect(sessionState).toHaveAttribute('aria-label', /voice-session-state:/);
    await expect(actionButton).toHaveAttribute('aria-label', /chat-voice-action-button:ptt:/);

    /* Open settings sheet and toggle duplex mode */
    await activeByTestId(page, 'agent-chat-settings-button').click();
    await expect(activeByTestId(page, 'chat-settings-sheet')).toBeVisible();
    await activeByTestId(page, 'chat-duplex-toggle').click();
    /* Close settings sheet via keyboard Escape */
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'chat-settings-sheet')).toHaveCount(0, { timeout: 3000 });

    /* After enabling duplex, session state should reflect duplex mode */
    await expect(sessionState).toHaveAttribute('aria-label', /duplex/, { timeout: 8000 });

    /* Toggle voice off → text mode restored */
    await voiceToggle.click();
    await expect(byTestId(page, 'voice-status-bar')).toHaveCount(0);
    await expect(activeByTestId(page, 'chat-text-input')).toBeVisible();

    /* Toggle voice back on → voice mode restored */
    await voiceToggle.click();
    await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible();
    await expect(byTestId(page, 'chat-text-input')).toHaveCount(0);
  });

  test('chat opens in text mode by default, voice toggle upgrades to voice mode', async ({ page }) => {
    await page.goto('/?e2e=voice-ui');

    /* v4.0: Chat is the default first tab, no console CTA needed */
    await expect(activeByTestId(page, 'agent-chat-screen')).toBeAttached();
    await expect(activeByTestId(page, 'chat-text-input')).toBeVisible();
    await expect(byTestId(page, 'voice-status-bar')).toHaveCount(0);

    await activeByTestId(page, 'chat-voice-mode-toggle').click();
    await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible();
    await expect(activeByTestId(page, 'voice-onboarding-tooltip')).toBeVisible();

    await activeByTestId(page, 'voice-onboarding-skip').click();
    await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);

    /* Toggle off voice and confirm text mode restored */
    await activeByTestId(page, 'chat-voice-mode-toggle').click();
    await expect(byTestId(page, 'voice-status-bar')).toHaveCount(0);
    await expect(activeByTestId(page, 'chat-text-input')).toBeVisible();
  });

  test('microphone permission denial can recover back into live voice', async ({ page }) => {
    test.fixme(true, 'Expo Web does not emulate mid-session OS microphone permission revocation reliably.');

    await openVoiceChat(page);

    if (await byTestId(page, 'voice-onboarding-tooltip').count()) {
      await activeByTestId(page, 'voice-onboarding-skip').click();
      await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);
    }

    const actionButton = activeByTestId(page, 'chat-voice-action-button');
    const permissionState = activeByTestId(page, 'voice-permission-state');
    const sessionState = activeByTestId(page, 'voice-session-state');

    await actionButton.click();
    await expect(sessionState).toHaveAttribute('aria-label', /voice-session-state:tap:duplex:idle:/);

    await setLiveSpeechPermission(page, 'denied');
    await expect.poll(async () => page.evaluate(() => (window as any).__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__)).toBe('denied');
    await actionButton.click();
    await expect(sessionState).toHaveAttribute('aria-label', /voice-session-state:tap:duplex:idle:/);

    await setLiveSpeechPermission(page, 'granted');
    await expect.poll(async () => page.evaluate(() => (window as any).__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__)).toBe('granted');
    await actionButton.click();
    await expect(permissionState).toHaveAttribute('aria-label', 'voice-permission-state:granted');
    await expect(sessionState).toHaveAttribute('aria-label', /voice-session-state:tap:duplex:recording:/);
  });

  test('voice mode activation and agent voice persona is switchable', async ({ page }) => {
    await page.goto('/?e2e=voice-ui');
    await expect(activeByTestId(page, 'agent-chat-screen')).toBeAttached();

    /* Activate voice mode via toggle */
    await activeByTestId(page, 'chat-voice-mode-toggle').click();
    await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible({ timeout: 5000 });

    if (await byTestId(page, 'voice-onboarding-tooltip').count()) {
      await activeByTestId(page, 'voice-onboarding-skip').click();
      await expect(byTestId(page, 'voice-onboarding-tooltip')).toHaveCount(0);
    }

    await activeByTestId(page, 'agent-chat-settings-button').click();
    await expect(activeByTestId(page, 'chat-settings-sheet')).toBeVisible();

    await activeByTestId(page, 'chat-voice-persona-nova').click();
    await expect(activeByTestId(page, 'chat-selected-voice')).toHaveAttribute('aria-label', 'chat-selected-voice:nova');
  });

  test('realtime final transcript creates one user turn and receives assistant chunks', async ({ page }) => {
    await openVoiceChat(page);

    await skipVoiceOnboardingIfPresent(page);

    /* Enable duplex mode via settings sheet for realtime channel */
    await activeByTestId(page, 'agent-chat-settings-button').click();
    await expect(activeByTestId(page, 'chat-settings-sheet')).toBeVisible();
    await activeByTestId(page, 'chat-duplex-toggle').click();
    /* Close settings sheet via keyboard Escape */
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'chat-settings-sheet')).toHaveCount(0, { timeout: 3000 });

    /* Wait for duplex + realtime connected session */
    await expect(activeByTestId(page, 'voice-session-state')).toHaveAttribute(
      'aria-label',
      /voice-session-state:.*:duplex:.*:connected/,
      { timeout: 10000 },
    );

    /* Verify the E2E realtime bridge is set up */
    await expect.poll(async () =>
      page.evaluate(() => !!(window as any).__AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__),
      { timeout: 5000 },
    ).toBeTruthy();

    const transcript = '能听到我说话吗';
    const assistantReply = '已收到，你的实时语音链路现在已经接通。';

    await emitRealtimeFinalTranscript(page, transcript);
    await emitRealtimeFinalTranscript(page, transcript);

    await expect
      .poll(async () => byTestId(page, 'chat-message-text-user').filter({ hasText: transcript }).count())
      .toBe(1);

    await emitRealtimeAssistantChunk(page, assistantReply);
    await completeRealtimeAssistantResponse(page);

    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: assistantReply })).toHaveCount(1);
  });

  test('local text chat routes through the on-device bridge and returns a local reply', async ({ page }) => {
    const userText = '你好';
    const assistantReply = '本地模型回复：Gemma 文字链路已接通。';

    await page.goto('/?e2e=voice-ui');
    await expect(activeByTestId(page, 'agent-chat-screen')).toBeAttached();
    await configureLocalModelScenario(page, {
      modelId: 'gemma-4-2b',
      replyText: assistantReply,
      supportsVisionInput: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
    });

    await activeByTestId(page, 'chat-text-input').fill(userText);
    await activeByTestId(page, 'chat-send-button').click();

    await expect
      .poll(async () => byTestId(page, 'chat-message-text-user').filter({ hasText: userText }).count())
      .toBe(1);
    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: assistantReply })).toHaveCount(1);
    await expect.poll(async () => (await getLocalModelCalls(page)).length).toBe(1);

    const calls = await getLocalModelCalls(page);
    expect(calls[0]).toMatchObject({
      model: 'gemma-4-2b',
      userText,
    });
    expect(calls[0]?.messageCount ?? 0).toBeGreaterThan(0);
  });

  test('local hold-to-talk speech routes into the on-device bridge and returns a local reply', async ({ page }) => {
    const transcript = '你好';
    const assistantReply = '本地模型回复：语音链路已接通。';

    await page.goto('/?e2e=voice-ui');
    await expect(activeByTestId(page, 'agent-chat-screen')).toBeAttached();
    await configureLocalModelScenario(page, {
      modelId: 'qwen2.5-omni-3b',
      replyText: assistantReply,
      supportsVisionInput: true,
      supportsAudioInput: true,
      supportsAudioOutput: true,
    });

    await activeByTestId(page, 'chat-voice-mode-toggle').click();
    await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible();
    await skipVoiceOnboardingIfPresent(page);

    await holdToTalkWithTranscript(page, transcript);

    await expect
      .poll(async () => byTestId(page, 'chat-message-text-user').filter({ hasText: transcript }).count())
      .toBe(1);
    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: assistantReply })).toHaveCount(1);
    await expect.poll(async () => (await getLocalModelCalls(page)).length).toBe(1);

    const calls = await getLocalModelCalls(page);
    expect(calls[0]).toMatchObject({
      model: 'qwen2.5-omni-3b',
      userText: transcript,
    });
    expect(calls[0]?.messageCount ?? 0).toBeGreaterThan(0);
  });

  test('local duplex speech stays off the realtime bridge and returns a local reply', async ({ page }) => {
    const transcript = '你好';
    const assistantReply = '本地模型回复：实时语音链路已接通。';

    await page.goto('/?e2e=voice-ui');
    await expect(activeByTestId(page, 'agent-chat-screen')).toBeAttached();
    await configureLocalModelScenario(page, {
      modelId: 'qwen2.5-omni-3b',
      replyText: assistantReply,
      supportsVisionInput: true,
      supportsAudioInput: true,
      supportsAudioOutput: true,
    });

    await activeByTestId(page, 'chat-voice-mode-toggle').click();
    await expect(activeByTestId(page, 'voice-status-bar')).toBeVisible();
    await skipVoiceOnboardingIfPresent(page);

    await activeByTestId(page, 'agent-chat-settings-button').click();
    await expect(activeByTestId(page, 'chat-settings-sheet')).toBeVisible();
    await activeByTestId(page, 'chat-duplex-toggle').click();
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'chat-settings-sheet')).toHaveCount(0, { timeout: 3000 });

    await expect(activeByTestId(page, 'voice-session-state')).toHaveAttribute(
      'aria-label',
      /voice-session-state:.*:duplex:.*:connected/,
      { timeout: 10000 },
    );

    await expect.poll(async () =>
      page.evaluate(() => !!(window as any).__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__),
      { timeout: 5000 },
    ).toBeTruthy();

    await expect.poll(async () =>
      page.evaluate(() => !!(window as any).__AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__),
    ).toBeFalsy();

    await emitLiveSpeechFinalTranscript(page, transcript);

    await expect
      .poll(async () => byTestId(page, 'chat-message-text-user').filter({ hasText: transcript }).count())
      .toBe(1);
    await expect(byTestId(page, 'chat-message-text-assistant').filter({ hasText: assistantReply })).toHaveCount(1);
    await expect.poll(async () => (await getLocalModelCalls(page)).length).toBe(1);

    const calls = await getLocalModelCalls(page);
    expect(calls[0]).toMatchObject({
      model: 'qwen2.5-omni-3b',
      userText: transcript,
    });
    expect(calls[0]?.messageCount ?? 0).toBeGreaterThan(0);
  });
});