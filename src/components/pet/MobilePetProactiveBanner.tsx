/**
 * MobilePetProactiveBanner — Phase C mobile companion bubble.
 *
 * Mobile equivalent of the desktop PetProactiveBubble. Listens to
 * `presence:pet.proactive` events from backend's pet-companion-engine,
 * shows a non-intrusive banner above the home screen with the pet's
 * greeting/suggestion + optional CTA button.
 *
 * Behavior:
 *   - Auto-dismiss after 12s
 *   - Tap "知道了" → POST /api/v1/pet/proactive/:id/ack
 *   - Tap "不打扰我" → POST /api/v1/pet/proactive/:id/dismiss + 4h mute
 *   - Tap CTA → invoke action + ack
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import { connectPetPresence } from '../../services/petPresence';
import { useAuthStore } from '../../stores/authStore';
import { apiFetch } from '../../services/api';

const AUTO_DISMISS_MS = 12_000;

interface ProactivePayload {
  event_id: string;
  kind: string;
  title: string;
  body: string;
  cta?: { label: string; action: string } | null;
  intimacy_level?: number;
}

export function MobilePetProactiveBanner() {
  const token = useAuthStore((s) => s.token);
  const [bubble, setBubble] = useState<ProactivePayload | null>(null);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to proactive events. `connectPetPresence` expects a flat
  // `{ token, deviceId, handlers, … }` shape (see services/petPresence.ts),
  // not a nested `auth`. We synthesise a stable per-install deviceId so the
  // server can dedupe events across reconnects.
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let handle: ReturnType<typeof connectPetPresence> | null = null;

    (async () => {
      let deviceId = 'mobile-anon';
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const cached = await AsyncStorage.getItem('agentrix.deviceId');
        if (cached) {
          deviceId = cached;
        } else {
          deviceId = `mobile-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
          await AsyncStorage.setItem('agentrix.deviceId', deviceId);
        }
      } catch { /* ignore */ }
      if (cancelled) return;

      handle = connectPetPresence({
        token,
        deviceId,
        handlers: {
          'presence:pet.proactive': (payload) => {
            const p = payload as ProactivePayload | null | undefined;
            if (!p?.event_id) return;
            setBubble(p);
            // Light haptic to alert user
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
              try { Vibration.vibrate(50); } catch { /* ignore */ }
            }
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      handle?.disconnect();
    };
  }, [token]);

  // Slide animation when bubble appears
  useEffect(() => {
    if (!bubble) return;
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    // Auto-dismiss
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      handleDismiss(false);
    }, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble?.event_id]);

  async function callApi(path: string) {
    try {
      await apiFetch(path, { method: 'POST' });
    } catch { /* ignore */ }
  }

  function handleDismiss(mute4h: boolean) {
    const id = bubble?.event_id;
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setBubble(null);
    });
    if (id) {
      const path = mute4h
        ? `/v1/pet/proactive/${id}/dismiss`
        : `/v1/pet/proactive/${id}/ack`;
      void callApi(path);
    }
  }

  function handleCta() {
    const cta = bubble?.cta;
    handleDismiss(false);
    if (cta?.action) {
      // Dispatch a global event the app can listen to (similar to desktop pattern)
      // Mobile screens can subscribe via DeviceEventEmitter
      try {
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit('agentrix:pet-cta', { action: cta.action });
      } catch { /* ignore */ }
    }
  }

  if (!bubble) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.bubble}>
        <View style={styles.row}>
          <Text style={styles.emoji}>🐾</Text>
          <View style={styles.textColumn}>
            <Text style={styles.title} numberOfLines={1}>{bubble.title}</Text>
            <Text style={styles.body} numberOfLines={3}>{bubble.body}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.ackBtn} onPress={() => handleDismiss(false)}>
            <Text style={styles.ackText}>知道了</Text>
          </Pressable>
          {bubble.cta && (
            <Pressable style={styles.ctaBtn} onPress={handleCta}>
              <Text style={styles.ctaText}>{bubble.cta.label}</Text>
            </Pressable>
          )}
          <Pressable style={styles.muteBtn} onPress={() => handleDismiss(true)}>
            <Text style={styles.muteText}>暂不打扰</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? 50 : 25,
    paddingHorizontal: 12,
  },
  bubble: {
    backgroundColor: 'rgba(99, 102, 241, 0.95)',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  emoji: {
    fontSize: 28,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  body: {
    color: '#e0e7ff',
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  ackBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },
  ackText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  ctaBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  ctaText: {
    color: '#6366f1',
    fontSize: 12,
    fontWeight: '700',
  },
  muteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 'auto',
  },
  muteText: {
    color: '#cbd5e1',
    fontSize: 11,
  },
});
