/**
 * CompanionLayer — global mount point for the P-9 Companion experience.
 *
 * Mounts INSIDE NavigationContainer (so children can call useNavigation /
 * useNavigationState), but OUTSIDE all tab navigators (so it persists
 * across tab switches with shared state). Spec design.md §Components §1.
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

export function CompanionLayer(_props: CompanionLayerProps) {
  return (
    <>
      {/* Floating ball — single-tap delegates to ConversationBubble.present(),
          long-press to PetDetailSheet.present() (handled internally by the
          ball wrapper via companionSheets imperative refs). */}
      <CompanionBall
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
