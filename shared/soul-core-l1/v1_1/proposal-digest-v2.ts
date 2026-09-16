/**
 * ProposalDigestV2 protocol freeze for Agent/Soul Core attribution.
 *
 * V2 is an additive, strict field superset of ProposalV1. It never changes the
 * V1 encoder or verifier. Evidence remains protocol_only until implemented and
 * verified independently by host, backend and real Applet code.
 */
import { sha256BytesHex, utf8Bytes } from './canonical';
import { proposalDigest, type ProposalV1 } from './proposal-digest';

export const PROPOSAL_DIGEST_V2_SCHEMA_VERSION = '2' as const;
export const PROPOSAL_DIGEST_V2_DOMAIN = 'AGENTRIX_SOUL_PROPOSAL_V2' as const;
export const EMPTY_DELEGATION_CHAIN_DIGEST = '0'.repeat(64);

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const CANONICAL_COUNTER = /^(0|[1-9][0-9]*)$/;
const V1_FIELD_NAMES = [
  'kitId',
  'accountId',
  'chainId',
  'authorityId',
  'proposalType',
  'payloadHash',
  'policyVersion',
  'proposalNonce',
  'expiresAtOrEpoch',
  'requiredRole',
] as const;
const V2_FIELD_NAMES = [
  ...V1_FIELD_NAMES,
  'schemaVersion',
  'actorRefDigest',
  'accountableAgentId',
  'authorityRootRefDigest',
  'delegationChainDigest',
  'controlEpoch',
  'expectedLifecycleCounter',
] as const;

/** V1's ten fields are inherited without rename or semantic change. */
export interface ProposalV2 extends ProposalV1 {
  schemaVersion: typeof PROPOSAL_DIGEST_V2_SCHEMA_VERSION;
  actorRefDigest: string;
  accountableAgentId: string;
  authorityRootRefDigest: string;
  /** Fixed EMPTY_DELEGATION_CHAIN_DIGEST when no delegation applies. */
  delegationChainDigest: string;
  /** Monotonic across owner/controller/principal/root-authority changes. */
  controlEpoch: string;
  /** Card/registry lifecycle counter expected at signing time. */
  expectedLifecycleCounter: string;
}

export interface ProposalDigestV2VerificationContext {
  /** Current authoritative epoch from the owner/controller/authority registry. */
  currentControlEpoch: string;
  /** Current authoritative lifecycle counter from card + registry reconciliation. */
  currentLifecycleCounter: string;
}

export class ProposalDigestV2EncodingError extends Error {
  readonly code = 'proposal_digest_v2_invalid';

  constructor() {
    super('Invalid ProposalDigestV2 input');
    this.name = 'ProposalDigestV2EncodingError';
  }
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isExactProposalV1(value: unknown): value is ProposalV1 {
  if (typeof value !== 'object' || value === null || !hasExactKeys(value, V1_FIELD_NAMES)) return false;
  const proposal = value as Record<string, unknown>;
  return V1_FIELD_NAMES.every(
    (field) => typeof proposal[field] === 'string' && proposal[field].length > 0 && isWellFormedUnicode(proposal[field]),
  );
}

/** Exact V2 field order: domain, all V1 fields in V1 order, then V2 additions. */
export function proposalV2Fields(proposal: ProposalV2): string[] {
  return [
    PROPOSAL_DIGEST_V2_DOMAIN,
    proposal.kitId,
    proposal.accountId,
    proposal.chainId,
    proposal.authorityId,
    proposal.proposalType,
    proposal.payloadHash,
    proposal.policyVersion,
    proposal.proposalNonce,
    proposal.expiresAtOrEpoch,
    proposal.requiredRole,
    proposal.schemaVersion,
    proposal.actorRefDigest,
    proposal.accountableAgentId,
    proposal.authorityRootRefDigest,
    proposal.delegationChainDigest,
    proposal.controlEpoch,
    proposal.expectedLifecycleCounter,
  ];
}

function validateProposalV2(proposal: ProposalV2): void {
  if (typeof proposal !== 'object' || proposal === null || !hasExactKeys(proposal, V2_FIELD_NAMES)) {
    throw new ProposalDigestV2EncodingError();
  }
  const fields = proposalV2Fields(proposal);
  if (fields.some((field) => typeof field !== 'string' || field.length === 0 || !isWellFormedUnicode(field))) {
    throw new ProposalDigestV2EncodingError();
  }
  if (
    proposal.schemaVersion !== PROPOSAL_DIGEST_V2_SCHEMA_VERSION ||
    !LOWER_HEX_64.test(proposal.actorRefDigest) ||
    !LOWER_HEX_64.test(proposal.authorityRootRefDigest) ||
    !LOWER_HEX_64.test(proposal.delegationChainDigest) ||
    !CANONICAL_COUNTER.test(proposal.controlEpoch) ||
    !CANONICAL_COUNTER.test(proposal.expectedLifecycleCounter)
  ) {
    throw new ProposalDigestV2EncodingError();
  }
}

/**
 * Canonical bytes: every NFC-normalized UTF-8 field is prefixed by its unsigned
 * 32-bit big-endian byte length. No delimiter or locale-dependent encoding.
 */
export function encodeProposalV2(proposal: ProposalV2): Uint8Array {
  validateProposalV2(proposal);
  const encodedFields = proposalV2Fields(proposal).map((field) => utf8Bytes(field.normalize('NFC')));
  const totalLength = encodedFields.reduce((sum, field) => sum + 4 + field.length, 0);
  const encoded = new Uint8Array(totalLength);
  const view = new DataView(encoded.buffer);
  let offset = 0;
  for (const field of encodedFields) {
    view.setUint32(offset, field.length, false);
    offset += 4;
    encoded.set(field, offset);
    offset += field.length;
  }
  return encoded;
}

export function proposalDigestV2(proposal: ProposalV2): string {
  return sha256BytesHex(encodeProposalV2(proposal));
}

export type ProposalDigestEnvelope =
  | { digestVersion: 1; proposal: ProposalV1; digest: string }
  | { digestVersion: 2; proposal: ProposalV2; digest: string };

/**
 * Explicit version dispatch. V1 accepts exactly V1's ten fields, so a V2
 * payload cannot be relabelled as V1. V2 additionally requires current
 * authoritative state; unknown versions, stale state and malformed payloads
 * fail closed, and a failed V2 verification never falls back to V1.
 */
export function verifyProposalDigestEnvelope(
  envelope: unknown,
  context?: ProposalDigestV2VerificationContext,
): boolean {
  if (typeof envelope !== 'object' || envelope === null) return false;
  const candidate = envelope as Record<string, unknown>;
  if (!hasExactKeys(candidate, ['digestVersion', 'proposal', 'digest'])) return false;
  if (typeof candidate.digest !== 'string' || !LOWER_HEX_64.test(candidate.digest)) return false;

  if (candidate.digestVersion === 1) {
    if (!isExactProposalV1(candidate.proposal)) return false;
    return proposalDigest(candidate.proposal) === candidate.digest;
  }
  if (candidate.digestVersion === 2) {
    if (!context || !CANONICAL_COUNTER.test(context.currentControlEpoch) || !CANONICAL_COUNTER.test(context.currentLifecycleCounter)) {
      return false;
    }
    try {
      const proposal = candidate.proposal as ProposalV2;
      validateProposalV2(proposal);
      if (
        proposal.controlEpoch !== context.currentControlEpoch ||
        proposal.expectedLifecycleCounter !== context.currentLifecycleCounter
      ) {
        return false;
      }
      return proposalDigestV2(proposal) === candidate.digest;
    } catch {
      return false;
    }
  }
  return false;
}
