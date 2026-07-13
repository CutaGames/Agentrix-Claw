/**
 * PetProactiveToast — P1-3 Mobile 主动陪伴 toast（最小可用版本）
 *
 * 跟桌面 PetProactiveBubble、Web WebProactiveBubble 三端同源：监听
 * `presence:pet.proactive`，弹一个底部卡片，提供 ACK / Dismiss / 静音 / CTA。
 *
 * 不在此处发起 socket 连接；调用方用 `src/services/petPresence.ts` 的
 * `connectPetPresence` 注入回调 setEvent(payload)。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PetProactivePayload } from '../../shared/types/pet-presence';
import { API_BASE } from '../config/env';

export interface PetProactiveToastProps {
  event?: PetProactivePayload | null;
  token?: string;
  apiBase?: string;
  onResolved?: (action: 'ack' | 'dismiss' | 'mute' | 'cta') => void;
}

async function postAction(apiBase: string, token: string | undefined, path: string, body?: unknown) {
  if (!token) return;
  try {
    await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    /* swallow */
  }
}

export function PetProactiveToast({
  event,
  token,
  apiBase = API_BASE,
  onResolved,
}: PetProactiveToastProps): React.ReactElement | null {
  if (!event) return null;
  const ack = useCallback(async () => {
    await postAction(apiBase, token, `/v1/pet/proactive/${event.event_id}/ack`);
    onResolved?.('ack');
  }, [apiBase, token, event, onResolved]);
  const dismiss = useCallback(async () => {
    await postAction(apiBase, token, `/v1/pet/proactive/${event.event_id}/dismiss`);
    onResolved?.('dismiss');
  }, [apiBase, token, event, onResolved]);
  const mute = useCallback(async () => {
    await postAction(apiBase, token, `/v1/pet/proactive/mute`, { hours: 4 });
    onResolved?.('mute');
  }, [apiBase, token, onResolved]);
  const cta = useCallback(() => {
    if (event.cta) onResolved?.('cta');
  }, [event, onResolved]);

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.body}>{event.body}</Text>
      <View style={styles.row}>
        {event.cta ? (
          <Pressable onPress={cta} style={[styles.btn, styles.btnPrimary]}>
            <Text style={styles.btnPrimaryText}>{event.cta}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={ack} style={styles.btn}>
          <Text style={styles.btnText}>收到</Text>
        </Pressable>
        <Pressable onPress={dismiss} style={styles.btn}>
          <Text style={styles.btnText}>关掉</Text>
        </Pressable>
        <Pressable onPress={mute} style={styles.btn}>
          <Text style={styles.btnText}>静音 4h</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function usePetProactiveToast(): {
  event: PetProactivePayload | null;
  push: (e: PetProactivePayload) => void;
  clear: () => void;
} {
  const [event, setEvent] = useState<PetProactivePayload | null>(null);
  const push = useCallback((e: PetProactivePayload) => setEvent(e), []);
  const clear = useCallback(() => setEvent(null), []);
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(() => setEvent(null), 30_000);
    return () => clearTimeout(t);
  }, [event]);
  return { event, push, clear };
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    padding: 14,
    backgroundColor: 'rgba(20,20,28,0.94)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    zIndex: 9999,
  },
  title: { color: '#fff', fontWeight: '600', fontSize: 15, marginBottom: 4 },
  body: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnText: { color: '#cfd2db', fontSize: 12 },
  btnPrimary: { backgroundColor: '#5b8def', borderColor: '#5b8def' },
  btnPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

export default PetProactiveToast;
