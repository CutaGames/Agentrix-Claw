/**
 * Agent-first presentation context for Mobile V6.
 *
 * This module intentionally owns no canonical Agent/Soul Core DTO, storage,
 * authentication, transport, feature-flag evaluation or navigation. Callers
 * must provide authorization/freshness results and canonical Agent-to-Soul
 * Core references from their authoritative upstreams.
 *
 * Resolution is fail-closed and ordered:
 * explicit authorized route > user selection > canonical Primary.
 * A present higher-priority candidate that is invalid, unauthorized, stale or
 * unknown never falls through to a lower-priority candidate.
 */

export const MOBILE_AGENT_CONTEXT_SCHEMA_VERSION = 'mobile-agent-context/v1' as const;

export type MobileAgentContextSource =
  | 'explicit_route'
  | 'user_selection'
  | 'canonical_primary';

export type MobileAgentAuthorizationState =
  | 'authorized'
  | 'unauthorized'
  | 'unknown';

export type MobileAgentFreshnessState = 'fresh' | 'stale' | 'unknown';

/**
 * Presentation-only candidate. `agentId` must already be canonical; this
 * module never derives it from an account, Pet, device, wallet or Soul Core.
 */
export interface MobileAgentContextCandidate {
  agentId: string;
  authorization: MobileAgentAuthorizationState;
  freshness: MobileAgentFreshnessState;
}

/**
 * Canonical mapping supplied by an upstream directory. The status describes
 * the mapping itself, independently of the selected Agent candidate.
 */
export interface MobileCanonicalSoulCoreRef {
  agentId: string;
  soulCoreId: string;
  status: 'active' | 'stale' | 'unauthorized' | 'unknown';
}

export interface ResolveMobileAgentContextInput {
  explicitRoute?: MobileAgentContextCandidate | null;
  userSelection?: MobileAgentContextCandidate | null;
  canonicalPrimaryCandidates?: readonly MobileAgentContextCandidate[] | null;
  canonicalSoulCoreRefs?: readonly MobileCanonicalSoulCoreRef[] | null;
}

export interface MobileAgentContextScope {
  /** Query keys must retain both IDs so data cannot bleed across Agents. */
  queryKey: readonly [
    typeof MOBILE_AGENT_CONTEXT_SCHEMA_VERSION,
    'agent',
    string,
    'soul-core',
    string,
  ];
  /** Stable compose scope for draft/action state; never use a global scope. */
  composeKey: string;
}

export interface ResolvedMobileAgentContext {
  schemaVersion: typeof MOBILE_AGENT_CONTEXT_SCHEMA_VERSION;
  source: MobileAgentContextSource;
  agentId: string;
  soulCoreId: string;
  scope: MobileAgentContextScope;
}

export type MobileAgentContextMissingReason =
  | 'canonical_primary_missing'
  | 'soul_core_mapping_missing';

export type MobileAgentContextAmbiguousReason =
  | 'multiple_canonical_primary_agents'
  | 'multiple_soul_core_mappings';

export type MobileAgentContextUnauthorizedReason =
  | 'agent_unauthorized'
  | 'soul_core_mapping_unauthorized';

export type MobileAgentContextStaleReason =
  | 'agent_context_stale'
  | 'soul_core_mapping_stale';

export type MobileAgentContextUnavailableReason =
  | 'invalid_agent_identifier'
  | 'agent_authorization_unknown'
  | 'agent_freshness_unknown'
  | 'invalid_soul_core_identifier'
  | 'soul_core_mapping_unknown';

export type MobileAgentContextResolution =
  | { kind: 'ready'; context: ResolvedMobileAgentContext }
  | {
      kind: 'missing';
      reason: MobileAgentContextMissingReason;
      source?: MobileAgentContextSource;
      agentId?: string;
    }
  | {
      kind: 'ambiguous';
      reason: MobileAgentContextAmbiguousReason;
      source?: MobileAgentContextSource;
      agentId?: string;
      candidateAgentIds?: readonly string[];
    }
  | {
      kind: 'unauthorized';
      reason: MobileAgentContextUnauthorizedReason;
      source: MobileAgentContextSource;
      agentId?: string;
    }
  | {
      kind: 'stale';
      reason: MobileAgentContextStaleReason;
      source: MobileAgentContextSource;
      agentId?: string;
    }
  | {
      kind: 'unavailable';
      reason: MobileAgentContextUnavailableReason;
      source: MobileAgentContextSource;
      agentId?: string;
    };

const SAFE_CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

interface SelectedCandidate {
  source: MobileAgentContextSource;
  candidate: MobileAgentContextCandidate;
}

type CandidateSelection =
  | { kind: 'selected'; value: SelectedCandidate }
  | Extract<MobileAgentContextResolution, { kind: 'missing' | 'ambiguous' }>;

function isCanonicalId(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value === value.trim()
    && SAFE_CANONICAL_ID.test(value)
  );
}

function selectCandidate(input: ResolveMobileAgentContextInput): CandidateSelection {
  if (input.explicitRoute !== undefined && input.explicitRoute !== null) {
    return {
      kind: 'selected',
      value: { source: 'explicit_route', candidate: input.explicitRoute },
    };
  }

  if (input.userSelection !== undefined && input.userSelection !== null) {
    return {
      kind: 'selected',
      value: { source: 'user_selection', candidate: input.userSelection },
    };
  }

  const primaries = input.canonicalPrimaryCandidates ?? [];
  if (primaries.length === 0) {
    return { kind: 'missing', reason: 'canonical_primary_missing' };
  }
  if (primaries.length !== 1) {
    return {
      kind: 'ambiguous',
      reason: 'multiple_canonical_primary_agents',
      candidateAgentIds: primaries
        .map((candidate) => candidate?.agentId)
        .filter(isCanonicalId),
    };
  }

  return {
    kind: 'selected',
    value: { source: 'canonical_primary', candidate: primaries[0] },
  };
}

function validateCandidate(
  selected: SelectedCandidate,
): Exclude<MobileAgentContextResolution, { kind: 'missing' | 'ambiguous' }> | null {
  const { source, candidate } = selected;
  const agentId = candidate?.agentId;

  if (!isCanonicalId(agentId)) {
    return { kind: 'unavailable', reason: 'invalid_agent_identifier', source };
  }
  if (candidate.authorization === 'unauthorized') {
    return { kind: 'unauthorized', reason: 'agent_unauthorized', source, agentId };
  }
  if (candidate.authorization !== 'authorized') {
    return {
      kind: 'unavailable',
      reason: 'agent_authorization_unknown',
      source,
      agentId,
    };
  }
  if (candidate.freshness === 'stale') {
    return { kind: 'stale', reason: 'agent_context_stale', source, agentId };
  }
  if (candidate.freshness !== 'fresh') {
    return {
      kind: 'unavailable',
      reason: 'agent_freshness_unknown',
      source,
      agentId,
    };
  }

  return null;
}

function createScope(agentId: string, soulCoreId: string): MobileAgentContextScope {
  return Object.freeze({
    queryKey: Object.freeze([
      MOBILE_AGENT_CONTEXT_SCHEMA_VERSION,
      'agent',
      agentId,
      'soul-core',
      soulCoreId,
    ] as const),
    composeKey: [
      MOBILE_AGENT_CONTEXT_SCHEMA_VERSION,
      encodeURIComponent(agentId),
      encodeURIComponent(soulCoreId),
    ].join(':'),
  });
}

/**
 * Resolve the Mobile V6 Agent presentation context without guessing identity.
 * Callers should invoke this only after `mobile.agent_first_ia` evaluates true;
 * the resolver itself deliberately has no process-global flag dependency.
 */
export function resolveMobileAgentContext(
  input: ResolveMobileAgentContextInput,
): MobileAgentContextResolution {
  const selection = selectCandidate(input);
  if (selection.kind !== 'selected') return selection;

  const selected = selection.value;
  const candidateFailure = validateCandidate(selected);
  if (candidateFailure) return candidateFailure;

  const { source, candidate } = selected;
  const agentId = candidate.agentId;
  const refs = (input.canonicalSoulCoreRefs ?? []).filter(
    (ref) => ref?.agentId === agentId,
  );

  if (refs.length === 0) {
    return {
      kind: 'missing',
      reason: 'soul_core_mapping_missing',
      source,
      agentId,
    };
  }
  if (refs.length !== 1) {
    return {
      kind: 'ambiguous',
      reason: 'multiple_soul_core_mappings',
      source,
      agentId,
    };
  }

  const ref = refs[0];
  if (!isCanonicalId(ref.soulCoreId)) {
    return {
      kind: 'unavailable',
      reason: 'invalid_soul_core_identifier',
      source,
      agentId,
    };
  }
  if (ref.status === 'unauthorized') {
    return {
      kind: 'unauthorized',
      reason: 'soul_core_mapping_unauthorized',
      source,
      agentId,
    };
  }
  if (ref.status === 'stale') {
    return {
      kind: 'stale',
      reason: 'soul_core_mapping_stale',
      source,
      agentId,
    };
  }
  if (ref.status !== 'active') {
    return {
      kind: 'unavailable',
      reason: 'soul_core_mapping_unknown',
      source,
      agentId,
    };
  }

  return {
    kind: 'ready',
    context: Object.freeze({
      schemaVersion: MOBILE_AGENT_CONTEXT_SCHEMA_VERSION,
      source,
      agentId,
      soulCoreId: ref.soulCoreId,
      scope: createScope(agentId, ref.soulCoreId),
    }),
  };
}
