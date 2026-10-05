/**
 * Experience-layer contracts for G-01 / G-03 / G-04 / G-05 / G-06.
 *
 * These types freeze the wire shape so frontend shells can render
 * `not_implemented` honestly before backend writers exist.
 * They grant no Import Authority and no canonical write.
 *
 * Validators never throw. Capability resolution never upgrades to
 * `available` unless a backend projection says exactly that.
 */

import {
  parseGenericArchiveItemV2,
  type GenericArchiveItemV2,
} from './agent-portability-archive-v2';

export const HANDOFF_SESSION_SCHEMA = 'agentrix.portability.handoff-session/1' as const;
export const CANDIDATE_SNAPSHOT_SCHEMA = 'agentrix.portability.candidate-snapshot/1' as const;
export const EXPERIENCE_TASK_SCHEMA = 'agentrix.portability.experience-task/1' as const;
export const IMPORT_UPDATE_CHECK_SCHEMA = 'agentrix.portability.import-update-check/1' as const;

export const EXPERIENCE_CAPABILITY_STATES = [
  'available',
  'limited_preview',
  'not_implemented',
  'blocked',
  'unknown',
] as const;
export type ExperienceCapabilityState =
  (typeof EXPERIENCE_CAPABILITY_STATES)[number];

export const HANDOFF_SESSION_STATES = [
  'waiting',
  'received',
  'expired',
  'consumed',
  'rejected',
] as const;
export type HandoffSessionState = (typeof HANDOFF_SESSION_STATES)[number];

/**
 * One-time pairing code shown to the owner and typed into ChatGPT / Claude.
 * Uppercase, no 0/O/1/I ambiguity, 8–10 chars. Codes are never secrets on
 * their own: the session is owner-bound and expires.
 */
export const HANDOFF_PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' as const;
export const HANDOFF_PAIRING_CODE_MIN_LENGTH = 8 as const;
export const HANDOFF_PAIRING_CODE_MAX_LENGTH = 10 as const;
export const HANDOFF_PAIRING_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8,10}$/;

/**
 * Bounds for the single MCP tool `submit_candidates(session_code, items[])`.
 * The endpoint only accepts candidates; it never receives Import Authority
 * and never writes a target. Constants only — the server does not exist yet.
 */
export const SUBMIT_CANDIDATES_BOUNDS = Object.freeze({
  maxItems: 200,
  maxItemBytes: 8 * 1024,
  maxPayloadBytes: 512 * 1024,
  maxSessionTtlSeconds: 15 * 60,
  maxSnapshotsPerSession: 1,
});

export interface HandoffSessionV1 {
  schemaVersion: typeof HANDOFF_SESSION_SCHEMA;
  sessionRef: string;
  ownerRef: string;
  pairingCode: string;
  nonceDigest: string;
  expiresAt: string;
  state: HandoffSessionState;
  candidateCount: number;
  capabilityState: ExperienceCapabilityState;
}

export const HANDOFF_REJECT_REASONS = [
  'expired',
  'wrong_owner',
  'replay',
  'payload_too_large',
  'malformed',
] as const;
export type HandoffRejectReason = (typeof HANDOFF_REJECT_REASONS)[number];

export const CANDIDATE_SOURCE_KINDS = [
  'official_export',
  'handoff',
  'paste',
  'unknown',
] as const;
export type CandidateSourceKind = (typeof CANDIDATE_SOURCE_KINDS)[number];

export interface CandidateSnapshotV1 {
  schemaVersion: typeof CANDIDATE_SNAPSHOT_SCHEMA;
  snapshotRef: string;
  ownerRef: string;
  sourceKind: CandidateSourceKind;
  itemCount: number;
  digest: string;
  createdAt: string;
  immutable: true;
  defaultSelectedCount: number;
  capabilityState: ExperienceCapabilityState;
}

/**
 * Owner-only read of one snapshot. The list contract stays a summary: this
 * is the only place `items` appear. Unreadable rows are dropped, not a
 * parse failure, so one bad item cannot hide the rest of a real snapshot.
 */
export type CandidateSnapshotDetailV1 = CandidateSnapshotV1 & {
  items: GenericArchiveItemV2[];
};

export const EXPERIENCE_TASK_KINDS = [
  'import',
  'export',
  'restore',
  'compensate',
  'handoff',
] as const;
export type ExperienceTaskKind = (typeof EXPERIENCE_TASK_KINDS)[number];

export const EXPERIENCE_TASK_PHASES = [
  'created',
  'scanning',
  'preview',
  'committing',
  'committed',
  'zero_candidates',
  'cancelled',
  'compensated',
  'stuck',
] as const;
export type ExperienceTaskPhase = (typeof EXPERIENCE_TASK_PHASES)[number];

export const EXPERIENCE_TASK_FRESHNESS = ['live', 'stale', 'unknown'] as const;
export type ExperienceTaskFreshness = (typeof EXPERIENCE_TASK_FRESHNESS)[number];

export const EXPERIENCE_TASK_NEXT_ACTIONS = [
  'wait',
  'review',
  'commit',
  'cancel',
  'compensate',
  'none',
] as const;
export type ExperienceTaskNextAction = (typeof EXPERIENCE_TASK_NEXT_ACTIONS)[number];

export interface ExperienceTaskV1 {
  schemaVersion: typeof EXPERIENCE_TASK_SCHEMA;
  taskRef: string;
  ownerRef: string;
  kind: ExperienceTaskKind;
  phase: ExperienceTaskPhase;
  freshness: ExperienceTaskFreshness;
  nextAction: ExperienceTaskNextAction;
  jobRef?: string;
  receiptRef?: string;
  updatedAt: string;
  capabilityState: ExperienceCapabilityState;
}

export interface ImportCompensationRequestV1 {
  receiptRef: string;
  ownerRef: string;
  confirm: true;
}

export interface ImportUpdateCheckV1 {
  schemaVersion?: typeof IMPORT_UPDATE_CHECK_SCHEMA;
  sourceDigest: string;
  previousReceiptRef?: string;
  addedCount: number;
  changedCount: number;
  unchangedCount: number;
  capabilityState: ExperienceCapabilityState;
}

export const EXPERIENCE_CAPABILITY_KEYS = [
  'handoff',
  'inbox',
  'taskCenter',
  'compensate',
  'updateCheck',
] as const;
export type ExperienceCapabilityKey = (typeof EXPERIENCE_CAPABILITY_KEYS)[number];

export const CURRENT_EXPERIENCE_CAPABILITIES = {
  handoff: 'not_implemented',
  inbox: 'not_implemented',
  taskCenter: 'not_implemented',
  compensate: 'not_implemented',
  updateCheck: 'not_implemented',
} as const satisfies Record<ExperienceCapabilityKey, ExperienceCapabilityState>;

export type ExperienceParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}

function isCount(input: unknown): input is number {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0;
}

function isIsoTimestamp(input: unknown): input is string {
  return isNonEmptyString(input) && !Number.isNaN(Date.parse(input));
}

function oneOf<T extends readonly string[]>(
  input: unknown,
  allowed: T,
): input is T[number] {
  return typeof input === 'string' && (allowed as readonly string[]).includes(input);
}

function isCapabilityState(input: unknown): input is ExperienceCapabilityState {
  return oneOf(input, EXPERIENCE_CAPABILITY_STATES);
}

function requireString(
  object: Record<string, unknown>,
  key: string,
  issues: string[],
): void {
  if (!isNonEmptyString(object[key])) issues.push(`${key}:required_string`);
}

function requireCount(
  object: Record<string, unknown>,
  key: string,
  issues: string[],
): void {
  if (!isCount(object[key])) issues.push(`${key}:non_negative_integer`);
}

function requireEnum<T extends readonly string[]>(
  object: Record<string, unknown>,
  key: string,
  allowed: T,
  issues: string[],
): void {
  if (!oneOf(object[key], allowed)) issues.push(`${key}:invalid_enum`);
}

function requireCapability(object: Record<string, unknown>, issues: string[]): void {
  if (!isCapabilityState(object.capabilityState)) issues.push('capabilityState:invalid_enum');
}

function requireSchema(
  object: Record<string, unknown>,
  expected: string,
  issues: string[],
): void {
  if (object.schemaVersion !== expected) issues.push(`schemaVersion:expected_${expected}`);
}

function finish<T>(issues: string[], value: unknown): ExperienceParseResult<T> {
  return issues.length === 0
    ? { ok: true, value: value as T }
    : { ok: false, issues };
}

/**
 * Parsers must never throw, even for hostile inputs whose property access
 * throws (proxies, exotic host objects). Anything that escapes the field
 * checks becomes a single root issue.
 */
function guarded<T>(parse: () => ExperienceParseResult<T>): ExperienceParseResult<T> {
  try {
    return parse();
  } catch {
    return { ok: false, issues: ['root:unreadable'] };
  }
}

export function parseHandoffSessionV1(input: unknown): ExperienceParseResult<HandoffSessionV1> {
  return guarded(() => parseHandoffSession(input));
}

function parseHandoffSession(input: unknown): ExperienceParseResult<HandoffSessionV1> {
  if (!isRecord(input)) return { ok: false, issues: ['root:not_object'] };
  const issues: string[] = [];
  requireSchema(input, HANDOFF_SESSION_SCHEMA, issues);
  requireString(input, 'sessionRef', issues);
  requireString(input, 'ownerRef', issues);
  if (
    !isNonEmptyString(input.pairingCode) ||
    !HANDOFF_PAIRING_CODE_PATTERN.test(input.pairingCode)
  ) {
    issues.push('pairingCode:invalid_format');
  }
  requireString(input, 'nonceDigest', issues);
  if (!isIsoTimestamp(input.expiresAt)) issues.push('expiresAt:invalid_timestamp');
  requireEnum(input, 'state', HANDOFF_SESSION_STATES, issues);
  requireCount(input, 'candidateCount', issues);
  requireCapability(input, issues);
  return finish<HandoffSessionV1>(issues, input);
}

export function parseCandidateSnapshotV1(
  input: unknown,
): ExperienceParseResult<CandidateSnapshotV1> {
  return guarded(() => parseCandidateSnapshot(input));
}

export function parseCandidateSnapshotDetailV1(
  input: unknown,
): ExperienceParseResult<CandidateSnapshotDetailV1> {
  return guarded(() => parseCandidateSnapshotDetail(input));
}

function parseCandidateSnapshot(input: unknown): ExperienceParseResult<CandidateSnapshotV1> {
  if (!isRecord(input)) return { ok: false, issues: ['root:not_object'] };
  const issues: string[] = [];
  requireSchema(input, CANDIDATE_SNAPSHOT_SCHEMA, issues);
  requireString(input, 'snapshotRef', issues);
  requireString(input, 'ownerRef', issues);
  requireEnum(input, 'sourceKind', CANDIDATE_SOURCE_KINDS, issues);
  requireCount(input, 'itemCount', issues);
  requireString(input, 'digest', issues);
  if (!isIsoTimestamp(input.createdAt)) issues.push('createdAt:invalid_timestamp');
  if (input.immutable !== true) issues.push('immutable:must_be_true');
  requireCount(input, 'defaultSelectedCount', issues);
  if (
    isCount(input.itemCount) &&
    isCount(input.defaultSelectedCount) &&
    input.defaultSelectedCount > input.itemCount
  ) {
    issues.push('defaultSelectedCount:exceeds_item_count');
  }
  requireCapability(input, issues);
  return finish<CandidateSnapshotV1>(issues, input);
}

function parseCandidateSnapshotDetail(input: unknown): ExperienceParseResult<CandidateSnapshotDetailV1> {
  const summary = parseCandidateSnapshot(input);
  if (summary.ok === false) return summary;
  if (!isRecord(input) || !Array.isArray(input.items)) {
    return { ok: false, issues: ['items:not_array'] };
  }
  const items: GenericArchiveItemV2[] = [];
  for (const [index, raw] of input.items.entries()) {
    const parsed = parseGenericArchiveItemV2(raw, index);
    if ('reasonCode' in parsed) continue;
    items.push(parsed);
  }
  return { ok: true, value: { ...summary.value, items } };
}

export function parseExperienceTaskV1(input: unknown): ExperienceParseResult<ExperienceTaskV1> {
  return guarded(() => parseExperienceTask(input));
}

function parseExperienceTask(input: unknown): ExperienceParseResult<ExperienceTaskV1> {
  if (!isRecord(input)) return { ok: false, issues: ['root:not_object'] };
  const issues: string[] = [];
  requireSchema(input, EXPERIENCE_TASK_SCHEMA, issues);
  requireString(input, 'taskRef', issues);
  requireString(input, 'ownerRef', issues);
  requireEnum(input, 'kind', EXPERIENCE_TASK_KINDS, issues);
  requireEnum(input, 'phase', EXPERIENCE_TASK_PHASES, issues);
  requireEnum(input, 'freshness', EXPERIENCE_TASK_FRESHNESS, issues);
  requireEnum(input, 'nextAction', EXPERIENCE_TASK_NEXT_ACTIONS, issues);
  if (input.jobRef !== undefined && !isNonEmptyString(input.jobRef)) issues.push('jobRef:invalid');
  if (input.receiptRef !== undefined && !isNonEmptyString(input.receiptRef)) {
    issues.push('receiptRef:invalid');
  }
  if (!isIsoTimestamp(input.updatedAt)) issues.push('updatedAt:invalid_timestamp');
  requireCapability(input, issues);
  return finish<ExperienceTaskV1>(issues, input);
}

export function parseImportUpdateCheckV1(
  input: unknown,
): ExperienceParseResult<ImportUpdateCheckV1> {
  return guarded(() => parseImportUpdateCheck(input));
}

function parseImportUpdateCheck(input: unknown): ExperienceParseResult<ImportUpdateCheckV1> {
  if (!isRecord(input)) return { ok: false, issues: ['root:not_object'] };
  const issues: string[] = [];
  if (input.schemaVersion !== undefined && input.schemaVersion !== IMPORT_UPDATE_CHECK_SCHEMA) {
    issues.push(`schemaVersion:expected_${IMPORT_UPDATE_CHECK_SCHEMA}`);
  }
  requireString(input, 'sourceDigest', issues);
  if (input.previousReceiptRef !== undefined && !isNonEmptyString(input.previousReceiptRef)) {
    issues.push('previousReceiptRef:invalid');
  }
  requireCount(input, 'addedCount', issues);
  requireCount(input, 'changedCount', issues);
  requireCount(input, 'unchangedCount', issues);
  requireCapability(input, issues);
  return finish<ImportUpdateCheckV1>(issues, input);
}

/**
 * Reads `projection.experience.capabilities[key]` from any backend projection
 * shape (for example the `agent-experience/v1` entry).
 *
 *  - field absent or null (older backend, no projection yet) -> the frozen
 *    `CURRENT_EXPERIENCE_CAPABILITIES[key]`, today `not_implemented`
 *  - present and exactly one of {@link EXPERIENCE_CAPABILITY_STATES} -> that state
 *  - present but anything else (typo, casing, boolean, wrong container shape,
 *    hostile object) -> `unknown`
 *
 * `available` is only ever returned when the backend literally published that
 * string. Nothing in this helper can invent it.
 */
export function resolveExperienceCapability(
  projection: unknown,
  key: ExperienceCapabilityKey,
): ExperienceCapabilityState {
  const fallback = CURRENT_EXPERIENCE_CAPABILITIES[key];
  try {
    if (!isRecord(projection)) return fallback;
    const experience = projection.experience;
    if (experience === undefined || experience === null) return fallback;
    if (!isRecord(experience)) return 'unknown';
    const capabilities = experience.capabilities;
    if (capabilities === undefined || capabilities === null) return fallback;
    if (!isRecord(capabilities)) return 'unknown';
    if (!Object.prototype.hasOwnProperty.call(capabilities, key)) return fallback;
    const state = capabilities[key];
    return isCapabilityState(state) ? state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * `available` and `limited_preview` render live controls; the latter must carry
 * a visible "limited preview" label (real backend, not yet proven end to end).
 * `not_implemented`, `blocked` and `unknown` are gray shells with an explanation.
 */
export function isExperienceCapabilityLive(state: ExperienceCapabilityState): boolean {
  return state === 'available' || state === 'limited_preview';
}
