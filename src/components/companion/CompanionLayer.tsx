/**
 * CompanionLayer — global mount point for the P-9 Companion experience.
 *
 * Mounts INSIDE NavigationContainer but OUTSIDE all tab navigators. IMPORTANT:
 * children must NOT call `useNavigation()` / `useNavigationState()` here — those
 * hooks require a Stack/Tab navigator context which does NOT exist at this
 * sibling position and THROW on mount (this was the root cause of the long-
 * standing "dead companion ball": the throw was swallowed by the boundaries
 * below and the real ball replaced by the static fallback). All companion
 * components navigate via the shared `src/navigation/navigationRef` instead.
 *
 * The layer persists across tab switches with shared state. Spec
 * design.md §Components §1.
 *
 * Phase 1 wave 4+5 children:
 *   - <CompanionBall />         — the floating pet (T3 wrapper)
 *   - <ConversationBubble />    — single-tap → 65/100% sheet (T5)
 *   - <PetDetailSheet />        — long-press → 85% sheet (T6)
 *   - <Trust3SigningSheet />    — bus/imperative → 70% sheet (T7)
 *   - <WalletCapsule />         — wallet-delta event (T10.2)
 *   - <ApprovalAlertCapsule />  — approval-incoming event (T10.3)
 *   - <VoiceGreetCapsule />     — voice-greet event (T10.4)
 *
 * Future (wave 6+):
 *   - <SkillInstallCard />     (T15)
 *   - <AmbientPresenceBridge /> (T12 + T13)
 *
 * Wave 17 v3 (2026-05-23) — wraps the entire subtree in a local
 * ErrorBoundary that renders null on failure. Even if some descendant
 * accidentally calls a navigator-only hook (or anything else throws on
 * mount), the rest of the app keeps working. Companion is enhancement,
 * not a blocker — the user should never see "Reset App State" because
 * of a Companion bug.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Dimensions } from 'react-native';
import { CompanionBall } from './CompanionBall';
import { ConversationBubble } from './ConversationBubble';
import { PetDetailSheet } from './PetDetailSheet';
import { Trust3SigningSheet } from './Trust3SigningSheet';
import { SkillInstallCard } from './SkillInstallCard';
import { WalletCapsule } from './WalletCapsule';
import { ApprovalAlertCapsule } from './ApprovalAlertCapsule';
import { VoiceGreetCapsule } from './VoiceGreetCapsule';
import { companionSheets, conversationBubbleRef, petDetailSheetRef } from './sheetRefRegistry';
import { addVoiceDiagnostic } from '../../services/voiceDiagnostics';
import { useCompanionLayoutStore } from '../../stores/companionLayoutStore';

/**
 * Shared crash recorder for the companion boundaries. Writes to BOTH a
 * `globalThis` slot (cheap programmatic read) AND the persisted
 * voiceDiagnostics log (surfaced in the in-app Diagnostics viewer) so the
 * operator can read the actual mount-throw root cause ON DEVICE without a
 * remote debugger. This is the key to finally pinning down the
 * long-standing "ball is dead" report.
 */
function recordCompanionCrash(slot: string, error: Error, info: React.ErrorInfo) {
  const stack = info?.componentStack?.split('\n').slice(0, 6).join('\n');
  try {
    (globalThis as any).__companionBallError = {
      slot,
      message: error?.message,
      at: Date.now(),
      stack,
    };
    const all = ((globalThis as any).__companionChildErrors || {}) as Record<string, unknown>;
    all[slot] = { message: error?.message, at: Date.now() };
    (globalThis as any).__companionChildErrors = all;
  } catch {
    /* ignore */
  }
  try {
    addVoiceDiagnostic('companion-crash', slot, {
      message: error?.message,
      stack,
    });
  } catch {
    /* ignore */
  }
  // Best-effort remote telemetry so the actual mount-throw root cause is
  // visible server-side (in-app voiceDiagnostics are local-only). Fire-and-
  // forget; never let reporting throw into the boundary.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { API_BASE } = require('../../config/env') as { API_BASE: string };
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { useAuthStore } = require('../../stores/authStore') as typeof import('../../stores/authStore');
    const token = useAuthStore.getState?.().token;
    if (API_BASE && token) {
      void fetch(`${API_BASE}/voice/companion-crash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot, message: error?.message, stack, platform: 'mobile' }),
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

interface CompanionLayerProps {
  /**
   * Phase 1 placeholder — kept for future wave 6 sheet-driven navigation
   * shortcuts that may need direct access to the navigation root from
   * outside React (e.g. the Trust3 sheet driving an Inbox open after
   * sign success). Currently unused: each sheet captures its own
   * navigation context via useNavigation().
   */
  navigationRef?: any;
}

/**
 * Local ErrorBoundary scoped to the Companion subtree. We deliberately
 * silence-then-recover so a Companion render error never propagates to
 * the global AppErrorBoundary and shows the "Reset App State" screen.
 *
 * Examples of errors this catches:
 *   - "Couldn't get the navigation state. Is your component inside a
 *     navigator?" — if any descendant calls a navigator-only hook from
 *     a position outside any Navigator subtree.
 *   - Reanimated worklet errors triggered during initial mount.
 *   - Missing pet sprite errors.
 */
class CompanionErrorBoundary extends React.Component<
  { children: React.ReactNode; navigationRef?: any },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; navigationRef?: any }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to console so test environments can still spot it but the
    // user just loses the floating ball — they keep the rest of the app.
    console.warn(
      '[CompanionLayer] swallowed render error to keep app alive:',
      error?.message,
      info?.componentStack?.split('\n').slice(0, 4).join(' / '),
    );
    recordCompanionCrash('layer', error, info);
  }

  render() {
    // Wave 18 — instead of rendering null (which made the ball vanish with
    // zero user-visible signal whenever ANY descendant threw on mount),
    // fall back to a minimal always-tappable companion entry so the user
    // can still reach their pet. The full-featured ball returns next launch
    // once the transient error clears.
    if (this.state.failed) return <CompanionFallbackBall navigationRef={this.props.navigationRef} />;
    return this.props.children;
  }
}

/**
 * IsolatedBoundary — P-9 Q1 (2026-05-30).
 *
 * Wraps a SINGLE companion child and renders null on failure. This is the
 * fix for the "dead 🦊 ball" class of bugs:
 *
 *   Before Q1 the whole CompanionLayer subtree (ball + 4 sheets + 3
 *   capsules) lived under ONE CompanionErrorBoundary. If any single
 *   bottom-sheet threw on mount (e.g. a @gorhom/bottom-sheet ⇄ reanimated
 *   worklet hiccup), the boundary swapped EVERYTHING — including the
 *   otherwise-healthy ball — for the static fallback ball. Users then saw
 *   a 🦊 emoji that couldn't drag, didn't animate sprites, and only
 *   re-navigated on tap. Exactly "the ball is dead".
 *
 *   Now each child is isolated: a crashing sheet renders null but the ball
 *   keeps its full draggable + sprite-animated + mode-reactive behavior.
 */
class IsolatedBoundary extends React.Component<
  { children: React.ReactNode; label: string; fallback?: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; label: string; fallback?: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn(
      `[CompanionLayer] isolated child "${this.props.label}" failed (rest of companion stays alive):`,
      error?.message,
      info?.componentStack?.split('\n').slice(0, 4).join(' / '),
    );
    recordCompanionCrash(this.props.label, error, info);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/**
 * BallBoundary — like IsolatedBoundary but for the ball specifically.
 * If the full GlobalFloatingBall subtree throws on mount, we still want a
 * VISIBLE, usable companion entry rather than nothing — so we fall back to
 * CompanionFallbackBall (real idle sprite, tap → World) instead of null.
 * This is the safety net for the long-standing "ball throws on mount →
 * swallowed → user sees nothing / dead 🦊" report.
 */
class BallBoundary extends React.Component<
  { children: React.ReactNode; navigationRef?: any },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; navigationRef?: any }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn(
      '[CompanionLayer] ball subtree failed — showing fallback ball:',
      error?.message,
      info?.componentStack?.split('\n').slice(0, 4).join(' / '),
    );
    recordCompanionCrash('ball', error, info);
  }

  render() {
    if (this.state.failed) {
      return <CompanionFallbackBall navigationRef={this.props.navigationRef} />;
    }
    return this.props.children;
  }
}

export function CompanionLayer(props: CompanionLayerProps) {
  return (
    <CompanionErrorBoundary navigationRef={props.navigationRef}>
      <CompanionLayerContent navigationRef={props.navigationRef} />
    </CompanionErrorBoundary>
  );
}

function CompanionLayerContent(props: CompanionLayerProps) {
  return (
    <>
      {/* Floating ball — single-tap delegates to ConversationBubble.present(),
          long-press to PetDetailSheet.present() (handled internally by the
          ball wrapper via companionSheets imperative refs).

          Q1 — the ball is in its OWN BallBoundary: if the full ball subtree
          throws on mount (the long-standing "ball is dead" report), we fall
          back to a VISIBLE CompanionFallbackBall instead of letting the
          crash take down the whole companion layer. A sheet crash below can
          likewise never reach the ball. */}
      <BallBoundary navigationRef={props.navigationRef}>
        <CompanionBall
          navigationRef={props.navigationRef}
          onSingleTap={() => companionSheets.conversation.present({ autoActivateVoice: true })}
          onLongPress={() => companionSheets.petDetail.present()}
          onRightSwipe={() => companionSheets.conversation.present({ autoOpenCamera: true })}
        />
      </BallBoundary>

      {/* Bottom sheets — each isolated so one sheet's mount error doesn't
          cascade to the ball or the other sheets. Their imperative
          present() / dismiss() APIs are stored in module-scope refs so any
          caller (deep-link handler, intent dispatcher, push notification)
          can invoke them without a hook. */}
      <IsolatedBoundary label="conversation">
        <ConversationBubble />
      </IsolatedBoundary>
      <IsolatedBoundary label="petDetail">
        <PetDetailSheet />
      </IsolatedBoundary>
      <IsolatedBoundary label="trust3">
        <Trust3SigningSheet />
      </IsolatedBoundary>
      <IsolatedBoundary label="skillInstall">
        <SkillInstallCard />
      </IsolatedBoundary>

      {/* Transient capsule overlays — independent of the ball's internal
          legacy capsule rendering, driven entirely by companionEvents bus. */}
      <IsolatedBoundary label="walletCapsule">
        <WalletCapsule />
      </IsolatedBoundary>
      <IsolatedBoundary label="approvalCapsule">
        <ApprovalAlertCapsule />
      </IsolatedBoundary>
      <IsolatedBoundary label="voiceGreetCapsule">
        <VoiceGreetCapsule />
      </IsolatedBoundary>
    </>
  );
}

/**
 * CompanionFallbackBall — last-resort safe ball.
 *
 * Rendered by CompanionErrorBoundary only when the ENTIRE CompanionLayer
 * subtree throws (should be rare now that each child has its own
 * IsolatedBoundary). Q1 upgrade: render the real pet sprite (灵狐 idle)
 * instead of a generic emoji so even the degraded state is on-brand, and
 * long-press still routes to the pet detail surface.
 */
function CompanionFallbackBall({ navigationRef }: { navigationRef?: any }) {
  const goWorld = React.useCallback(() => {
    try {
      navigationRef?.current?.navigate?.('Main', { screen: 'World' });
    } catch {
      /* best-effort */
    }
  }, [navigationRef]);

  const openConversation = React.useCallback(() => {
    if (conversationBubbleRef.current) {
      companionSheets.conversation.present({ autoActivateVoice: true });
    } else {
      goWorld();
    }
  }, [goWorld]);

  const openDetail = React.useCallback(() => {
    if (petDetailSheetRef.current) {
      companionSheets.petDetail.present();
    } else {
      goWorld();
    }
  }, [goWorld]);

  // Draggable fallback: the static fallback ball was the actual "can't move"
  // bug — when the rich GlobalFloatingBall crashes on mount (navigator-hook
  // throw, asset failure, etc.) this fallback is what the user sees, and it had
  // no gesture handling. Give it the same drag + edge-snap + persistence as the
  // real ball so the visible ball is always movable regardless of the crash.
  const FALL_BALL = 48;
  const FALL_MARGIN = 16;
  const { width: screenW, height: screenH } = Dimensions.get('window');

  const initialPos = React.useRef(((): { x: number; y: number } => {
    try {
      const st = useCompanionLayoutStore.getState();
      const onLeft = st.lastCorner === 'top-left' || st.lastCorner === 'bottom-left';
      const x = onLeft ? FALL_MARGIN : screenW - FALL_BALL - FALL_MARGIN;
      const y = typeof st.y === 'number' && st.y > 0
        ? Math.max(60, Math.min(st.y, screenH - FALL_BALL - 100))
        : screenH - 200;
      return { x, y };
    } catch {
      return { x: screenW - FALL_BALL - FALL_MARGIN, y: screenH - 200 };
    }
  })()).current;

  const pan = React.useRef(new Animated.ValueXY(initialPos)).current;
  const dragging = React.useRef(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        dragging.current = false;
        longPressTimer.current = setTimeout(() => {
          if (!dragging.current) openDetail();
        }, 400);
        pan.extractOffset();
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5) {
          dragging.current = true;
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }
        Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(_, g);
      },
      onPanResponderRelease: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        pan.flattenOffset();
        const curX = (pan.x as any)._value ?? initialPos.x;
        const curY = (pan.y as any)._value ?? initialPos.y;
        const onLeft = curX < screenW / 2;
        const snapX = onLeft ? FALL_MARGIN : screenW - FALL_BALL - FALL_MARGIN;
        const clampedY = Math.max(60, Math.min(curY, screenH - FALL_BALL - 100));
        Animated.spring(pan, { toValue: { x: snapX, y: clampedY }, useNativeDriver: false, friction: 7 }).start();
        try {
          const corner = `${clampedY < screenH / 2 ? 'top' : 'bottom'}-${onLeft ? 'left' : 'right'}` as
            | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
          const st = useCompanionLayoutStore.getState();
          st.setLastCorner(corner);
          st.setPosition(snapX, clampedY);
        } catch {
          /* best-effort */
        }
        if (!dragging.current) openConversation();
        dragging.current = false;
      },
    }),
  ).current;

  // Render the real idle sprite as a SINGLE icon. If the sprite render
  // throws (asset/native issue), the IsolatedBoundary swaps to the 🦊 emoji
  // — they never stack, so the fallback ball shows exactly one icon.
  return (
    <Animated.View
      style={[
        fallbackStyles.wrap,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={fallbackStyles.ball} accessibilityLabel="companion" testID="companion-fallback-ball">
        <IsolatedBoundary
          label="fallback-sprite"
          fallback={<Text style={fallbackStyles.emoji}>🦊</Text>}
        >
          <FallbackSprite />
        </IsolatedBoundary>
      </View>
    </Animated.View>
  );
}

/** Lazy sprite render kept separate so a require/render failure is isolated. */
function FallbackSprite() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { PetSpriteImage } = require('../PetSpriteImage') as typeof import('../PetSpriteImage');
  return <PetSpriteImage sprite="idle" size={40} testID="companion-fallback-sprite" />;
}

const fallbackStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
    elevation: 10,
  },
  ball: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  emoji: { fontSize: 24 },
});
