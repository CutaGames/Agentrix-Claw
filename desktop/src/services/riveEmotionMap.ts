/**
 * Rive emotion ↔ State Machine input mapping — Phase 2 W2 RD-T2.1.
 *
 * Single source of truth for the desktop / mobile / web Rive runtime: every
 * pet's `.riv` asset must expose a State Machine named `PetSM` with one
 * trigger per emotion. When the emotion changes (via PetState event), the
 * renderer fires the corresponding trigger.
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

/**
 * Returns the trigger name for a given emotion. Falls back to the neutral
 * trigger for unknown / undefined input — never throws, since renderers
 * may receive emotions from older / newer pet versions during rollout.
 */
export function emotionTrigger(emotion: string | undefined | null): string {
  if (!emotion) return RIVE_EMOTION_TRIGGERS.neutral;
  return RIVE_EMOTION_TRIGGERS[emotion as PetEmotion] ?? RIVE_EMOTION_TRIGGERS.neutral;
}

/**
 * Performance budget — soft target per RD-T2.2/2.3/2.4.
 * Renderers SHOULD log a warning when transitionMs exceeds this.
 */
export const RIVE_EMOTION_TRANSITION_BUDGET_MS = 200;
