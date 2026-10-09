/**
 * Global push-to-talk (phone M0 / M2, owner 10-07 "M1 / M2 纯代码也冲"). Off unless the build sets
 * EXPO_PUBLIC_MOBILE_GLOBAL_PTT=1: then every four-zone tab except 伙伴 (whose chat has its own hold-to-talk) shows a mic
 * button. Hold it, speak, release: the words are transcribed through the same POST /voice/transcribe-json the chat's
 * hold-to-talk uses and handed to AgentChatScreen as a pending prefill that sends itself. A tap (shorter than
 * PTT_MIN_HOLD_MS) just opens the chat. Nothing is recorded before the press and the recording is dropped after upload.
 */
export function globalPttEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const GLOBAL_PTT_ENABLED = globalPttEnabled(process.env.EXPO_PUBLIC_MOBILE_GLOBAL_PTT);

export const PTT_MIN_HOLD_MS = 350;
export const PTT_MAX_HOLD_MS = 60_000;
export const PTT_TRANSCRIBE_TIMEOUT_MS = 45_000;

export type PttFailure = 'empty' | 'unauthenticated' | 'http' | 'timeout' | 'network';
export type PttTranscription = { ok: true; text: string } | { ok: false; reason: PttFailure };

export interface PttTranscribeDeps {
  apiBase: string;
  token: string | null;
  lang: 'zh' | 'en';
  readBase64(uri: string): Promise<string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function transcribePttRecording(uri: string, deps: PttTranscribeDeps): Promise<PttTranscription> {
  if (!deps.token) return { ok: false, reason: 'unauthenticated' };
  let audioBase64: string;
  try {
    audioBase64 = await deps.readBase64(uri);
  } catch {
    return { ok: false, reason: 'empty' };
  }
  if (!audioBase64) return { ok: false, reason: 'empty' };
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? PTT_TRANSCRIBE_TIMEOUT_MS;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Some RN builds never reject an aborted fetch, so the timeout is raced as its own promise.
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      ac?.abort();
      resolve('timeout');
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      doFetch(`${deps.apiBase.replace(/\/+$/, '')}/voice/transcribe-json?lang=${deps.lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.token}` },
        body: JSON.stringify({ audioBase64, mimeType: 'audio/m4a', lang: deps.lang }),
        ...(ac ? { signal: ac.signal } : {}),
      }),
      timedOut,
    ]);
    if (response === 'timeout') return { ok: false, reason: 'timeout' };
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'unauthenticated' };
    if (!response.ok) return { ok: false, reason: 'http' };
    const body = (await response.json().catch((): null => null)) as { text?: unknown; transcript?: unknown } | null;
    const raw = typeof body?.text === 'string' ? body.text : typeof body?.transcript === 'string' ? body.transcript : '';
    const text = raw.trim();
    return text ? { ok: true, text } : { ok: false, reason: 'empty' };
  } catch (error) {
    return { ok: false, reason: (error as { name?: string } | null)?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface PttRecorder {
  /** Asks for the microphone if needed and starts recording. */
  start(): Promise<'recording' | 'denied'>;
  /** Stops and returns the file URI (null when nothing was captured). */
  stop(): Promise<string | null>;
  /** Stops and throws the recording away. */
  cancel(): Promise<void>;
}

export type PttPhase = 'idle' | 'starting' | 'recording' | 'transcribing';
export type PttNotice = 'mic_denied' | 'nothing_heard' | 'transcribe_failed' | 'signed_out';

export interface PttControllerDeps {
  recorder: PttRecorder;
  transcribe(uri: string): Promise<PttTranscription>;
  /** Hand the words to the chat (pending prefill that sends itself) and open it. */
  deliver(text: string): void;
  /** A tap: open the chat without sending anything. */
  openChat(): void;
  notify(notice: PttNotice): void;
  onPhase?(phase: PttPhase): void;
  now?(): number;
}

export interface PttController {
  pressIn(): Promise<void>;
  pressOut(): Promise<void>;
  phase(): PttPhase;
}

const NOTICE_FOR: Record<PttFailure, PttNotice> = {
  empty: 'nothing_heard',
  unauthenticated: 'signed_out',
  http: 'transcribe_failed',
  timeout: 'transcribe_failed',
  network: 'transcribe_failed',
};

export function createPttController(deps: PttControllerDeps): PttController {
  const now = deps.now ?? Date.now;
  let phase: PttPhase = 'idle';
  let startedAt = 0;
  let releasedWhileStarting = false;
  const set = (next: PttPhase) => {
    phase = next;
    deps.onPhase?.(next);
  };

  const finish = async () => {
    const held = now() - startedAt;
    if (held < PTT_MIN_HOLD_MS) {
      await deps.recorder.cancel().catch(() => undefined);
      set('idle');
      deps.openChat();
      return;
    }
    const uri = await deps.recorder.stop().catch((): null => null);
    if (!uri) {
      set('idle');
      deps.notify('nothing_heard');
      return;
    }
    set('transcribing');
    const result = await deps.transcribe(uri).catch((): PttTranscription => ({ ok: false, reason: 'network' }));
    set('idle');
    if ('text' in result) deps.deliver(result.text);
    else deps.notify(NOTICE_FOR[result.reason]);
  };

  return {
    phase: () => phase,
    async pressIn() {
      if (phase !== 'idle') return;
      releasedWhileStarting = false;
      startedAt = now();
      set('starting');
      const started = await deps.recorder.start().catch((): 'denied' => 'denied');
      if (started === 'denied') {
        set('idle');
        deps.notify('mic_denied');
        return;
      }
      set('recording');
      if (releasedWhileStarting) await finish();
    },
    async pressOut() {
      if (phase === 'starting') {
        releasedWhileStarting = true;
        return;
      }
      if (phase !== 'recording') return;
      await finish();
    },
  };
}
