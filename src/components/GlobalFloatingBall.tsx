import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Text,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme/colors';
import * as Haptics from 'expo-haptics';
import { useI18n } from '../stores/i18nStore';
import { useSettingsStore } from '../stores/settingsStore';
import { resolveMobileWakeWordConfig } from '../config/wakeWord';
import { SpeechWakeWordService } from '../services/speechWakeWord.service';
import { LocalWakeWordService, hasLocalWakeWordModel, thresholdFromSensitivity } from '../services/localWakeWord.service';
import { addVoiceDiagnostic } from '../services/voiceDiagnostics';
import { isVoiceUiE2EEnabled } from '../testing/e2e';
import {
  resolveSpriteForMode,
  subscribePetMode,
  setPetMode,
  type PetMode,
} from '../services/petMode';
import { PetSpriteImage } from './PetSpriteImage';

// ─── Layout constants ───────────────────────────────────────────────────────
const BALL_SIZE = 48;
const CAPSULE_WIDTH = 220;
const CAPSULE_HEIGHT = 52;
const EDGE_MARGIN = 12;
const MINIMIZED_REVEAL = 18;
const LONG_PRESS_DURATION = 400;
const MAGNETIC_OFFSET = 4;

const PILL_WIDTH = 280;

type BallState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STATE_GRADIENTS: Record<BallState, [string, string]> = {
  idle:      ['#6C5CE7', '#a78bfa'],
  listening: ['#10B981', '#34d399'],
  thinking:  ['#F59E0B', '#fbbf24'],
  speaking:  ['#3b82f6', '#60a5fa'],
};

const STATE_BORDER_COLORS: Record<BallState, string> = {
  idle: '#6C5CE7',
  listening: '#10B981',
  thinking: '#F59E0B',
  speaking: '#3b82f6',
};

// ─── Orbiting Particles (Processing state) ──────────────────────────────────
function OrbitingParticles({ active }: { active: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { rotation.setValue(0); return; }
    const spin = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 2000, useNativeDriver: true }),
    );
    spin.start();
    return () => spin.stop();
  }, [active, rotation]);

  if (!active) return null;

  const rotateStr = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const ORBIT_R = BALL_SIZE / 2 + 10;
  const P = 5;
  const angles = [0, 90, 180, 270];

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', transform: [{ rotate: rotateStr }] }]}
      pointerEvents="none"
    >
      <Svg width={ORBIT_R * 2 + P} height={ORBIT_R * 2 + P}>
        {angles.map((deg, i) => {
          const a = (deg * Math.PI) / 180;
          return (
            <Circle key={i} cx={ORBIT_R + P / 2 + Math.cos(a) * ORBIT_R} cy={ORBIT_R + P / 2 + Math.sin(a) * ORBIT_R}
              r={P / 2} fill={i % 2 === 0 ? '#F59E0B' : '#fbbf24'} opacity={0.85} />
          );
        })}
      </Svg>
    </Animated.View>
  );
}

interface Props {
  onVoiceActivate?: () => void;
  pillTranscript?: string;
  onPillSend?: (text: string) => void;
  pillVolume?: number;
  resultText?: string;
  onResultAction?: (action: string) => void;
  /**
   * P-9 Companion Redesign T3.3 — when provided, overrides the legacy
   * "tap = navigate(AgentChat)" behavior so the parent CompanionBall can
   * route single-tap to ConversationBubble.present() instead. Pass
   * undefined (or omit) to retain legacy behavior.
   */
  onSingleTapOverride?: () => void;
  /**
   * P-9 T3.3 — when provided, overrides the legacy "long-press = expand
   * pill" behavior so the parent can route to PetDetailSheet.present().
   */
  onLongPressOverride?: () => void;
  /**
   * P-9 T3.3 — when provided, signals from a parent gesture observer
   * that the user right-swiped the ball (drag finished with dx > 100
   * and |dy| < 80). The parent runs whatever camera flow it needs.
   * Phase 1 the wrapper layer doesn't yet detect this; we expose the
   * prop so wave 6 polish can wire it without further refactors here.
   */
  onRightSwipeOverride?: () => void;
  /**
   * Wave 17 hotfix — module-scope NavigationContainerRef from App.tsx.
   * Used to read root navigation state via `getRootState()` instead of
   * `useNavigationState`, which throws "Couldn't get the navigation
   * state. Is your component inside a navigator?" because the ball is
   * mounted as a sibling of <AppNavigator/>, not inside any Navigator
   * screen. The ref is safe — `current` may be null on cold launch
   * (before NavigationContainer mounts), which we handle gracefully.
   */
  navigationRef?: any;
}

export function GlobalFloatingBall({
  onVoiceActivate, pillTranscript, onPillSend, pillVolume = 0,
  resultText, onResultAction,
  onSingleTapOverride, onLongPressOverride,
  navigationRef,
}: Props) {
  const navigation = useNavigation<any>();
  const { language } = useI18n();
  const wakeWordSettings = useSettingsStore((state) => state.wakeWordConfig);
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const wakeWordConfig = useMemo(() => resolveMobileWakeWordConfig(wakeWordSettings), [wakeWordSettings]);

  // Wave 17 hotfix — read current route via navigationRef instead of
  // useNavigationState. The hook throws "Couldn't get the navigation
  // state. Is your component inside a navigator?" because the ball
  // mounts as a sibling of the Navigator subtree (under
  // NavigationContainer but outside Stack/Tab navigators). The ref
  // gives us the same root state without any context dependency.
  //
  // Resolution mirrors the legacy useNavigationState selector: walk
  // up to 4 levels of nested route.state until we hit the leaf route.
  const resolveLeafRouteName = useCallback((rootState: any): string => {
    if (!rootState) return '';
    let route = rootState.routes?.[rootState.index];
    if (!route) return '';
    for (let depth = 0; depth < 4; depth++) {
      const nested = route?.state as any;
      if (!nested?.routes || nested.index == null) break;
      route = nested.routes[nested.index];
    }
    return route?.name || '';
  }, []);

  const [currentRouteName, setCurrentRouteName] = useState<string>(() => {
    try {
      return resolveLeafRouteName(navigationRef?.current?.getRootState?.());
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const ref = navigationRef?.current;
    if (!ref?.addListener) return;
    const updateRoute = () => {
      try {
        setCurrentRouteName(resolveLeafRouteName(ref.getRootState()));
      } catch {
        /* ref unmounted between calls — ignore */
      }
    };
    // Sync once on mount in case the ref existed but state arrived
    // before the listener attached.
    updateRoute();
    const unsubscribe = ref.addListener('state', updateRoute);
    return () => {
      try { unsubscribe?.(); } catch { /* ignore */ }
    };
  }, [navigationRef, resolveLeafRouteName]);

  const hideOnScreens = ['AgentChat', 'VoiceChat', 'ClawSettings'];
  // Keep the ball (and wake-word listener) visible on the main tab routes.
  // Earlier versions hid it on Main/MainTabs/Agent which removed wake-word
  // support from the home tab — restoring the build138 behavior.
  const shouldHide = hideOnScreens.includes(currentRouteName);
  const useDirectPressHandlers = Platform.OS === 'web' || isVoiceUiE2EEnabled();

  // ── Core state ──
  const [ballState, setBallState] = useState<BallState>('idle');
  const [isMinimized, setIsMinimized] = useState(true);
  const [isCapsule, setIsCapsule] = useState(false);
  const [pillExpanded, setPillExpanded] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const [showResultCard, setShowResultCard] = useState(false);

  // Sprint P-6 (2026-05-22): pet form mode subscription. The ball's
  // gradient + waveform handle ambient state (idle/listening/speaking),
  // while `petMode` selects a 13-form sprite per
  // `docs/PET_FORMS_DESIGN_v5.zh-CN.md`. The two are complementary:
  // ballState drives capsule layout, petMode drives the sprite shown
  // inside it.
  const [petMode, setPetModeState] = useState<PetMode>('idle');
  useEffect(() => {
    return subscribePetMode((mode) => setPetModeState(mode));
  }, []);
  // Cross-wire ballState → petMode so legacy callers that only flip
  // `ballState` still drive the form system.
  useEffect(() => {
    if (ballState === 'listening') setPetMode('listening', 'ballState:listening');
    else if (ballState === 'speaking') setPetMode('speaking', 'ballState:speaking');
    else if (ballState === 'thinking') setPetMode('thinking', 'ballState:thinking');
    else if (ballState === 'idle') setPetMode('idle', 'ballState:idle');
  }, [ballState]);
  const petSprite = useMemo(() => resolveSpriteForMode(petMode), [petMode]);

  // ── Animation values ──
  const pan = useRef(new Animated.ValueXY({ x: screenW - MINIMIZED_REVEAL, y: screenH - 200 })).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const coreBreathAnim = useRef(new Animated.Value(0.6)).current;
  const morphWidth = useRef(new Animated.Value(BALL_SIZE)).current;
  const morphRadius = useRef(new Animated.Value(BALL_SIZE / 2)).current;
  const magneticX = useRef(new Animated.Value(0)).current;
  const magneticY = useRef(new Animated.Value(0)).current;
  const pillExpandAnim = useRef(new Animated.Value(0)).current;
  const resultCardAnim = useRef(new Animated.Value(0)).current;
  const waveformAnims = useRef(
    Array.from({ length: 7 }, () => new Animated.Value(0.15))
  ).current;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const wakeListenerRef = useRef<SpeechWakeWordService | LocalWakeWordService | null>(null);
  const navigatingToChatRef = useRef(false);
  const activateVoiceExperienceRef = useRef<() => void>(() => {});
  const lastWakeWordAlertRef = useRef<{ message: string; shownAt: number }>({ message: '', shownAt: 0 });

  // ── Core breathing animation (always runs) ──
  useEffect(() => {
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(coreBreathAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(coreBreathAnim, { toValue: 0.6, duration: 1800, useNativeDriver: true }),
      ]),
    );
    breath.start();
    return () => breath.stop();
  }, [coreBreathAnim]);

  // ── Pulse for non-idle states ──
  useEffect(() => {
    if (ballState !== 'idle') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [ballState, pulseAnim]);

  useEffect(() => {
    if (!shouldHide) {
      setBallState('idle');
      navigatingToChatRef.current = false;
    } else if (navigatingToChatRef.current) {
      navigatingToChatRef.current = false;
    }
  }, [shouldHide]);

  // ── Capsule morph animation ──
  useEffect(() => {
    Animated.parallel([
      Animated.spring(morphWidth, { toValue: isCapsule ? CAPSULE_WIDTH : BALL_SIZE, useNativeDriver: false, friction: 8, tension: 80 }),
      Animated.spring(morphRadius, { toValue: isCapsule ? CAPSULE_HEIGHT / 2 : BALL_SIZE / 2, useNativeDriver: false, friction: 8, tension: 80 }),
    ]).start();
  }, [isCapsule, morphWidth, morphRadius]);

  // Auto-expand capsule when listening/speaking
  useEffect(() => {
    if (ballState === 'listening' || ballState === 'speaking') {
      setIsCapsule(true);
      if (isMinimized) setIsMinimized(false);
    } else if (ballState === 'idle') {
      setIsCapsule(false);
    }
  }, [ballState, isMinimized]);

  // Pill expand/collapse
  useEffect(() => {
    Animated.spring(pillExpandAnim, { toValue: pillExpanded ? 1 : 0, useNativeDriver: false, friction: 8 }).start();
  }, [pillExpanded, pillExpandAnim]);

  useEffect(() => {
    if (ballState !== 'listening' && pillExpanded) setPillExpanded(false);
  }, [ballState, pillExpanded]);

  // Waveform driven by volume
  useEffect(() => {
    if (ballState !== 'listening' && ballState !== 'speaking') return;
    waveformAnims.forEach((anim, i) => {
      const base = Math.min(1, 0.15 + pillVolume * 0.85);
      const jitter = Math.random() * 0.35;
      Animated.timing(anim, {
        toValue: Math.min(1, base + jitter * (i % 2 === 0 ? 1 : 0.5)),
        duration: 100 + Math.random() * 60,
        useNativeDriver: false,
      }).start();
    });
  }, [ballState, pillVolume, waveformAnims]);

  // Result card animation
  useEffect(() => {
    const show = !!resultText && resultText.length > 0;
    setShowResultCard(show);
    Animated.spring(resultCardAnim, { toValue: show ? 1 : 0, useNativeDriver: false, friction: 8 }).start();
  }, [resultText, resultCardAnim]);

  // ── Edge snapping ──
  const snapToEdge = useCallback((x: number, y: number) => {
    const onLeft = x < screenW / 2;
    const snapX = isMinimized
      ? (onLeft ? -(BALL_SIZE - MINIMIZED_REVEAL) : screenW - MINIMIZED_REVEAL)
      : (onLeft ? EDGE_MARGIN : screenW - BALL_SIZE - EDGE_MARGIN);
    const clampedY = Math.max(EDGE_MARGIN + 50, Math.min(y, screenH - BALL_SIZE - 100));
    Animated.spring(pan, { toValue: { x: snapX, y: clampedY }, useNativeDriver: false, friction: 7 }).start();
  }, [pan, screenW, screenH, isMinimized]);

  // Re-dock when going minimized
  useEffect(() => {
    if (isMinimized) {
      const currentX = (pan.x as any)._value ?? screenW - MINIMIZED_REVEAL;
      const currentY = (pan.y as any)._value ?? screenH - 200;
      snapToEdge(currentX, currentY);
    }
  }, [isMinimized, snapToEdge, pan, screenW, screenH]);

  // Auto re-minimize after 8s idle
  useEffect(() => {
    if (ballState !== 'idle' || isMinimized || pillExpanded || showResultCard) return;
    const timer = setTimeout(() => setIsMinimized(true), 8000);
    return () => clearTimeout(timer);
  }, [ballState, isMinimized, pillExpanded, showResultCard]);

  const showWakeWordGuidance = useCallback((message: string) => {
    const now = Date.now();
    if (
      lastWakeWordAlertRef.current.message === message
      && now - lastWakeWordAlertRef.current.shownAt < 15000
    ) {
      return;
    }
    lastWakeWordAlertRef.current = { message, shownAt: now };
    addVoiceDiagnostic('floating-ball', 'wake-word-guidance-shown', { message });

    const title = language === 'zh' ? '语音唤醒需要设置' : 'Wake word needs setup';
    const openSettingsLabel = language === 'zh' ? '打开系统设置' : 'Open Settings';
    const laterLabel = language === 'zh' ? '稍后' : 'Later';

    Alert.alert(title, message, [
      {
        text: openSettingsLabel,
        onPress: () => {
          Linking.openSettings().catch(() => {});
        },
      },
      { text: laterLabel, style: 'cancel' },
    ]);
  }, [language]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
      onPanResponderGrant: () => {
        Animated.spring(magneticX, { toValue: MAGNETIC_OFFSET, useNativeDriver: false, friction: 6 }).start();
        Animated.spring(magneticY, { toValue: -MAGNETIC_OFFSET, useNativeDriver: false, friction: 6 }).start();

        longPressTimer.current = setTimeout(() => {
          if (!isDragging.current) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            handleLongPress();
          }
        }, LONG_PRESS_DURATION);

        pan.extractOffset();
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5) {
          isDragging.current = true;
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }
        Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(_, gesture);
      },
      onPanResponderRelease: (_, gesture) => {
        Animated.spring(magneticX, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
        Animated.spring(magneticY, { toValue: 0, useNativeDriver: false, friction: 6 }).start();

        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        pan.flattenOffset();

        const currentX = (pan.x as any)._value ?? screenW - BALL_SIZE - EDGE_MARGIN;
        const currentY = (pan.y as any)._value ?? screenH - 200;

        if (!isDragging.current) handleTap();
        isDragging.current = false;
        snapToEdge(currentX, currentY);
      },
    })
  ).current;

  const activateVoiceExperience = useCallback(async () => {
    // Guard against double-tap while already navigating
    if (navigatingToChatRef.current) {
      addVoiceDiagnostic('floating-ball', 'activate-blocked-navigating');
      return;
    }
    navigatingToChatRef.current = true;
    setBallState('listening');
    onVoiceActivate?.();

    // Safety: auto-reset guard after 3s in case navigation silently fails
    // (shouldHide effect normally resets this, but navigation might not trigger it)
    setTimeout(() => {
      if (navigatingToChatRef.current) {
        addVoiceDiagnostic('floating-ball', 'guard-timeout-reset');
        navigatingToChatRef.current = false;
        setBallState('idle');
      }
    }, 3000);

    if (isVoiceUiE2EEnabled() && onVoiceActivate) {
      return;
    }

    // GlobalFloatingBall sits beside MainTabNavigator inside the Root screen,
    // so it gets the Root navigator. Resolve the target instance up front.
    const authStore = require('../stores/authStore').useAuthStore.getState();
    const targetInstance = authStore.activeInstance ?? authStore.user?.openClawInstances?.[0] ?? null;
    addVoiceDiagnostic('floating-ball', 'activate-start', {
      currentRouteName,
      hasActiveInstance: !!authStore.activeInstance,
      targetInstanceId: targetInstance?.id || null,
      targetInstanceName: targetInstance?.name || null,
    });
    if (!authStore.activeInstance && targetInstance?.id) {
      authStore.setActiveInstance(targetInstance.id);
      addVoiceDiagnostic('floating-ball', 'set-active-instance', { instanceId: targetInstance.id });
    }

    // Release wake word listener BEFORE navigation so the mic is fully freed
    // before the chat screen's duplex mode tries to acquire it.
    const listener = wakeListenerRef.current;
    if (listener) {
      wakeListenerRef.current = null;
      try {
        await listener.release();
        addVoiceDiagnostic('floating-ball', 'listener-released');
      } catch (releaseErr) {
        addVoiceDiagnostic('floating-ball', 'listener-release-failed', releaseErr);
      }
    }

    // Navigate to Agent tab → AgentChat, preserving navigation stacks.
    const chatParams = {
      instanceId: targetInstance?.id,
      instanceName: targetInstance?.name || 'Agent',
      voiceMode: true,
      duplexMode: true,
    };

    try {
      if (isVoiceUiE2EEnabled()) {
        navigation.navigate('AgentChat', chatParams);
      } else if (!targetInstance?.id) {
        // No instance available — navigate to Agent tab only (shows welcome/provision screen).
        // Do NOT navigate to AgentChat with empty instanceId to avoid white screen.
        addVoiceDiagnostic('floating-ball', 'no-instance-fallback');
        (navigation as any).navigate('MainTabs', { screen: 'Agent' });
        navigatingToChatRef.current = false;
        setBallState('idle');
      } else {
        // Two-step navigation for reliability: first switch to Agent tab,
        // then navigate within the (now-mounted) Agent stack to AgentChat.
        // Single-step deeply-nested navigate silently fails from some tabs (Me, Discover).
        (navigation as any).navigate('MainTabs', { screen: 'Agent' });
        setTimeout(() => {
          try {
            (navigation as any).navigate('MainTabs', {
              screen: 'Agent',
              params: {
                screen: 'AgentChat',
                params: chatParams,
              },
            });
          } catch (retryErr) {
            addVoiceDiagnostic('floating-ball', 'navigate-retry-failed', retryErr);
          }
        }, 150);
      }
      addVoiceDiagnostic('floating-ball', 'navigate-agent-chat', {
        instanceId: chatParams.instanceId || null,
        instanceName: chatParams.instanceName,
      });
    } catch (navErr) {
      addVoiceDiagnostic('floating-ball', 'navigate-failed', navErr);
      console.warn('[FloatingBall] Navigation failed:', navErr);
      navigatingToChatRef.current = false;
      setBallState('idle');
    }
  }, [navigation, onVoiceActivate, currentRouteName]);

  activateVoiceExperienceRef.current = activateVoiceExperience;

  const handleTap = useCallback(() => {
    addVoiceDiagnostic('floating-ball', 'tap');
    Haptics.selectionAsync().catch(() => {});

    if (isMinimized) {
      setIsMinimized(false);
      const currentX = (pan.x as any)._value ?? screenW - BALL_SIZE - EDGE_MARGIN;
      const currentY = (pan.y as any)._value ?? screenH - 200;
      const onLeft = currentX < screenW / 2;
      Animated.spring(pan, {
        toValue: { x: onLeft ? EDGE_MARGIN : screenW - BALL_SIZE - EDGE_MARGIN, y: currentY },
        useNativeDriver: false, friction: 7,
      }).start();
      return;
    }

    // P-9 T3.3 single-tap override: when the parent CompanionBall wrapper
    // wants single-tap to surface the ConversationBubble instead of
    // navigating to AgentChat, it passes onSingleTapOverride.
    if (onSingleTapOverride) {
      addVoiceDiagnostic('floating-ball', 'tap-override');
      onSingleTapOverride();
      return;
    }

    void activateVoiceExperience();
  }, [activateVoiceExperience, isMinimized, pan, screenW, screenH, onSingleTapOverride]);

  const handleLongPress = useCallback(() => {
    addVoiceDiagnostic('floating-ball', 'long-press-activate');
    if (isMinimized) { setIsMinimized(false); return; }

    // P-9 T3.3 long-press override: parent can hijack the long-press to
    // open PetDetailSheet instead of expanding the legacy pill.
    if (onLongPressOverride) {
      addVoiceDiagnostic('floating-ball', 'long-press-override');
      onLongPressOverride();
      return;
    }

    setPillExpanded(true);
    setBallState('listening');
    onVoiceActivate?.();
  }, [isMinimized, onVoiceActivate, onLongPressOverride]);

  const handleQuickSend = useCallback(() => {
    const text = quickInput.trim();
    if (!text) return;
    if (onPillSend) {
      onPillSend(text);
      setQuickInput('');
      setPillExpanded(false);
      setBallState('thinking');
    }
  }, [quickInput, onPillSend]);

  const handlePillSend = useCallback(() => {
    if (pillTranscript && onPillSend) {
      onPillSend(pillTranscript);
      setPillExpanded(false);
      setBallState('thinking');
    }
  }, [pillTranscript, onPillSend]);

  const handlePillClose = useCallback(() => {
    setPillExpanded(false);
    setQuickInput('');
    setBallState('idle');
  }, []);

  useEffect(() => {
    if (!isVoiceUiE2EEnabled() || Platform.OS !== 'web') {
      return;
    }

    const handleE2EWakeWord = () => {
      addVoiceDiagnostic('floating-ball', 'e2e-wake-word-triggered');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      activateVoiceExperienceRef.current();
    };

    const handleE2ELocalWakeWord = () => {
      addVoiceDiagnostic('floating-ball', 'e2e-local-wake-word-triggered');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      activateVoiceExperienceRef.current();
    };

    window.addEventListener('agentrix:e2e-wake-word', handleE2EWakeWord);
    window.addEventListener('agentrix:e2e-local-wake-word', handleE2ELocalWakeWord);
    return () => {
      window.removeEventListener('agentrix:e2e-wake-word', handleE2EWakeWord);
      window.removeEventListener('agentrix:e2e-local-wake-word', handleE2ELocalWakeWord);
    };
  }, []);

  useEffect(() => {
    if (!wakeWordConfig.enabled || shouldHide || navigatingToChatRef.current) {
      const listener = wakeListenerRef.current;
      if (listener) {
        void listener.release();
        wakeListenerRef.current = null;
      }
      return;
    }

    const preferredEngine = wakeWordConfig.engine ?? 'auto';
    const localModelAvailable = hasLocalWakeWordModel(wakeWordConfig.localModel);
    const shouldUseLocalTemplate =
      (preferredEngine === 'local-template' || preferredEngine === 'auto')
      && localModelAvailable
      && LocalWakeWordService.isAvailable();

    const listener = shouldUseLocalTemplate
      ? new LocalWakeWordService()
      : SpeechWakeWordService.isAvailable()
        ? new SpeechWakeWordService()
        : null;

    if (!listener) {
      return;
    }

    wakeListenerRef.current = listener;
    let cancelled = false;

    void (async () => {
      try {
      if (listener instanceof LocalWakeWordService) {
        await listener.init({
          model: wakeWordConfig.localModel!,
          threshold: thresholdFromSensitivity(wakeWordConfig.sensitivity),
          onWakeWord: () => {
            if (!cancelled) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              activateVoiceExperienceRef.current();
            }
          },
          onError: (err) => {
            addVoiceDiagnostic('floating-ball', 'local-wake-word-error', { message: err?.message });
            const rawMessage = err?.message || '';
            if (/permission denied|permission/i.test(rawMessage)) {
              showWakeWordGuidance(language === 'zh'
                ? '本地唤醒词需要麦克风权限。请先到系统设置里授权。'
                : 'Local wake word needs microphone permission. Enable it in system settings first.');
            }
          },
        });
      } else {
        await listener.init({
          phrases: wakeWordConfig.fallbackPhrases,
          language,
          onWakeWord: () => {
            if (!cancelled) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              activateVoiceExperienceRef.current();
            }
          },
          onError: (err) => {
            addVoiceDiagnostic('floating-ball', 'wake-word-error', { message: err?.message });
            const rawMessage = err?.message || '';
            if (/permission denied|permission/i.test(rawMessage)) {
              showWakeWordGuidance(language === 'zh'
                ? '唤醒词需要麦克风和语音识别权限。请到系统设置里开启权限，然后再试一次。'
                : 'Wake word needs microphone and speech permissions. Enable them in system settings, then try again.');
              return;
            }
            if (/unavailable/i.test(rawMessage)) {
              showWakeWordGuidance(language === 'zh'
                ? '当前设备没有可用的系统语音唤醒能力。你仍然可以直接点悬浮球进入实时语音。'
                : 'This device does not expose wake-word speech recognition. You can still tap the floating ball to jump straight into live voice.');
            }
          },
        });
      }

      if (!cancelled) {
        await listener.start();
      }
      } catch (err) {
        addVoiceDiagnostic('floating-ball', 'wake-word-init-failed', err);
        console.warn('[FloatingBall] Wake word init failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      void listener.release();
      if (wakeListenerRef.current === listener) {
        wakeListenerRef.current = null;
      }
    };
  }, [
    language,
    shouldHide,
    wakeWordConfig.enabled,
    wakeWordConfig.engine,
    wakeWordConfig.fallbackPhrases,
    wakeWordConfig.localModel,
    wakeWordConfig.sensitivity,
    showWakeWordGuidance,
  ]);

  if (shouldHide) return null;

  const borderColor = STATE_BORDER_COLORS[ballState];
  const gradientColors = STATE_GRADIENTS[ballState];

  return (
    <Animated.View
      testID="voice-floating-ball"
      accessibilityLabel="voice-floating-ball"
      style={[
        styles.outerContainer,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { translateX: magneticX },
            { translateY: magneticY },
            { scale: pulseAnim },
          ],
        },
      ]}
      {...(useDirectPressHandlers ? {} : panResponder.panHandlers)}
    >
      {/* Result Card (Phase 2) — below the ball */}
      {showResultCard && (
        <Animated.View
          style={[
            styles.resultCard,
            {
              opacity: resultCardAnim,
              transform: [{ translateY: resultCardAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
            },
          ]}
        >
          <BlurView intensity={60} tint="dark" style={styles.resultCardBlur}>
            <Text style={styles.resultCardText} numberOfLines={4}>{resultText}</Text>
            {onResultAction && (
              <View style={styles.resultCardActions}>
                <TouchableOpacity style={styles.resultActionBtn} onPress={() => onResultAction('open')}>
                  <Text style={styles.resultActionText}>{language === 'zh' ? '查看详情' : 'View'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.resultActionBtn, styles.resultActionBtnPrimary]} onPress={() => onResultAction('dismiss')}>
                  <Text style={[styles.resultActionText, styles.resultActionTextPrimary]}>{language === 'zh' ? '好的' : 'OK'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </BlurView>
        </Animated.View>
      )}

      {/* Voice Pill / Quick Input panel — above the ball */}
      {pillExpanded && (
        <Animated.View
          style={[
            styles.pillPanel,
            {
              opacity: pillExpandAnim,
              transform: [{ scale: pillExpandAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            },
          ]}
        >
          <BlurView intensity={50} tint="dark" style={styles.pillBlur}>
            <View style={styles.pillHeader}>
              <Text style={styles.pillTitle}>
                {ballState === 'listening'
                  ? (language === 'zh' ? '🎙 聆听中…' : '🎙 Listening…')
                  : ballState === 'thinking'
                  ? (language === 'zh' ? '💭 思考中…' : '💭 Thinking…')
                  : (language === 'zh' ? '🔊 回复中' : '🔊 Speaking')}
              </Text>
              <TouchableOpacity onPress={handlePillClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.pillCloseBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.waveformRow}>
              {waveformAnims.map((anim, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.waveformBar,
                    {
                      height: anim.interpolate({ inputRange: [0, 1], outputRange: [3, 26] }),
                      backgroundColor: gradientColors[i % 2],
                    },
                  ]}
                />
              ))}
            </View>

            {!!pillTranscript && (
              <Text style={styles.pillTranscript} numberOfLines={2}>{pillTranscript}</Text>
            )}

            <View style={styles.quickInputRow}>
              <TextInput
                style={styles.quickInput}
                placeholder={language === 'zh' ? '快捷指令…' : 'Quick command…'}
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={quickInput}
                onChangeText={setQuickInput}
                onSubmitEditing={handleQuickSend}
                returnKeyType="send"
                blurOnSubmit
              />
              {(quickInput.trim().length > 0 || !!pillTranscript) && (
                <TouchableOpacity
                  style={styles.pillSendBtn}
                  onPress={quickInput.trim() ? handleQuickSend : handlePillSend}
                >
                  <Text style={styles.pillSendText}>⬆</Text>
                </TouchableOpacity>
              )}
            </View>
          </BlurView>
        </Animated.View>
      )}

      {/* Glow ring for non-idle */}
      {ballState !== 'idle' && (
        <View style={[styles.glowRing, { borderColor: borderColor + '50' }]} />
      )}

      {/* Orbiting Particles (thinking state) */}
      <OrbitingParticles active={ballState === 'thinking'} />

      {/* The Ball / Capsule */}
      <TouchableOpacity
        testID="voice-floating-ball-core"
        accessibilityLabel={`voice-floating-ball-core:${ballState}`}
        activeOpacity={0.85}
        disabled={!useDirectPressHandlers}
        onPress={useDirectPressHandlers ? handleTap : undefined}
        onLongPress={useDirectPressHandlers ? handleLongPress : undefined}
        delayLongPress={LONG_PRESS_DURATION}
      >
        <Animated.View
          style={[
            styles.ballBody,
            {
              width: morphWidth,
              height: BALL_SIZE,
              borderRadius: morphRadius,
              borderColor: borderColor + '60',
            },
          ]}
        >
          {/* Glassmorphism blur background */}
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 20}
            tint="dark"
            style={[StyleSheet.absoluteFill, { borderRadius: BALL_SIZE / 2, overflow: 'hidden' }]}
          />

          {/* Dark overlay for contrast */}
          <View style={[StyleSheet.absoluteFill, styles.ballOverlay]} />

          {/* Inner gradient core */}
          <Animated.View
            style={[styles.innerCore, { opacity: coreBreathAnim, transform: [{ scale: coreBreathAnim }] }]}
          >
            <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.innerCoreGradient} />
          </Animated.View>

          {/* Label — morph between sprite (idle) and capsule content (listening/speaking).
            * Sprint P-6: the `AX` text mark is replaced by the 13-form sprite
            * driven by the PetMode bus. Capsule mode still shows the brand
            * mark + waveform for clear voice-state feedback.
            */}
          {isCapsule ? (
            <View style={styles.capsuleContent}>
              <View style={styles.capsuleBrandSlot}>
                <PetSpriteImage sprite={petSprite} size={28} testID="floating-ball-sprite-capsule" />
              </View>
              <View style={styles.capsuleWaveRow}>
                {waveformAnims.slice(0, 5).map((anim, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.capsuleWaveBar,
                      { height: anim.interpolate({ inputRange: [0, 1], outputRange: [3, 16] }), backgroundColor: '#fff', opacity: 0.8 },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.capsuleStatusText}>
                {ballState === 'listening'
                  ? (language === 'zh' ? '聆听中' : 'Listening')
                  : ballState === 'speaking'
                  ? (language === 'zh' ? '回复中' : 'Speaking')
                  : (language === 'zh' ? '思考中' : 'Thinking')}
              </Text>
            </View>
          ) : (
            <PetSpriteImage sprite={petSprite} size={BALL_SIZE - 8} testID="floating-ball-sprite" />
          )}
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 10,
  },
  ballBody: {
    height: BALL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  ballOverlay: {
    backgroundColor: 'rgba(11, 18, 32, 0.55)',
    borderRadius: BALL_SIZE / 2,
  },
  innerCore: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
  },
  innerCoreGradient: {
    flex: 1,
    borderRadius: 9,
  },
  glowRing: {
    position: 'absolute',
    width: BALL_SIZE + 14,
    height: BALL_SIZE + 14,
    borderRadius: (BALL_SIZE + 14) / 2,
    borderWidth: 2,
    top: -7,
    alignSelf: 'center',
  },
  brandMark: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    zIndex: 1,
  },
  capsuleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    zIndex: 1,
  },
  capsuleBrand: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  capsuleBrandSlot: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
  },
  capsuleWaveBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  capsuleStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  pillPanel: {
    position: 'absolute',
    bottom: BALL_SIZE + 12,
    right: 0,
    width: PILL_WIDTH,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  pillBlur: {
    padding: 14,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pillTitle: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
  },
  pillCloseBtn: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 30,
    marginBottom: 8,
  },
  waveformBar: {
    width: 3.5,
    borderRadius: 2,
  },
  pillTranscript: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  quickInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  quickInput: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSendText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  resultCard: {
    position: 'absolute',
    top: BALL_SIZE + 10,
    right: 0,
    width: PILL_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  resultCardBlur: {
    padding: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  resultCardText: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  resultCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  resultActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  resultActionBtnPrimary: {
    backgroundColor: '#6C5CE7',
  },
  resultActionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  resultActionTextPrimary: {
    color: '#fff',
  },
});

export default GlobalFloatingBall;
