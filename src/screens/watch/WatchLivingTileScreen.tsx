/**
 * P0-W3-1 — WearOS Living Tile + 6 emotions + L1 Approval (PRD wearable-prd-v3 §4.1)
 *
 * Renders a compact pet-emotion tile suitable for round 1.4" Pixel Watch /
 * square TicWatch. Subscribes to Data Layer messages forwarded from the phone
 * with payload `{ type: 'pet.state', emotion, intensity, level }`.
 *
 * L1 approvals (low-risk: read-only, draft-only) can be approved directly from
 * this tile via tap; higher tiers escalate to WatchApprovalScreen for biometric.
 *
 * Companion to: WatchMainScreen.tsx (full quick-talk surface)
 *               WatchApprovalScreen.tsx (L2/L3 escalation)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { WatchDataLayerService, type WatchMessage } from '../../services/wearables/watchDataLayerBridge.service';

// 10 emotion states mirrored from shared/types/agentrix-presence.ts (kept inline
// to avoid pulling backend types into the watch bundle).
type PetEmotion =
  | 'calm' | 'happy' | 'excited' | 'focused' | 'concerned' | 'tired'
  | 'love' | 'sad' | 'angry' | 'sleepy';

const EMOTION_EMOJI: Record<PetEmotion, string> = {
  calm: '😌', happy: '😊', excited: '🤩', focused: '🧐', concerned: '😟',
  tired: '😴', love: '💖', sad: '😢', angry: '😠', sleepy: '💤',
};

const EMOTION_TINT: Record<PetEmotion, string> = {
  calm: '#94a3b8', happy: '#10b981', excited: '#f59e0b',
  focused: '#6366f1', concerned: '#ef4444', tired: '#64748b',
  love: '#ec4899', sad: '#0ea5e9', angry: '#dc2626', sleepy: '#475569',
};

interface PetTileState {
  emotion: PetEmotion;
  intensity: number;        // 0-3
  level: number;            // intimacy level 0-10
  petName: string;
}

interface L1Approval {
  id: string;
  title: string;
  description?: string;
}

const DEFAULT_STATE: PetTileState = {
  emotion: 'calm',
  intensity: 1,
  level: 1,
  petName: 'Aira',
};

export function WatchLivingTileScreen() {
  const [pet, setPet] = useState<PetTileState>(DEFAULT_STATE);
  const [pendingL1, setPendingL1] = useState<L1Approval | null>(null);

  useEffect(() => {
    // Phone forwards `/presence/pet.state` heartbeats over `/agentrix/session/state`.
    const unsub = WatchDataLayerService.onMessage('/agentrix/session/state', (msg: WatchMessage) => {
      const payload = (msg.data ?? {}) as Record<string, unknown>;
      if (payload.kind === 'pet.state') {
        setPet((prev) => ({
          emotion: (payload.emotion as PetEmotion) ?? prev.emotion,
          intensity: typeof payload.intensity === 'number' ? payload.intensity : prev.intensity,
          level: typeof payload.level === 'number' ? payload.level : prev.level,
          petName: typeof payload.petName === 'string' ? payload.petName : prev.petName,
        }));
        if (payload.emotion && payload.emotion !== 'calm') {
          Vibration.vibrate(40);
        }
      }
    });
    const unsubApproval = WatchDataLayerService.onMessage('/agentrix/approval/request', (msg: WatchMessage) => {
      const data = (msg.data ?? {}) as Record<string, unknown>;
      if ((data.riskLevel ?? 'low') === 'low' && typeof data.id === 'string') {
        setPendingL1({
          id: data.id,
          title: typeof data.toolName === 'string' ? data.toolName : 'L1 Approval',
          description: typeof data.description === 'string' ? data.description : undefined,
        });
      }
    });
    return () => {
      unsub?.();
      unsubApproval?.();
    };
  }, []);

  const approveL1 = useCallback(async () => {
    if (!pendingL1) return;
    await WatchDataLayerService.broadcastMessage('/agentrix/approval/response', {
      id: pendingL1.id,
      decision: 'approve',
      surface: 'wearable',
    });
    Vibration.vibrate([0, 30, 50, 30]);
    setPendingL1(null);
  }, [pendingL1]);

  const denyL1 = useCallback(async () => {
    if (!pendingL1) return;
    await WatchDataLayerService.broadcastMessage('/agentrix/approval/response', {
      id: pendingL1.id,
      decision: 'deny',
      surface: 'wearable',
    });
    setPendingL1(null);
  }, [pendingL1]);

  const tint = EMOTION_TINT[pet.emotion] ?? '#94a3b8';
  const emoji = EMOTION_EMOJI[pet.emotion] ?? '😌';

  if (pendingL1) {
    return (
      <View style={[styles.container, { borderColor: '#6366f1' }]}>
        <Text style={styles.label}>L1 审批</Text>
        <Text style={styles.l1Title} numberOfLines={2}>{pendingL1.title}</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.btn, styles.btnDeny]} onPress={denyL1}>
            <Text style={styles.btnLabel}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={approveL1}>
            <Text style={styles.btnLabel}>✓</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: tint }]}>
      <Text style={[styles.emoji, { textShadowColor: tint }]}>{emoji}</Text>
      <Text style={styles.petName}>{pet.petName}</Text>
      <Text style={[styles.emotion, { color: tint }]}>{pet.emotion}</Text>
      <View style={styles.intensityRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.intensityDot,
              { backgroundColor: i < pet.intensity ? tint : '#1e293b' },
            ]}
          />
        ))}
      </View>
      <Text style={styles.level}>Lv.{pet.level}</Text>
    </View>
  );
}

// ── Complications (registered separately by the WearOS host project) ──
//
// CornerComplication: emoji only (24×24)
// RectangularComplication: emoji + petName + emotion (160×40)
//
// These are exported as render functions for the native bridge to mount.

export function renderCornerComplication(state: Pick<PetTileState, 'emotion'>) {
  return EMOTION_EMOJI[state.emotion] ?? '😌';
}

export function renderRectangularComplication(state: PetTileState) {
  const emoji = EMOTION_EMOJI[state.emotion] ?? '😌';
  return `${emoji} ${state.petName} · ${state.emotion}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    borderWidth: 2,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    margin: 8,
  },
  emoji: {
    fontSize: 48,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  petName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginTop: 4 },
  emotion: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  intensityRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  intensityDot: { width: 6, height: 6, borderRadius: 3 },
  level: { color: '#64748b', fontSize: 10, marginTop: 4 },
  // L1 approval mode
  label: { color: '#a5b4fc', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  l1Title: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: 8,
  },
  actionRow: { flexDirection: 'row', gap: 12 },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeny: { backgroundColor: '#7f1d1d' },
  btnApprove: { backgroundColor: '#065f46' },
  btnLabel: { color: '#fff', fontSize: 20, fontWeight: '700' },
});

export default WatchLivingTileScreen;
