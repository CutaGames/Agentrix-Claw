/**
 * L9.2 batch 13 (cycles A and B): machine tasks.
 *
 * A machine task is a device-rental job (`device-capability.ts` section 5) read as a piece of work a machine did:
 * - bounded: the task carries its own limits (capability, unit, most units, price, the most it can cost); whether the
 *   device takes tasks from other owners' Agents at all is the owner's rule;
 * - attributable: the device hands back a receipt signed by its device key. The platform keeps it together with the key
 *   it checked it against and countersigns it (`MACHINE_ACTION_RECEIPT_TYP_V1`);
 * - revocable: the owner stops a device with one call. From then on it takes no new task, the tasks still waiting are
 *   cancelled and refunded, and a task it is already running finishes or times out (a device cannot be stopped mid-run).
 *
 * Nothing in this file moves money. Amounts are the rental's test ledger (`environment: 'test'`); a task the buyer chose
 * to pay on a test network (section 5) is paid from its own wallet and signed on its own device, never by the platform.
 * A receipt proves that the device's key signed this result. It is not hardware attestation (`assurance: 'device_key'`)
 * and it is not a Trust Core action receipt.
 *
 * The buyer never learns which device it was or whose (as on `DeviceRentalOfferV0`): a buyer sees the seller's Agent and
 * the thumbprint of the device key, never the device id. The claims the platform signs hold nothing a buyer may not see;
 * what only the seller may see (`MachineActionReceiptDeviceProofV1`) is tied to the claims by two digests.
 *
 * Switches, each exactly `'1'`, default off: `MACHINE_TASK_V1_ENABLED` on top of `DEVICE_MESH_V0_ENABLED` and
 * `DEVICE_RENTAL_V0_ENABLED` (backend), `NEXT_PUBLIC_MACHINE_TASK_V1_ENABLED` (web). Off: every route answers the 404 of
 * a route that does not exist, and no receipt is written.
 */
import {
  DEVICE_CAPABILITY_STATES_V0,
  DEVICE_CAPABILITY_TYPE_PATTERN_V0,
  DEVICE_RENTAL_JOB_REF_PATTERN_V0,
  DEVICE_RENTAL_JOB_STATUSES_V0,
  DEVICE_RENTAL_OFFER_REF_PATTERN_V0,
  DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0,
  DEVICE_RENTAL_UNITS_V0,
  DEVICE_RULE_APPROVALS_V0,
  DEVICE_RULE_AUDIENCES_V0,
  deviceRentalReceiptMessageV0,
  type DeviceCapabilityStateV0,
  type DeviceRentalJobStatusV0,
  type DeviceRentalUnitV0,
  type DeviceRuleApprovalV0,
  type DeviceRuleAudienceV0,
} from './device-capability';

// ── 1. Switches and routes ───────────────────────────────────────────────────────────────────────

export const MACHINE_TASK_FLAG_V1 = 'MACHINE_TASK_V1_ENABLED' as const;
export const MACHINE_TASK_WEB_FLAG_V1 = 'NEXT_PUBLIC_MACHINE_TASK_V1_ENABLED' as const;

/** Every one of these must be exactly `'1'` for a machine-task route to exist or a receipt to be written. */
export const MACHINE_TASK_REQUIRED_FLAGS_V1 = ['DEVICE_MESH_V0_ENABLED', 'DEVICE_RENTAL_V0_ENABLED', MACHINE_TASK_FLAG_V1] as const;

export function machineTaskEnabledV1(flags: Readonly<Record<string, string | undefined>>): boolean {
  return MACHINE_TASK_REQUIRED_FLAGS_V1.every((flag) => flags[flag] === '1');
}

/** Under `/api`. Every route needs a person's own sign-in; the owner is always taken from it. */
export const MACHINE_TASK_ROUTES_V1 = {
  list: 'GET /machine-tasks',
  read: 'GET /machine-tasks/:taskRef',
  receipt: 'GET /machine-tasks/:taskRef/receipt',
  devices: 'GET /machine-tasks/devices',
  deviceManifest: 'GET /machine-tasks/devices/:deviceId/manifest',
  stopDevice: 'POST /machine-tasks/devices/:deviceId/stop',
} as const;

export const MACHINE_TASK_BASE_PATH_V1 = '/machine-tasks';

export const MACHINE_TASK_ROLES_V1 = ['seller', 'buyer'] as const;
export type MachineTaskRoleV1 = (typeof MACHINE_TASK_ROLES_V1)[number];

export function machineTaskListPathV1(role: MachineTaskRoleV1): string {
  return `${MACHINE_TASK_BASE_PATH_V1}?role=${role}`;
}
export function machineTaskPathV1(taskRef: string): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/${encodeURIComponent(taskRef)}`;
}
export function machineTaskReceiptPathV1(taskRef: string): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/${encodeURIComponent(taskRef)}/receipt`;
}
export function machineDeviceListPathV1(): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/devices`;
}
export function machineDeviceManifestPathV1(deviceId: string): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/devices/${encodeURIComponent(deviceId)}/manifest`;
}
export function machineDeviceStopPathV1(deviceId: string): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/devices/${encodeURIComponent(deviceId)}/stop`;
}

export const MACHINE_TASK_ERROR_CODES_V1 = {
  /** No such task or device, or it is somebody else's (never told apart). */
  notFound: 'MACHINE_TASK_NOT_FOUND',
  invalid: 'MACHINE_TASK_INVALID',
  /** The task has no machine receipt (`MachineTaskNoReceiptReasonV1` says why). */
  noReceipt: 'MACHINE_TASK_NO_RECEIPT',
  /** The owner's rules could not be read, so nothing was changed. */
  rulesUnavailable: 'MACHINE_TASK_RULES_UNAVAILABLE',
} as const;

/** The task reference is the rental job reference (`drj_` + 32 hex). */
export const MACHINE_TASK_REF_PATTERN_V1 = DEVICE_RENTAL_JOB_REF_PATTERN_V0;

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const B64URL_COORD = /^[A-Za-z0-9_-]{43}$/;
const MAX_CENTS = 100_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, set: readonly T[]): value is T {
  return typeof value === 'string' && (set as readonly string[]).includes(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isCount(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIME.test(value) && Number.isFinite(Date.parse(value));
}

function isOpaque(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE.test(value);
}

/** A field that may be `null`: `null` stays `null`, anything else must pass the check; `undefined` means refused. */
function orNull<T>(value: unknown, check: (value: unknown) => value is T): T | null | undefined {
  if (value === null) return null;
  return check(value) ? value : undefined;
}

// ── 2. The task, as each side sees it ────────────────────────────────────────────────────────────

export const MACHINE_TASK_LIST_MAX_V1 = 50;

/** What a task may use at most. Fixed when the task was ordered; nothing changes it afterwards. */
export interface MachineTaskBoundsV1 {
  capabilityType: string;
  unit: DeviceRentalUnitV0;
  priceCentsPerUnit: number;
  maxUnits: number;
  maxAmountCents: number;
}

/**
 * Why a task has no machine receipt:
 * - `not_finished`: it is still waiting or running;
 * - `no_device_receipt`: it timed out or was cancelled, so the device never signed anything;
 * - `not_recorded`: the device signed a receipt, but no machine receipt was written (receipts were off at the time, or
 *   writing it failed). The device's signed finished-at was not kept, so none can be written later.
 */
export const MACHINE_TASK_NO_RECEIPT_REASONS_V1 = ['not_finished', 'no_device_receipt', 'not_recorded'] as const;
export type MachineTaskNoReceiptReasonV1 = (typeof MACHINE_TASK_NO_RECEIPT_REASONS_V1)[number];

export type MachineTaskReceiptStateV1 =
  | { state: 'issued'; receiptRef: string; platformSigned: boolean }
  | { state: 'none'; reason: MachineTaskNoReceiptReasonV1 };

export const MACHINE_TASK_ESCROW_STATES_V1 = ['held', 'released', 'refunded'] as const;
export type MachineTaskEscrowStateV1 = (typeof MACHINE_TASK_ESCROW_STATES_V1)[number];

export interface MachineTaskViewV1 {
  schemaVersion: 1;
  taskRef: string;
  role: MachineTaskRoleV1;
  status: DeviceRentalJobStatusV0;
  bounds: MachineTaskBoundsV1;
  unitsUsed: number | null;
  /** The rental's test ledger. No real money. */
  ledger: { environment: 'test'; escrowState: MachineTaskEscrowStateV1; amountCents: number | null };
  /** The seller's Agent (`agentUniqueId`), as on the offer. */
  sellerAgentId: string;
  /** Seller only: which of the owner's own devices. Always null for the buyer. */
  deviceId: string | null;
  receipt: MachineTaskReceiptStateV1;
  createdAt: string;
  startedAt: string | null;
  /** When the server got the device's receipt, or ended the task itself. */
  endedAt: string | null;
}

export interface MachineTaskListV1 {
  items: MachineTaskViewV1[];
}

function decodeBounds(value: unknown): MachineTaskBoundsV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['capabilityType', 'unit', 'priceCentsPerUnit', 'maxUnits', 'maxAmountCents'])) return null;
  if (typeof value.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(value.capabilityType)) return null;
  if (!isOneOf(value.unit, DEVICE_RENTAL_UNITS_V0)) return null;
  if (!isCount(value.priceCentsPerUnit, MAX_CENTS) || value.priceCentsPerUnit < 1) return null;
  if (!isCount(value.maxUnits, MAX_CENTS) || value.maxUnits < 1) return null;
  if (!isCount(value.maxAmountCents, MAX_CENTS) || value.maxAmountCents < 1) return null;
  return {
    capabilityType: value.capabilityType,
    unit: value.unit,
    priceCentsPerUnit: value.priceCentsPerUnit,
    maxUnits: value.maxUnits,
    maxAmountCents: value.maxAmountCents,
  };
}

function decodeReceiptState(value: unknown): MachineTaskReceiptStateV1 | null {
  if (!isRecord(value)) return null;
  if (value.state === 'issued') {
    if (!hasOnly(value, ['state', 'receiptRef', 'platformSigned'])) return null;
    if (typeof value.receiptRef !== 'string' || !MACHINE_ACTION_RECEIPT_REF_PATTERN_V1.test(value.receiptRef)) return null;
    if (typeof value.platformSigned !== 'boolean') return null;
    return { state: 'issued', receiptRef: value.receiptRef, platformSigned: value.platformSigned };
  }
  if (value.state === 'none') {
    if (!hasOnly(value, ['state', 'reason']) || !isOneOf(value.reason, MACHINE_TASK_NO_RECEIPT_REASONS_V1)) return null;
    return { state: 'none', reason: value.reason };
  }
  return null;
}

/** All clients: decode one task. An unknown key or value refuses the whole view. */
export function decodeMachineTaskViewV1(value: unknown): MachineTaskViewV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const keys = ['schemaVersion', 'taskRef', 'role', 'status', 'bounds', 'unitsUsed', 'ledger', 'sellerAgentId', 'deviceId', 'receipt', 'createdAt', 'startedAt', 'endedAt'];
  if (!hasOnly(value, keys)) return null;
  if (typeof value.taskRef !== 'string' || !MACHINE_TASK_REF_PATTERN_V1.test(value.taskRef)) return null;
  if (!isOneOf(value.role, MACHINE_TASK_ROLES_V1) || !isOneOf(value.status, DEVICE_RENTAL_JOB_STATUSES_V0)) return null;
  const bounds = decodeBounds(value.bounds);
  if (!bounds) return null;
  const unitsUsed = orNull(value.unitsUsed, (entry): entry is number => isCount(entry, bounds.maxUnits));
  if (unitsUsed === undefined) return null;
  const ledger = value.ledger;
  if (!isRecord(ledger) || !hasOnly(ledger, ['environment', 'escrowState', 'amountCents']) || ledger.environment !== 'test') return null;
  if (!isOneOf(ledger.escrowState, MACHINE_TASK_ESCROW_STATES_V1)) return null;
  const amountCents = orNull(ledger.amountCents, (entry): entry is number => isCount(entry, bounds.maxAmountCents));
  if (amountCents === undefined) return null;
  if (typeof value.sellerAgentId !== 'string' || !AGENT_ID.test(value.sellerAgentId)) return null;
  const deviceId = orNull(value.deviceId, isOpaque);
  if (deviceId === undefined) return null;
  // The buyer's view has no room for the device.
  if (value.role === 'buyer' && deviceId !== null) return null;
  const receipt = decodeReceiptState(value.receipt);
  if (!receipt) return null;
  if (!isTime(value.createdAt)) return null;
  const startedAt = orNull(value.startedAt, isTime);
  const endedAt = orNull(value.endedAt, isTime);
  if (startedAt === undefined || endedAt === undefined) return null;
  return {
    schemaVersion: 1,
    taskRef: value.taskRef,
    role: value.role,
    status: value.status,
    bounds,
    unitsUsed,
    ledger: { environment: 'test', escrowState: ledger.escrowState, amountCents },
    sellerAgentId: value.sellerAgentId,
    deviceId,
    receipt,
    createdAt: value.createdAt,
    startedAt,
    endedAt,
  };
}

export function decodeMachineTaskListV1(value: unknown): MachineTaskListV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['items']) || !Array.isArray(value.items) || value.items.length > MACHINE_TASK_LIST_MAX_V1) return null;
  const items: MachineTaskViewV1[] = [];
  for (const raw of value.items) {
    const item = decodeMachineTaskViewV1(raw);
    if (!item) return null;
    items.push(item);
  }
  return { items };
}

// ── 3. The machine action receipt ────────────────────────────────────────────────────────────────

/** JWS header `typ` of the platform's countersignature. Not a Trust Core action receipt. */
export const MACHINE_ACTION_RECEIPT_TYP_V1 = 'machine-action-receipt+jwt' as const;
export const MACHINE_ACTION_RECEIPT_KIND_V1 = 'machine_action_receipt' as const;
export const MACHINE_ACTION_RECEIPT_REF_PATTERN_V1 = /^mar_[0-9a-f]{32}$/;
export const MACHINE_ACTION_RECEIPT_OUTCOMES_V1 = ['completed', 'failed'] as const;
export type MachineActionReceiptOutcomeV1 = (typeof MACHINE_ACTION_RECEIPT_OUTCOMES_V1)[number];
/** RFC 7638 thumbprint (SHA-256, base64url) of the device's P-256 signing key. */
export const MACHINE_DEVICE_KEY_THUMBPRINT_PATTERN_V1 = B64URL_COORD;
/** `sha256:` + hex of the SHA-256 of the device's signature string (ASCII). */
export const MACHINE_DEVICE_SIGNATURE_DIGEST_PATTERN_V1 = DIGEST;
/** P-256 / SHA-256, IEEE P1363 (r||s), base64url. */
export const MACHINE_DEVICE_SIGNATURE_PATTERN_V1 = /^[A-Za-z0-9_-]{86}$/;

/**
 * What the platform signs. Both sides may read all of it: there is no device id, no owner and no account in it.
 * - `deviceFinishedAt` is the time the device signed; `receivedAt` is when the server got the receipt.
 * - `deviceKeyThumbprint` names the key the device's signature was checked against; `deviceSignatureDigest` ties the
 *   signature itself (seller only) to these claims.
 */
export interface MachineActionReceiptClaimsV1 {
  iss: string;
  iat: number;
  /** The receipt reference. */
  jti: string;
  kind: typeof MACHINE_ACTION_RECEIPT_KIND_V1;
  receiptVersion: 1;
  environment: 'test';
  taskRef: string;
  sellerAgentId: string;
  capabilityType: string;
  unit: DeviceRentalUnitV0;
  priceCentsPerUnit: number;
  maxUnits: number;
  maxAmountCents: number;
  outcome: MachineActionReceiptOutcomeV1;
  unitsUsed: number;
  inputDigest: string;
  resultDigest: string;
  startedAt: string;
  deviceFinishedAt: string;
  receivedAt: string;
  deviceKeyThumbprint: string;
  deviceSignatureDigest: string;
  assurance: 'device_key';
}

export const MACHINE_ACTION_RECEIPT_CLAIM_KEYS_V1 = [
  'iss',
  'iat',
  'jti',
  'kind',
  'receiptVersion',
  'environment',
  'taskRef',
  'sellerAgentId',
  'capabilityType',
  'unit',
  'priceCentsPerUnit',
  'maxUnits',
  'maxAmountCents',
  'outcome',
  'unitsUsed',
  'inputDigest',
  'resultDigest',
  'startedAt',
  'deviceFinishedAt',
  'receivedAt',
  'deviceKeyThumbprint',
  'deviceSignatureDigest',
  'assurance',
] as const;

export interface MachineDevicePublicJwkV1 {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

/** Seller only: what it takes to check the device's signature again without the platform. */
export interface MachineActionReceiptDeviceProofV1 {
  deviceId: string;
  publicJwk: MachineDevicePublicJwkV1;
  /** Over `machineActionReceiptDeviceMessageV1(claims, deviceId)`. */
  signature: string;
  /** The device's capability declaration the key came from. */
  declarationId: string;
  declarationDigest: string;
}

/**
 * What the server found when it read the receipt back:
 * - platform: `valid` (the stored countersignature verifies and carries exactly these claims), `invalid`, `unsigned`
 *   (the platform had no key when the receipt was written), `unavailable` (no key to check with now);
 * - device: `valid` (the stored signature verifies against the stored key over the message rebuilt from these claims,
 *   and both digests in the claims match), `invalid`.
 */
export const MACHINE_RECEIPT_PLATFORM_CHECKS_V1 = ['valid', 'invalid', 'unsigned', 'unavailable'] as const;
export type MachineReceiptPlatformCheckV1 = (typeof MACHINE_RECEIPT_PLATFORM_CHECKS_V1)[number];
export const MACHINE_RECEIPT_DEVICE_CHECKS_V1 = ['valid', 'invalid'] as const;
export type MachineReceiptDeviceCheckV1 = (typeof MACHINE_RECEIPT_DEVICE_CHECKS_V1)[number];

export interface MachineActionReceiptViewV1 {
  schemaVersion: 1;
  receiptRef: string;
  taskRef: string;
  role: MachineTaskRoleV1;
  claims: MachineActionReceiptClaimsV1;
  /** Compact JWS over `claims` (ES256, `typ` `MACHINE_ACTION_RECEIPT_TYP_V1`); null when the platform did not sign. */
  platformJws: string | null;
  checks: { platformSignature: MachineReceiptPlatformCheckV1; deviceSignature: MachineReceiptDeviceCheckV1 };
  /** Seller only. Always null for the buyer. */
  deviceProof: MachineActionReceiptDeviceProofV1 | null;
}

/** The six-line message the device signed (`deviceRentalReceiptMessageV0`), rebuilt from the claims and the device id. */
export function machineActionReceiptDeviceMessageV1(
  claims: Pick<MachineActionReceiptClaimsV1, 'taskRef' | 'resultDigest' | 'unitsUsed' | 'deviceFinishedAt'>,
  deviceId: string,
): string {
  return deviceRentalReceiptMessageV0({
    deviceId,
    jobRef: claims.taskRef,
    resultDigest: claims.resultDigest,
    unitsUsed: claims.unitsUsed,
    finishedAt: claims.deviceFinishedAt,
  });
}

export function decodeMachineActionReceiptClaimsV1(value: unknown): MachineActionReceiptClaimsV1 | null {
  if (!isRecord(value) || !hasOnly(value, MACHINE_ACTION_RECEIPT_CLAIM_KEYS_V1)) return null;
  if (typeof value.iss !== 'string' || value.iss.length === 0 || value.iss.length > 200) return null;
  if (!isCount(value.iat) || value.iat < 1) return null;
  if (typeof value.jti !== 'string' || !MACHINE_ACTION_RECEIPT_REF_PATTERN_V1.test(value.jti)) return null;
  if (value.kind !== MACHINE_ACTION_RECEIPT_KIND_V1 || value.receiptVersion !== 1 || value.environment !== 'test') return null;
  if (typeof value.taskRef !== 'string' || !MACHINE_TASK_REF_PATTERN_V1.test(value.taskRef)) return null;
  if (typeof value.sellerAgentId !== 'string' || !AGENT_ID.test(value.sellerAgentId)) return null;
  const bounds = decodeBounds({
    capabilityType: value.capabilityType,
    unit: value.unit,
    priceCentsPerUnit: value.priceCentsPerUnit,
    maxUnits: value.maxUnits,
    maxAmountCents: value.maxAmountCents,
  });
  if (!bounds) return null;
  if (!isOneOf(value.outcome, MACHINE_ACTION_RECEIPT_OUTCOMES_V1)) return null;
  if (!isCount(value.unitsUsed, bounds.maxUnits)) return null;
  // A completed task used at least one unit; a failed one used none.
  if (value.outcome === 'completed' ? value.unitsUsed < 1 : value.unitsUsed !== 0) return null;
  if (typeof value.inputDigest !== 'string' || !DIGEST.test(value.inputDigest)) return null;
  if (typeof value.resultDigest !== 'string' || !DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0.test(value.resultDigest)) return null;
  if (!isTime(value.startedAt) || !isTime(value.deviceFinishedAt) || !isTime(value.receivedAt)) return null;
  if (typeof value.deviceKeyThumbprint !== 'string' || !MACHINE_DEVICE_KEY_THUMBPRINT_PATTERN_V1.test(value.deviceKeyThumbprint)) return null;
  if (typeof value.deviceSignatureDigest !== 'string' || !MACHINE_DEVICE_SIGNATURE_DIGEST_PATTERN_V1.test(value.deviceSignatureDigest)) return null;
  if (value.assurance !== 'device_key') return null;
  return {
    iss: value.iss,
    iat: value.iat,
    jti: value.jti,
    kind: MACHINE_ACTION_RECEIPT_KIND_V1,
    receiptVersion: 1,
    environment: 'test',
    taskRef: value.taskRef,
    sellerAgentId: value.sellerAgentId,
    capabilityType: bounds.capabilityType,
    unit: bounds.unit,
    priceCentsPerUnit: bounds.priceCentsPerUnit,
    maxUnits: bounds.maxUnits,
    maxAmountCents: bounds.maxAmountCents,
    outcome: value.outcome,
    unitsUsed: value.unitsUsed,
    inputDigest: value.inputDigest,
    resultDigest: value.resultDigest,
    startedAt: value.startedAt,
    deviceFinishedAt: value.deviceFinishedAt,
    receivedAt: value.receivedAt,
    deviceKeyThumbprint: value.deviceKeyThumbprint,
    deviceSignatureDigest: value.deviceSignatureDigest,
    assurance: 'device_key',
  };
}

export function decodeMachineDevicePublicJwkV1(value: unknown): MachineDevicePublicJwkV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['kty', 'crv', 'x', 'y'])) return null;
  if (value.kty !== 'EC' || value.crv !== 'P-256') return null;
  if (typeof value.x !== 'string' || !B64URL_COORD.test(value.x) || typeof value.y !== 'string' || !B64URL_COORD.test(value.y)) return null;
  return { kty: 'EC', crv: 'P-256', x: value.x, y: value.y };
}

function decodeDeviceProof(value: unknown): MachineActionReceiptDeviceProofV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['deviceId', 'publicJwk', 'signature', 'declarationId', 'declarationDigest'])) return null;
  if (typeof value.deviceId !== 'string' || !OPAQUE.test(value.deviceId)) return null;
  const publicJwk = decodeMachineDevicePublicJwkV1(value.publicJwk);
  if (!publicJwk) return null;
  if (typeof value.signature !== 'string' || !MACHINE_DEVICE_SIGNATURE_PATTERN_V1.test(value.signature)) return null;
  if (typeof value.declarationId !== 'string' || !UUID.test(value.declarationId)) return null;
  if (typeof value.declarationDigest !== 'string' || !DIGEST.test(value.declarationDigest)) return null;
  return { deviceId: value.deviceId, publicJwk, signature: value.signature, declarationId: value.declarationId, declarationDigest: value.declarationDigest };
}

/** All clients: decode one receipt. An unknown key or value refuses the whole view. */
export function decodeMachineActionReceiptViewV1(value: unknown): MachineActionReceiptViewV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!hasOnly(value, ['schemaVersion', 'receiptRef', 'taskRef', 'role', 'claims', 'platformJws', 'checks', 'deviceProof'])) return null;
  const claims = decodeMachineActionReceiptClaimsV1(value.claims);
  if (!claims) return null;
  if (value.receiptRef !== claims.jti || value.taskRef !== claims.taskRef) return null;
  if (!isOneOf(value.role, MACHINE_TASK_ROLES_V1)) return null;
  const platformJws = orNull(value.platformJws, isCompactJws);
  if (platformJws === undefined) return null;
  const checks = value.checks;
  if (!isRecord(checks) || !hasOnly(checks, ['platformSignature', 'deviceSignature'])) return null;
  if (!isOneOf(checks.platformSignature, MACHINE_RECEIPT_PLATFORM_CHECKS_V1) || !isOneOf(checks.deviceSignature, MACHINE_RECEIPT_DEVICE_CHECKS_V1)) return null;
  // Signed and unsigned must agree with whether there is a countersignature at all.
  if ((platformJws === null) !== (checks.platformSignature === 'unsigned')) return null;
  let deviceProof: MachineActionReceiptDeviceProofV1 | null = null;
  if (value.deviceProof !== null) {
    // The buyer's view has no room for the device.
    if (value.role === 'buyer') return null;
    deviceProof = decodeDeviceProof(value.deviceProof);
    if (!deviceProof) return null;
  }
  return {
    schemaVersion: 1,
    receiptRef: claims.jti,
    taskRef: claims.taskRef,
    role: value.role,
    claims,
    platformJws,
    checks: { platformSignature: checks.platformSignature, deviceSignature: checks.deviceSignature },
    deviceProof,
  };
}

/** Three base64url parts, at most 24 KB. */
function isCompactJws(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 24 * 1024 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

// ── 4. The owner's devices: what each may do, and the stop ──────────────────────────────────────────────

export const MACHINE_DEVICE_LIST_MAX_V1 = 20;
/** A device declares at most 32 capabilities; a rule or an offer may name a few more it no longer declares. */
export const MACHINE_DEVICE_CAPABILITY_MAX_V1 = 64;
/** Rules one stop may report (every rule of the device that named other owners' Agents). */
export const MACHINE_DEVICE_STOP_RULES_MAX_V1 = 128;

/**
 * Why a capability takes no new task from other owners' Agents right now, the first that applies: the device has no
 * live declaration of it; it reports it busy or unavailable; the platform's switches do not allow renting this type;
 * the owner has no active offer for it (a paused offer counts as none); or the owner's rule says no (the reasons of
 * `evaluateDeviceRentalRuleV0`, read without an order: the day's caps are counted when a task is ordered).
 */
export const MACHINE_DEVICE_CLOSED_REASONS_V1 = [
  'not_declared',
  'not_available',
  'not_rentable',
  'no_offer',
  'no_rule',
  'audience',
  'window',
  'price_below_minimum',
  'offer_over_daily_cap',
  'daily_jobs_cap',
  'daily_minutes_cap',
  'approval_required',
] as const;
export type MachineDeviceClosedReasonV1 = (typeof MACHINE_DEVICE_CLOSED_REASONS_V1)[number];

export interface MachineDeviceRuleSummaryV1 {
  audience: DeviceRuleAudienceV0[];
  windows: string[];
  timezone: string;
  approval: DeviceRuleApprovalV0;
  minPriceCentsPerJob: number | null;
  maxJobsPerDay: number | null;
  maxMinutesPerDay: number | null;
  revision: number;
}

export interface MachineDeviceCapabilityV1 {
  capabilityType: string;
  /** From the device's live signed declaration; null when it has none or does not list this capability. */
  declaredState: DeviceCapabilityStateV0 | null;
  /** Whether the platform's switches allow renting this type at all. */
  rentable: boolean;
  rule: MachineDeviceRuleSummaryV1 | null;
  /** Whether the device would take a new task from another owner's Agent now. */
  takesTasks: boolean;
  closedReason: MachineDeviceClosedReasonV1 | null;
}

/** Why the platform's signed list of inference programs and models is not available. */
export const MACHINE_PINNED_PROGRAMS_REASONS_V1 = [
  'not_configured',
  'unreadable',
  'malformed',
  'signer_unknown',
  'signature_invalid',
  'invalid_manifest',
  'not_yet_valid',
  'expired',
] as const;
export type MachinePinnedProgramsReasonV1 = (typeof MACHINE_PINNED_PROGRAMS_REASONS_V1)[number];

export type MachinePinnedProgramsV1 =
  | { available: true; entries: number; expiresAt: string }
  | { available: false; reason: MachinePinnedProgramsReasonV1 };

export interface MachineDeviceManifestV1 {
  schemaVersion: 1;
  deviceId: string;
  /** The device's latest signed capability declaration; `live` is false once it has expired. */
  declaration: { declarationId: string; digest: string; observedAt: string; expiresAt: string; live: boolean } | null;
  capabilities: MachineDeviceCapabilityV1[];
  /** A rented task only runs an inference program and model from this list, signed by people, checked by the device. */
  pinnedPrograms: MachinePinnedProgramsV1;
  /** Seconds. A running task is failed and refunded after `runLimitSeconds`; a waiting one is cancelled after `pendingLimitSeconds`. */
  limits: { runLimitSeconds: number; pendingLimitSeconds: number; disputeWindowSeconds: number };
  open: { queued: number; running: number };
  lastStop: { stoppedAt: string; rulesChanged: number; cancelledTasks: number } | null;
}

export interface MachineDeviceListV1 {
  items: MachineDeviceManifestV1[];
}

function decodeRuleSummary(value: unknown): MachineDeviceRuleSummaryV1 | null {
  if (!isRecord(value)) return null;
  if (!hasOnly(value, ['audience', 'windows', 'timezone', 'approval', 'minPriceCentsPerJob', 'maxJobsPerDay', 'maxMinutesPerDay', 'revision'])) return null;
  const audience = value.audience;
  if (!Array.isArray(audience) || audience.length === 0 || audience.length > DEVICE_RULE_AUDIENCES_V0.length) return null;
  const seen: DeviceRuleAudienceV0[] = [];
  for (const entry of audience) {
    if (!isOneOf(entry, DEVICE_RULE_AUDIENCES_V0) || seen.includes(entry)) return null;
    seen.push(entry);
  }
  const windows = value.windows;
  if (!Array.isArray(windows) || windows.length > 8) return null;
  const windowList: string[] = [];
  for (const entry of windows) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 40) return null;
    windowList.push(entry);
  }
  if (typeof value.timezone !== 'string' || value.timezone.length === 0 || value.timezone.length > 64) return null;
  if (!isOneOf(value.approval, DEVICE_RULE_APPROVALS_V0)) return null;
  for (const key of ['minPriceCentsPerJob', 'maxJobsPerDay', 'maxMinutesPerDay'] as const) {
    if (value[key] !== null && !isCount(value[key], MAX_CENTS)) return null;
  }
  if (!isCount(value.revision)) return null;
  return {
    audience: seen,
    windows: windowList,
    timezone: value.timezone,
    approval: value.approval,
    minPriceCentsPerJob: value.minPriceCentsPerJob as number | null,
    maxJobsPerDay: value.maxJobsPerDay as number | null,
    maxMinutesPerDay: value.maxMinutesPerDay as number | null,
    revision: value.revision,
  };
}

function decodeCapability(value: unknown): MachineDeviceCapabilityV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['capabilityType', 'declaredState', 'rentable', 'rule', 'takesTasks', 'closedReason'])) return null;
  if (typeof value.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(value.capabilityType)) return null;
  const declaredState = orNull(value.declaredState, (entry): entry is DeviceCapabilityStateV0 => isOneOf(entry, DEVICE_CAPABILITY_STATES_V0));
  if (declaredState === undefined) return null;
  if (typeof value.rentable !== 'boolean' || typeof value.takesTasks !== 'boolean') return null;
  const rule = value.rule === null ? null : decodeRuleSummary(value.rule);
  if (value.rule !== null && !rule) return null;
  const closedReason = orNull(value.closedReason, (entry): entry is MachineDeviceClosedReasonV1 => isOneOf(entry, MACHINE_DEVICE_CLOSED_REASONS_V1));
  if (closedReason === undefined) return null;
  // Open and closed must agree with the reason.
  if (value.takesTasks !== (closedReason === null)) return null;
  return {
    capabilityType: value.capabilityType,
    declaredState,
    rentable: value.rentable,
    rule,
    takesTasks: value.takesTasks,
    closedReason,
  };
}

function decodePinnedPrograms(value: unknown): MachinePinnedProgramsV1 | null {
  if (!isRecord(value)) return null;
  if (value.available === true) {
    if (!hasOnly(value, ['available', 'entries', 'expiresAt']) || !isCount(value.entries, 10_000) || !isTime(value.expiresAt)) return null;
    return { available: true, entries: value.entries, expiresAt: value.expiresAt };
  }
  if (value.available === false) {
    if (!hasOnly(value, ['available', 'reason']) || !isOneOf(value.reason, MACHINE_PINNED_PROGRAMS_REASONS_V1)) return null;
    return { available: false, reason: value.reason };
  }
  return null;
}

/** All clients: decode one device. An unknown key or value refuses the whole view. */
export function decodeMachineDeviceManifestV1(value: unknown): MachineDeviceManifestV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!hasOnly(value, ['schemaVersion', 'deviceId', 'declaration', 'capabilities', 'pinnedPrograms', 'limits', 'open', 'lastStop'])) return null;
  if (typeof value.deviceId !== 'string' || !OPAQUE.test(value.deviceId)) return null;
  let declaration: MachineDeviceManifestV1['declaration'] = null;
  if (value.declaration !== null) {
    const d = value.declaration;
    if (!isRecord(d) || !hasOnly(d, ['declarationId', 'digest', 'observedAt', 'expiresAt', 'live'])) return null;
    if (typeof d.declarationId !== 'string' || !UUID.test(d.declarationId) || typeof d.digest !== 'string' || !DIGEST.test(d.digest)) return null;
    if (!isTime(d.observedAt) || !isTime(d.expiresAt) || typeof d.live !== 'boolean') return null;
    declaration = { declarationId: d.declarationId, digest: d.digest, observedAt: d.observedAt, expiresAt: d.expiresAt, live: d.live };
  }
  if (!Array.isArray(value.capabilities) || value.capabilities.length > MACHINE_DEVICE_CAPABILITY_MAX_V1) return null;
  const capabilities: MachineDeviceCapabilityV1[] = [];
  for (const raw of value.capabilities) {
    const capability = decodeCapability(raw);
    if (!capability || capabilities.some((entry) => entry.capabilityType === capability.capabilityType)) return null;
    capabilities.push(capability);
  }
  const pinnedPrograms = decodePinnedPrograms(value.pinnedPrograms);
  if (!pinnedPrograms) return null;
  const limits = value.limits;
  if (!isRecord(limits) || !hasOnly(limits, ['runLimitSeconds', 'pendingLimitSeconds', 'disputeWindowSeconds'])) return null;
  if (!isCount(limits.runLimitSeconds, 86_400) || !isCount(limits.pendingLimitSeconds, 86_400) || !isCount(limits.disputeWindowSeconds, 366 * 86_400)) return null;
  const open = value.open;
  if (!isRecord(open) || !hasOnly(open, ['queued', 'running']) || !isCount(open.queued) || !isCount(open.running)) return null;
  let lastStop: MachineDeviceManifestV1['lastStop'] = null;
  if (value.lastStop !== null) {
    const s = value.lastStop;
    if (!isRecord(s) || !hasOnly(s, ['stoppedAt', 'rulesChanged', 'cancelledTasks'])) return null;
    if (!isTime(s.stoppedAt) || !isCount(s.rulesChanged) || !isCount(s.cancelledTasks)) return null;
    lastStop = { stoppedAt: s.stoppedAt, rulesChanged: s.rulesChanged, cancelledTasks: s.cancelledTasks };
  }
  return {
    schemaVersion: 1,
    deviceId: value.deviceId,
    declaration,
    capabilities,
    pinnedPrograms,
    limits: { runLimitSeconds: limits.runLimitSeconds, pendingLimitSeconds: limits.pendingLimitSeconds, disputeWindowSeconds: limits.disputeWindowSeconds },
    open: { queued: open.queued, running: open.running },
    lastStop,
  };
}

export function decodeMachineDeviceListV1(value: unknown): MachineDeviceListV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['items']) || !Array.isArray(value.items) || value.items.length > MACHINE_DEVICE_LIST_MAX_V1) return null;
  const items: MachineDeviceManifestV1[] = [];
  for (const raw of value.items) {
    const item = decodeMachineDeviceManifestV1(raw);
    if (!item) return null;
    items.push(item);
  }
  return { items };
}

/**
 * The owner's stop.
 * - `stopped`: no rule on this device names other owners' Agents any more.
 * - `partial`: at least one rule could not be rewritten (`rules[].result === 'failed'`): for that capability the device
 *   may still take tasks. The caller must say so; it is never shown as a success.
 * - `nothing_to_stop`: no rule named other owners' Agents and no task was waiting.
 * `queuedLeft` tasks were still waiting right after the stop (they could not be cancelled this instant): the rental's
 * sweep cancels and refunds them at the pending limit, and once every rule is stopped none of them is handed to the
 * device any more. `runningTasks` finish or time out: a device cannot be stopped mid-run.
 */
export const MACHINE_DEVICE_STOP_OUTCOMES_V1 = ['stopped', 'partial', 'nothing_to_stop'] as const;
export type MachineDeviceStopOutcomeV1 = (typeof MACHINE_DEVICE_STOP_OUTCOMES_V1)[number];
export const MACHINE_DEVICE_STOP_FAIL_REASONS_V1 = ['revision_conflict', 'invalid_rule', 'store_unavailable'] as const;
export type MachineDeviceStopFailReasonV1 = (typeof MACHINE_DEVICE_STOP_FAIL_REASONS_V1)[number];

export type MachineDeviceStopRuleV1 =
  | { capabilityType: string; result: 'stopped' }
  | { capabilityType: string; result: 'failed'; reason: MachineDeviceStopFailReasonV1 };

export interface MachineDeviceStopResultV1 {
  schemaVersion: 1;
  deviceId: string;
  outcome: MachineDeviceStopOutcomeV1;
  rules: MachineDeviceStopRuleV1[];
  cancelledTasks: number;
  queuedLeft: number;
  runningTasks: number;
  stoppedAt: string;
}

/** What the audience of a rule becomes when the owner stops the device: everything but other owners' Agents. */
export function machineStoppedAudienceV1(audience: readonly DeviceRuleAudienceV0[]): DeviceRuleAudienceV0[] {
  const rest = audience.filter((entry) => entry !== 'other_agents');
  return rest.length > 0 ? rest : ['own_agents'];
}

export function decodeMachineDeviceStopResultV1(value: unknown): MachineDeviceStopResultV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!hasOnly(value, ['schemaVersion', 'deviceId', 'outcome', 'rules', 'cancelledTasks', 'queuedLeft', 'runningTasks', 'stoppedAt'])) return null;
  if (typeof value.deviceId !== 'string' || !OPAQUE.test(value.deviceId)) return null;
  if (!isOneOf(value.outcome, MACHINE_DEVICE_STOP_OUTCOMES_V1)) return null;
  if (!Array.isArray(value.rules) || value.rules.length > MACHINE_DEVICE_STOP_RULES_MAX_V1) return null;
  const rules: MachineDeviceStopRuleV1[] = [];
  for (const raw of value.rules) {
    if (!isRecord(raw) || typeof raw.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(raw.capabilityType)) return null;
    if (raw.result === 'stopped' && hasOnly(raw, ['capabilityType', 'result'])) {
      rules.push({ capabilityType: raw.capabilityType, result: 'stopped' });
    } else if (raw.result === 'failed' && hasOnly(raw, ['capabilityType', 'result', 'reason']) && isOneOf(raw.reason, MACHINE_DEVICE_STOP_FAIL_REASONS_V1)) {
      rules.push({ capabilityType: raw.capabilityType, result: 'failed', reason: raw.reason });
    } else {
      return null;
    }
  }
  if (!isCount(value.cancelledTasks) || !isCount(value.queuedLeft) || !isCount(value.runningTasks) || !isTime(value.stoppedAt)) return null;
  // A failed rule is never reported as anything but `partial`, and `partial` always names one.
  if (rules.some((rule) => rule.result === 'failed') !== (value.outcome === 'partial')) return null;
  return {
    schemaVersion: 1,
    deviceId: value.deviceId,
    outcome: value.outcome,
    rules,
    cancelledTasks: value.cancelledTasks,
    queuedLeft: value.queuedLeft,
    runningTasks: value.runningTasks,
    stoppedAt: value.stoppedAt,
  };
}

// ── 5. Paying a task on a test network (cycle B) ─────────────────────────────────────────────────────────────────

/**
 * A buyer may have one task paid on a TEST network from its Agent's own wallet:
 * - chosen per order: the buyer orders through `POST /machine-tasks/orders` and names one of its session grants
 *   (`settle.grantId`). A task ordered any other way is never paid on a chain.
 * - paid only once the task completed, its machine receipt checks out, the dispute window is over and the rental's test
 *   escrow has released the money. A payment out of the buyer's own wallet cannot be taken back, so nothing is paid
 *   while it could still be disputed.
 * - the platform never pays by itself: it asks the wallet for one payment and the buyer's device signs it with its
 *   session key. The server holds no key that could sign instead. A request the device does not sign in time lapses
 *   with nothing sent, and nothing is asked again unless the buyer asks (`retry`), at most three requests a task.
 * - testnets only (chains 97 and 84532, each with its one token). No real money, and the payment is NOT added to the
 *   rental's income totals: the test ledger and the chain are two separate records.
 *
 * Switches: `MACHINE_TASK_SETTLEMENT_V1_ENABLED` on top of the three machine-task switches and the own wallet's main,
 * recovery and session switches, each exactly `'1'`. Any of them off: the three routes answer like routes that do not
 * exist and the settlement sweep reads and writes nothing.
 */
export const MACHINE_TASK_SETTLEMENT_FLAG_V1 = 'MACHINE_TASK_SETTLEMENT_V1_ENABLED' as const;

export const MACHINE_TASK_SETTLEMENT_REQUIRED_FLAGS_V1 = [
  ...MACHINE_TASK_REQUIRED_FLAGS_V1,
  'AGENT_OWN_WALLET_V1_ENABLED',
  'AGENT_OWN_WALLET_RECOVERY_V1_ENABLED',
  'AGENT_OWN_WALLET_SESSION_V1_ENABLED',
  MACHINE_TASK_SETTLEMENT_FLAG_V1,
] as const;

export function machineTaskSettlementEnabledV1(flags: Readonly<Record<string, string | undefined>>): boolean {
  return MACHINE_TASK_SETTLEMENT_REQUIRED_FLAGS_V1.every((flag) => flags[flag] === '1');
}

/** Under `/api`, a person's own sign-in on every route. Only the buyer may order or ask for a payment again. */
export const MACHINE_TASK_SETTLEMENT_ROUTES_V1 = {
  order: 'POST /machine-tasks/orders',
  settlement: 'GET /machine-tasks/:taskRef/settlement',
  retry: 'POST /machine-tasks/:taskRef/settlement/retry',
} as const;

export function machineTaskOrderPathV1(): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/orders`;
}
export function machineTaskSettlementPathV1(taskRef: string): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/${encodeURIComponent(taskRef)}/settlement`;
}
export function machineTaskSettlementRetryPathV1(taskRef: string): string {
  return `${MACHINE_TASK_BASE_PATH_V1}/${encodeURIComponent(taskRef)}/settlement/retry`;
}

export const MACHINE_TASK_SETTLEMENT_ERROR_CODES_V1 = {
  /** 409: a check before the order failed (`reason`, `MachineTaskOrderRefusalV1`). No task was ordered. */
  orderRefused: 'MACHINE_TASK_ORDER_REFUSED',
  /** 409: the buyer asked for the payment again when that is not allowed (`reason`). Nothing was asked. */
  retryRefused: 'MACHINE_TASK_RETRY_REFUSED',
  /** 503: the wallet could not be asked. Nothing was ordered and nothing was asked. */
  walletUnavailable: 'MACHINE_TASK_WALLET_UNAVAILABLE',
} as const;

/**
 * Why an order with a payment was refused. A grant that is not the caller's reads exactly like one that does not exist
 * (`grant_not_found`).
 */
export const MACHINE_TASK_ORDER_REFUSALS_V1 = [
  'chain_not_allowed',
  'grant_not_found',
  'grant_not_active',
  'grant_expired',
  /** The grant is for another of the owner's Agents than the one that orders. */
  'grant_not_for_this_agent',
  /** The grant allows no payment in the chain's token. */
  'grant_without_token',
  /** The grant ends before the task's latest end, the dispute window and the time the device has to sign. */
  'grant_expires_too_soon',
  'payee_unavailable',
  /** The grant pays someone else than the seller Agent's receiving address. */
  'payee_mismatch',
  'over_per_payment_cap',
  /** With what this module has already set aside on the grant, the grant's total would not cover this task. */
  'over_total_cap',
] as const;
export type MachineTaskOrderRefusalV1 = (typeof MACHINE_TASK_ORDER_REFUSALS_V1)[number];

export const MACHINE_TASK_RETRY_REFUSALS_V1 = ['not_retryable', 'requests_used_up'] as const;
export type MachineTaskRetryRefusalV1 = (typeof MACHINE_TASK_RETRY_REFUSALS_V1)[number];

/**
 * The chains a task may be paid on, and the one token on each. This module's own list: the own wallet has its list too,
 * and a payment needs both. A main network is on neither.
 */
export const MACHINE_TASK_SETTLEMENT_CHAINS_V1 = [97, 84532] as const;
export type MachineTaskSettlementChainV1 = (typeof MACHINE_TASK_SETTLEMENT_CHAINS_V1)[number];

export interface MachineTaskSettlementTokenV1 {
  symbol: 'USDT' | 'USDC';
  /** Lower case. */
  address: string;
  decimals: number;
  /** The token's smallest units in one US cent, as a decimal string (whole numbers only). */
  unitsPerCent: string;
}

export const MACHINE_TASK_SETTLEMENT_TOKENS_V1: Readonly<Record<MachineTaskSettlementChainV1, MachineTaskSettlementTokenV1>> = {
  97: { symbol: 'USDT', address: '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd', decimals: 18, unitsPerCent: '10000000000000000' },
  84532: { symbol: 'USDC', address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', decimals: 6, unitsPerCent: '10000' },
};

export function machineTaskSettlementChainV1(chainId: unknown): chainId is MachineTaskSettlementChainV1 {
  return typeof chainId === 'number' && (MACHINE_TASK_SETTLEMENT_CHAINS_V1 as readonly number[]).includes(chainId);
}

/** US cents in the chain's token, in its smallest unit: integers only. Null off the list or for anything but whole cents. */
export function machineTaskCentsToUnitsV1(chainId: unknown, cents: unknown): bigint | null {
  if (!machineTaskSettlementChainV1(chainId) || !isCount(cents, MAX_CENTS)) return null;
  return BigInt(cents) * BigInt(MACHINE_TASK_SETTLEMENT_TOKENS_V1[chainId].unitsPerCent);
}

/** At most this many payment requests for one task (the first one and two more the buyer asks for). */
export const MACHINE_TASK_SETTLEMENT_MAX_REQUESTS_V1 = 3;

/**
 * Where a task's payment is:
 * - `waiting`: not payable yet (not finished, in the dispute window, or the test escrow has not released the money).
 * - `requesting`: the wallet is being asked right now. A payment left here (the server stopped halfway) is never asked
 *   again by itself: it goes to `review`.
 * - `awaiting_signature`: the wallet holds the payment for the buyer's device to sign until `requestExpiresAt`.
 * - `submitted`: the device signed it and the wallet sent it.
 * - `paid`: confirmed on the test network (`txHash`).
 * - `expired`: the device did not sign in time. Nothing was sent; the buyer may ask again.
 * - `held`: a check right before paying failed (`reason`). Nothing was sent; the buyer may ask again.
 * - `not_payable`: this task is never paid on a chain (`reason`).
 * - `review`: a person has to look (`reason`). Nothing is asked again, by the platform or on request.
 */
export const MACHINE_TASK_SETTLEMENT_STATES_V1 = ['waiting', 'requesting', 'awaiting_signature', 'submitted', 'paid', 'expired', 'held', 'not_payable', 'review'] as const;
export type MachineTaskSettlementStateV1 = (typeof MACHINE_TASK_SETTLEMENT_STATES_V1)[number];

export const MACHINE_TASK_SETTLEMENT_REASONS_V1 = {
  expired: ['device_did_not_sign'],
  held: ['payee_changed', 'payee_unavailable', 'amount_out_of_bounds', 'chain_not_allowed', 'wallet_refused', 'wallet_unavailable'],
  not_payable: ['task_failed', 'task_cancelled', 'refunded', 'dispute_refunded', 'no_machine_receipt', 'nothing_to_pay', 'grant_revoked', 'grant_expired', 'grant_not_active'],
  review: ['interrupted', 'payment_failed', 'receipt_invalid', 'amount_invalid', 'wallet_error'],
} as const;
export type MachineTaskSettlementReasonV1 = (typeof MACHINE_TASK_SETTLEMENT_REASONS_V1)[keyof typeof MACHINE_TASK_SETTLEMENT_REASONS_V1][number];

/** The states in which the buyer may ask for the payment again (while requests are left). */
export const MACHINE_TASK_SETTLEMENT_RETRYABLE_V1: readonly MachineTaskSettlementStateV1[] = ['expired', 'held'];

export interface MachineTaskSettlementViewV1 {
  schemaVersion: 1;
  taskRef: string;
  role: MachineTaskRoleV1;
  environment: 'testnet';
  state: MachineTaskSettlementStateV1;
  /** Set exactly for `expired`, `held`, `not_payable` and `review`. */
  reason: MachineTaskSettlementReasonV1 | null;
  chainId: MachineTaskSettlementChainV1;
  token: MachineTaskSettlementTokenV1;
  /** The seller Agent's receiving address, as the wallet gave it when the task was ordered (lower case). */
  payee: string;
  /** The most this task may be paid, in the token's smallest unit (decimal string). */
  capUnits: string;
  /** What was asked for, once a request was made. */
  amountUnits: string | null;
  /** Payment requests made so far. */
  requests: number;
  /** Buyer only: asking again is allowed now. Always false for the seller. */
  canRetry: boolean;
  requestExpiresAt: string | null;
  /** Only once `paid`. */
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
const UNITS = /^(0|[1-9][0-9]{0,77})$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;
const SETTLEMENT_KEYS = [
  'schemaVersion',
  'taskRef',
  'role',
  'environment',
  'state',
  'reason',
  'chainId',
  'token',
  'payee',
  'capUnits',
  'amountUnits',
  'requests',
  'canRetry',
  'requestExpiresAt',
  'txHash',
  'createdAt',
  'updatedAt',
] as const;

function reasonFits(state: MachineTaskSettlementStateV1, reason: unknown): boolean {
  const allowed = (MACHINE_TASK_SETTLEMENT_REASONS_V1 as Readonly<Record<string, readonly string[]>>)[state];
  return allowed ? typeof reason === 'string' && allowed.includes(reason) : reason === null;
}

/** All clients: decode a task's payment. Anything unknown, or a value that contradicts the state, refuses all of it. */
export function decodeMachineTaskSettlementViewV1(value: unknown): MachineTaskSettlementViewV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !hasOnly(value, SETTLEMENT_KEYS)) return null;
  if (typeof value.taskRef !== 'string' || !MACHINE_TASK_REF_PATTERN_V1.test(value.taskRef)) return null;
  if (!isOneOf(value.role, MACHINE_TASK_ROLES_V1) || value.environment !== 'testnet') return null;
  if (!isOneOf(value.state, MACHINE_TASK_SETTLEMENT_STATES_V1) || !reasonFits(value.state, value.reason)) return null;
  if (!machineTaskSettlementChainV1(value.chainId)) return null;
  const pinned = MACHINE_TASK_SETTLEMENT_TOKENS_V1[value.chainId];
  const token = value.token;
  if (!isRecord(token) || !hasOnly(token, ['symbol', 'address', 'decimals', 'unitsPerCent'])) return null;
  if (token.symbol !== pinned.symbol || token.address !== pinned.address || token.decimals !== pinned.decimals || token.unitsPerCent !== pinned.unitsPerCent) return null;
  if (typeof value.payee !== 'string' || !ADDRESS.test(value.payee)) return null;
  if (typeof value.capUnits !== 'string' || !UNITS.test(value.capUnits) || value.capUnits === '0') return null;
  if (value.amountUnits !== null && (typeof value.amountUnits !== 'string' || !UNITS.test(value.amountUnits) || BigInt(value.amountUnits) > BigInt(value.capUnits))) return null;
  if (!isCount(value.requests, MACHINE_TASK_SETTLEMENT_MAX_REQUESTS_V1) || typeof value.canRetry !== 'boolean') return null;
  const retryable = value.role === 'buyer' && MACHINE_TASK_SETTLEMENT_RETRYABLE_V1.includes(value.state) && value.requests < MACHINE_TASK_SETTLEMENT_MAX_REQUESTS_V1;
  if (value.canRetry !== retryable) return null;
  const requestExpiresAt = orNull(value.requestExpiresAt, isTime);
  if (requestExpiresAt === undefined) return null;
  const txHash = orNull(value.txHash, (v): v is string => typeof v === 'string' && TX_HASH.test(v));
  if (txHash === undefined || (txHash !== null) !== (value.state === 'paid')) return null;
  if (value.state === 'paid' && value.amountUnits === null) return null;
  if (!isTime(value.createdAt) || !isTime(value.updatedAt)) return null;
  return {
    schemaVersion: 1,
    taskRef: value.taskRef,
    role: value.role,
    environment: 'testnet',
    state: value.state,
    reason: value.reason as MachineTaskSettlementReasonV1 | null,
    chainId: value.chainId,
    token: { ...pinned },
    payee: value.payee,
    capUnits: value.capUnits,
    amountUnits: value.amountUnits as string | null,
    requests: value.requests,
    canRetry: value.canRetry,
    requestExpiresAt,
    txHash,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

/** The rental's own limits on an order (`device-rental.service.ts`), checked here first so a bad order asks no wallet. */
export const MACHINE_TASK_ORDER_INPUT_MAX_V1 = 32 * 1024;
export const MACHINE_TASK_ORDER_UNITS_MAX_V1 = 1000;

/** The body of `POST /machine-tasks/orders`: the rental's order and the grant to pay it from. Nothing else is read. */
export interface MachineTaskOrderRequestV1 {
  offerRef: string;
  buyerAgentAccountId: string;
  maxUnits: number;
  input: string;
  allowSpotCheck?: boolean;
  settle: { grantId: string };
}

/**
 * Server: decode an order. A key it does not know refuses the order (`field` names it): an address or an amount in the
 * body is never read, the payee comes from the wallet and the amount from the task.
 */
export function decodeMachineTaskOrderRequestV1(value: unknown): { ok: true; value: MachineTaskOrderRequestV1 } | { ok: false; field: string } {
  if (!isRecord(value)) return { ok: false, field: 'body' };
  const unknown = Object.keys(value).find((key) => !['offerRef', 'buyerAgentAccountId', 'maxUnits', 'input', 'allowSpotCheck', 'settle'].includes(key));
  if (unknown !== undefined) return { ok: false, field: unknown };
  if (typeof value.offerRef !== 'string' || !DEVICE_RENTAL_OFFER_REF_PATTERN_V0.test(value.offerRef)) return { ok: false, field: 'offerRef' };
  if (typeof value.buyerAgentAccountId !== 'string' || !UUID.test(value.buyerAgentAccountId)) return { ok: false, field: 'buyerAgentAccountId' };
  if (!isCount(value.maxUnits, MACHINE_TASK_ORDER_UNITS_MAX_V1) || value.maxUnits < 1) return { ok: false, field: 'maxUnits' };
  if (typeof value.input !== 'string' || value.input.length === 0 || value.input.length > MACHINE_TASK_ORDER_INPUT_MAX_V1) return { ok: false, field: 'input' };
  const allowSpotCheck = value.allowSpotCheck;
  if (allowSpotCheck !== undefined && typeof allowSpotCheck !== 'boolean') return { ok: false, field: 'allowSpotCheck' };
  const settle = value.settle;
  if (!isRecord(settle) || !hasOnly(settle, ['grantId']) || typeof settle.grantId !== 'string' || !UUID.test(settle.grantId)) return { ok: false, field: 'settle' };
  return {
    ok: true,
    value: {
      offerRef: value.offerRef,
      buyerAgentAccountId: value.buyerAgentAccountId,
      maxUnits: value.maxUnits,
      input: value.input,
      ...(typeof allowSpotCheck === 'boolean' ? { allowSpotCheck } : {}),
      settle: { grantId: settle.grantId.toLowerCase() },
    },
  };
}

export interface MachineTaskOrderResultV1 {
  schemaVersion: 1;
  task: MachineTaskViewV1;
  /**
   * Null when the payment could not be recorded after the task was ordered: the task is then an ordinary test-ledger
   * task and is never paid on a chain.
   */
  settlement: MachineTaskSettlementViewV1 | null;
}

export function decodeMachineTaskOrderResultV1(value: unknown): MachineTaskOrderResultV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !hasOnly(value, ['schemaVersion', 'task', 'settlement'])) return null;
  const task = decodeMachineTaskViewV1(value.task);
  if (!task || task.role !== 'buyer') return null;
  if (value.settlement === null) return { schemaVersion: 1, task, settlement: null };
  const settlement = decodeMachineTaskSettlementViewV1(value.settlement);
  if (!settlement || settlement.taskRef !== task.taskRef || settlement.role !== 'buyer') return null;
  return { schemaVersion: 1, task, settlement };
}
