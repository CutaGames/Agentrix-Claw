/**
 * L8 D9: skills and device capabilities in one market list. The server (`GET /api/market-unified`, behind
 * `MARKET_UNIFIED_V1_ENABLED` exactly `1`, 404 otherwise) merges the approved skill listings with the live device-capability
 * offers of other owners. Each part has its own stop: the skills are public data; the device offers keep every rule of the
 * rental (its switch, the device mesh, the signed gate ledger, the owners' rules) and say so in `devices` when they are not
 * shown. The list carries no developer or seller account id and no buyer data.
 */
import { DEVICE_CAPABILITY_TYPE_PATTERN_V0 } from './device-capability';

export const UNIFIED_MARKET_ROUTE_V1 = 'GET /api/market-unified' as const;
export const UNIFIED_MARKET_ITEMS_MAX_V1 = 100;

export const UNIFIED_MARKET_DEVICE_STATES_V1 = ['ok', 'off', 'closed', 'unavailable'] as const;
export type UnifiedMarketDeviceStateV1 = (typeof UNIFIED_MARKET_DEVICE_STATES_V1)[number];

export interface UnifiedMarketSkillItemV1 {
  kind: 'skill';
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  /** Price of one use, in USD cents. */
  priceCents: number;
  invokeCount: number;
}

export interface UnifiedMarketDeviceItemV1 {
  kind: 'device_capability';
  offerRef: string;
  capabilityType: string;
  unit: string;
  priceCentsPerUnit: number;
  /** The seller Agent's public id. */
  sellerAgentId: string;
  availableNow: boolean;
  completedJobs: number;
  completionRateBps: number | null;
  /** Every order for this capability waits for its owner's confirmation card. */
  ownerConfirmsEachOrder: boolean;
}

export type UnifiedMarketItemV1 = UnifiedMarketSkillItemV1 | UnifiedMarketDeviceItemV1;

export interface UnifiedMarketListV1 {
  items: UnifiedMarketItemV1[];
  /** Why there are no device items, when there are none: the rental is off, its gates are closed, or it could not be read. */
  devices: UnifiedMarketDeviceStateV1;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000;
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);

function decodeSkill(value: Record<string, unknown>): UnifiedMarketSkillItemV1 | null {
  if (!exact(value, ['kind', 'id', 'name', 'slug', 'description', 'category', 'priceCents', 'invokeCount'])) return null;
  const { id, name, slug, description, category, priceCents, invokeCount } = value;
  if (typeof id !== 'string' || id.length === 0 || id.length > 128 || typeof name !== 'string' || name.length === 0 || name.length > 200) return null;
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > 200 || typeof description !== 'string' || description.length > 4000) return null;
  if (typeof category !== 'string' || category.length === 0 || category.length > 40) return null;
  if (!isCount(priceCents) || !isCount(invokeCount)) return null;
  return { kind: 'skill', id, name, slug, description, category, priceCents, invokeCount };
}

function decodeDevice(value: Record<string, unknown>): UnifiedMarketDeviceItemV1 | null {
  if (!exact(value, ['kind', 'offerRef', 'capabilityType', 'unit', 'priceCentsPerUnit', 'sellerAgentId', 'availableNow', 'completedJobs', 'completionRateBps', 'ownerConfirmsEachOrder'])) return null;
  const { offerRef, capabilityType, unit, priceCentsPerUnit, sellerAgentId, availableNow, completedJobs, completionRateBps, ownerConfirmsEachOrder } = value;
  if (typeof offerRef !== 'string' || !/^dro_[0-9a-f]{32}$/.test(offerRef)) return null;
  if (typeof capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(capabilityType)) return null;
  if (typeof unit !== 'string' || !['job', 'minute', 'thousand_tokens'].includes(unit)) return null;
  if (!isCount(priceCentsPerUnit) || priceCentsPerUnit < 1 || typeof sellerAgentId !== 'string' || sellerAgentId.length === 0 || sellerAgentId.length > 128) return null;
  if (typeof availableNow !== 'boolean' || typeof ownerConfirmsEachOrder !== 'boolean' || !isCount(completedJobs)) return null;
  if (completionRateBps !== null && (!Number.isInteger(completionRateBps) || (completionRateBps as number) < 0 || (completionRateBps as number) > 10000)) return null;
  return { kind: 'device_capability', offerRef, capabilityType, unit, priceCentsPerUnit, sellerAgentId, availableNow, completedJobs, completionRateBps: completionRateBps as number | null, ownerConfirmsEachOrder };
}

/** `{ items, devices }`; one item that does not decode makes the whole list unreadable. */
export function decodeUnifiedMarketListV1(value: unknown): UnifiedMarketListV1 | null {
  if (!isRecord(value) || !exact(value, ['items', 'devices'])) return null;
  if (!(UNIFIED_MARKET_DEVICE_STATES_V1 as readonly unknown[]).includes(value.devices)) return null;
  if (!Array.isArray(value.items) || value.items.length > UNIFIED_MARKET_ITEMS_MAX_V1) return null;
  const items: UnifiedMarketItemV1[] = [];
  for (const raw of value.items) {
    if (!isRecord(raw)) return null;
    const item = raw.kind === 'skill' ? decodeSkill(raw) : raw.kind === 'device_capability' ? decodeDevice(raw) : null;
    if (!item) return null;
    items.push(item);
  }
  return { items, devices: value.devices as UnifiedMarketDeviceStateV1 };
}
