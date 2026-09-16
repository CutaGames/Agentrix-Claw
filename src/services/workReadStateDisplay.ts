/**
 * Read-state → display semantics — MTR-R07.2/.3 / M1.2.2.
 *
 * design §10.1 picks option (b): the logic worth asserting is lifted out of
 * the screens into a pure function that the current jest `testMatch` can
 * actually run. The screens keep only layout.
 *
 * The eight states are the `DeveloperWorkspaceReadState` contract (design §5).
 * They are reproduced here as a display-layer input domain, not as a second
 * copy of canonical data: nothing in this module fetches, caches or decides
 * anything a backend owns.
 */

export const WORK_READ_STATES = [
  'ready',
  'partial',
  'unavailable',
  'offline_stale',
  'unknown',
  'unauthorized',
  'unsupported',
  'error',
] as const;

export type WorkReadState = (typeof WORK_READ_STATES)[number];

export type WorkReadStateTone = 'ready' | 'caution' | 'blocked' | 'neutral';

export type WorkReadStateNextAction =
  | 'none'
  | 'retry'
  | 'reconnect'
  | 'sign_in'
  | 'open_on_web'
  | 'contact_support';

export interface WorkReadStateInput {
  readonly state: unknown;
  readonly capability?: string;
  readonly reason?: string;
  readonly capturedAt?: string;
}

export interface WorkReadStateDisplay {
  readonly state: WorkReadState;
  readonly tone: WorkReadStateTone;
  /** Whether any payload may be rendered at all. */
  readonly showsData: boolean;
  /** Whether the age of the data must be shown next to it. */
  readonly showsStaleness: boolean;
  readonly nextAction: WorkReadStateNextAction;
  /** i18n key suffix; copy lives with the screen. */
  readonly messageKey: string;
  /** MTR-R07.3 — `unavailable` shows the capability name and reason verbatim. */
  readonly capability?: string;
  readonly reason?: string;
  readonly capturedAt?: string;
  /** True when the reduction had to fall back because the input was not a known state. */
  readonly fellBack: boolean;
}

type Rule = Omit<WorkReadStateDisplay, 'state' | 'capability' | 'reason' | 'capturedAt' | 'fellBack'>;

const RULES: Readonly<Record<WorkReadState, Rule>> = Object.freeze({
  ready: { tone: 'ready', showsData: true, showsStaleness: false, nextAction: 'none', messageKey: 'readState.ready' },
  partial: { tone: 'caution', showsData: true, showsStaleness: true, nextAction: 'retry', messageKey: 'readState.partial' },
  unavailable: { tone: 'blocked', showsData: false, showsStaleness: false, nextAction: 'open_on_web', messageKey: 'readState.unavailable' },
  offline_stale: { tone: 'caution', showsData: true, showsStaleness: true, nextAction: 'reconnect', messageKey: 'readState.offlineStale' },
  unknown: { tone: 'blocked', showsData: false, showsStaleness: false, nextAction: 'retry', messageKey: 'readState.unknown' },
  unauthorized: { tone: 'blocked', showsData: false, showsStaleness: false, nextAction: 'sign_in', messageKey: 'readState.unauthorized' },
  unsupported: { tone: 'neutral', showsData: false, showsStaleness: false, nextAction: 'open_on_web', messageKey: 'readState.unsupported' },
  error: { tone: 'blocked', showsData: false, showsStaleness: false, nextAction: 'retry', messageKey: 'readState.error' },
});

export function isWorkReadState(value: unknown): value is WorkReadState {
  return typeof value === 'string' && (WORK_READ_STATES as readonly string[]).includes(value);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Reduce a read-state to what the UI is allowed to show.
 *
 * An unrecognised state reduces to `unknown` rather than `ready`: a screen
 * that cannot name its own state must not render payload.
 */
export function reduceWorkReadState(input: WorkReadStateInput): WorkReadStateDisplay {
  const known = isWorkReadState(input?.state);
  const state: WorkReadState = known ? (input.state as WorkReadState) : 'unknown';
  const rule = RULES[state];
  const capability = cleanText(input?.capability);
  const reason = cleanText(input?.reason);

  return {
    state,
    ...rule,
    // An `unavailable` card with no capability/reason is indistinguishable
    // from a blank screen, which MTR-R07.3 forbids — say so instead.
    ...(state === 'unavailable' && !reason ? { reason: 'reason_not_reported' } : { reason }),
    ...(state === 'unavailable' && !capability
      ? { capability: 'capability_not_reported' }
      : { capability }),
    capturedAt: rule.showsStaleness ? cleanText(input?.capturedAt) : undefined,
    fellBack: !known,
  };
}

/** True when the surface may render cached or partial payload. */
export function mayRenderPayload(input: WorkReadStateInput): boolean {
  return reduceWorkReadState(input).showsData;
}
