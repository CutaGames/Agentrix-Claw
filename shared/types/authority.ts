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

/**
 * The only enforcement-layer wire values any runtime may accept (T23).
 * Legacy single markers (`SE`, `onchain-AA`) and unknown values are not members:
 * consumers must drop them rather than guess an equivalent.
 */
export const CANONICAL_ENFORCEMENT_LAYERS = [
  'software',
  'onchain-4337',
  'SE-tap',
  'SE-resident',
] as const;

const CANONICAL_ENFORCEMENT_LAYER_SET: ReadonlySet<string> = new Set(
  CANONICAL_ENFORCEMENT_LAYERS,
);

export function isCanonicalEnforcementLayer(value: unknown): value is EnforcementLayer {
  return typeof value === 'string' && CANONICAL_ENFORCEMENT_LAYER_SET.has(value);
}

/**
 * Fail-closed split of an untrusted layer list. Renderers use `canonical` and
 * surface `rejected` instead of crashing on `map[unknownLayer].icon` or silently
 * upgrading a legacy marker. Duplicates collapse; order is preserved.
 */
export function partitionEnforcementLayers(
  values: unknown,
): { canonical: EnforcementLayer[]; rejected: string[] } {
  if (!Array.isArray(values)) return { canonical: [], rejected: [] };
  const canonical: EnforcementLayer[] = [];
  const rejected: string[] = [];
  for (const value of values) {
    if (isCanonicalEnforcementLayer(value)) {
      if (!canonical.includes(value)) canonical.push(value);
    } else {
      const label = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
      if (!rejected.includes(label)) rejected.push(label);
    }
  }
  return { canonical, rejected };
}

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
