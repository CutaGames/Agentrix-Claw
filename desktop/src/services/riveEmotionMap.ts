import type { PetEmotion as PresencePetEmotion } from "../../../shared/types/agentrix-presence";

/**
 * Rive emotion ↔ State Machine input mapping — Phase 2 W2 RD-T2.1.
 *
 * Single source of truth for the desktop / mobile / web Rive runtime: every
 * pet's `.riv` asset must expose a State Machine named `PetSM` with one
 * trigger per emotion. When the emotion changes (via PetState event), the
 * renderer fires the corresponding trigger. Desktop presence events still use
 * the shared PetState emotion contract, so we bridge those values onto the
 * canonical authoring emotions here.
 *
 * 10 emotions taken from the canonical PRD (P0-2 baseline):
 *   neutral · happy · sad · angry · surprised · sleepy ·
 *   excited · curious · loving · embarrassed
 */

export type PetEmotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'sleepy'
  | 'excited'
  | 'curious'
  | 'loving'
  | 'embarrassed';

export const PET_EMOTIONS: readonly PetEmotion[] = [
  'neutral', 'happy', 'sad', 'angry', 'surprised',
  'sleepy', 'excited', 'curious', 'loving', 'embarrassed',
] as const;

export const RIVE_STATE_MACHINE_NAME = 'PetSM';

const PRESENCE_TO_RIVE_EMOTION: Record<PresencePetEmotion, PetEmotion> = {
  calm: 'neutral',
  happy: 'happy',
  excited: 'excited',
  focused: 'curious',
  concerned: 'sad',
  tired: 'sleepy',
  love: 'loving',
  sad: 'sad',
  angry: 'angry',
  sleepy: 'sleepy',
};

/**
 * Maps each emotion to its Rive trigger input name (camelCase, matches
 * authoring convention in the .riv file). This is the contract between
 * pet authors uploading new Rive assets and the runtime.
 */
export const RIVE_EMOTION_TRIGGERS: Record<PetEmotion, string> = {
  neutral: 'toNeutral',
  happy: 'toHappy',
  sad: 'toSad',
  angry: 'toAngry',
  surprised: 'toSurprised',
  sleepy: 'toSleepy',
  excited: 'toExcited',
  curious: 'toCurious',
  loving: 'toLoving',
  embarrassed: 'toEmbarrassed',
};

/** Reverse lookup: trigger name → emotion (for telemetry / replay). */
export const TRIGGER_TO_EMOTION: Record<string, PetEmotion> = Object.fromEntries(
  Object.entries(RIVE_EMOTION_TRIGGERS).map(([emo, trig]) => [trig, emo as PetEmotion]),
) as Record<string, PetEmotion>;

export interface RiveTriggerInputLike {
  name: string;
  fire(): void;
}

export interface FireRiveEmotionResult {
  resolvedEmotion: PetEmotion;
  triggerName: string;
  fired: boolean;
}

export function resolveRiveEmotion(emotion: string | undefined | null): PetEmotion {
  if (!emotion) return 'neutral';
  if (emotion in PRESENCE_TO_RIVE_EMOTION) {
    return PRESENCE_TO_RIVE_EMOTION[emotion as PresencePetEmotion];
  }
  if ((PET_EMOTIONS as readonly string[]).includes(emotion)) {
    return emotion as PetEmotion;
  }
  return 'neutral';
}

/**
 * Returns the trigger name for a given emotion. Falls back to the neutral
 * trigger for unknown / undefined input — never throws, since renderers
 * may receive emotions from older / newer pet versions during rollout.
 */
export function emotionTrigger(emotion: string | undefined | null): string {
  return RIVE_EMOTION_TRIGGERS[resolveRiveEmotion(emotion)];
}

/**
 * Performance budget — soft target per RD-T2.2/2.3/2.4.
 * Renderers SHOULD log a warning when transitionMs exceeds this.
 */
export const RIVE_EMOTION_TRANSITION_BUDGET_MS = 200;

export function fireRiveEmotionTrigger(
  inputs: Iterable<RiveTriggerInputLike>,
  emotion: string | undefined | null,
): FireRiveEmotionResult {
  const resolvedEmotion = resolveRiveEmotion(emotion);
  const triggerName = RIVE_EMOTION_TRIGGERS[resolvedEmotion];
  for (const input of inputs) {
    if (input.name === triggerName) {
      input.fire();
      return { resolvedEmotion, triggerName, fired: true };
    }
  }
  return { resolvedEmotion, triggerName, fired: false };
}

export function measureRiveTransitionBudget(
  startedAtMs: number,
  nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  logger: Pick<Console, 'warn'> = console,
): number {
  const transitionMs = Math.max(0, nowMs - startedAtMs);
  if (transitionMs > RIVE_EMOTION_TRANSITION_BUDGET_MS) {
    logger.warn(
      `[PetRive] emotion transition exceeded ${RIVE_EMOTION_TRANSITION_BUDGET_MS}ms budget (${Math.round(transitionMs)}ms)`,
    );
  }
  return transitionMs;
}
