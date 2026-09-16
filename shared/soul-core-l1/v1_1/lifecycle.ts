/**
 * Soul Core L1 v1.1 · Lifecycle state machine + monotonic counter + external revoked veto (T15 / W7).
 *
 * States: manufactured → factory_personalized → user_activated → {frozen, recovery_pending} → retired.
 * `retired` is terminal and irreversible (all signing/config APDUs return CARD_RETIRED).
 * External Trust Registry `revoked` overrides ANY non-retired local availability claim (Property 13):
 * an offline passive card cannot receive a cloud freeze in real time, so Authority/4337 must block
 * first and the card syncs frozen/recovery_pending next time it is present.
 *
 * Evidence level: simulator / protocol_only. lifecycleCounter is strictly monotonic (anti-rollback);
 * on-card power-cut atomicity is `development_card` evidence and is physically blocked here.
 */
import { digestHex } from './canonical';

export const LIFECYCLE_STATES = [
  'manufactured',
  'factory_personalized',
  'user_activated',
  'frozen',
  'recovery_pending',
  'retired',
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const LIFECYCLE_REJECT_CODES = [
  'lifecycle-invalid-transition',
  'lifecycle-counter-not-monotonic',
  'card-retired',
  'card-revoked',
] as const;
export type LifecycleRejectCode = (typeof LIFECYCLE_REJECT_CODES)[number];

/** Allowed forward transitions (design §4 state diagram). `retired` is terminal. */
export const LIFECYCLE_TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
  manufactured: ['factory_personalized'],
  factory_personalized: ['user_activated'],
  user_activated: ['frozen', 'recovery_pending', 'retired'],
  frozen: ['user_activated', 'recovery_pending', 'retired'],
  recovery_pending: ['retired'],
  retired: [],
};

export interface LifecycleSnapshot {
  state: LifecycleState;
  /** Strictly monotonic; every applied transition increments it. */
  lifecycleCounter: number;
  lastTransitionDigest?: string;
}

export interface LifecycleTransitionInput {
  to: LifecycleState;
  /** Must be exactly current.lifecycleCounter (CAS); result is +1. */
  expectedCounter: number;
  actor: string;
  reasonCode?: string;
  occurredAt: string;
}

export type LifecycleResult =
  | { ok: true; snapshot: LifecycleSnapshot }
  | { ok: false; reason: LifecycleRejectCode; from?: LifecycleState };

export function isKnownLifecycleState(state: string): state is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(state);
}

export function isRetired(state: LifecycleState): boolean {
  return state === 'retired';
}

/**
 * Effective operability: a card is only operable when its local state is not retired AND the
 * external Trust Registry has not revoked it. `revoked` always vetoes (Property 13).
 */
export function isOperable(state: LifecycleState, externalRevoked: boolean): boolean {
  if (externalRevoked) return false;
  return state !== 'retired';
}

/**
 * Apply a lifecycle transition. Fail-closed on: unknown target, illegal transition, non-monotonic
 * counter (anti-rollback), or acting on a retired/revoked card.
 */
export function applyLifecycleTransition(
  current: LifecycleSnapshot,
  input: LifecycleTransitionInput,
  externalRevoked = false,
): LifecycleResult {
  if (externalRevoked) return { ok: false, reason: 'card-revoked', from: current.state };
  if (current.state === 'retired') return { ok: false, reason: 'card-retired', from: current.state };
  if (!isKnownLifecycleState(input.to)) return { ok: false, reason: 'lifecycle-invalid-transition', from: current.state };
  if (input.expectedCounter !== current.lifecycleCounter) {
    return { ok: false, reason: 'lifecycle-counter-not-monotonic', from: current.state };
  }
  const allowed = LIFECYCLE_TRANSITIONS[current.state] ?? [];
  if (!allowed.includes(input.to)) return { ok: false, reason: 'lifecycle-invalid-transition', from: current.state };

  const lifecycleCounter = current.lifecycleCounter + 1;
  const lastTransitionDigest = digestHex({
    from: current.state,
    to: input.to,
    lifecycleCounter,
    actor: input.actor,
    reasonCode: input.reasonCode ?? null,
    occurredAt: input.occurredAt,
  });
  return { ok: true, snapshot: { state: input.to, lifecycleCounter, lastTransitionDigest } };
}

/**
 * Whether a signing/config APDU may run given lifecycle + external revoked. Retired or revoked →
 * blocked. Only `user_activated` permits full operation; `frozen`/`recovery_pending` permit only
 * the recovery/lifecycle APDUs (enforced together with Profile capability elsewhere).
 */
export function canOperate(
  state: LifecycleState,
  externalRevoked: boolean,
): { allowed: boolean; reason?: LifecycleRejectCode } {
  if (externalRevoked) return { allowed: false, reason: 'card-revoked' };
  if (state === 'retired') return { allowed: false, reason: 'card-retired' };
  return { allowed: true };
}
