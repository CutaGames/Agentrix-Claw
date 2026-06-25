/**
 * realtime.service.ts
 * Chat streaming + notification polling for ClawLink.
 *
 * Two chat paths:
 *  1. streamProxyChatSSE  — SSE via /openclaw/proxy/:id/stream (requires active OpenClaw instance)
 *  2. directClaudeChat    — POST /claude/chat (backend Bedrock fallback, always available)
 */
import { API_BASE } from '../config/env';
import { useNotificationStore } from '../stores/notificationStore';

type ChunkCallback = (chunk: string) => void;
type DoneCallback = () => void;
type ErrorCallback = (err: string) => void;

interface StreamChatOptions {
  instanceId: string;
  message: string;
  sessionId?: string;
  token: string;
  model?: string;
  onChunk: ChunkCallback;
  onDone: DoneCallback;
  onError: ErrorCallback;
}

/**
 * Stream chat response via OpenClaw proxy SSE.
 * Requires an active bound OpenClaw instance.
 */
export function streamProxyChatSSE(opts: StreamChatOptions): AbortController {
  const ac = new AbortController();

  (async () => {
    const url = `${API_BASE}/openclaw/proxy/${opts.instanceId}/stream`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: opts.message,
          sessionId: opts.sessionId,
          model: opts.model,
        }),
        signal: ac.signal,
      });

      if (!resp.ok) {
        opts.onError(`HTTP ${resp.status}`);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { opts.onError('No response stream'); return; }
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data === '[DONE]') { opts.onDone(); return; }
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) opts.onChunk(parsed.chunk);
              else if (parsed.error) { opts.onError(parsed.error); return; }
            } catch {
              if (data) opts.onChunk(data);
            }
          }
        }
      }
      opts.onDone();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      opts.onError(err?.message ?? 'Stream error');
    }
  })();

  return ac;
}

// ─── Direct Claude fallback (backend Bedrock, no OpenClaw needed) ─────────────

export interface DirectChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DirectClaudeOptions {
  messages: DirectChatMessage[];
  token: string;
  /** e.g. 'claude-haiku-4-5', 'claude-sonnet-4-5'. Backend uses AWS Bedrock. */
  model?: string;
  sessionId?: string;
}

/**
 * Call POST /claude/chat on the main backend.
 * Uses the server's own AWS Bedrock credentials — always works for cloud/new users
 * who don't have an active OpenClaw instance yet.
 */
export async function directClaudeChat(opts: DirectClaudeOptions): Promise<string> {
  const _ac = new AbortController();
  const _t = setTimeout(() => _ac.abort(), 45_000);
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/claude/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        messages: opts.messages,
        context: { sessionId: opts.sessionId },
        options: {
          model: opts.model || 'claude-haiku-4-5',
          maxTokens: 2048,
        },
      }),
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
    data?.content ??
    data?.reply?.content ??
    data?.message ??
    data?.choices?.[0]?.message?.content ??
    data?.result ??
    null;

  if (!content) throw new Error('Empty response from AI service');
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * Fake-stream a directClaudeChat response word-by-word so the UI shows streaming effect.
 */
export function streamDirectClaude(
  opts: DirectClaudeOptions & { onChunk: ChunkCallback; onDone: DoneCallback; onError: ErrorCallback }
): AbortController {
  const ac = new AbortController();
  (async () => {
    try {
      const reply = await directClaudeChat(opts);
      if (ac.signal.aborted) return;
      // Emit in small word-chunks for streaming appearance
      const words = reply.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (ac.signal.aborted) return;
        opts.onChunk((i === 0 ? '' : ' ') + words[i]);
        // Small delay for typing effect only on first 30 words
        if (i < 30) await new Promise(r => setTimeout(r, 18));
      }
      opts.onDone();
    } catch (err: any) {
      if (ac.signal.aborted) return;
      opts.onError(err?.message ?? 'AI error');
    }
  })();
  return ac;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification polling (lightweight alternative to WebSocket for notifications)
// ─────────────────────────────────────────────────────────────────────────────

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let lastPollTime = 0;

export function startNotificationPolling(token: string, intervalMs = 30_000) {
  stopNotificationPolling();
  pollingTimer = setInterval(() => pollNotifications(token), intervalMs);
  // Immediate first poll
  pollNotifications(token);
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
