/**
 * Digital Twin -- Twin Stop (design section 6.10, tasks Task 11; Seed Trial section 0.1).
 *
 * A Stop is the Creator's one-click "my twin must stop speaking for me". The
 * mandatory target set is frozen here on the server side; a client may only
 * choose `scope: 'all'` in Seed Trial and can never narrow the set. Public
 * ingress is always the first target. Every target carries its own status;
 * `unknown` is never treated as converged and is never blindly replayed.
 *
 * Seed Trial reality: the only live targets are Digital Twin's own surfaces
 * (private answers, review digest, public ingress once DT-G2 opens). Body
 * providers, mandates and Visitor sessions do not exist yet and are reported
 * `not_applicable` with the reason, not silently omitted. The record is an
 * `interim_seed_stop` product record, not a Trust/Consent canonical revoke.
 *
 * There is no entitlement wall: Stop needs the master flag only.
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinCapabilityIdV1,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinRefV1,
} from './digital-twin';

const { isRecord, isNonEmptyString, isIsoTimestamp, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_STOP_TARGETS_V1 = [
  'public_ingress',
  'private_answers',
  'review_digest',
  'body_voice',
  'body_avatar',
  'mandate_actions',
  'visitor_sessions',
  'projection_cache',
] as const;
export type DigitalTwinStopTargetIdV1 = (typeof DIGITAL_TWIN_STOP_TARGETS_V1)[number];

export const DIGITAL_TWIN_STOP_TARGET_STATUSES_V1 = ['converged', 'pending', 'unknown', 'not_applicable'] as const;
export type DigitalTwinStopTargetStatusV1 = (typeof DIGITAL_TWIN_STOP_TARGET_STATUSES_V1)[number];

export const DIGITAL_TWIN_STOP_SCOPES_V1 = ['all'] as const;
export type DigitalTwinStopScopeV1 = (typeof DIGITAL_TWIN_STOP_SCOPES_V1)[number];

export const DIGITAL_TWIN_STOP_ACTIONS_V1 = ['stop', 'resume'] as const;
export type DigitalTwinStopActionV1 = (typeof DIGITAL_TWIN_STOP_ACTIONS_V1)[number];

export const DIGITAL_TWIN_STOP_RECORD_STATES_V1 = ['stopped', 'resumed'] as const;
export type DigitalTwinStopRecordStateV1 = (typeof DIGITAL_TWIN_STOP_RECORD_STATES_V1)[number];

export const DIGITAL_TWIN_STOP_REASON_MAX_CHARS = 200;

export interface DigitalTwinStopTargetV1 {
  target: DigitalTwinStopTargetIdV1;
  /** Who converges this target (module or canonical owner); informational. */
  owner: string;
  status: DigitalTwinStopTargetStatusV1;
  /** Why the target is `not_applicable`/`pending`/`unknown` -- a code, not prose. */
  reasonCode?: string;
  at: string;
}

export interface DigitalTwinStopRecordV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: 'interim_seed_stop';
  stopRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  /** Monotonic; every stop increments it. Anything issued under an older epoch is stale. */
  stopEpoch: number;
  scope: DigitalTwinStopScopeV1;
  state: DigitalTwinStopRecordStateV1;
  reason?: string;
  targets: DigitalTwinStopTargetV1[];
  requestedAt: string;
  convergedAt?: string;
  resumedAt?: string;
}

export interface DigitalTwinStopCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: DigitalTwinStopActionV1;
  scope: DigitalTwinStopScopeV1;
  reason?: string;
}

export interface DigitalTwinStopStatusV1 {
  /** Stop executed and every mandatory target converged or not applicable. */
  stopped: boolean;
  /** Stop executed but at least one target pending/unknown. */
  stopPending: boolean;
  stopEpoch: number;
}

/** Target owners as the Seed Trial knows them; canonical owners take over their rows when their ports publish. */
export const DIGITAL_TWIN_STOP_TARGET_OWNERS_V1: Readonly<Record<DigitalTwinStopTargetIdV1, string>> = {
  public_ingress: 'digital-twin (public projection)',
  private_answers: 'digital-twin (private thread)',
  review_digest: 'digital-twin (review queue)',
  body_voice: 'body provider gateway (Task 8)',
  body_avatar: 'body provider gateway (Task 8)',
  mandate_actions: 'Authority owner (blocked by TC-02.0)',
  visitor_sessions: 'Conversation owner (port unpublished)',
  projection_cache: 'digital-twin (public projection cache)',
};

export interface DigitalTwinStopPlanInputV1 {
  /** Capability availability as the profile projection reports it. */
  capabilities: Partial<Record<DigitalTwinCapabilityIdV1, 'available' | 'unavailable'>>;
  /** Body bindings currently on the Profile; each needs a provider-side converge. */
  bodyBindingCount: number;
  /** Whether a public projection has ever been served for this Profile (cache to invalidate). */
  hasPublicProjection: boolean;
  now: string;
}

/**
 * The frozen, ordered target set. Public ingress comes first (design: pause
 * ingress before draining anything else). Digital Twin's own surfaces converge
 * immediately because every answer path reads the stop record before acting;
 * everything owned elsewhere is `pending` when it exists and `not_applicable`
 * with a reason when it does not.
 */
export function buildDigitalTwinStopTargetsV1(input: DigitalTwinStopPlanInputV1): DigitalTwinStopTargetV1[] {
  const at = input.now;
  const publicAvailable = input.capabilities.public === 'available';
  const bodyStatus = (capability: 'voice' | 'avatar'): DigitalTwinStopTargetV1 => {
    const target: DigitalTwinStopTargetIdV1 = capability === 'voice' ? 'body_voice' : 'body_avatar';
    if (input.bodyBindingCount > 0 && input.capabilities[capability] === 'available') {
      return { target, owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1[target], status: 'pending', reasonCode: 'provider_converge_required', at };
    }
    return { target, owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1[target], status: 'not_applicable', reasonCode: 'no_body_binding', at };
  };
  return [
    publicAvailable
      ? { target: 'public_ingress', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.public_ingress, status: 'converged', at }
      : { target: 'public_ingress', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.public_ingress, status: 'not_applicable', reasonCode: 'capability_off', at },
    { target: 'private_answers', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.private_answers, status: 'converged', at },
    { target: 'review_digest', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.review_digest, status: 'converged', at },
    bodyStatus('voice'),
    bodyStatus('avatar'),
    { target: 'mandate_actions', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.mandate_actions, status: 'not_applicable', reasonCode: 'blocked_tc_02_0', at },
    { target: 'visitor_sessions', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.visitor_sessions, status: 'not_applicable', reasonCode: 'owner_port_unavailable', at },
    input.hasPublicProjection
      ? { target: 'projection_cache', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.projection_cache, status: 'converged', at }
      : { target: 'projection_cache', owner: DIGITAL_TWIN_STOP_TARGET_OWNERS_V1.projection_cache, status: 'not_applicable', reasonCode: 'no_projection', at },
  ];
}

export function digitalTwinStopStatusV1(record: DigitalTwinStopRecordV1 | null | undefined): DigitalTwinStopStatusV1 {
  if (!record || record.state !== 'stopped') return { stopped: false, stopPending: false, stopEpoch: record?.stopEpoch ?? 0 };
  const pending = record.targets.some((target) => target.status === 'pending' || target.status === 'unknown');
  return { stopped: !pending, stopPending: pending, stopEpoch: record.stopEpoch };
}

export function decodeDigitalTwinStopCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinStopCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!(DIGITAL_TWIN_STOP_ACTIONS_V1 as readonly unknown[]).includes(input.action)) return fail('invalid_enum', ['action']);
  const scope = input.scope ?? 'all';
  if (!(DIGITAL_TWIN_STOP_SCOPES_V1 as readonly unknown[]).includes(scope)) return fail('invalid_enum', ['scope']);
  let reason: string | undefined;
  if (input.reason !== undefined) {
    if (!isNonEmptyString(input.reason) || input.reason.length > DIGITAL_TWIN_STOP_REASON_MAX_CHARS) return fail('invalid_shape', ['reason']);
    reason = input.reason.trim();
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      action: input.action as DigitalTwinStopActionV1,
      scope: scope as DigitalTwinStopScopeV1,
      ...(reason ? { reason } : {}),
    },
  };
}

export function decodeDigitalTwinStopRecordV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinStopRecordV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (input.record !== 'interim_seed_stop') return fail('invalid_enum', ['record']);
  if (!(DIGITAL_TWIN_STOP_RECORD_STATES_V1 as readonly unknown[]).includes(input.state)) return fail('invalid_enum', ['state']);
  if (!(Number.isInteger(input.stopEpoch) && (input.stopEpoch as number) >= 1)) return fail('invalid_shape', ['stopEpoch']);
  if (!Array.isArray(input.targets)) return fail('invalid_shape', ['targets']);
  for (const target of input.targets) {
    if (!isRecord(target)) return fail('invalid_shape', ['targets[]']);
    if (!(DIGITAL_TWIN_STOP_TARGETS_V1 as readonly unknown[]).includes(target.target)) return fail('invalid_enum', ['targets[].target']);
    if (!(DIGITAL_TWIN_STOP_TARGET_STATUSES_V1 as readonly unknown[]).includes(target.status)) return fail('invalid_enum', ['targets[].status']);
    if (!isIsoTimestamp(target.at)) return fail('invalid_timestamp', ['targets[].at']);
  }
  if (!isIsoTimestamp(input.requestedAt)) return fail('invalid_timestamp', ['requestedAt']);
  return { ok: true, value: input as unknown as DigitalTwinStopRecordV1 };
}
