/**
 * WebProactiveBubble — P1-3 Web 主动陪伴气泡（最小可用版本）
 *
 * 与 desktop PetProactiveBubble 的功能对齐：监听 `presence:pet.proactive`，
 * 渲染 toast 卡片，提供 ACK / Dismiss / 静音入口。Web 端不做 TTS（避免
 * 自动播放限制），改成纯文本气泡。
 *
 * 调用方需自行：
 *   1. 用 `connectPetPresence({ token, handlers: { 'presence:pet.proactive': ... } })`
 *      把 socket 起来；
 *   2. 把回调 setEvent(payload) 注入到本组件 props.event。
 *
 * 也可以直接 import { useProactiveBubble } 让组件内部自管 state。
 */

import { useCallback, useEffect, useState } from 'react';
import type { PetProactivePayload } from '../../../shared/types/pet-presence';

export interface WebProactiveBubbleProps {
  /** Currently shown event (null/undefined hides the bubble). */
  event?: PetProactivePayload | null;
  /** API base for ACK / dismiss; default reads NEXT_PUBLIC_API_BASE_URL. */
  apiBase?: string;
  /** JWT */
  token?: string;
  /** Called after user reaction so caller can clear / advance queue. */
  onResolved?: (action: 'ack' | 'dismiss' | 'mute' | 'cta') => void;
}

const DEFAULT_API =
  (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_BASE_URL as string) : '') ||
  'https://api.agentrix.top';

async function postAction(
  apiBase: string,
  token: string | undefined,
  path: string,
  body?: Record<string, unknown>,
) {
  if (!token) return;
  try {
    await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    /* swallow — UI still resolves */
  }
}

export function WebProactiveBubble({
  event,
  apiBase = DEFAULT_API,
  token,
  onResolved,
}: WebProactiveBubbleProps): JSX.Element | null {
  if (!event) return null;
  const ack = useCallback(async () => {
    await postAction(apiBase, token, `/api/v1/pet/proactive/${event.event_id}/ack`);
    onResolved?.('ack');
  }, [apiBase, token, event, onResolved]);
  const dismiss = useCallback(async () => {
    await postAction(apiBase, token, `/api/v1/pet/proactive/${event.event_id}/dismiss`);
    onResolved?.('dismiss');
  }, [apiBase, token, event, onResolved]);
  const mute = useCallback(async () => {
    await postAction(apiBase, token, `/api/v1/pet/proactive/mute`, { hours: 4 });
    onResolved?.('mute');
  }, [apiBase, token, onResolved]);
  const cta = useCallback(() => {
    if (event.cta) onResolved?.('cta');
  }, [event, onResolved]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        maxWidth: 320,
        padding: '14px 16px',
        background: 'rgba(20,20,28,0.92)',
        color: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        fontSize: 14,
        zIndex: 9999,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{event.title}</div>
      <div style={{ opacity: 0.85, lineHeight: 1.4 }}>{event.body}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {event.cta ? (
          <button
            onClick={cta}
            style={{
              background: '#5b8def',
              color: '#fff',
              border: 0,
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {typeof event.cta === 'string' ? event.cta : (event.cta as any)?.label ?? 'OK'}
          </button>
        ) : null}
        <button
          onClick={ack}
          style={btnStyle}
          title="收到，继续"
        >
          收到
        </button>
        <button onClick={dismiss} style={btnStyle} title="关闭这条">
          关掉
        </button>
        <button onClick={mute} style={btnStyle} title="4 小时内别再推">
          静音 4h
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#cfd2db',
  border: '1px solid rgba(255,255,255,0.18)',
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

/**
 * 自管 state 的 hook：把最近一次 proactive event 暴露成 React state。
 * 调用方只需把它和 `connectPetPresence` 的 handlers 衔接起来。
 *
 *   const { event, push, clear } = useProactiveBubble();
 *   useEffect(() => {
 *     const h = connectPetPresence({ token, handlers: { 'presence:pet.proactive': push }});
 *     return () => h.disconnect();
 *   }, [token]);
 *   return <WebProactiveBubble event={event} token={token} onResolved={clear} />;
 */
export function useProactiveBubble(): {
  event: PetProactivePayload | null;
  push: (e: PetProactivePayload) => void;
  clear: () => void;
} {
  const [event, setEvent] = useState<PetProactivePayload | null>(null);
  const push = useCallback((e: PetProactivePayload) => setEvent(e), []);
  const clear = useCallback(() => setEvent(null), []);
  // 自动 30s 后消失，避免气泡永久占位
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(() => setEvent(null), 30_000);
    return () => clearTimeout(t);
  }, [event]);
  return { event, push, clear };
}

export default WebProactiveBubble;
