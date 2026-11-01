import {
  authorityRootRefsEqualV1,
  isAuthorityRootRefV1,
  isRecordRefV1,
  validateActionAttributionV1,
  type ActionAttributionV1,
  type ActionAttributionValidationContextV1,
  type AuthorityRootRefV1,
} from '../../types/agent-attribution';
import {
  validateExecutionMandateV1,
  type ExecutionMandateV1,
} from '../../types/agent-economy';
import {
  canonicalizeJson,
  type RecordRef,
} from '../../types/trust-loop-primitives';
import { sha256Hex } from './canonical';
import {
  EMPTY_DELEGATION_CHAIN_DIGEST,
  PROPOSAL_DIGEST_V2_SCHEMA_VERSION,
  proposalDigestV2,
  type ProposalV2,
} from './proposal-digest-v2';

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const COUNTER = /^(0|[1-9][0-9]*)$/;
const PRE_EXECUTION_REF_TYPES = new Set<RecordRef['type']>([
  'authority_decision',
  'policy',
  'terms',
  'evidence',
  'assurance_evidence',
  'delegation_chain',
  'risk_decision',
  'budget_reservation',
]);

export type ProposalV2BaseFields = Pick<
  ProposalV2,
  | 'kitId'
  | 'accountId'
  | 'chainId'
  | 'authorityId'
  | 'proposalType'
  | 'policyVersion'
  | 'proposalNonce'
  | 'expiresAtOrEpoch'
  | 'requiredRole'
>;

export interface ProposalV2AuthoritativeContext {
  kitId: string;
  accountId: string;
  chainId: string;
  authorityId: string;
  controlEpoch: string;
  lifecycleCounter: string;
  directAuthorityRootRef: AuthorityRootRefV1;
}

export interface BuildProposalV2ExecutionContextInput {
  base: ProposalV2BaseFields;
  actionId: string;
  attribution: ActionAttributionV1;
  attributionValidationContext?: ActionAttributionValidationContextV1;
  mandate: ExecutionMandateV1;
  mandateRef: RecordRef;
  proposalEvidenceRefs: RecordRef[];
  authoritative: ProposalV2AuthoritativeContext;
}

export interface BoundProposalV2ExecutionContext {
  proposal: ProposalV2;
  proposalDigest: string;
  proposalContextDigest: string;
  mandateRef: RecordRef;
  proposalEvidenceRefs: RecordRef[];
}

export class ProposalV2ExecutionContextError extends Error {
  readonly code = 'proposal_v2_execution_context_invalid';
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`ProposalV2 execution context invalid: ${errors.join('; ')}`);
    this.name = 'ProposalV2ExecutionContextError';
    this.errors = errors;
  }
}

function refKey(ref: RecordRef): string {
  return `${ref.type}:${ref.id}:${ref.version ?? ''}`;
}

function refsEqual(left: RecordRef | undefined, right: RecordRef | undefined): boolean {
  if (!left || !right) return left === right;
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function authorityId(root: AuthorityRootRefV1): string {
  return root.kind === 'soul_core' ? root.soulCoreId : root.authorityId;
}

function digestCanonical(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}

function validateReference(ref: unknown, path: string, errors: string[]): ref is RecordRef {
  if (!isRecordRefV1(ref)) {
    errors.push(`${path}: invalid RecordRef`);
    return false;
  }
  return true;
}

/**
 * Builds the only accepted pre-execution V2 shape. It binds Action attribution,
 * the canonical ExecutionMandate/actionId and pre-execution evidence refs into
 * payloadHash. It never accepts or emits a V1 envelope, ActionReceipt or
 * ResponsibilityLineage.
 */
export function buildProposalV2ExecutionContext(
  input: BuildProposalV2ExecutionContextInput,
): BoundProposalV2ExecutionContext {
  const errors: string[] = [];
  const attributionContext = {
    ...input.attributionValidationContext,
    directAuthorityRootRef: input.authoritative.directAuthorityRootRef,
    requireAuthorityRelationshipProof: true,
  } satisfies ActionAttributionValidationContextV1;
  const attributionValidation = validateActionAttributionV1(input.attribution, attributionContext);
  errors.push(...attributionValidation.errors.map((error) => `attribution: ${error}`));
  const mandateValidation = validateExecutionMandateV1(input.mandate);
  errors.push(...mandateValidation.errors.map((error) => `mandate: ${error}`));

  if (!isAuthorityRootRefV1(input.mandate.authorityRootRef)) {
    errors.push('mandate.authorityRootRef: invalid authority root');
  }
  if (!isAuthorityRootRefV1(input.authoritative.directAuthorityRootRef)) {
    errors.push('authoritative.directAuthorityRootRef: invalid authority root');
  }
  if (input.actionId.length === 0 || input.actionId !== input.mandate.actionId) {
    errors.push('actionId: must equal mandate.actionId');
  }
  if (input.attribution.accountableAgentId !== input.mandate.accountableAgentId) {
    errors.push('accountableAgentId: attribution and mandate mismatch');
  }
  if (
    isAuthorityRootRefV1(input.attribution.authorityRootRef) &&
    isAuthorityRootRefV1(input.mandate.authorityRootRef) &&
    !authorityRootRefsEqualV1(input.attribution.authorityRootRef, input.mandate.authorityRootRef)
  ) {
    errors.push('authorityRootRef: attribution and mandate mismatch');
  }
  if (
    isAuthorityRootRefV1(input.attribution.authorityRootRef) &&
    input.authoritative.authorityId !== authorityId(input.attribution.authorityRootRef)
  ) {
    errors.push('authoritative.authorityId: does not identify attribution authority root');
  }

  for (const field of ['kitId', 'accountId', 'chainId', 'authorityId'] as const) {
    if (input.base[field] !== input.authoritative[field]) {
      errors.push(`base.${field}: authoritative value mismatch`);
    }
  }
  if (!COUNTER.test(input.authoritative.controlEpoch)) {
    errors.push('authoritative.controlEpoch: expected canonical uint counter');
  }
  if (!COUNTER.test(input.authoritative.lifecycleCounter)) {
    errors.push('authoritative.lifecycleCounter: expected canonical uint counter');
  }

  const mandateRefValid = validateReference(input.mandateRef, 'mandateRef', errors);
  if (mandateRefValid) {
    if (input.mandateRef.type !== 'execution_mandate' || input.mandateRef.id !== input.mandate.mandateId) {
      errors.push('mandateRef: must identify the supplied ExecutionMandate');
    }
    if (!input.mandateRef.digest || !LOWER_HEX_64.test(input.mandateRef.digest.value)) {
      errors.push('mandateRef.digest: sha-256 digest is required');
    }
  }

  if (!Array.isArray(input.proposalEvidenceRefs) || input.proposalEvidenceRefs.length === 0) {
    errors.push('proposalEvidenceRefs: at least one pre-execution ref is required');
  } else {
    const keys = new Set<string>();
    for (const [index, ref] of input.proposalEvidenceRefs.entries()) {
      if (!validateReference(ref, `proposalEvidenceRefs[${index}]`, errors)) continue;
      if (!PRE_EXECUTION_REF_TYPES.has(ref.type)) {
        errors.push(`proposalEvidenceRefs[${index}]: post-execution or unsupported ref type ${ref.type}`);
      }
      const key = refKey(ref);
      if (keys.has(key)) errors.push(`proposalEvidenceRefs[${index}]: duplicate ref`);
      keys.add(key);
    }
  }

  const delegationRef = input.attribution.delegationChainRef;
  if (!refsEqual(delegationRef, input.mandate.delegationChainRef)) {
    errors.push('delegationChainRef: attribution and mandate must use the same ref');
  }
  let delegationChainDigest = EMPTY_DELEGATION_CHAIN_DIGEST;
  if (delegationRef) {
    if (!delegationRef.digest || !LOWER_HEX_64.test(delegationRef.digest.value)) {
      errors.push('delegationChainRef.digest: delegated action requires lower-case sha-256 digest');
    } else {
      delegationChainDigest = delegationRef.digest.value;
    }
  }

  if (errors.length > 0) throw new ProposalV2ExecutionContextError(errors);

  const contextBinding = {
    schemaVersion: 1,
    actionId: input.actionId,
    mandateRef: input.mandateRef,
    proposalEvidenceRefs: input.proposalEvidenceRefs,
  } as const;
  const proposalContextDigest = digestCanonical(contextBinding);
  const proposal: ProposalV2 = {
    ...input.base,
    payloadHash: proposalContextDigest,
    schemaVersion: PROPOSAL_DIGEST_V2_SCHEMA_VERSION,
    actorRefDigest: digestCanonical(input.attribution.actorRef),
    accountableAgentId: input.attribution.accountableAgentId,
    authorityRootRefDigest: digestCanonical(input.attribution.authorityRootRef),
    delegationChainDigest,
    controlEpoch: input.authoritative.controlEpoch,
    expectedLifecycleCounter: input.authoritative.lifecycleCounter,
  };
  const digest = proposalDigestV2(proposal);
  return {
    proposal,
    proposalDigest: digest,
    proposalContextDigest,
    mandateRef: input.mandateRef,
    proposalEvidenceRefs: [...input.proposalEvidenceRefs],
  };
}
