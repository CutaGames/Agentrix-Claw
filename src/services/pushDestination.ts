/**
 * Push destination resolution — MTR-R04.2 / M0.4.2.
 *
 * Pure function: notification `data` payload in, canonical destination or a
 * typed `destination-error` out. Lives in `src/services/` so it falls inside
 * the jest `testMatch` the project actually runs (design §10.1 option (b)).
 *
 * It deliberately does NOT import `expo-notifications`, React Navigation or
 * any feature flag: the caller (`src/app/pushRouting.ts`) owns the side
 * effects, this module owns the decision.
 */

export const PUSH_NOTIFICATION_TYPES = [
  'incoming_call',
  'approval_required',
  'twin_critical',
  'twin_review_required',
  'agenda_reminder',
  'handoff_ready',
] as const;

export type PushNotificationType = (typeof PUSH_NOTIFICATION_TYPES)[number];

/**
 * Types that only ever existed in the retired `src/services/notifications.ts`
 * module. Nothing ever created an Android channel for them and their old
 * destinations (`Airdrop` / `AutoEarn` / `Activity` / `TaskMarket` /
 * `BudgetPools` / `Settlements` / `Home`) are not in the current IA, so what
 * migrates here is the *semantics*, not a running behaviour (design §6).
 */
export const RETIRED_PUSH_NOTIFICATION_TYPES = [
  'airdrop_available',
  'airdrop_claimed',
  'earning_received',
  'payment_received',
  'payment_sent',
  'task_assigned',
  'task_completed',
  'milestone_approved',
  'settlement_ready',
] as const;

export type RetiredPushNotificationType = (typeof RETIRED_PUSH_NOTIFICATION_TYPES)[number];

/**
 * Product surfaces, not navigator route names. The IA still moves under us
 * (M1.4), and a push payload must not encode which navigator is mounted.
 */
export type PushDestinationSurface =
  | 'call_ringing'
  | 'work_inbox_approval'
  | 'work_inbox_twin_review'
  | 'work_agenda_today'
  | 'work_handoff'
  | 'work_receipt'
  | 'twin_status_card'
  | 'economy_orders';

export type PushDestinationErrorReason =
  | 'unknown_notification_type'
  | 'legacy_route_retired'
  | 'missing_required_ref'
  | 'invalid_payload';

export interface PushDestinationParams {
  readonly callSessionRef?: string;
  readonly approvalRef?: string;
  readonly twinProfileRef?: string;
  readonly reviewBatchRef?: string;
  readonly scheduleItemRef?: string;
  readonly handoffRef?: string;
  readonly risk?: PushRisk;
  readonly expiresAt?: string;
  readonly reasonCode?: string;
  readonly count?: number;
}

export type PushRisk = 'low' | 'medium' | 'high' | 'unknown';

export type PushDestination =
  | {
    readonly ok: true;
    readonly type: PushNotificationType | RetiredPushNotificationType;
    readonly surface: PushDestinationSurface;
    readonly params: PushDestinationParams;
  }
  | {
    readonly ok: false;
    readonly reason: PushDestinationErrorReason;
    /** Echoed back for the destination-error screen; never rendered as content. */
    readonly type?: string;
  };

/** `type` → Android channel. Channels are created in `src/app/pushRouting.ts`. */
export const PUSH_TYPE_TO_CHANNEL: Readonly<Record<PushNotificationType, string>> = Object.freeze({
  incoming_call: 'calls',
  approval_required: 'approvals',
  twin_critical: 'twin_critical',
  twin_review_required: 'twin_review',
  agenda_reminder: 'agenda',
  handoff_ready: 'handoff',
});

const RETIRED_TYPE_TO_SURFACE: Readonly<
  Record<RetiredPushNotificationType, PushDestinationSurface | null>
> = Object.freeze({
  airdrop_available: null,
  airdrop_claimed: null,
  earning_received: 'economy_orders',
  payment_received: 'economy_orders',
  payment_sent: 'economy_orders',
  task_assigned: 'work_inbox_approval',
  task_completed: 'work_inbox_approval',
  milestone_approved: 'work_receipt',
  settlement_ready: 'economy_orders',
});

const MAX_REF_LENGTH = 256;
// Opaque refs only: no path separators, so a ref can never be mistaken for
// (or smuggle) a route or a URL when it is echoed into navigation params.
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const RISK_VALUES: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'unknown']);

function readRef(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_REF_LENGTH || !SAFE_REF.test(trimmed)) return undefined;
  return trimmed;
}

function readExpiry(data: Record<string, unknown>): string | undefined {
  const value = data.expiresAt;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) return undefined;
  return trimmed;
}

/** Unknown / missing risk resolves to `unknown`, which callers fail closed on. */
function readRisk(data: Record<string, unknown>): PushRisk {
  const value = data.risk;
  return typeof value === 'string' && RISK_VALUES.has(value) ? (value as PushRisk) : 'unknown';
}

function readCount(data: Record<string, unknown>): number | undefined {
  const value = data.count;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function ok(
  type: PushNotificationType | RetiredPushNotificationType,
  surface: PushDestinationSurface,
  params: PushDestinationParams,
): PushDestination {
  return { ok: true, type, surface, params };
}

function error(reason: PushDestinationErrorReason, type?: string): PushDestination {
  return type === undefined ? { ok: false, reason } : { ok: false, reason, type };
}

export function isPushNotificationType(value: unknown): value is PushNotificationType {
  return typeof value === 'string'
    && (PUSH_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isRetiredPushNotificationType(
  value: unknown,
): value is RetiredPushNotificationType {
  return typeof value === 'string'
    && (RETIRED_PUSH_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/**
 * Resolve a notification payload to a canonical destination.
 *
 * Fail closed everywhere: a malformed payload, a missing opaque ref or an
 * unrecognised type all produce `destination-error` with a reason code rather
 * than a best-guess navigation (MTR-R03.2, MTR-R04.3).
 */
export function resolvePushDestination(input: unknown): PushDestination {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return error('invalid_payload');
  }
  const data = input as Record<string, unknown>;
  const rawType = data.type;

  if (isRetiredPushNotificationType(rawType)) {
    const surface = RETIRED_TYPE_TO_SURFACE[rawType];
    if (surface === null) return error('legacy_route_retired', rawType);
    // Retired types carry no contract-frozen refs; the destination is the
    // surface itself and the user re-reads from there.
    return ok(rawType, surface, {});
  }

  if (!isPushNotificationType(rawType)) {
    return error('unknown_notification_type', typeof rawType === 'string' ? rawType : undefined);
  }

  switch (rawType) {
    case 'incoming_call': {
      const callSessionRef = readRef(data, 'callSessionRef');
      if (!callSessionRef) return error('missing_required_ref', rawType);
      return ok('incoming_call', 'call_ringing', {
        callSessionRef,
        expiresAt: readExpiry(data),
      });
    }
    case 'approval_required': {
      const approvalRef = readRef(data, 'approvalRef');
      if (!approvalRef) return error('missing_required_ref', rawType);
      return ok('approval_required', 'work_inbox_approval', {
        approvalRef,
        risk: readRisk(data),
        expiresAt: readExpiry(data),
      });
    }
    case 'twin_critical': {
      const twinProfileRef = readRef(data, 'twinProfileRef');
      if (!twinProfileRef) return error('missing_required_ref', rawType);
      return ok('twin_critical', 'twin_status_card', {
        twinProfileRef,
        reasonCode: readRef(data, 'reasonCode'),
      });
    }
    case 'twin_review_required': {
      const reviewBatchRef = readRef(data, 'reviewBatchRef');
      if (!reviewBatchRef) return error('missing_required_ref', rawType);
      return ok('twin_review_required', 'work_inbox_twin_review', {
        reviewBatchRef,
        count: readCount(data),
      });
    }
    case 'agenda_reminder': {
      const scheduleItemRef = readRef(data, 'scheduleItemRef');
      if (!scheduleItemRef) return error('missing_required_ref', rawType);
      return ok('agenda_reminder', 'work_agenda_today', { scheduleItemRef });
    }
    case 'handoff_ready': {
      const handoffRef = readRef(data, 'handoffRef');
      if (!handoffRef) return error('missing_required_ref', rawType);
      return ok('handoff_ready', 'work_handoff', { handoffRef });
    }
    default:
      return error('unknown_notification_type');
  }
}

/**
 * Path handed to the linking layer when resolution fails. Mirrors the
 * `destination-error?reason=` contract already used by `normalizeMobileV7Route`.
 */
export function pushDestinationErrorPath(reason: PushDestinationErrorReason): string {
  return `/destination-error?reason=${encodeURIComponent(reason)}`;
}
