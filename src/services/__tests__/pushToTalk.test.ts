import {
  PTT_MIN_HOLD_MS,
  createPttController,
  globalPttEnabled,
  transcribePttRecording,
  type PttControllerDeps,
  type PttPhase,
  type PttRecorder,
  type PttTranscription,
} from '../pushToTalk';

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function transcribeDeps(over: Partial<Parameters<typeof transcribePttRecording>[1]> = {}) {
  const fetchImpl = jest.fn(async () => response(200, { text: '  明天下午三点提醒我开会  ' }));
  return {
    fetchImpl,
    deps: { apiBase: 'https://api.example.test/api/', token: 't0k', lang: 'zh' as const, readBase64: async () => 'QUJD', fetchImpl: fetchImpl as unknown as typeof fetch, ...over },
  };
}

describe('global push-to-talk switch', () => {
  it('is on only for the exact value 1', () => {
    expect(globalPttEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', 1, 'yes']) expect(globalPttEnabled(value)).toBe(false);
  });
});

describe('transcribePttRecording', () => {
  it('posts the recording as base64 JSON with the bearer to /voice/transcribe-json and returns the trimmed text', async () => {
    const { fetchImpl, deps } = transcribeDeps();
    await expect(transcribePttRecording('file:///rec.m4a', deps)).resolves.toEqual({ ok: true, text: '明天下午三点提醒我开会' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/voice/transcribe-json?lang=zh');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer t0k' });
    expect(JSON.parse(String(init.body))).toEqual({ audioBase64: 'QUJD', mimeType: 'audio/m4a', lang: 'zh' });
  });

  it('accepts the transcript field too', async () => {
    const { deps } = transcribeDeps({ fetchImpl: (async () => response(200, { transcript: 'hello' })) as unknown as typeof fetch });
    await expect(transcribePttRecording('u', deps)).resolves.toEqual({ ok: true, text: 'hello' });
  });

  it('negative: no token never calls the server', async () => {
    const { fetchImpl, deps } = transcribeDeps({ token: null });
    await expect(transcribePttRecording('u', deps)).resolves.toEqual({ ok: false, reason: 'unauthenticated' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, { message: 'no' }, 'unauthenticated'],
    [403, {}, 'unauthenticated'],
    [500, {}, 'http'],
    [200, { text: '   ' }, 'empty'],
    [200, { text: 42 }, 'empty'],
  ])('status %s with %j is %s', async (status, body, reason) => {
    const { deps } = transcribeDeps({ fetchImpl: (async () => response(status, body)) as unknown as typeof fetch });
    await expect(transcribePttRecording('u', deps)).resolves.toEqual({ ok: false, reason });
  });

  it('an unreadable recording is empty and is not uploaded', async () => {
    const { fetchImpl, deps } = transcribeDeps({ readBase64: async () => { throw new Error('gone'); } });
    await expect(transcribePttRecording('u', deps)).resolves.toEqual({ ok: false, reason: 'empty' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a network failure is network and an abort is timeout', async () => {
    const failing = transcribeDeps({ fetchImpl: (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch });
    await expect(transcribePttRecording('u', failing.deps)).resolves.toEqual({ ok: false, reason: 'network' });
    const aborted = transcribeDeps({ fetchImpl: (async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }) as unknown as typeof fetch });
    await expect(transcribePttRecording('u', aborted.deps)).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('a server that never answers times out on its own, even if the abort is ignored', async () => {
    const { deps } = transcribeDeps({ fetchImpl: (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch, timeoutMs: 20 });
    await expect(transcribePttRecording('u', deps)).resolves.toEqual({ ok: false, reason: 'timeout' });
  });
});

function harness(over: { start?: PttRecorder['start']; stop?: PttRecorder['stop']; transcription?: PttTranscription } = {}) {
  let clock = 1_000;
  const phases: PttPhase[] = [];
  const recorder = {
    start: jest.fn(over.start ?? (async () => 'recording' as const)),
    stop: jest.fn(over.stop ?? (async () => 'file:///rec.m4a')),
    cancel: jest.fn(async () => undefined),
  };
  const deps: PttControllerDeps & { [k: string]: unknown } = {
    recorder,
    transcribe: jest.fn(async () => over.transcription ?? { ok: true as const, text: '帮我订明天的会议室' }),
    deliver: jest.fn(),
    openChat: jest.fn(),
    notify: jest.fn(),
    onPhase: (p) => phases.push(p),
    now: () => clock,
  };
  return { controller: createPttController(deps), deps, recorder, phases, advance: (ms: number) => { clock += ms; } };
}

describe('push-to-talk controller', () => {
  it('hold, speak, release: records, transcribes and delivers the words to the chat', async () => {
    const h = harness();
    await h.controller.pressIn();
    expect(h.controller.phase()).toBe('recording');
    h.advance(1_200);
    await h.controller.pressOut();
    expect(h.recorder.stop).toHaveBeenCalledTimes(1);
    expect(h.deps.transcribe).toHaveBeenCalledWith('file:///rec.m4a');
    expect(h.deps.deliver).toHaveBeenCalledWith('帮我订明天的会议室');
    expect(h.deps.openChat).not.toHaveBeenCalled();
    expect(h.phases).toEqual(['starting', 'recording', 'transcribing', 'idle']);
  });

  it('a tap throws the recording away and only opens the chat', async () => {
    const h = harness();
    await h.controller.pressIn();
    h.advance(PTT_MIN_HOLD_MS - 1);
    await h.controller.pressOut();
    expect(h.recorder.cancel).toHaveBeenCalledTimes(1);
    expect(h.recorder.stop).not.toHaveBeenCalled();
    expect(h.deps.transcribe).not.toHaveBeenCalled();
    expect(h.deps.deliver).not.toHaveBeenCalled();
    expect(h.deps.openChat).toHaveBeenCalledTimes(1);
  });

  it('negative: without the microphone it says so and records nothing', async () => {
    const h = harness({ start: async () => 'denied' });
    await h.controller.pressIn();
    h.advance(2_000);
    await h.controller.pressOut();
    expect(h.deps.notify).toHaveBeenCalledWith('mic_denied');
    expect(h.recorder.stop).not.toHaveBeenCalled();
    expect(h.deps.deliver).not.toHaveBeenCalled();
    expect(h.controller.phase()).toBe('idle');
  });

  it('a release while the recorder is still starting finishes once it has started', async () => {
    let started: (v: 'recording') => void = () => undefined;
    const h = harness({ start: () => new Promise((resolve) => { started = resolve; }) });
    const pressing = h.controller.pressIn();
    h.advance(900);
    await h.controller.pressOut();
    expect(h.recorder.stop).not.toHaveBeenCalled();
    started('recording');
    await pressing;
    expect(h.deps.deliver).toHaveBeenCalledWith('帮我订明天的会议室');
  });

  it.each([
    [{ ok: false as const, reason: 'empty' as const }, 'nothing_heard'],
    [{ ok: false as const, reason: 'unauthenticated' as const }, 'signed_out'],
    [{ ok: false as const, reason: 'http' as const }, 'transcribe_failed'],
    [{ ok: false as const, reason: 'timeout' as const }, 'transcribe_failed'],
    [{ ok: false as const, reason: 'network' as const }, 'transcribe_failed'],
  ])('a failed transcription %j tells the owner %s and sends nothing', async (transcription, notice) => {
    const h = harness({ transcription });
    await h.controller.pressIn();
    h.advance(1_000);
    await h.controller.pressOut();
    expect(h.deps.notify).toHaveBeenCalledWith(notice);
    expect(h.deps.deliver).not.toHaveBeenCalled();
    expect(h.controller.phase()).toBe('idle');
  });

  it('nothing captured is nothing heard', async () => {
    const h = harness({ stop: async () => null });
    await h.controller.pressIn();
    h.advance(1_000);
    await h.controller.pressOut();
    expect(h.deps.notify).toHaveBeenCalledWith('nothing_heard');
    expect(h.deps.transcribe).not.toHaveBeenCalled();
  });

  it('presses during a transcription are ignored', async () => {
    let answer: (v: PttTranscription) => void = () => undefined;
    const h = harness();
    (h.deps.transcribe as jest.Mock).mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await h.controller.pressIn();
    h.advance(1_000);
    const releasing = h.controller.pressOut();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.controller.phase()).toBe('transcribing');
    await h.controller.pressIn();
    expect(h.recorder.start).toHaveBeenCalledTimes(1);
    answer({ ok: true, text: 'ok' });
    await releasing;
    expect(h.deps.deliver).toHaveBeenCalledWith('ok');
  });
});

describe('M2 voice first: said by voice, answered by voice; typed stays silent', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');
  const chat = () => read('screens/agent/AgentChatScreen.tsx');

  it('the global button asks for the reply to be read aloud; the chat marks that send right before sending it', () => {
    expect(read('components/GlobalPushToTalk.tsx')).toMatch(/setPendingPrefill\(\{ text, autoSend: true, speakReply: true \}\)/);
    expect(chat()).toMatch(/const readAloud = !!prefill\.speakReply;\s*setTimeout\(\(\) => \{\s*readReplyAloudOnNextSendRef\.current = readAloud;\s*void handleSendRef\.current\(spoken\);/);
  });

  it("the chat's own voice input marks its send only in voice-first builds (EXPO_PUBLIC_MOBILE_GLOBAL_PTT)", () => {
    expect(chat()).toMatch(/onSendMessage: \(text, attachments\) => \{\s*if \(GLOBAL_PTT_ENABLED\) readReplyAloudOnNextSendRef\.current = true;\s*void handleSendRef\.current\(text, attachments\);/);
  });

  it('every send takes the mark and hands it to the voice session before anything streams, so a typed send turns it off', () => {
    const source = chat();
    expect(source).toMatch(/const handleSend = async \([^)]*\) => \{\s*const readReplyAloud = readReplyAloudOnNextSendRef\.current;\s*readReplyAloudOnNextSendRef\.current = false;/);
    expect(source).toMatch(/\|\| sending \|\| uploadingAttachment\) return;\s*setReadReplyAloud\(readReplyAloud\);/);
    expect(source.match(/readReplyAloudOnNextSendRef\.current = /g)).toHaveLength(4);
    // A spoken reply that pauses for tools / length goes on being read when it continues itself.
    expect(source).toMatch(/readReplyAloudOnNextSendRef\.current = readReplyAloud;\s*void handleSendRef\.current\(autoContinuePrompt, \[\]\);/);
  });

  it('the voice session reads a streamed reply in duplex, with 自动朗读 on, or when its send was said; stopping the voice ends it', () => {
    const hook = read('hooks/useVoiceSession.ts');
    expect(hook).toMatch(/if \(!\(duplexModeRef\.current \|\| autoSpeak \|\| readReplyAloudRef\.current\)\) return;/);
    expect(hook).toMatch(/const setReadReplyAloud = useCallback\(\(on: boolean\) => \{\s*readReplyAloudRef\.current = on;/);
    expect(hook).toMatch(/const stopSpeaking = useCallback\(\(\) => \{\s*readReplyAloudRef\.current = false;/);
  });
});
