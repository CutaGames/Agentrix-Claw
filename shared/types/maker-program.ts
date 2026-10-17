/**
 * Maker programme, v0 contract only (L7-2): hardware makers sell "Yowo certified" devices, list them in the capability
 * market and get a share of every order their devices serve. It waits for the collecting entity, seller KYC and the
 * owner's talks with Seeed / M5Stack, so nothing reads this in v0 and no money moves. The share cap is a placeholder
 * until the owner sets the terms.
 */
import { DEVICE_CAPABILITY_TYPE_PATTERN_V0 } from './device-capability';

/** Future server switch; nothing reads it in v0. */
export const MAKER_PROGRAM_V0_FLAG = 'MAKER_PROGRAM_V0_ENABLED';

export const MAKER_STATUSES_V0 = ['applied', 'approved', 'suspended'] as const;
export type MakerStatusV0 = (typeof MAKER_STATUSES_V0)[number];

export const MAKER_KYC_STATUSES_V0 = ['not_started', 'pending', 'verified', 'rejected'] as const;
export type MakerKycStatusV0 = (typeof MAKER_KYC_STATUSES_V0)[number];

/** Upper bound of the maker's share of one order, in basis points. */
export const MAKER_SHARE_MAX_BPS_V0 = 2000;

export interface MakerDeviceListingV0 {
  listingId: string;
  makerId: string;
  boardModel: string;
  /** Capability types the device offers, 1 to 8, for example gadget.display.v1. */
  capabilityTypes: string[];
  /** The maker's share of each order the device serves, in basis points. */
  shareBps: number;
}

const ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;

/** A listing goes public only for an approved maker whose board model is certified. */
export function makerListingMayPublishV0(listing: MakerDeviceListingV0, makerStatus: MakerStatusV0, certifiedModels: readonly string[]): boolean {
  return makerStatus === 'approved' && certifiedModels.includes(listing.boardModel);
}

/** The maker's share of one order in minor units: rounded down, capped at MAKER_SHARE_MAX_BPS_V0. */
export function makerShareMinorV0(orderAmountMinor: number, shareBps: number): number {
  if (!Number.isInteger(orderAmountMinor) || orderAmountMinor <= 0 || !Number.isInteger(shareBps) || shareBps <= 0) return 0;
  return Math.floor((orderAmountMinor * Math.min(shareBps, MAKER_SHARE_MAX_BPS_V0)) / 10000);
}

/** Payouts only to an approved maker whose KYC is verified. */
export function makerMayReceivePayoutV0(status: MakerStatusV0, kyc: MakerKycStatusV0): boolean {
  return status === 'approved' && kyc === 'verified';
}

export function decodeMakerDeviceListingV0(value: unknown): MakerDeviceListingV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { listingId, makerId, boardModel, capabilityTypes, shareBps } = raw;
  if (typeof listingId !== 'string' || !ID.test(listingId) || typeof makerId !== 'string' || !ID.test(makerId)) return null;
  if (typeof boardModel !== 'string' || !ID.test(boardModel)) return null;
  if (!Array.isArray(capabilityTypes) || capabilityTypes.length < 1 || capabilityTypes.length > 8) return null;
  const types: string[] = [];
  for (const type of capabilityTypes) {
    if (typeof type !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(type) || types.includes(type)) return null;
    types.push(type);
  }
  if (typeof shareBps !== 'number' || !Number.isInteger(shareBps) || shareBps < 0 || shareBps > MAKER_SHARE_MAX_BPS_V0) return null;
  return { listingId, makerId, boardModel, capabilityTypes: types, shareBps };
}
