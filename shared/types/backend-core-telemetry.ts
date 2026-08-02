/**
 * P1-04 · Backend Core typed telemetry v2 + WATU projection (R9).
 *
 * Additive over `telemetry.ts` (`WatuEventV1`). v2 promotes `taskProofId` to a
 * first-class field (canonical name) and adds compensation/recovery events. The
 * legacy `proofId` remains only on the v1 compatibility adapter (R9.2).
 */
import type { TrafficClassV1 } from './telemetry';

export const BACKEND_CORE_TELEMETRY_SCHEMA_VERSION = 2 as const;

export type BackendCoreEventNameV2 =
  | 'task.requested'
  | 'task.authorization.decided'
  | 'task.execution.started'
  | 'task.execution.completed'
  | 'task.settlement.completed'
  | 'task.refund.completed'
  | 'task.reconciliation.required'
  | 'task.recovery.completed'
  | 'task.cost.recorded'
  | 'task.proof.issued'
  | 'task.proof.revoked'
  | 'watu.qualified'
  | 'watu.reversed';

export interface BackendCoreEventV2 {
  schemaVersion: typeof BACKEND_CORE_TELEMETRY_SCHEMA_VERSION;
  eventId: string;
  eventName: BackendCoreEventNameV2;
  idempotencyKey: string;
  occurredAt: string;
  environment: 'production' | 'staging' | 'development' | 'test' | 'unknown';
  trafficClass: TrafficClassV1;
  requestId?: string;
  taskId?: string;
  soulCoreId?: string;
  /** Canonical proof reference (R9.2); replaces v1 `proofId`. */
  taskProofId?: string;
  /** For watu.qualified/watu.reversed. */
  userId?: string;
  isoWeek?: string;
  attributes?: Record<string, string | number | boolean | null>;
}

/** Convert a legacy v1 WATU event's `proofId` to the canonical `taskProofId`. */
export interface WatuEventV1CompatInput {
  proofId?: string;
  taskProofId?: string;
}
export function canonicalTaskProofId(input: WatuEventV1CompatInput): string | undefined {
  return input.taskProofId ?? input.proofId;
}

/** WATU qualification identity: one per (userId, isoWeek, taskProofId) (R9.5). */
export interface WatuQualificationKeyV1 {
  userId: string;
  isoWeek: string;
  taskProofId: string;
}

export function watuKeyString(k: WatuQualificationKeyV1): string {
  return `${k.userId}::${k.isoWeek}::${k.taskProofId}`;
}

export interface WatuProjectionResultV1 {
  /** Active qualifications keyed by watuKeyString. */
  qualifications: string[];
  /** Reversed qualifications (compensated), keyed by watuKeyString. */
  reversed: string[];
  /** eventIds/idempotencyKeys already applied (dedup ledger). */
  appliedKeys: string[];
  /** Weekly qualified count per (userId, isoWeek). */
  weeklyCounts: Record<string, number>;
}
