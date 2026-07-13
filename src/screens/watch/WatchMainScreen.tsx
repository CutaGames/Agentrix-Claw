/**
 * WearOS Main Entry Screen — standalone watch experience.
 *
 * Provides:
 *   - Quick voice activation (tap-to-talk)
 *   - Active agent status display
 *   - Pending approval badges
 *   - Last agent response preview
 *   - Health/step context display
 *   - Data Layer sync indicator
 *
 * Layout optimized for round 1.4" (Pixel Watch) and square (TicWatch) displays.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Vibration,
  AppState,
} from 'react-native';
import { WatchDataLayerService, type WatchMessage } from '../../services/wearables/watchDataLayerBridge.service';

// ── Types ──────────────────────────────────────────────

interface WatchState {
  connected: boolean;
  voiceActive: boolean;
  sessionId: string | null;
  agentName: string;
  lastResponse: string;
  pendingApprovals: number;
  strategy: string | null;
}

// ── Constants ──────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const IS_ROUND = SCREEN_W < 250; // heuristic
const MIC_BUTTON_SIZE = Math.min(SCREEN_W * 0.35, 80);

// ── Component ──────────────────────────────────────────

export default function WatchMainScreen() {
  const [state, setState] = useState<WatchState>({
    connected: false,
    voiceActive: false,
    sessionId: null,
    agentName: 'Agentrix',
    lastResponse: 'Ready',
    pendingApprovals: 0,
    strategy: null,
  });

  // Initialize Data Layer listener
  useEffect(() => {
    void WatchDataLayerService.startListening();

    const unsubs = [
      WatchDataLayerService.onMessage('/agentrix/agent/text', (msg: WatchMessage) => {
        const data = msg.data as { text?: string; isFinal?: boolean };
        if (data.text) {
          setState((s) => ({ ...s, lastResponse: data.text as string }));
          Vibration.vibrate([0, 30]); // subtle notification
        }
      }),

      WatchDataLayerService.onMessage('/agentrix/approval/request', () => {
        setState((s) => ({ ...s, pendingApprovals: s.pendingApprovals + 1 }));
        Vibration.vibrate([0, 50, 30, 50]); // double pulse for approval
      }),

      WatchDataLayerService.onMessage('/agentrix/voice/state', (msg: WatchMessage) => {
        const data = msg.data as { isActive?: boolean; sessionId?: string; strategy?: string };
        setState((s) => ({
          ...s,
          voiceActive: Boolean(data.isActive),
          sessionId: (data.sessionId as string) || null,
          strategy: (data.strategy as string) || null,
        }));
      }),

      WatchDataLayerService.onMessage('/agentrix/heartbeat', () => {
        setState((s) => ({ ...s, connected: true }));
      }),
    ];

    // Check connectivity
    void WatchDataLayerService.getConnectedNodes().then((nodes) => {
      setState((s) => ({ ...s, connected: nodes.length > 0 }));
    });

    return () => {
      unsubs.forEach((fn) => fn());
      void WatchDataLayerService.stopListening();
    };
  }, []);

  const handleMicPress = useCallback(() => {
    Vibration.vibrate([0, 30]);
    if (state.voiceActive) {
      // Stop voice
      void WatchDataLayerService.broadcastMessage('/agentrix/voice/command', {
        action: 'stop',
        sessionId: state.sessionId,
      });
      setState((s) => ({ ...s, voiceActive: false }));
    } else {
      // Start voice
      void WatchDataLayerService.broadcastMessage('/agentrix/voice/command', {
        action: 'start',
      });
      setState((s) => ({ ...s, voiceActive: true }));
    }
  }, [state.voiceActive, state.sessionId]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Connection indicator */}
      <View style={styles.statusRow}>
        <View style={[styles.dot, state.connected ? styles.dotGreen : styles.dotRed]} />
        <Text style={styles.statusText}>
          {state.connected ? 'Connected' : 'Disconnected'}
        </Text>
        {state.strategy && (
          <Text style={styles.strategyBadge}>{state.strategy}</Text>
        )}
      </View>

      {/* Mic button (center) */}
      <TouchableOpacity
        style={[
          styles.micButton,
          state.voiceActive && styles.micButtonActive,
        ]}
        onPress={handleMicPress}
        activeOpacity={0.7}
      >
        <Text style={styles.micIcon}>{state.voiceActive ? '⏹' : '🎤'}</Text>
      </TouchableOpacity>

      {/* Last response */}
      <Text style={styles.responseText} numberOfLines={3}>
        {state.lastResponse}
      </Text>

      {/* Pending approvals */}
      {state.pendingApprovals > 0 && (
        <View style={styles.approvalBadge}>
          <Text style={styles.approvalText}>
            {state.pendingApprovals} pending approval{state.pendingApprovals > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Agent info */}
      <Text style={styles.agentLabel}>{state.agentName}</Text>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    alignItems: 'center',
    paddingTop: IS_ROUND ? 30 : 12,
    paddingBottom: IS_ROUND ? 30 : 12,
    paddingHorizontal: IS_ROUND ? 20 : 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotGreen: {
    backgroundColor: '#22c55e',
  },
  dotRed: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    color: '#888',
    fontSize: 10,
  },
  strategyBadge: {
    color: '#60a5fa',
    fontSize: 9,
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  micButton: {
    width: MIC_BUTTON_SIZE,
    height: MIC_BUTTON_SIZE,
    borderRadius: MIC_BUTTON_SIZE / 2,
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  micButtonActive: {
    backgroundColor: '#1e3a5f',
    borderColor: '#3b82f6',
  },
  micIcon: {
    fontSize: 28,
  },
  responseText: {
    color: '#ccc',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
    lineHeight: 16,
  },
  approvalBadge: {
    backgroundColor: '#eab30820',
    borderWidth: 1,
    borderColor: '#eab308',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  approvalText: {
    color: '#eab308',
    fontSize: 10,
    fontWeight: '600',
  },
  agentLabel: {
    color: '#555',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
