import type { DigestRef } from './trust-loop-primitives';

export const IDENTITY_GOVERNANCE_SCHEMA_VERSION = 1 as const;
export const PRIMARY_AGENT_SELECTION_SCHEMA_VERSION = 1 as const;
export const OWNERSHIP_RELATIONSHIP_SCHEMA_VERSION = 1 as const;
export const OWNERSHIP_OPERATION_SCHEMA_VERSION = 1 as const;

export const OWNERSHIP_RELATIONSHIP_TYPES_V1 = [
  'owner',
  'controller',
  'custodian',
  'guardian',
] as const;
export type OwnershipRelationshipTypeV1 =
  (typeof OWNERSHIP_RELATIONSHIP_TYPES_V1)[number];

export const OWNERSHIP_PRINCIPAL_KINDS_V1 = [
  'user',
  'organization',
  'agent',
  'service',
] as const;
export type OwnershipPrincipalKindV1 =
  (typeof OWNERSHIP_PRINCIPAL_KINDS_V1)[number];

/** Principal identity is independent from actor, signer, wallet and device identity. */
export interface OwnershipPrincipalRefV1 {
  kind: OwnershipPrincipalKindV1;
  id: string;
}

export const PRIMARY_AGENT_SELECTION_STATUSES_V1 = [
  'active',
  'unset',
  'superseded',
  'revoked',
] as const;
export type PrimaryAgentSelectionStatusV1 =
  (typeof PRIMARY_AGENT_SELECTION_STATUSES_V1)[number];

export interface PrimaryAgentSelectionV1 {
  schemaVersion: typeof PRIMARY_AGENT_SELECTION_SCHEMA_VERSION;
  selectionRef: string;
  ownerId: string;
  agentAccountId: string;
  soulCoreId: string;
  status: PrimaryAgentSelectionStatusV1;
  selectionEpoch: string;
  optimisticVersion: number;
  selectedBy: OwnershipPrincipalRefV1;
  reasonCode: string;
  createdAt: string;
  updatedAt: string;
  unsetAt?: string;
}

export type PrimaryAgentResolutionV1 =
  | {
      schemaVersion: typeof PRIMARY_AGENT_SELECTION_SCHEMA_VERSION;
      status: 'selected';
      selection: PrimaryAgentSelectionV1;
    }
  | {
      schemaVersion: typeof PRIMARY_AGENT_SELECTION_SCHEMA_VERSION;
      status: 'missing';
      ownerId: string;
      lastSelectionEpoch: string;
    };

export interface OwnershipScopeV1 {
  capabilities: string[];
  resources?: string[];
}

export const OWNERSHIP_RELATIONSHIP_STATUSES_V1 = [
  'proposed',
  'active',
  'expired',
  'revoked',
  'superseded',
] as const;
export type OwnershipRelationshipStatusV1 =
  (typeof OWNERSHIP_RELATIONSHIP_STATUSES_V1)[number];

export interface OwnershipRelationshipAcceptedSnapshotV1 {
  schemaVersion: typeof OWNERSHIP_RELATIONSHIP_SCHEMA_VERSION;
  relationshipType: OwnershipRelationshipTypeV1;
  principalRef: OwnershipPrincipalRefV1;
  agentAccountId: string;
  soulCoreId: string;
  scope: OwnershipScopeV1;
  validFrom: string;
  validUntil?: string;
  source: string;
  sourceRef?: string;
  acceptedAt: string;
  acceptedBy: OwnershipPrincipalRefV1;
}

export interface OwnershipRelationshipV1 {
  schemaVersion: typeof OWNERSHIP_RELATIONSHIP_SCHEMA_VERSION;
  relationshipRef: string;
  relationshipType: OwnershipRelationshipTypeV1;
  principalRef: OwnershipPrincipalRefV1;
  agentAccountId: string;
  soulCoreId: string;
  scope: OwnershipScopeV1;
  validFrom: string;
  validUntil?: string;
  source: string;
  sourceRef?: string;
  status: OwnershipRelationshipStatusV1;
  controlEpoch: string;
  optimisticVersion: number;
  acceptedSnapshot: OwnershipRelationshipAcceptedSnapshotV1;
  acceptedSnapshotDigest: DigestRef;
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export const OWNERSHIP_OPERATION_TYPES_V1 = [
  'transfer',
  'gift',
  'recovery',
] as const;
export type OwnershipOperationTypeV1 =
  (typeof OWNERSHIP_OPERATION_TYPES_V1)[number];

export const OWNERSHIP_OPERATION_STATUSES_V1 = [
  'proposed',
  'step_up_pending',
  'cooldown',
  'accepted',
  'cancelled',
  'expired',
  'failed',
  'reconciling',
  'completed',
] as const;
export type OwnershipOperationStatusV1 =
  (typeof OWNERSHIP_OPERATION_STATUSES_V1)[number];

export interface OwnershipRevokeTargetSetV1 {
  authorityGrants: { status: 'pending' | 'complete' | 'failed'; refs?: string[] };
  sessions: { status: 'pending' | 'complete' | 'failed'; refs?: string[] };
  shellBindings: { status: 'pending' | 'complete' | 'failed'; refs?: string[] };
  partnerBindings: { status: 'pending' | 'complete' | 'failed'; refs?: string[] };
}

export interface OwnershipOperationV1 {
  schemaVersion: typeof OWNERSHIP_OPERATION_SCHEMA_VERSION;
  operationRef: string;
  operationType: OwnershipOperationTypeV1;
  agentAccountId: string;
  soulCoreId: string;
  initiatorPrincipalRef: OwnershipPrincipalRefV1;
  currentOwnerId: string;
  proposedOwnerPrincipalRef: OwnershipPrincipalRefV1;
  status: OwnershipOperationStatusV1;
  expectedIdentityEpoch: string;
  expectedCurrentOwnerEpoch: string;
  expectedOwnershipControlEpoch?: string;
  operationEpoch: string;
  optimisticVersion: number;
  stepUpRef?: string;
  cooldownUntil?: string;
  acceptanceSnapshot?: Record<string, unknown>;
  revokeTargetSet: OwnershipRevokeTargetSetV1;
  reasonCode: string;
  failureReason?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityOwnershipShadowComparisonV1 {
  schemaVersion: typeof IDENTITY_GOVERNANCE_SCHEMA_VERSION;
  agentAccountId: string;
  sourceOwnerIdPresent: boolean;
  targetOwnerStatus: 'missing' | 'match' | 'mismatch' | 'duplicate';
  targetActiveOwnerCount: number;
  cutoverAllowed: false;
}
