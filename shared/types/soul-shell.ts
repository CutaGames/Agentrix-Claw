/**
 * SoulShell v1 — revocable runtime projection of a Soul Core.
 *
 * This contract intentionally contains no private-key material and no independent
 * balance. Shells reference authority and task proofs; they do not own either.
 */
export const SOUL_SHELL_SCHEMA_VERSION = 1 as const;

export type SoulShellKindV1 =
  | 'web'
  | 'mobile'
  | 'desktop'
  | 'wearable'
  | 'toy'
  | 'vehicle'
  | 'robot'
  | 'other';

export interface SoulShellCapabilityV1 {
  capability: string;
  actions: string[];
  constraints?: Record<string, unknown>;
}

export interface SoulShellPresenceV1 {
  status: 'online' | 'idle' | 'offline' | 'unknown';
  lastSeenAt?: string;
  endpointRef?: string;
}

export interface SoulShellRevocationV1 {
  status: 'active' | 'revoked' | 'expired';
  revokedAt?: string;
  revokedBy?: string;
  reason?: string;
}

export interface SoulShellDescriptorV1 {
  schemaVersion: typeof SOUL_SHELL_SCHEMA_VERSION;
  shellId: string;
  soulCoreId: string;
  kind: SoulShellKindV1;
  runtimeId: string;
  declaredCapabilities: SoulShellCapabilityV1[];
  presence: SoulShellPresenceV1;
  revocation: SoulShellRevocationV1;
  registeredAt: string;
}

/** Effective capabilities are the intersection of core grants and shell support. */
export interface SoulShellCapabilityIntersectionV1 {
  coreGranted: SoulShellCapabilityV1[];
  shellSupported: SoulShellCapabilityV1[];
  effective: SoulShellCapabilityV1[];
  evaluatedAt: string;
}

export interface ShellSessionV1 {
  schemaVersion: typeof SOUL_SHELL_SCHEMA_VERSION;
  shellSessionId: string;
  shellId: string;
  soulCoreId: string;
  status: 'pending' | 'active' | 'suspended' | 'closed' | 'revoked' | 'expired';
  capabilities: SoulShellCapabilityIntersectionV1;
  authorityPolicyIds: string[];
  taskProofIds?: string[];
  startedAt: string;
  lastSeenAt?: string;
  expiresAt: string;
  closedAt?: string;
}

/** Deterministically intersect capabilities by capability and action name. */
export function intersectSoulShellCapabilities(
  coreGranted: readonly SoulShellCapabilityV1[],
  shellSupported: readonly SoulShellCapabilityV1[],
): SoulShellCapabilityV1[] {
  const supported = new Map(
    shellSupported.map((entry) => [entry.capability, new Set(entry.actions)]),
  );

  return coreGranted.flatMap((grant) => {
    const shellActions = supported.get(grant.capability);
    if (!shellActions) return [];
    const actions = grant.actions.filter((action) => shellActions.has(action));
    return actions.length > 0 ? [{ ...grant, actions }] : [];
  });
}
