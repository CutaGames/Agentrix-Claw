/**
 * P1-02 · Canonical Soul Core Aggregate v1 (R5).
 *
 * A versioned, typed, read-only projection model. Required canonical fields are
 * fully typed — never `Record<string, any>` (R5.3). The legacy `anchors` summary
 * (soul-core.ts `SoulCoreViewV1`) remains only as a compatibility projection and
 * is NOT the canonical source for these typed sections.
 *
 * The aggregate owns no authoritative write; every field maps to a declared
 * Source of Truth and Write Authority elsewhere (R5.8).
 */
import { SOUL_CORE_ID_PATTERN_V1, type SoulCoreOwnershipV1 } from './soul-core';
import type { AuthorityPolicyV1 } from './authority';
import type {
  AttestationClass,
  ReferenceValues,
  RegistryStatusView,
} from '../soul-core-l1/v1_1/attestation';
import type { ProfileId } from '../soul-core-l1/v1_1/profiles';
import type { LifecycleState } from '../soul-core-l1/v1_1/lifecycle';

export const SOUL_CORE_AGGREGATE_SCHEMA_VERSION = 1 as const;

/** Per-section availability (R5.5). */
export type ProjectionStateV1 =
  | 'available'
  | 'not_configured'
  | 'unavailable'
  | 'stale'
  | 'redacted';

/**
 * One aggregate section. `data` is present only when `state === 'available'`.
 * `unavailable`/`stale` carry a stable `diagnosticCode` (R5.5).
 */
export interface ProjectionV1<T> {
  state: ProjectionStateV1;
  /** ISO timestamp of the projected data's freshness. */
  asOf: string;
  /** Declared Source of Truth for this section. */
  source: string;
  diagnosticCode?: string;
  data?: T;
}

// ---- Typed section payloads (no free-form objects for required fields) ----

export interface SoulCoreIdentityProjectionV1 {
  /** @deprecated migration diagnostic only; never authoritative. */
  agentUniqueId?: string;
  onchain: {
    status: 'enabled' | 'pending' | 'failed' | 'not_enabled';
    chain?: string;
    txHash?: string;
    explorerUrl?: string;
  };
  /** Exportable DID (ERC-8004) — roadmap until M2; `null` when not issued. */
  did: string | null;
  didState: 'issued' | 'roadmap';
}

export interface SoulCoreVaultBalanceV1 {
  asset: string;
  amount: string;
}

export interface SoulCoreVaultProjectionV1 {
  walletType: string;
  address?: string;
  explorerUrl?: string;
  balances: SoulCoreVaultBalanceV1[];
  backup: {
    confirmed: boolean;
    confirmedAt?: string;
  };
}

export interface SoulCoreReputationProjectionV1 {
  creditScore: number;
  level: string;
  riskLevel: string;
  earnings?: SoulCoreVaultBalanceV1[];
  /** Hardware-backed reputation VC — roadmap until M2; `null` when not issued. */
  vc: string | null;
  vcState: 'issued' | 'roadmap';
}

export interface SoulKeyProjectionV1 {
  /** Soul Key (decrypts cloud soul ciphertext) — L1/L2 roadmap. */
  state: 'roadmap';
  note: string;
}

export interface PresenceProjectionV1 {
  status: 'online' | 'idle' | 'offline' | 'unknown';
  lastSeenAt?: string;
}

export interface SoulCoreShellRefV1 {
  shellId: string;
  kind: string;
  presence: 'online' | 'idle' | 'offline' | 'unknown';
  lastSeenAt?: string;
}

/** Evidence class of the concrete hardware run, separate from attestation class. */
export type SoulChipEvidenceLevelV1 =
  | 'protocol_only'
  | 'simulator'
  | 'development_card'
  | 'pilot_hardware'
  | 'certified_production';

/**
 * Backend-verified Soul Core L1 projection. Browsers must never construct this
 * from NFC/Applet claims directly. The section is `available` only after the
 * backend verifies attestation, reference values, registry freshness and
 * lifecycle fail-closed.
 */
export interface SoulChipProjectionV1 {
  verificationState: 'backend_verified';
  profileId: ProfileId;
  lifecycleState: LifecycleState;
  lifecycleCounter: number;
  attestationClass: AttestationClass;
  effectiveAssurance: 'development' | 'engineering_pilot' | 'pilot' | 'production_hardware';
  enforcementLayer: 'SE-tap' | 'SE-resident';
  evidenceLevel: SoulChipEvidenceLevelV1;
  referenceValues: ReferenceValues;
  registryStatus: RegistryStatusView;
  attestedAt: string;
  /** Human-readable honesty boundary supplied by the backend. */
  note: string;
}

/**
 * Canonical aggregate. Six anchors map to identity/vault/authority/reputation/
 * soulKey/ownership; presence and shellRefs are independent projections (R5.2).
 */
export interface SoulCoreAggregateV1 {
  schemaVersion: typeof SOUL_CORE_AGGREGATE_SCHEMA_VERSION;
  soulCoreId: string;
  /** `agentAccountId` is returned only to callers with an internal-relation need (R5.4). */
  agentAccountId?: string;
  consistency: 'snapshot' | 'per-section-eventual';
  identity: ProjectionV1<SoulCoreIdentityProjectionV1>;
  ownership: ProjectionV1<SoulCoreOwnershipV1>;
  vault: ProjectionV1<SoulCoreVaultProjectionV1>;
  authority: ProjectionV1<AuthorityPolicyV1[]>;
  reputation: ProjectionV1<SoulCoreReputationProjectionV1>;
  soulKey: ProjectionV1<SoulKeyProjectionV1>;
  /**
   * Additive Applet-ready L1 view. Optional for wire compatibility with older
   * aggregate producers; absence is equivalent to not_configured, never verified.
   */
  soulChip?: ProjectionV1<SoulChipProjectionV1>;
  presence: ProjectionV1<PresenceProjectionV1>;
  shellRefs: ProjectionV1<SoulCoreShellRefV1[]>;
}

/** Sections that MUST be present in a valid aggregate envelope. */
export const SOUL_CORE_AGGREGATE_SECTIONS = [
  'identity',
  'ownership',
  'vault',
  'authority',
  'reputation',
  'soulKey',
  'presence',
  'shellRefs',
] as const;

const VALID_PROJECTION_STATES: ReadonlySet<ProjectionStateV1> = new Set<ProjectionStateV1>([
  'available',
  'not_configured',
  'unavailable',
  'stale',
  'redacted',
]);

/** Deterministic three-client contract fixture (R5.11). */
export const SOUL_CORE_AGGREGATE_FIXTURE_V1: SoulCoreAggregateV1 = {
  schemaVersion: SOUL_CORE_AGGREGATE_SCHEMA_VERSION,
  soulCoreId: 'sc_0123456789abcdef0123456789abcdef',
  consistency: 'per-section-eventual',
  identity: {
    state: 'available',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'soul-core-identity',
    data: { onchain: { status: 'not_enabled' }, did: null, didState: 'roadmap' },
  },
  ownership: {
    state: 'available',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'agent-account',
    data: { custodyModel: 'owner-controlled', transferability: 'roadmap' },
  },
  vault: {
    state: 'available',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'account-ledger',
    data: { walletType: 'platform', balances: [], backup: { confirmed: false } },
  },
  authority: {
    state: 'not_configured',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'authority-policy',
  },
  reputation: {
    state: 'available',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'reputation',
    data: { creditScore: 500, level: 'standard', riskLevel: 'medium', vc: null, vcState: 'roadmap' },
  },
  soulKey: {
    state: 'not_configured',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'soul-key',
    data: { state: 'roadmap', note: 'Soul Key lands with L1/L2 hardware.' },
  },
  soulChip: {
    state: 'not_configured',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'soul-chip-attestation',
    diagnosticCode: 'SOUL_CHIP_VERIFIED_EVIDENCE_NOT_CONNECTED',
  },
  presence: {
    state: 'not_configured',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'presence',
  },
  shellRefs: {
    state: 'not_configured',
    asOf: '2026-07-15T00:00:00.000Z',
    source: 'soul-shell',
  },
};

/**
 * Machine-readable error for an unsupported aggregate schema version (R5.13).
 * The decoder never silently downgrades to a semantically different view.
 */
export class SoulCoreAggregateSchemaError extends Error {
  readonly code = 'SOUL_CORE_SCHEMA_UNSUPPORTED';
  constructor(message = 'Unsupported Soul Core aggregate schema version') {
    super(message);
    this.name = 'SoulCoreAggregateSchemaError';
  }
}

/** Normalized decode error for a malformed aggregate envelope. */
export class SoulCoreAggregateDecodeError extends Error {
  readonly code = 'SOUL_CORE_AGGREGATE_INVALID';
  constructor(message = 'Invalid Soul Core aggregate') {
    super(message);
    this.name = 'SoulCoreAggregateDecodeError';
  }
}

function isProjection(value: unknown): value is ProjectionV1<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.state === 'string' &&
    VALID_PROJECTION_STATES.has(p.state as ProjectionStateV1) &&
    typeof p.asOf === 'string' &&
    typeof p.source === 'string'
  );
}

/**
 * Decode a Backend-provided canonical aggregate. Shared by Web, Mobile and
 * Desktop so no client performs client-specific field inference (R5.11).
 *
 * - Unsupported schemaVersion → `SoulCoreAggregateSchemaError` (no silent
 *   downgrade, R5.13).
 * - Malformed envelope / missing section / bad `soulCoreId` grammar →
 *   `SoulCoreAggregateDecodeError`.
 */
export function decodeSoulCoreAggregateV1(input: unknown): SoulCoreAggregateV1 {
  if (typeof input !== 'object' || input === null) {
    throw new SoulCoreAggregateDecodeError();
  }
  const candidate = input as Record<string, unknown>;
  if (candidate.schemaVersion !== SOUL_CORE_AGGREGATE_SCHEMA_VERSION) {
    throw new SoulCoreAggregateSchemaError();
  }
  if (
    typeof candidate.soulCoreId !== 'string' ||
    !SOUL_CORE_ID_PATTERN_V1.test(candidate.soulCoreId)
  ) {
    throw new SoulCoreAggregateDecodeError();
  }
  if (
    candidate.consistency !== 'snapshot' &&
    candidate.consistency !== 'per-section-eventual'
  ) {
    throw new SoulCoreAggregateDecodeError();
  }
  for (const section of SOUL_CORE_AGGREGATE_SECTIONS) {
    if (!isProjection(candidate[section])) {
      throw new SoulCoreAggregateDecodeError(`Invalid section: ${section}`);
    }
  }
  if (candidate.soulChip !== undefined && !isProjection(candidate.soulChip)) {
    throw new SoulCoreAggregateDecodeError('Invalid section: soulChip');
  }
  return candidate as unknown as SoulCoreAggregateV1;
}
