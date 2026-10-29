/**
 * Device passport and capability market GA (L7-4): find a device by capability, take a quote, hold the money in
 * escrow, run, take the device's receipt, settle, and add to the device's reputation. GA adds low-risk physical
 * services (display, notifications, environment sensors, printing with the owner confirming every time); compute
 * stays under the rental contracts. Orders, quotes and escrow wait for the seven gates and the device gateway.
 *
 * v0 read side: the owner's own device passports (`DEVICE_MARKET_ROUTES_V0`), built from the live capability
 * declarations and the device's finished rental jobs. Server: `DEVICE_MARKET_V0_ENABLED` exactly `1` on top of
 * `DEVICE_MESH_V0_ENABLED`, otherwise 404. Clients: `NEXT_PUBLIC_DEVICE_MARKET_ENABLED`,
 * `EXPO_PUBLIC_DEVICE_MARKET_ENABLED`, `VITE_DEVICE_MARKET_ENABLED`, each exactly `1`.
 */
import {
  DEVICE_CAPABILITY_STATES_V0,
  DEVICE_CAPABILITY_TYPE_PATTERN_V0,
  DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0,
  DEVICE_KINDS_V0,
  type DeviceCapabilityDeclarationV0,
  type DeviceCapabilityStateV0,
  type DeviceKindV0,
} from './device-capability';

export const DEVICE_MARKET_V0_FLAG = 'DEVICE_MARKET_V0_ENABLED';

/**
 * L8 D4 (market GA, server side): physical services get an owner confirmation card for EVERY order, and the platform signs
 * one completion credential per seller Agent per day. Off unless exactly `1`; it sits on top of the rental switch
 * (`DEVICE_RENTAL_V0_ENABLED`), the device mesh and the signed gate ledger, none of which it replaces.
 */
export const DEVICE_MARKET_GA_V1_FLAG = 'DEVICE_MARKET_GA_V1_ENABLED';

export const DEVICE_MARKET_GA_ROUTES_V1 = {
  confirmations: 'GET /api/device-rental/confirmations',
  decide: 'POST /api/device-rental/confirmations/:confirmationRef/decision',
} as const;

export const DEVICE_MARKET_ROUTES_V0 = {
  passports: 'GET /api/device-market/passports',
} as const;

/** The physical services GA opens; any other type stays out of the market. */
export const DEVICE_MARKET_PHYSICAL_SERVICES_V0: readonly { type: string; confirmEachTime: boolean }[] = [
  { type: 'gadget.display.v1', confirmEachTime: false },
  { type: 'gadget.notify.v1', confirmEachTime: false },
  { type: 'gadget.env_sensor.v1', confirmEachTime: false },
  { type: 'hardware.print.v1', confirmEachTime: true },
];

export const DEVICE_MARKET_ORDER_STATES_V0 = ['quoted', 'escrowed', 'executing', 'receipted', 'settled', 'cancelled', 'disputed'] as const;
export type DeviceMarketOrderStateV0 = (typeof DEVICE_MARKET_ORDER_STATES_V0)[number];

const TRANSITIONS: Readonly<Record<DeviceMarketOrderStateV0, readonly DeviceMarketOrderStateV0[]>> = {
  quoted: ['escrowed', 'cancelled'],
  escrowed: ['executing', 'cancelled'],
  executing: ['receipted', 'disputed'],
  receipted: ['settled', 'disputed'],
  settled: [],
  cancelled: [],
  disputed: ['settled', 'cancelled'],
};

export const DEVICE_MARKET_OUTCOMES_V0 = ['completed', 'failed', 'dispute_lost', 'dispute_won'] as const;
export type DeviceMarketOutcomeV0 = (typeof DEVICE_MARKET_OUTCOMES_V0)[number];

const REPUTATION_DELTA: Readonly<Record<DeviceMarketOutcomeV0, number>> = { completed: 1, failed: -1, dispute_lost: -3, dispute_won: 0 };

export interface DeviceMarketQuoteV0 {
  quoteId: string;
  deviceId: string;
  capabilityType: string;
  priceMinor: number;
  currency: string;
  expiresAt: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_:-]{2,127}$/;
const CURRENCY = /^[A-Z]{3,4}$/;

export function deviceMarketTransitionAllowedV0(from: DeviceMarketOrderStateV0, to: DeviceMarketOrderStateV0): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Unknown types always ask, so a new service cannot skip the owner by accident. */
export function deviceMarketNeedsOwnerConfirmV0(capabilityType: string): boolean {
  const service = DEVICE_MARKET_PHYSICAL_SERVICES_V0.find((s) => s.type === capabilityType);
  return service ? service.confirmEachTime : true;
}

/** Usable only for a listed service and before it expires. */
export function deviceMarketQuoteUsableV0(quote: DeviceMarketQuoteV0, nowMs: number): boolean {
  return DEVICE_MARKET_PHYSICAL_SERVICES_V0.some((s) => s.type === quote.capabilityType) && Date.parse(quote.expiresAt) > nowMs;
}

export function deviceMarketReputationDeltaV0(outcome: DeviceMarketOutcomeV0): number {
  return REPUTATION_DELTA[outcome];
}

export function decodeDeviceMarketQuoteV0(value: unknown): DeviceMarketQuoteV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { quoteId, deviceId, capabilityType, priceMinor, currency, expiresAt } = raw;
  if (typeof quoteId !== 'string' || !ID.test(quoteId) || typeof deviceId !== 'string' || !ID.test(deviceId)) return null;
  if (typeof capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(capabilityType)) return null;
  if (typeof priceMinor !== 'number' || !Number.isInteger(priceMinor) || priceMinor <= 0 || priceMinor > 100_000_000) return null;
  if (typeof currency !== 'string' || !CURRENCY.test(currency)) return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  return { quoteId, deviceId, capabilityType, priceMinor, currency, expiresAt };
}

// --- L8 D4: owner confirmation cards and the daily completion credential ------------------------------------------

export const DEVICE_PHYSICAL_CONFIRMATION_REF_PATTERN_V1 = /^drc_[0-9a-f]{32}$/;
export const DEVICE_PHYSICAL_CONFIRMATION_STATUSES_V1 = ['pending', 'approved', 'denied', 'expired'] as const;
export type DevicePhysicalConfirmationStatusV1 = (typeof DEVICE_PHYSICAL_CONFIRMATION_STATUSES_V1)[number];
export const DEVICE_PHYSICAL_CONFIRMATION_DECISIONS_V1 = ['approve', 'deny'] as const;
export type DevicePhysicalConfirmationDecisionV1 = (typeof DEVICE_PHYSICAL_CONFIRMATION_DECISIONS_V1)[number];
export const DEVICE_PHYSICAL_CONFIRMATION_LIST_MAX_V1 = 50;

/** Capability categories whose use always asks the owner (`DEVICE_CAPABILITY_CATEGORY_POLICY_V0[..].alwaysAsk`). */
const ALWAYS_ASK_CATEGORIES_V1: readonly string[] = ['personal_sensor', 'actuation', 'network_egress', 'telephony'];

/**
 * Whether an order for this capability needs the owner's card before the device may take it. Stricter than
 * `deviceMarketNeedsOwnerConfirmV0`: every market physical service (display, notification, environment sensor, print) asks
 * on every order, so does any category that always asks, and so does any type nobody listed. Only compute-like
 * capabilities (the pilot's `llm.generate.v1` and the like) run without a card.
 */
export function devicePhysicalServiceNeedsCardV1(capabilityType: string, declaredCategory: string): boolean {
  if (DEVICE_MARKET_PHYSICAL_SERVICES_V0.some((service) => service.type === capabilityType)) return true;
  if (ALWAYS_ASK_CATEGORIES_V1.includes(declaredCategory)) return true;
  return deviceMarketNeedsOwnerConfirmV0(capabilityType) && !(declaredCategory === 'compute' || declaredCategory === 'accelerator');
}

/**
 * What the owner reads on the card. No buyer text and no buyer identity beyond the Agent's public id; but the size and the
 * digest of the buyer's input, so the owner is not approving blind (review M7).
 */
export interface DevicePhysicalConfirmationViewV1 {
  confirmationRef: string;
  jobRef: string;
  deviceId: string;
  capabilityType: string;
  /** The most the order can cost, in USD cents. */
  maxAmountCents: number;
  /** Size of the buyer's input in bytes (UTF-8); null once the device has taken the job and the server cleared the input. */
  inputBytes: number | null;
  /** `sha256:` digest of the buyer's input (the same digest the device gets with the job). */
  inputDigest: string;
  buyerAgentRef: string;
  status: DevicePhysicalConfirmationStatusV1;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
}

export interface DevicePhysicalConfirmationListV1 {
  items: DevicePhysicalConfirmationViewV1[];
}

const AGENT_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function decodeDevicePhysicalConfirmationViewV1(value: unknown): DevicePhysicalConfirmationViewV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ['confirmationRef', 'jobRef', 'deviceId', 'capabilityType', 'maxAmountCents', 'inputBytes', 'inputDigest', 'buyerAgentRef', 'status', 'requestedAt', 'expiresAt', 'decidedAt'];
  if (Object.keys(v).length !== keys.length || !keys.every((key) => key in v)) return null;
  if (typeof v.confirmationRef !== 'string' || !DEVICE_PHYSICAL_CONFIRMATION_REF_PATTERN_V1.test(v.confirmationRef)) return null;
  if (typeof v.jobRef !== 'string' || !/^drj_[0-9a-f]{32}$/.test(v.jobRef)) return null;
  if (typeof v.deviceId !== 'string' || !DEVICE_ID.test(v.deviceId)) return null;
  if (typeof v.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(v.capabilityType)) return null;
  if (!Number.isInteger(v.maxAmountCents) || (v.maxAmountCents as number) < 1 || (v.maxAmountCents as number) > 100_000_000) return null;
  if (v.inputBytes !== null && (!Number.isInteger(v.inputBytes) || (v.inputBytes as number) < 0 || (v.inputBytes as number) > 1_000_000)) return null;
  if (typeof v.inputDigest !== 'string' || !DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0.test(v.inputDigest)) return null;
  if (typeof v.buyerAgentRef !== 'string' || !AGENT_REF.test(v.buyerAgentRef)) return null;
  if (!(DEVICE_PHYSICAL_CONFIRMATION_STATUSES_V1 as readonly unknown[]).includes(v.status)) return null;
  if (typeof v.requestedAt !== 'string' || Number.isNaN(Date.parse(v.requestedAt)) || typeof v.expiresAt !== 'string' || Number.isNaN(Date.parse(v.expiresAt))) return null;
  if (v.decidedAt !== null && (typeof v.decidedAt !== 'string' || Number.isNaN(Date.parse(v.decidedAt)))) return null;
  return {
    confirmationRef: v.confirmationRef,
    jobRef: v.jobRef,
    deviceId: v.deviceId,
    capabilityType: v.capabilityType,
    maxAmountCents: v.maxAmountCents as number,
    inputBytes: v.inputBytes as number | null,
    inputDigest: v.inputDigest,
    buyerAgentRef: v.buyerAgentRef,
    status: v.status as DevicePhysicalConfirmationStatusV1,
    requestedAt: v.requestedAt,
    expiresAt: v.expiresAt,
    decidedAt: v.decidedAt as string | null,
  };
}

/** `{ items: [...] }`; one card that does not decode makes the whole list unreadable. */
export function decodeDevicePhysicalConfirmationListV1(value: unknown): DevicePhysicalConfirmationListV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { items } = value as Record<string, unknown>;
  if (!Array.isArray(items) || items.length > DEVICE_PHYSICAL_CONFIRMATION_LIST_MAX_V1) return null;
  const decoded = items.map(decodeDevicePhysicalConfirmationViewV1);
  return decoded.every((item): item is DevicePhysicalConfirmationViewV1 => item !== null) ? { items: decoded } : null;
}

/** The daily completion credential (a compact JWS by the platform signer, `typ` below). */
export const DEVICE_RENTAL_COMPLETION_TYP_V1 = 'device-rental-completion+jwt';
export const DEVICE_RENTAL_COMPLETION_KIND_V1 = 'device_rental_completion';

export interface DeviceRentalCompletionClaimsV1 {
  iss: string;
  /** The seller Agent's DID. */
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  kind: typeof DEVICE_RENTAL_COMPLETION_KIND_V1;
  /** UTC day the credential was signed for, `YYYY-MM-DD`. */
  day: string;
  agent_ref: string;
  completed_jobs: number;
  failed_jobs: number;
  disputes: number;
  /** completed / (completed + failed) in basis points; null before any job finished. */
  completion_rate_bps: number | null;
}

/** The one formula for the rate, shared by the market offer view and the credential. */
export function deviceRentalCompletionRateBpsV1(completed: number, failed: number): number | null {
  const done = completed + failed;
  return done === 0 ? null : Math.floor((completed * 10000) / done);
}

// --- v0 read side: device passports -------------------------------------------------------------------------------

export interface DevicePassportCapabilityV0 {
  type: string;
  state: DeviceCapabilityStateV0;
}

export interface DevicePassportServiceV0 extends DevicePassportCapabilityV0 {
  /** Whether every use would ask the owner first (`deviceMarketNeedsOwnerConfirmV0`). */
  confirmEachTime: boolean;
}

export interface DevicePassportV0 {
  deviceId: string;
  kind: DeviceKindV0;
  /** When the device last said what it can do, and until when that holds. */
  declaredAt: string;
  expiresAt: string;
  capabilities: DevicePassportCapabilityV0[];
  /** The declared capabilities that are market physical services. */
  marketServices: DevicePassportServiceV0[];
  /** The device's finished rental jobs. */
  jobs: { completed: number; failed: number };
  /** Sum of `deviceMarketReputationDeltaV0` over those jobs; dispute outcomes come with escrowed orders. */
  reputation: number;
}

export interface DevicePassportListV0 {
  passports: DevicePassportV0[];
}

export const DEVICE_PASSPORT_LIST_MAX_V0 = 100;

const COUNT_MAX = 1_000_000;
/** The device id rule of `device-capability.ts`. */
const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function devicePassportV0(declaration: DeviceCapabilityDeclarationV0, jobs: { completed: number; failed: number }): DevicePassportV0 {
  const capabilities = declaration.items.map((item) => ({ type: item.type, state: item.state }));
  const marketServices = capabilities
    .filter((item) => DEVICE_MARKET_PHYSICAL_SERVICES_V0.some((service) => service.type === item.type))
    .map((item) => ({ ...item, confirmEachTime: deviceMarketNeedsOwnerConfirmV0(item.type) }));
  return {
    deviceId: declaration.deviceId,
    kind: declaration.kind,
    declaredAt: declaration.observedAt,
    expiresAt: declaration.expiresAt,
    capabilities,
    marketServices,
    jobs: { completed: jobs.completed, failed: jobs.failed },
    reputation: jobs.completed * deviceMarketReputationDeltaV0('completed') + jobs.failed * deviceMarketReputationDeltaV0('failed'),
  };
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= COUNT_MAX;
const isState = (v: unknown): v is DeviceCapabilityStateV0 => (DEVICE_CAPABILITY_STATES_V0 as readonly unknown[]).includes(v);

function decodeCapability(value: unknown): DevicePassportCapabilityV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { type, state } = value as Record<string, unknown>;
  return typeof type === 'string' && DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(type) && isState(state) ? { type, state } : null;
}

function decodePassport(value: unknown): DevicePassportV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { deviceId, kind, declaredAt, expiresAt, capabilities, marketServices, jobs, reputation } = raw;
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId) || !(DEVICE_KINDS_V0 as readonly unknown[]).includes(kind)) return null;
  if (typeof declaredAt !== 'string' || Number.isNaN(Date.parse(declaredAt)) || typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  if (!Array.isArray(capabilities) || !Array.isArray(marketServices) || !jobs || typeof jobs !== 'object') return null;
  const { completed, failed } = jobs as Record<string, unknown>;
  if (!isCount(completed) || !isCount(failed) || !Number.isInteger(reputation) || reputation !== completed - failed) return null;
  const caps = capabilities.map(decodeCapability);
  if (!caps.every((c): c is DevicePassportCapabilityV0 => c !== null)) return null;
  const services: DevicePassportServiceV0[] = [];
  for (const item of marketServices) {
    const cap = decodeCapability(item);
    if (!cap || !DEVICE_MARKET_PHYSICAL_SERVICES_V0.some((s) => s.type === cap.type)) return null;
    if ((item as Record<string, unknown>).confirmEachTime !== deviceMarketNeedsOwnerConfirmV0(cap.type)) return null;
    services.push({ ...cap, confirmEachTime: deviceMarketNeedsOwnerConfirmV0(cap.type) });
  }
  return { deviceId, kind: kind as DeviceKindV0, declaredAt, expiresAt, capabilities: caps, marketServices: services, jobs: { completed, failed }, reputation: reputation as number };
}

/** `{ passports: [...] }`; one passport that does not decode makes the whole list unreadable. */
export function decodeDevicePassportListV0(value: unknown): DevicePassportListV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { passports } = value as Record<string, unknown>;
  if (!Array.isArray(passports) || passports.length > DEVICE_PASSPORT_LIST_MAX_V0) return null;
  const decoded = passports.map(decodePassport);
  return decoded.every((p): p is DevicePassportV0 => p !== null) ? { passports: decoded } : null;
}
