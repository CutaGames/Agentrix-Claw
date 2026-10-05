/**
 * Cross-owner rental at scale and on mainnet, v0 contract only (L7-5): every workload kind passes the seven gates on
 * its own; settlement moves to mainnet only after the split-contract audit has no open Critical or High finding
 * (the plan lists 3 Critical and 5 High to close) and the lawyer has signed off; sellers receive real money only with
 * verified KYC. Nothing reads this in v0.
 */
import { RENTAL_GATES_V2, type RentalGateV2, type RentalWorkloadKindV2 } from './rental-workloads-v2';

/** Future server switch; nothing reads it in v0. */
export const RENTAL_MAINNET_V0_FLAG = 'RENTAL_MAINNET_V0_ENABLED';

export const RENTAL_SELLER_KYC_STATUSES_V0 = ['not_started', 'pending', 'verified', 'rejected'] as const;
export type RentalSellerKycStatusV0 = (typeof RENTAL_SELLER_KYC_STATUSES_V0)[number];

export interface SplitContractAuditV0 {
  /** Commit of the audited contracts, 40 hex. */
  auditedCommit: string;
  criticalOpen: number;
  highOpen: number;
  /** Where the report lives, for example the audit firm's reference. */
  reportRef: string;
}

export interface RentalMainnetReadinessV0 {
  audit: SplitContractAuditV0 | null;
  lawyerSignedOff: boolean;
  /** Gates passed, per workload kind. */
  gatesByKind: Partial<Record<RentalWorkloadKindV2, ReadonlySet<RentalGateV2>>>;
}

export function splitContractAuditCleanV0(audit: SplitContractAuditV0 | null): boolean {
  return audit !== null && audit.criticalOpen === 0 && audit.highOpen === 0;
}

/** A kind settles on mainnet only with a clean audit, the lawyer's sign-off and all seven gates for that kind. */
export function rentalKindMainnetReadyV0(readiness: RentalMainnetReadinessV0, kind: RentalWorkloadKindV2): boolean {
  if (!splitContractAuditCleanV0(readiness.audit) || readiness.lawyerSignedOff !== true) return false;
  const passed = readiness.gatesByKind[kind];
  if (!passed) return false;
  for (const gate of RENTAL_GATES_V2) if (!passed.has(gate)) return false;
  return true;
}

export function rentalSellerMayReceiveV0(kyc: RentalSellerKycStatusV0): boolean {
  return kyc === 'verified';
}

export function decodeSplitContractAuditV0(value: unknown): SplitContractAuditV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { auditedCommit, criticalOpen, highOpen, reportRef } = raw;
  if (typeof auditedCommit !== 'string' || !/^[0-9a-f]{40}$/.test(auditedCommit)) return null;
  if (typeof criticalOpen !== 'number' || !Number.isInteger(criticalOpen) || criticalOpen < 0) return null;
  if (typeof highOpen !== 'number' || !Number.isInteger(highOpen) || highOpen < 0) return null;
  if (typeof reportRef !== 'string' || !reportRef.trim() || reportRef.length > 200) return null;
  return { auditedCommit, criticalOpen, highOpen, reportRef: reportRef.trim() };
}
