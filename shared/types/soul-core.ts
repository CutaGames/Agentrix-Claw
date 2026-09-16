import type {
  AuthorityItemCompatV1,
  AuthorityItemV1,
} from './authority';

/** Soul Core v1 — stable identity and read-model contract. */
export const SOUL_CORE_SCHEMA_VERSION = 1 as const;

export interface SoulCoreRefV1 {
  schemaVersion: typeof SOUL_CORE_SCHEMA_VERSION;
  /** Stable opaque external identifier; never derived from owner, signer or wallet. */
  soulCoreId: string;
  /** Internal AgentAccount relation, not an ownership or signing authority. */
  agentAccountId: string;
}

export type SoulCoreAnchorKeyV1 =
  | 'identity'
  | 'vault'
  | 'authority'
  | 'reputation'
  | 'soulKey'
  | 'ownership';

export type SoulCoreAnchorStateV1 =
  | 'enabled'
  | 'pending'
  | 'failed'
  | 'not_enabled'
  | 'roadmap';

export interface SoulCoreAnchorV1 {
  key: SoulCoreAnchorKeyV1;
  title: string;
  state: SoulCoreAnchorStateV1;
  summary: Record<string, any>;
  roadmap?: boolean;
  roadmapNote?: string;
}

/** Ownership projection only; it does not grant signer or repository write authority. */
export interface SoulCoreOwnershipV1 {
  ownerId?: string;
  custodyModel: 'owner-controlled' | 'delegated' | 'platform-assisted' | 'unknown';
  transferability: 'disabled' | 'policy-gated' | 'enabled' | 'roadmap';
  delegatedAuthorityPolicyIds?: string[];
}

export interface SoulCoreSovereigntyV1 {
  tier: string;
  trustModel: string;
  stillTrusts: string;
  note: string;
}

export interface SoulCoreRoadmapV1 {
  soulChip: 'roadmap';
  /**
   * @deprecated Compatibility wire only. Soul Dock is now Agent Embodiment /
   * Companion; optional Secure Host assurance is modeled independently.
   */
  soulDock: 'roadmap';
  transfer: 'roadmap';
  did: 'roadmap';
}

/** Canonical Soul Core v1 view after stable identity cutover. */
export interface SoulCoreViewV1 extends SoulCoreRefV1 {
  /** @deprecated Display `soulCoreId`; retained only for migration diagnostics. */
  agentUniqueId?: string;
  ownerId?: string;
  ownership: SoulCoreOwnershipV1;
  sovereignty: SoulCoreSovereigntyV1;
  anchors: SoulCoreAnchorV1[];
  authority: AuthorityItemV1[];
  compliance: { disclosures: string[] };
  roadmap: SoulCoreRoadmapV1;
}

/**
 * Existing API compatibility view during expand/contract migration.
 * Stable mapping and ownership projection are optional until migration gates pass.
 */
export type SoulCoreViewCompatV1 = Omit<
  SoulCoreViewV1,
  | keyof SoulCoreRefV1
  | 'agentUniqueId'
  | 'ownership'
  | 'authority'
> &
  Partial<SoulCoreRefV1> & {
    /** @deprecated Use `soulCoreId` once present. */
    agentUniqueId: string;
    ownership?: SoulCoreOwnershipV1;
    authority: AuthorityItemCompatV1[];
  };

/**
 * Canonical stable Soul Core identifier grammar (v1). Shared by Web, Mobile and
 * Desktop so no client computes, derives, or replaces the identifier locally.
 */
export const SOUL_CORE_ID_PATTERN_V1 = /^sc_[0-9a-f]{32}$/;

/** Deterministic contract fixture used by all three client contract tests. */
export const SOUL_CORE_REF_FIXTURE_V1: SoulCoreRefV1 = {
  schemaVersion: SOUL_CORE_SCHEMA_VERSION,
  soulCoreId: 'sc_0123456789abcdef0123456789abcdef',
  agentAccountId: '00000000-0000-4000-8000-000000000000',
};

/** Normalized decode error. Clients surface a single non-enumerating message. */
export class SoulCoreRefDecodeError extends Error {
  readonly code = 'soul_core_ref_invalid';
  constructor(message = 'Invalid Soul Core reference') {
    super(message);
    this.name = 'SoulCoreRefDecodeError';
  }
}

/**
 * Decode a Backend-provided Soul Core reference.
 *
 * The identifier is treated as opaque and authoritative: the decoder validates
 * the versioned envelope and grammar but never derives or substitutes the ID
 * from owner, signer, wallet, or `agentUniqueId` (R2.13). Unsupported schema
 * versions and malformed identifiers fail with one normalized error.
 */
export function decodeSoulCoreRefV1(input: unknown): SoulCoreRefV1 {
  if (typeof input !== 'object' || input === null) {
    throw new SoulCoreRefDecodeError();
  }
  const candidate = input as Record<string, unknown>;
  if (candidate.schemaVersion !== SOUL_CORE_SCHEMA_VERSION) {
    throw new SoulCoreRefDecodeError('Unsupported Soul Core schema version');
  }
  if (
    typeof candidate.soulCoreId !== 'string' ||
    !SOUL_CORE_ID_PATTERN_V1.test(candidate.soulCoreId)
  ) {
    throw new SoulCoreRefDecodeError();
  }
  if (typeof candidate.agentAccountId !== 'string' || candidate.agentAccountId.length === 0) {
    throw new SoulCoreRefDecodeError();
  }
  return {
    schemaVersion: SOUL_CORE_SCHEMA_VERSION,
    soulCoreId: candidate.soulCoreId,
    agentAccountId: candidate.agentAccountId,
  };
}
