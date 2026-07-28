/**
 * Authority v1 — cross-runtime policy and enforcement contract.
 *
 * `enforcementLayers` is the canonical representation. `enforcedBy` only
 * exists on the compatibility shape while older clients are being migrated.
 */

export const AUTHORITY_SCHEMA_VERSION = 1 as const;

/** Runtime layers that can independently enforce an authority policy. */
export type EnforcementLayer =
  | 'software'
  | 'onchain-4337'
  | 'SE-tap'
  | 'SE-resident';

/** @deprecated Use `EnforcementLayer[]`. */
export type LegacyEnforcedBy = 'software' | 'onchain-AA' | 'SE';

export type AuthorityPolicyKindV1 =
  | 'dailyLimit'
  | 'singleTxLimit'
  | 'monthlyLimit'
  | 'allowlist'
  | 'velocity'
  | 'approval'
  | 'capability';

export type AuthorityPolicyStatusV1 =
  | 'draft'
  | 'active'
  | 'suspended'
  | 'revoked'
  | 'expired';

/** Canonical machine-readable authority policy. */
export interface AuthorityPolicyV1 {
  schemaVersion: typeof AUTHORITY_SCHEMA_VERSION;
  policyId: string;
  soulCoreId: string;
  kind: AuthorityPolicyKindV1;
  effect: 'allow' | 'deny' | 'limit' | 'require-approval';
  status: AuthorityPolicyStatusV1;
  /** All layers that enforce this policy; order does not imply precedence. */
  enforcementLayers: EnforcementLayer[];
  /** Policy-specific values such as amount, currency, window, or allowlist. */
  constraints: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

/** Human-facing projection of one active authority rule. */
export interface AuthorityItemV1 {
  kind: AuthorityPolicyKindV1;
  label: string;
  value?: string;
  policyId?: string;
  enforcementLayers: EnforcementLayer[];
  /** True only when at least one active layer is outside operator software. */
  hard: boolean;
  note?: string;
}

/**
 * Expand/contract shape returned while old clients still read `enforcedBy`.
 * New code must read `enforcementLayers` first.
 */
export interface AuthorityItemCompatV1 extends AuthorityItemV1 {
  /** @deprecated Read `enforcementLayers` instead. */
  enforcedBy: LegacyEnforcedBy;
}

const LEGACY_LAYER_MAP: Record<LegacyEnforcedBy, readonly EnforcementLayer[]> = {
  software: ['software'],
  'onchain-AA': ['onchain-4337'],
  SE: ['SE-resident'],
};

/** Convert an old single enforcement marker into the canonical layer list. */
export function legacyEnforcedByToLayers(
  enforcedBy?: LegacyEnforcedBy | null,
): EnforcementLayer[] {
  return [...LEGACY_LAYER_MAP[enforcedBy ?? 'software']];
}
