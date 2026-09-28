/**
 * Watch Quick Approval Screen — WearOS-optimized approval UI.
 *
 * Features:
 *   - Large touch targets for small round/square watch displays
 *   - Haptic feedback on approve/reject via Vibration API
 *   - Swipe-to-approve gesture (swipe right = approve, swipe left = reject)
 *   - Risk-level color coding (green/yellow/red)
 *   - Auto-timeout with countdown indicator
 *   - Integration with WatchDataLayerBridge for phone sync
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';

// ── Types ──────────────────────────────────────────────

export interface WatchApprovalRequest {
  id: string;
  toolName: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  timeoutMs?: number;
  params?: Record<string, unknown>;
}

interface Props {
  request: WatchApprovalRequest;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onTimeout?: (requestId: string) => void;
}

// ── Constants ──────────────────────────────────────────

const SCREEN = Dimensions.get('window');
const IS_ROUND = SCREEN.width === SCREEN.height; // heuristic for round watches
const SWIPE_THRESHOLD = SCREEN.width * 0.3;
const DEFAULT_TIMEOUT_MS = 30_000;

const HAPTIC_APPROVE = [0, 50, 30, 50]; // short double pulse
const HAPTIC_REJECT = [0, 100]; // single long pulse
const HAPTIC_TAP = [0, 20]; // tiny tap

const RISK_COLORS = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#ef4444',
};

const TOOL_ICONS: Record<string, string> = {
  code_execute: '⚡',
  file_write: '📝',
  git_push: '🚀',
  browser_navigate: '🌐',
  terminal_command: '💻',
  payment: '💳',
  default: '🔧',
};

// ── Component ──────────────────────────────────────────

export default function WatchApprovalScreen({ request, onApprove, onReject, onTimeout }: Props) {
  const [decided, setDecided] = useState(false);
  const [countdown, setCountdown] = useState(
    Math.ceil((request.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000),
  );
  const panX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!decided) {
            Vibration.vibrate(HAPTIC_REJECT);
            onTimeout?.(request.id);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [decided, onTimeout, request.id]);

  const handleApprove = useCallback(() => {
    if (decided) return;
    setDecided(true);
    Vibration.vibrate(HAPTIC_APPROVE);
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      onApprove(request.id);
    });
  }, [decided, fadeAnim, onApprove, request.id]);

  const handleReject = useCallback(() => {
    if (decided) return;
    setDecided(true);
    Vibration.vibrate(HAPTIC_REJECT);
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      onReject(request.id);
    });
  }, [decided, fadeAnim, onReject, request.id]);

  // Swipe gesture handler
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
      onPanResponderMove: (_, gs) => {
        panX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          // Swipe right = approve
          Animated.spring(panX, { toValue: SCREEN.width, useNativeDriver: true }).start();
          handleApprove();
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          // Swipe left = reject
          Animated.spring(panX, { toValue: -SCREEN.width, useNativeDriver: true }).start();
          handleReject();
        } else {
          // Snap back
          Vibration.vibrate(HAPTIC_TAP);
          Animated.spring(panX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const icon = TOOL_ICONS[request.toolName] || TOOL_ICONS.default;
  const riskColor = RISK_COLORS[request.riskLevel];
  const countdownPercent = countdown / Math.ceil((request.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000);

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.card, { transform: [{ translateX: panX }] }]}>
        {/* Countdown ring */}
        <View style={[styles.countdownRing, { borderColor: riskColor }]}>
          <Text style={styles.countdownText}>{countdown}s</Text>
        </View>

        {/* Tool info */}
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.toolName} numberOfLines={1}>
          {request.toolName.replace(/_/g, ' ')}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {request.description}
        </Text>

        {/* Risk badge */}
        <View style={[styles.riskBadge, { backgroundColor: riskColor }]}>
          <Text style={styles.riskText}>{request.riskLevel.toUpperCase()}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.btn, styles.rejectBtn]}
            onPress={handleReject}
            activeOpacity={0.7}
          >
            <Text style={styles.btnText}>✗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.approveBtn]}
            onPress={handleApprove}
            activeOpacity={0.7}
          >
            <Text style={styles.btnText}>✓</Text>
          </TouchableOpacity>
        </View>

        {/* Swipe hint */}
        <Text style={styles.swipeHint}>← reject  ·  approve →</Text>
      </Animated.View>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: IS_ROUND ? 20 : 8,
  },
  card: {
    alignItems: 'center',
    width: '100%',
  },
  countdownRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  countdownText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  icon: {
    fontSize: 28,
    marginBottom: 4,
  },
  toolName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  description: {
    color: '#aaa',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 10,
  },
  riskText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800',
  },
  buttons: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 6,
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtn: {
    backgroundColor: '#dc2626',
  },
  approveBtn: {
    backgroundColor: '#16a34a',
  },
  btnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  swipeHint: {
    color: '#555',
    fontSize: 8,
    letterSpacing: 0.5,
  },
});
