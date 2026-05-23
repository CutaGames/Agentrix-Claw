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
import { CompanionBall } from './CompanionBall';
import { ConversationBubble } from './ConversationBubble';
import { PetDetailSheet } from './PetDetailSheet';
import { Trust3SigningSheet } from './Trust3SigningSheet';
import { SkillInstallCard } from './SkillInstallCard';
import { WalletCapsule } from './WalletCapsule';
import { ApprovalAlertCapsule } from './ApprovalAlertCapsule';
import { VoiceGreetCapsule } from './VoiceGreetCapsule';
import { companionSheets } from './sheetRefRegistry';

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
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
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
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function CompanionLayer(props: CompanionLayerProps) {
  return (
    <CompanionErrorBoundary>
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

          Wave 17 hotfix — pass navigationRef through so CompanionBall can
          read state via the ref instead of useNavigationState (which
          throws when no Navigator subtree exists yet, e.g. SplashScreen). */}
      <CompanionBall
        navigationRef={props.navigationRef}
        onSingleTap={() => companionSheets.conversation.present({ autoActivateVoice: true })}
        onLongPress={() => companionSheets.petDetail.present()}
        onRightSwipe={() => companionSheets.conversation.present({ autoOpenCamera: true })}
      />

      {/* Bottom sheets — mounted permanently; their imperative present() /
          dismiss() APIs are stored in module-scope refs so any caller
          (deep-link handler, intent dispatcher, push notification) can
          invoke them without a hook. */}
      <ConversationBubble />
      <PetDetailSheet />
      <Trust3SigningSheet />
      <SkillInstallCard />

      {/* Transient capsule overlays — independent of the ball's internal
          legacy capsule rendering, driven entirely by companionEvents bus. */}
      <WalletCapsule />
      <ApprovalAlertCapsule />
      <VoiceGreetCapsule />

      {/* Phase 1 wave 6+ adds:
            - <SkillInstallCard ref={...} />           (T15)
            - <AmbientPresenceBridge />                (T12 + T13)
            - SkillInstallCard ref           (T14)
      */}
    </>
  );
}
