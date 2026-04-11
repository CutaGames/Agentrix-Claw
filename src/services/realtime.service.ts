/**
 * realtime.service.ts
 * Chat streaming + notification polling for ClawLink.
 *
 * Two chat paths:
 *  1. streamProxyChatSSE  — SSE via /openclaw/proxy/:id/stream (requires active OpenClaw instance)
 *  2. directClaudeChat    — default /openclaw/proxy chat (server keeps /claude/chat as compat only)
 */
import { API_BASE } from '../config/env';
import { useNotificationStore } from '../stores/notificationStore';
import { AgentrixStreamParser, type StreamEvent } from '../../shared/stream-parser';

type DoneReason = Extract<StreamEvent, { type: 'done' }>['reason'];

type ChunkCallback = (chunk: string) => void;
type DoneCallback = () => void;
type ErrorCallback = (err: string) => void;

interface StreamChatOptions {
  instanceId: string;
  message: string | any[];
  sessionId?: string;
  token: string;
  model?: string;
  voiceId?: string;
  onChunk: ChunkCallback;
  onDone: DoneCallback;
  onError: ErrorCallback;
  onMeta?: (meta: { resolvedModel?: string; resolvedModelLabel?: string }) => void;
  onEvent?: (event: StreamEvent) => void;
}

interface StreamCallbacks {
  onChunk: ChunkCallback;
  onDone: DoneCallback;
  onError: ErrorCallback;
  onMeta?: (meta: { resolvedModel?: string; resolvedModelLabel?: string }) => void;
  onEvent?: (event: StreamEvent) => void;
}

function normalizeDoneReason(reason?: string): DoneReason {
  return reason === 'max_tokens'
    || reason === 'stop_sequence'
    || reason === 'abort'
    || reason === 'error'
    || reason === 'tool_use'
    || reason === 'end_turn'
    ? reason
    : 'end_turn';
}

function createStreamConsumer(callbacks: StreamCallbacks) {
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    callbacks.onDone();
  };

  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    callbacks.onError(message);
  };

  const emit = (event: StreamEvent) => {
    callbacks.onEvent?.(event);
  };

  const parser = new AgentrixStreamParser({
    onTextDelta: (event) => {
      emit(event);
      callbacks.onChunk(event.text);
    },
    onThinking: emit,
    onToolStart: emit,
    onToolProgress: emit,
    onToolResult: emit,
    onToolError: emit,
    onApprovalRequired: emit,
    onUsage: emit,
    onTurnInfo: emit,
    onDone: (event) => {
      emit(event);
      finish();
    },
    onError: (event) => {
      emit(event);
      fail(event.error);
    },
    onMeta: (meta) => callbacks.onMeta?.(meta as { resolvedModel?: string; resolvedModelLabel?: string }),
  });

  return {
    parser,
    finish,
    fail,
    isSettled: () => settled,
  };
}

async function consumeAgentrixSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<void> {
  const decoder = new TextDecoder();
  const consumer = createStreamConsumer(callbacks);

  while (!consumer.isSettled()) {
    const { done, value } = await reader.read();
    if (done) break;
    consumer.parser.feed(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) {
    consumer.parser.feed(tail);
  }
  consumer.parser.end();
  consumer.finish();
}

function shouldUseXhrStreamTransport(): boolean {
  return typeof navigator !== 'undefined'
    && navigator.product === 'ReactNative'
    && typeof XMLHttpRequest !== 'undefined';
}

async function consumeAgentrixSseViaXhr(opts: {
  url: string;
  token: string;
  body: string;
  signal: AbortSignal;
  callbacks: StreamCallbacks;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const consumer = createStreamConsumer(opts.callbacks);
    const xhr = new XMLHttpRequest();
    let settled = false;
    let lastOffset = 0;

    const abortListener = () => {
      try {
        xhr.abort();
      } catch {
        // Ignore abort races.
      }
    };

    const cleanup = () => {
      opts.signal.removeEventListener('abort', abortListener);
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const rejectOnce = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const feedResponse = () => {
      const nextChunk = xhr.responseText.slice(lastOffset);
      if (!nextChunk) return;
      lastOffset = xhr.responseText.length;
      consumer.parser.feed(nextChunk);
    };

    xhr.open('POST', opts.url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${opts.token}`);

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && (xhr.status < 200 || xhr.status >= 300)) {
        const message = `HTTP ${xhr.status}`;
        consumer.fail(message);
        rejectOnce(message);
        try {
          xhr.abort();
        } catch {
          // Ignore abort races.
        }
      }
    };

    xhr.onprogress = () => {
      if (consumer.isSettled()) return;
      feedResponse();
    };

    xhr.onload = () => {
      if (opts.signal.aborted) {
        resolveOnce();
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const responseText = xhr.responseText?.trim().slice(0, 150);
        const message = responseText ? `HTTP ${xhr.status}: ${responseText}` : `HTTP ${xhr.status}`;
        consumer.fail(message);
        rejectOnce(message);
        return;
      }

      feedResponse();
      consumer.parser.end();
      consumer.finish();
      resolveOnce();
    };

    xhr.onerror = () => {
      if (opts.signal.aborted) {
        resolveOnce();
        return;
      }

      const message = 'Stream error';
      consumer.fail(message);
      rejectOnce(message);
    };

    xhr.onabort = () => {
      resolveOnce();
    };

    opts.signal.addEventListener('abort', abortListener, { once: true });

    try {
      xhr.send(opts.body);
    } catch (error: any) {
      const message = error?.message ?? 'Failed to start stream';
      consumer.fail(message);
      rejectOnce(message);
    }
  });
}

async function streamAgentrixSseRequest(opts: {
  url: string;
  token: string;
  body: string;
  signal: AbortSignal;
  callbacks: StreamCallbacks;
}): Promise<void> {
  if (shouldUseXhrStreamTransport()) {
    await consumeAgentrixSseViaXhr(opts);
    return;
  }

  const resp = await fetch(opts.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
      Accept: 'text/event-stream',
    },
    body: opts.body,
    signal: opts.signal,
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) {
    if (typeof XMLHttpRequest !== 'undefined') {
      await consumeAgentrixSseViaXhr(opts);
      return;
    }
    throw new Error('No response stream');
  }

  await consumeAgentrixSse(reader, opts.callbacks);
}

/**
 * Stream chat response via OpenClaw proxy SSE.
 * Requires an active bound OpenClaw instance.
 */
export function streamProxyChatSSE(opts: StreamChatOptions): AbortController {
  const ac = new AbortController();

  (async () => {
    const url = `${API_BASE}/openclaw/proxy/${opts.instanceId}/stream`;
    const body = JSON.stringify({
      message: opts.message,
      sessionId: opts.sessionId,
      model: opts.model,
      voiceId: opts.voiceId,
    });
    try {
      await streamAgentrixSseRequest({
        url,
        token: opts.token,
        body,
        signal: ac.signal,
        callbacks: {
        onChunk: opts.onChunk,
        onDone: opts.onDone,
        onError: opts.onError,
        onMeta: opts.onMeta,
        onEvent: opts.onEvent,
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      opts.onError(err?.message ?? 'Stream error');
    }
  })();

  return ac;
}

// ─── Default OpenClaw proxy chat (default-instance route) ────────

export interface DirectChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DirectClaudeOptions {
  messages: DirectChatMessage[];
  token: string;
  /** Claude model override, defaults to 'claude-3-haiku' (Bedrock) */
  model?: string;
  sessionId?: string;
}

function buildDirectClaudePayload(opts: DirectClaudeOptions, stream = false) {
  return {
    messages: opts.messages,
    mode: 'ask' as const,
    platform: 'mobile' as const,
    stream,
    context: { sessionId: opts.sessionId },
    options: {
      model: opts.model || 'claude-3-haiku',
      maxTokens: 2048,
    },
  };
}

/**
 * Call the default OpenClaw proxy chat endpoint on the main backend.
 */
export async function directClaudeChat(opts: DirectClaudeOptions): Promise<{ content: string; stopReason?: DoneReason }> {
  const _ac = new AbortController();
  const _t = setTimeout(() => _ac.abort(), 45_000);
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/openclaw/proxy/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify(buildDirectClaudePayload(opts, false)),
      signal: _ac.signal,
    });
  } finally {
    clearTimeout(_t);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`AI service error ${resp.status}: ${text.slice(0, 150)}`);
  }

  const data = await resp.json();
  const content =
    data?.text ??
    data?.content ??
    data?.reply?.content ??
    data?.message ??
    data?.choices?.[0]?.message?.content ??
    data?.result ??
    null;

  if (!content) throw new Error('Empty response from AI service');
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    stopReason: normalizeDoneReason(data?.stopReason),
  };
}

/**
 * Fake-stream a directClaudeChat response word-by-word so the UI shows streaming effect.
 */
export function streamDirectClaude(
  opts: DirectClaudeOptions & { onChunk: ChunkCallback; onDone: DoneCallback; onError: ErrorCallback; onEvent?: (event: StreamEvent) => void }
): AbortController {
  const ac = new AbortController();
  (async () => {
    try {
      await streamAgentrixSseRequest({
        url: `${API_BASE}/openclaw/proxy/stream`,
        token: opts.token,
        body: JSON.stringify(buildDirectClaudePayload(opts, true)),
        signal: ac.signal,
        callbacks: {
          onChunk: opts.onChunk,
          onDone: opts.onDone,
          onError: opts.onError,
          onEvent: opts.onEvent,
        },
      });
    } catch (err: any) {
      if (ac.signal.aborted) return;

      try {
        const reply = await directClaudeChat(opts);
        if (ac.signal.aborted) return;
        const words = reply.content.split(' ');
        for (let i = 0; i < words.length; i++) {
          if (ac.signal.aborted) return;
          opts.onChunk((i === 0 ? '' : ' ') + words[i]);
          if (i < 30) await new Promise(r => setTimeout(r, 18));
        }
        opts.onEvent?.({
          type: 'done',
          reason: reply.stopReason || 'end_turn',
          totalDurationMs: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
        });
        opts.onDone();
      } catch (fallbackErr: any) {
        if (ac.signal.aborted) return;
        opts.onError(fallbackErr?.message ?? err?.message ?? 'AI error');
      }
    }
  })();
  return ac;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification polling (lightweight alternative to WebSocket for notifications)
// ─────────────────────────────────────────────────────────────────────────────

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let lastPollTime = 0;

export function startNotificationPolling(token: string, intervalMs = 30_000, options?: { immediate?: boolean }) {
  stopNotificationPolling();
  pollingTimer = setInterval(() => pollNotifications(token), intervalMs);
  if (options?.immediate) {
    pollNotifications(token);
  }
}

export function stopNotificationPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

async function pollNotifications(token: string) {
  try {
    const since = lastPollTime > 0 ? `&since=${lastPollTime}` : '';
    const _ac2 = new AbortController();
    const _t2 = setTimeout(() => _ac2.abort(), 8000);
    let resp: Response;
    try {
      resp = await fetch(`${API_BASE}/notifications/recent?limit=10${since}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: _ac2.signal,
      });
    } finally {
      clearTimeout(_t2);
    }
    if (!resp.ok) return;
    const data = await resp.json();
    const items: any[] = data.notifications ?? data ?? [];
    const { addNotification } = useNotificationStore.getState();
    for (const item of items) {
      addNotification({
        type: item.type ?? 'system',
        title: item.title ?? 'Notification',
        body: item.body ?? item.message ?? '',
        data: item.data,
      });
    }
    lastPollTime = Date.now();
  } catch {
    // Silently ignore poll errors
  }
}

export function resetPollingTimestamp() {
  lastPollTime = 0;
}
