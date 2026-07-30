import {
  TRUST_RECORD_TYPES,
  type RecordRef,
} from './trust-loop-primitives';

/** ADR-SOUL-002 typed actor/accountability/authority attribution contract. */
export const ACTION_ATTRIBUTION_SCHEMA_VERSION = 1 as const;

export type ActorRefV1 =
  | { kind: 'agent'; agentId: string }
  | { kind: 'worker'; workerId: string; workerRunId?: string };

export type AuthorityRootRefV1 =
  | { kind: 'soul_core'; soulCoreId: string }
  | { kind: 'team_authority'; teamId: string; authorityId: string };

export interface ActionAttributionV1 {
  schemaVersion: typeof ACTION_ATTRIBUTION_SCHEMA_VERSION;
  actorRef: ActorRefV1;
  accountableAgentId: string;
  authorityRootRef: AuthorityRootRefV1;
  delegationChainRef?: RecordRef;
  initiatorRef: RecordRef;
  runtimeRef: RecordRef;
  shellSessionRef?: RecordRef;
}

/**
 * Relationship facts supplied by the authority mapping write authority.
 * Structural validation can prove Worker/Team delegation locally; cross-root
 * validation requires this context and must not be guessed from current owner,
 * wallet, signer, Runtime or Shell state.
 */
export interface ActionAttributionValidationContextV1 {
  directAuthorityRootRef?: AuthorityRootRefV1;
  delegationRequired?: boolean;
  requireAuthorityRelationshipProof?: boolean;
}

export interface AgentSoulContractValidationResultV1 {
  valid: boolean;
  errors: string[];
}

export class ActionAttributionValidationError extends Error {
  readonly code = 'action_attribution_invalid';
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Action attribution validation failed: ${errors.join('; ')}`);
    this.name = 'ActionAttributionValidationError';
    this.errors = errors;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isActorRefV1(input: unknown): input is ActorRefV1 {
  if (!isObject(input)) return false;
  if (input.kind === 'agent') return isNonEmptyString(input.agentId);
  if (input.kind === 'worker') {
    return (
      isNonEmptyString(input.workerId) &&
      (input.workerRunId === undefined || isNonEmptyString(input.workerRunId))
    );
  }
  return false;
}

export function isAuthorityRootRefV1(input: unknown): input is AuthorityRootRefV1 {
  if (!isObject(input)) return false;
  if (input.kind === 'soul_core') return isNonEmptyString(input.soulCoreId);
  if (input.kind === 'team_authority') {
    return isNonEmptyString(input.teamId) && isNonEmptyString(input.authorityId);
  }
  return false;
}

export function isRecordRefV1(input: unknown): input is RecordRef {
  if (!isObject(input)) return false;
  if (
    !isNonEmptyString(input.type) ||
    !(TRUST_RECORD_TYPES as readonly string[]).includes(input.type) ||
    !isNonEmptyString(input.id)
  ) {
    return false;
  }
  if (
    input.version !== undefined &&
    (typeof input.version !== 'number' || !Number.isInteger(input.version) || input.version < 1)
  ) {
    return false;
  }
  if (input.digest !== undefined) {
    if (!isObject(input.digest)) return false;
    if (
      input.digest.algorithm !== 'sha-256' ||
      !isNonEmptyString(input.digest.canonicalization) ||
      typeof input.digest.value !== 'string' ||
      !/^[0-9a-f]{64}$/.test(input.digest.value)
    ) {
      return false;
    }
  }
  return true;
}

export function authorityRootRefsEqualV1(
  left: AuthorityRootRefV1,
  right: AuthorityRootRefV1,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'soul_core' && right.kind === 'soul_core') {
    return left.soulCoreId === right.soulCoreId;
  }
  return (
    left.kind === 'team_authority' &&
    right.kind === 'team_authority' &&
    left.teamId === right.teamId &&
    left.authorityId === right.authorityId
  );
}

export function validateActionAttributionV1(
  input: unknown,
  context: ActionAttributionValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { valid: false, errors: ['attribution: expected object'] };
  }

  if (input.schemaVersion !== ACTION_ATTRIBUTION_SCHEMA_VERSION) {
    errors.push(`attribution.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  if (!isActorRefV1(input.actorRef)) {
    errors.push('attribution.actorRef: unknown kind or malformed reference');
  }
  if (!isNonEmptyString(input.accountableAgentId)) {
    errors.push('attribution.accountableAgentId: expected non-empty string');
  }
  if (!isAuthorityRootRefV1(input.authorityRootRef)) {
    errors.push('attribution.authorityRootRef: unknown kind or malformed reference');
  }
  if (!isRecordRefV1(input.initiatorRef)) {
    errors.push('attribution.initiatorRef: expected known RecordRef');
  }
  if (!isRecordRefV1(input.runtimeRef)) {
    errors.push('attribution.runtimeRef: expected known RecordRef');
  }
  if (input.shellSessionRef !== undefined && !isRecordRefV1(input.shellSessionRef)) {
    errors.push('attribution.shellSessionRef: expected known RecordRef when present');
  }
  if (input.delegationChainRef !== undefined && !isRecordRefV1(input.delegationChainRef)) {
    errors.push('attribution.delegationChainRef: expected known RecordRef when present');
  }

  const actorRef = isActorRefV1(input.actorRef) ? input.actorRef : undefined;
  const authorityRootRef = isAuthorityRootRefV1(input.authorityRootRef)
    ? input.authorityRootRef
    : undefined;
  const hasDelegation = isRecordRefV1(input.delegationChainRef);

  if (
    actorRef?.kind === 'agent' &&
    isNonEmptyString(input.accountableAgentId) &&
    input.accountableAgentId !== actorRef.agentId
  ) {
    errors.push('attribution.accountableAgentId: Agent actor must account to its own agentId');
  }

  let delegationRequired = context.delegationRequired === true;
  if (actorRef?.kind === 'worker') delegationRequired = true;
  if (authorityRootRef?.kind === 'team_authority') delegationRequired = true;

  if (context.directAuthorityRootRef !== undefined) {
    if (!isAuthorityRootRefV1(context.directAuthorityRootRef)) {
      errors.push('context.directAuthorityRootRef: unknown kind or malformed reference');
    } else if (
      authorityRootRef !== undefined &&
      !authorityRootRefsEqualV1(authorityRootRef, context.directAuthorityRootRef)
    ) {
      delegationRequired = true;
    }
  } else if (context.requireAuthorityRelationshipProof === true && !hasDelegation) {
    errors.push('attribution.authorityRootRef: direct authority relationship proof is required');
  }

  if (delegationRequired && !hasDelegation) {
    errors.push('attribution.delegationChainRef: required for delegated, Worker, Team or cross-root action');
  }

  return { valid: errors.length === 0, errors };
}

export function decodeActionAttributionV1(
  input: unknown,
  context: ActionAttributionValidationContextV1 = {},
): ActionAttributionV1 {
  const validation = validateActionAttributionV1(input, context);
  if (!validation.valid) throw new ActionAttributionValidationError(validation.errors);
  return input as ActionAttributionV1;
}
