/**
 * Soul Core L1 v1.1 · ProposalDigestV1 canonical encoding + role signing boundary (T16 / W8).
 *
 * ProposalDigestV1 = HASH(
 *   "AGENTRIX_SOUL_PROPOSAL_V1" || kitId || accountId || chainId || authorityId ||
 *   proposalType || payloadHash || policyVersion || proposalNonce || expiresAtOrEpoch || requiredRole )
 *
 * The applet re-encodes and re-computes the digest on-card before signing (`SIGN_PROPOSAL`), then
 * checks Profile→proposalType allow-list, nonce (idempotency/anti-replay) and domain. A single card
 * only proves "this card, in this role, approved this digest" — signer de-dup, role matrix, M-of-N,
 * conflicting proposals, expiry and atomic execution are the EXTERNAL Authority's job. A single-card
 * output must never claim quorumComplete (Property 14 domain binding, Property 15 quorum honesty).
 *
 * Evidence level: simulator / protocol_only.
 */
import { digestHex } from './canonical';
import { checkProposalType, hasCapability, type ProfileId, type ProposalType, type CapabilityName } from './profiles';

export const PROPOSAL_DIGEST_DOMAIN = 'AGENTRIX_SOUL_PROPOSAL_V1' as const;

export const PROPOSAL_REJECT_CODES = [
  'proposal-domain-mismatch',
  'proposal-type-not-allowed',
  'proposal-nonce-replay',
  'proposal-expired',
  'proposal-field-invalid',
  'capability-denied',
] as const;
export type ProposalRejectCode = (typeof PROPOSAL_REJECT_CODES)[number];

/** Which capability a proposal type requires the signing Profile to hold. */
export const PROPOSAL_TYPE_CAPABILITY: Record<ProposalType, CapabilityName> = {
  session_issue: 'CAP_SESSION_ISSUE',
  policy_update: 'CAP_POLICY_ADMIN',
  step_up: 'CAP_STEP_UP',
  freeze: 'CAP_FREEZE',
  rotate: 'CAP_ROTATE',
  recover: 'CAP_RECOVER',
  governance: 'CAP_GOVERNANCE_PROPOSAL',
  finance: 'CAP_FINANCE_PROPOSAL',
  retire: 'CAP_RETIRE',
};

export interface ProposalV1 {
  kitId: string;
  accountId: string;
  chainId: string;
  authorityId: string;
  proposalType: ProposalType;
  /** Digest of the full proposal payload (host-provided; bound into the digest domain). */
  payloadHash: string;
  policyVersion: string;
  proposalNonce: string;
  /** Absolute ISO time or an owner-signed epoch marker. */
  expiresAtOrEpoch: string;
  requiredRole: string;
}

/** Canonical, order-fixed field encoding fed into the digest (domain-separated). */
export function encodeProposal(p: ProposalV1): string {
  return [
    PROPOSAL_DIGEST_DOMAIN,
    p.kitId,
    p.accountId,
    p.chainId,
    p.authorityId,
    p.proposalType,
    p.payloadHash,
    p.policyVersion,
    p.proposalNonce,
    p.expiresAtOrEpoch,
    p.requiredRole,
  ].join('|');
}

/** ProposalDigestV1 — deterministic; any field change (incl. domain) changes the digest. */
export function proposalDigest(p: ProposalV1): string {
  return digestHex({ domain: PROPOSAL_DIGEST_DOMAIN, encoded: encodeProposal(p) });
}

export interface CardSignerContext {
  profileId: ProfileId;
  cardIdRef: string;
  signerKeyRef: string;
  lifecycleCounter: number;
  /** Ring buffer of recently seen proposal nonces (idempotency / anti-replay). */
  recentProposalNonces: string[];
  proposalCounter: number;
  now: string;
}

export interface ProposalSignatureRecord {
  proposalDigest: string;
  signerKeyRef: string;
  cardIdRef: string;
  profileId: ProfileId;
  lifecycleCounter: number;
  proposalCounter: number;
  proposalType: ProposalType;
  /** Deterministic simulator signature placeholder — NOT cryptographic. */
  signature: string;
  signatureKind: 'deterministic-simulator-not-cryptographic';
  /** Property 15: a single card NEVER asserts quorum completion. */
  quorumComplete: false;
}

export type SignProposalResult =
  | { ok: true; record: ProposalSignatureRecord; consumedNonce: string }
  | { ok: false; reason: ProposalRejectCode; replayedRecord?: ProposalSignatureRecord };

/**
 * On-card `SIGN_PROPOSAL` semantics (simulator level):
 *  - re-encode + re-digest (domain-bound, Property 14),
 *  - Profile→proposalType allow-list + required capability,
 *  - nonce idempotency/anti-replay,
 *  - expiry,
 *  - emit a per-card signature record that never claims quorum (Property 15).
 */
export function signProposal(
  ctx: CardSignerContext,
  proposal: ProposalV1,
  priorRecordsByNonce?: Record<string, ProposalSignatureRecord>,
): SignProposalResult {
  // Field sanity
  for (const [k, v] of Object.entries(proposal)) {
    if (typeof v !== 'string' || v.length === 0) return { ok: false, reason: 'proposal-field-invalid' };
    void k;
  }
  // Profile → proposalType allow-list
  const typeCheck = checkProposalType(ctx.profileId, proposal.proposalType);
  if (!typeCheck.allowed) return { ok: false, reason: 'proposal-type-not-allowed' };
  // Required capability
  const requiredCap = PROPOSAL_TYPE_CAPABILITY[proposal.proposalType];
  if (!hasCapability(ctx.profileId, requiredCap)) return { ok: false, reason: 'capability-denied' };

  // Nonce idempotency: same nonce already signed by this card → replay the existing record.
  if (ctx.recentProposalNonces.includes(proposal.proposalNonce)) {
    const prior = priorRecordsByNonce?.[proposal.proposalNonce];
    if (prior) return { ok: false, reason: 'proposal-nonce-replay', replayedRecord: prior };
    return { ok: false, reason: 'proposal-nonce-replay' };
  }

  // Expiry (ISO time only; epoch markers are validated by the owner/authority off-card).
  const expiresMs = Date.parse(proposal.expiresAtOrEpoch);
  if (!Number.isNaN(expiresMs) && expiresMs <= Date.parse(ctx.now)) {
    return { ok: false, reason: 'proposal-expired' };
  }

  const digest = proposalDigest(proposal);
  const proposalCounter = ctx.proposalCounter + 1;
  const record: ProposalSignatureRecord = {
    proposalDigest: digest,
    signerKeyRef: ctx.signerKeyRef,
    cardIdRef: ctx.cardIdRef,
    profileId: ctx.profileId,
    lifecycleCounter: ctx.lifecycleCounter,
    proposalCounter,
    proposalType: proposal.proposalType,
    signature: `sim_prop_${digestHex({ digest, signerKeyRef: ctx.signerKeyRef, proposalCounter })}`,
    signatureKind: 'deterministic-simulator-not-cryptographic',
    quorumComplete: false,
  };
  return { ok: true, record, consumedNonce: proposal.proposalNonce };
}

/**
 * External quorum evaluation (Authority side, NOT on-card): de-dup signers, enforce distinct roles
 * and M-of-N over records that share the SAME proposalDigest. Rejects duplicate signer/card and
 * cross-domain records. This is the only place quorumComplete can become true.
 */
export interface QuorumPolicy {
  threshold: number;
  /** Distinct required roles (Profiles) that must each appear at least once, if any. */
  requiredRoles?: ProfileId[];
}

export function evaluateQuorum(
  records: ProposalSignatureRecord[],
  expectedDigest: string,
  policy: QuorumPolicy,
): { quorumComplete: boolean; distinctSigners: number; reasons: string[] } {
  const reasons: string[] = [];
  const sameDigest = records.filter((r) => r.proposalDigest === expectedDigest);
  if (sameDigest.length !== records.length) reasons.push('mixed-proposal-digest');
  // de-dup by (cardIdRef, signerKeyRef): one card counts once
  const seen = new Set<string>();
  const distinct: ProposalSignatureRecord[] = [];
  for (const r of sameDigest) {
    const key = `${r.cardIdRef}|${r.signerKeyRef}`;
    if (seen.has(key)) {
      reasons.push('duplicate-signer');
      continue;
    }
    seen.add(key);
    distinct.push(r);
  }
  let rolesOk = true;
  if (policy.requiredRoles && policy.requiredRoles.length) {
    const rolesPresent = new Set(distinct.map((r) => r.profileId));
    rolesOk = policy.requiredRoles.every((role) => rolesPresent.has(role));
    if (!rolesOk) reasons.push('required-role-missing');
  }
  const quorumComplete = distinct.length >= policy.threshold && rolesOk && reasons.every((x) => x === 'duplicate-signer');
  return { quorumComplete, distinctSigners: distinct.length, reasons };
}
