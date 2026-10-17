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
  DEVICE_KINDS_V0,
  type DeviceCapabilityDeclarationV0,
  type DeviceCapabilityStateV0,
  type DeviceKindV0,
} from './device-capability';

export const DEVICE_MARKET_V0_FLAG = 'DEVICE_MARKET_V0_ENABLED';

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
