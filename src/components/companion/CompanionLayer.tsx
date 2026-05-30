/**
 * CompanionLayer — global mount point for the P-9 Companion experience.
 *
 * Mounts INSIDE NavigationContainer (so children can call useNavigation),
 * but OUTSIDE all tab navigators. Note: useNavigationState is NOT safe
 * here — its NavigationStateListenerContext is provided by individual
 * Navigators (Stack/Tab), not NavigationContainer, so any direct usage
 * inside this layer crashes cold launch with "Couldn't get the navigation
 * state. Is your component inside a navigator?". CompanionBall +
 * GlobalFloatingBall both read root state via the navigationRef (wave 17
 * hotfix) to bypass that requirement entirely.
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
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CompanionBall } from './CompanionBall';
import { ConversationBubble } from './ConversationBubble';
import { PetDetailSheet } from './PetDetailSheet';
import { Trust3SigningSheet } from './Trust3SigningSheet';
import { SkillInstallCard } from './SkillInstallCard';
import { WalletCapsule } from './WalletCapsule';
import { ApprovalAlertCapsule } from './ApprovalAlertCapsule';
import { VoiceGreetCapsule } from './VoiceGreetCapsule';
import { companionSheets } from './sheetRefRegistry';
import { addVoiceDiagnostic } from '../../services/voiceDiagnostics';

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
  { children: React.ReactNode; label: string },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; label: string }) {
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
    if (this.state.failed) return null;
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

  // Long-press still tries to open the PetDetailSheet via the imperative
  // registry (it lives in its own IsolatedBoundary, so it may still be
  // alive even if the ball subtree crashed). Falls back to navigating to
  // World if the sheet isn't mounted.
  const openDetail = React.useCallback(() => {
    try {
      companionSheets.petDetail.present();
    } catch {
      goWorld();
    }
  }, [goWorld]);

  // Try to render the real idle sprite; if even that throws (asset/render
  // issue) the inner boundary drops to the 🦊 emoji so we never crash.
  return (
    <View style={fallbackStyles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={fallbackStyles.ball}
        onPress={goWorld}
        onLongPress={openDetail}
        delayLongPress={400}
        activeOpacity={0.8}
        accessibilityLabel="companion"
        testID="companion-fallback-ball"
      >
        {/* Emoji sits behind the sprite as the absolute last resort: if the
            sprite render throws, the IsolatedBoundary renders null and this
            🦊 shows through instead of an empty ball. */}
        <Text style={fallbackStyles.emoji}>🦊</Text>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <IsolatedBoundary label="fallback-sprite">
            <View style={fallbackStyles.spriteCenter}>
              <FallbackSprite />
            </View>
          </IsolatedBoundary>
        </View>
      </TouchableOpacity>
    </View>
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
    right: 16,
    bottom: 120,
    zIndex: 9999,
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
  spriteCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
