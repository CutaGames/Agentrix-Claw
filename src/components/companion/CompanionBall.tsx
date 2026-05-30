/**
 * CompanionBall — P-9 Companion Redesign T3.
 *
 * Phase 1 strategy: rather than rewriting the 1084-line GlobalFloatingBall
 * (which has 8 months of stable PanResponder / wake-word / capsule
 * battle-tested logic), CompanionBall is a thin **wrapper** that:
 *
 *   1. Subscribes to `companionEvents` to drive 8-mode sprite/border state
 *      that GlobalFloatingBall doesn't know about.
 *   2. Locks dragging when mode === 'signing' (R1.11) by intercepting the
 *      navigation context and toggling pointerEvents.
 *   3. Honors low-power mode (R1.10) via `expo-battery`.
 *   4. Hides itself in Summon tab + AgentChat / VoiceChat / ClawSettings
 *      via a deeper hideOnScreens check than GlobalFloatingBall's
 *      built-in (R1.2).
 *   5. Wires single-tap / long-press / right-swipe to CompanionLayer's
 *      sheet refs (delivered as props from CompanionLayer).
 *
 * The actual 56pt visual upgrade + Capsule overlays + Voice_Greet bubble
 * happen INSIDE GlobalFloatingBall.tsx in a follow-up pass (T3.2 fast
 * path) once we have UI screenshot feedback. For now we just put the
 * shell in place and verify cross-tab visibility + lock work.
 *
 * Spec: requirements.md R1.1-R1.12, design.md §Components/Core 1.
 */
import React, { useEffect, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import * as Battery from 'expo-battery';
import { GlobalFloatingBall } from '../GlobalFloatingBall';
import { useCompanionLayoutStore } from '../../stores/companionLayoutStore';
import { companionEvents } from '../../services/companionEvents.service';
import { subscribeCompanionMode, getCompanionMode } from '../../services/petMode';
import { COMPANION_MODE_COLOR, COMPANION_MODE_PULSES } from '../../services/petMode';
import type { CompanionMode } from '../../services/petMode';
import { useActivePet } from '../../services/activePet.service';

interface CompanionBallProps {
  /** Optional callback invoked on single-tap (default: navigate to AgentChat). */
  onSingleTap?: () => void;
  /** Optional callback invoked on long-press (default: open PetDetailSheet). */
  onLongPress?: () => void;
  /** Optional callback invoked on right-swipe (default: open camera → Conversation). */
  onRightSwipe?: () => void;
  /**
   * Wave 17 hotfix — caller-provided NavigationContainerRef so we can
   * read root state without `useNavigationState` (which throws when no
   * Navigator is mounted, e.g. during SplashScreen or auth flip).
   * The ref is created at App.tsx module scope so it survives any
   * remount.
   */
  navigationRef?: any;
}

/**
 * Tabs where the ball IS visible. Anything not in this list (Summon,
 * AgentChat, VoiceChat, ClawSettings, Onboarding, etc.) hides it.
 *
 * The check resolves the deepest active route name across nested
 * navigators because RN Navigation's currentRoute is at the leaf.
 */
const VISIBLE_TAB_ROOTS = new Set(['World', 'Plaza', 'Me']);

function resolveDeepRoute(state: any): string {
  if (!state) return '';
  let route = state.routes?.[state.index];
  for (let depth = 0; depth < 6; depth++) {
    if (!route?.state?.routes) break;
    const nested = route.state;
    route = nested.routes[nested.index];
  }
  return route?.name || '';
}

function resolveTopTab(state: any): string {
  if (!state) return '';
  // The Main tab navigator sits below Root. Walk one level into Main.
  const main = state.routes?.find((r: any) => r.name === 'Main');
  if (!main?.state) {
    // Direct case — the very top might already be the tab navigator.
    const r = state.routes?.[state.index];
    return r?.name || '';
  }
  const topTab = main.state.routes[main.state.index];
  return topTab?.name || '';
}

const HIDE_ON_DEEP_ROUTES = new Set([
  'AgentChat',
  'VoiceChat',
  'ClawSettings',
]);

export function CompanionBall(props: CompanionBallProps) {
  // Wave 17 hotfix — read navigation state via the navigation ref instead
  // of useNavigationState. The hook throws "Couldn't get the navigation
  // state. Is your component inside a navigator?" when no Navigator is
  // mounted yet (cold launch SplashScreen, auth flip, E2E surrogate
  // apps). Reading the ref is safe — `current` may be null which we
  // handle with the nullish-coalescing fallback below.
  //
  // We poll the ref via a state subscription set up in useEffect so the
  // ball repaints on tab changes. The state listener is wired in
  // App.tsx via navigationRef.addListener('state', ...).
  const [navState, setNavState] = useState<any>(() => {
    try {
      return props.navigationRef?.current?.getRootState?.() ?? null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const tryAttach = () => {
      const ref = props.navigationRef?.current;
      if (!ref?.addListener) return false;
      // Poll once for initial state in case it changed between mount and now.
      try {
        const initial = ref.getRootState?.();
        if (initial && !cancelled) setNavState(initial);
      } catch {
        /* ignore */
      }
      // Subscribe for future tab changes.
      unsubscribe = ref.addListener('state', () => {
        try {
          if (!cancelled) setNavState(ref.getRootState());
        } catch {
          /* ignore — ref unmounted between calls */
        }
      });
      return true;
    };

    // Try to attach immediately. If the ref isn't ready yet (cold launch
    // SplashScreen → NavigationContainer not mounted), poll every 200ms
    // until it is. This solves the "ball never appears" bug where the
    // initial useState read got null and addListener was never wired.
    if (!tryAttach()) {
      pollTimer = setInterval(() => {
        if (cancelled) return;
        if (tryAttach() && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      try {
        unsubscribe?.();
      } catch {
        /* ignore */
      }
    };
  }, [props.navigationRef]);

  const layoutStore = useCompanionLayoutStore();
  const activePet = useActivePet();

  const topTab = resolveTopTab(navState);
  const deepRoute = resolveDeepRoute(navState);

  // Wave 17 v4 — until the navigationRef has hydrated (navState is null),
  // optimistically assume the user is on the default World tab so the
  // ball shows up immediately on cold launch. Once nav state arrives,
  // VISIBLE_TAB_ROOTS / HIDE_ON_DEEP_ROUTES filtering kicks in normally.
  const tabAllowsBall = navState == null ? true : VISIBLE_TAB_ROOTS.has(topTab);
  const deepBlocks = HIDE_ON_DEEP_ROUTES.has(deepRoute);
  const visible = tabAllowsBall && !deepBlocks;

  // Track current CompanionMode for visual state (border color / lock).
  const [mode, setMode] = useState<CompanionMode>(getCompanionMode());
  useEffect(() => subscribeCompanionMode((m) => setMode(m)), []);

  // Lock the ball during signing — overlay a transparent View that
  // captures touches before they reach GlobalFloatingBall's PanResponder.
  // Cheap + safe: doesn't break inner state, just suspends interaction.
  useEffect(() => {
    layoutStore.setLocked(mode === 'signing');
    // Cleanup: ensure unlock on unmount so refresh doesn't strand the lock.
    return () => layoutStore.setLocked(false);
  }, [mode, layoutStore]);

  // Detect low-power mode for sprite fps drop (R1.10). Battery API may be
  // unavailable on some emulators / iOS dev builds; default to false.
  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    (async () => {
      try {
        const status = await Battery.getPowerStateAsync();
        if (!cancelled) layoutStore.setLowPower(!!status.lowPowerMode);
        const sub = Battery.addLowPowerModeListener((s) => {
          if (!cancelled) layoutStore.setLowPower(!!s.lowPowerMode);
        });
        removeListener = () => sub.remove();
      } catch {
        // expo-battery is unavailable; default to off
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [layoutStore]);

  // Emit periodic mount diagnostic so the R12.2 missing-ball watchdog
  // can fire if the ball stops mounting on a tab.
  useEffect(() => {
    if (!visible) return;
    companionEvents.emit({
      type: 'mode-changed',
      from: mode,
      to: mode,
      source: `mount:${topTab}`,
    });
    // Fire-and-forget — logged to voiceDiagnostics via emit() side-effect.
  }, [visible, topTab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Render legacy ball — its existing internal logic handles drag,
          tap, long-press, wake-word, capsule animations, and pet sprite
          rendering. We only add a P-9 lock overlay on top when signing.

          P-9 wave 4 (T3.3 + T5.6 + T6.9): single-tap and long-press are
          intercepted via the new override props. When set, single-tap
          surfaces the ConversationBubble (instead of navigating to
          AgentChat), and long-press surfaces the PetDetailSheet
          (instead of expanding the legacy quick-input pill). */}
      <GlobalFloatingBall
        onVoiceActivate={props.onSingleTap}
        onSingleTapOverride={props.onSingleTap}
        onLongPressOverride={props.onLongPress}
        companionModeColor={mode === 'companion' ? undefined : COMPANION_MODE_COLOR[mode]}
        companionModePulse={COMPANION_MODE_PULSES[mode]}
        spriteClan={activePet.clan}
        navigationRef={props.navigationRef}
      />

      {/* P-9 signing lock — transparent overlay that absorbs touches when
          mode is 'signing'. Positioned over the entire screen (not just
          the ball) because we want to prevent ALL interaction during
          mpc-wallet biometric prompt. */}
      {layoutStore.isLocked && (
        <View
          style={[StyleSheet.absoluteFillObject, styles.signingLock]}
          pointerEvents="auto"
          testID="companion-ball-signing-lock"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  signingLock: {
    // No background — fully transparent so user still sees the
    // Trust3SigningSheet that's open above. We only block drag/tap.
    backgroundColor: 'transparent',
  },
});
