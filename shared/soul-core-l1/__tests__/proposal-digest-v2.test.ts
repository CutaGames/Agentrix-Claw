/** ProposalDigestV2 strict-superset, frozen encoding and no-downgrade verification. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { proposalDigest, type ProposalV1 } from '../v1_1/proposal-digest';
import {
  encodeProposalV2,
  proposalDigestV2,
  verifyProposalDigestEnvelope,
  type ProposalV2,
} from '../v1_1/proposal-digest-v2';

const golden: {
  proposalsV2: Array<{
    name: string;
    proposal: ProposalV2;
    expectedEncodedHex: string;
    expectedProposalDigest: string;
  }>;
} = JSON.parse(readFileSync(join(__dirname, '..', 'v1_1', 'golden-vectors.json'), 'utf8'));

const vector = golden.proposalsV2[0];
const proposal = (over: Partial<ProposalV2> = {}): ProposalV2 => ({ ...vector.proposal, ...over });
const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const v1Proposal = (): ProposalV1 => {
  const p = vector.proposal;
  return {
    kitId: p.kitId,
    accountId: p.accountId,
    chainId: p.chainId,
    authorityId: p.authorityId,
    proposalType: p.proposalType,
    payloadHash: p.payloadHash,
    policyVersion: p.policyVersion,
    proposalNonce: p.proposalNonce,
    expiresAtOrEpoch: p.expiresAtOrEpoch,
    requiredRole: p.requiredRole,
  };
};
const currentState = { currentControlEpoch: '7', currentLifecycleCounter: '3' };

describe('Soul Core ProposalDigestV2 protocol freeze', () => {
  it('reproduces the frozen binary preimage and SHA-256 golden vector', () => {
    expect(hex(encodeProposalV2(vector.proposal))).toBe(vector.expectedEncodedHex);
    expect(proposalDigestV2(vector.proposal)).toBe(vector.expectedProposalDigest);
  });

  it('is a strict field superset: changing any V1 or V2 value changes the digest', () => {
    const baseline = proposalDigestV2(proposal());
    const changes: Array<Partial<ProposalV2>> = [
      { kitId: 'kit_other' },
      { accountId: 'acct_2' },
      { chainId: '1' },
      { authorityId: 'auth_2' },
      { proposalType: 'freeze' },
      { payloadHash: 'q'.repeat(64) },
      { policyVersion: 'v2' },
      { proposalNonce: 'nonce-2' },
      { expiresAtOrEpoch: '2999-01-02T00:00:00Z' },
      { requiredRole: 'owner' },
      { actorRefDigest: 'c'.repeat(64) },
      { accountableAgentId: 'agent_other' },
      { authorityRootRefDigest: 'd'.repeat(64) },
      { delegationChainDigest: 'e'.repeat(64) },
      { controlEpoch: '8' },
      { expectedLifecycleCounter: '4' },
    ];
    for (const change of changes) expect(proposalDigestV2(proposal(change))).not.toBe(baseline);
  });

  it('normalizes well-formed Unicode to NFC and rejects lone surrogates', () => {
    expect(proposalDigestV2(proposal({ accountableAgentId: 'agent_é' }))).toBe(
      proposalDigestV2(proposal({ accountableAgentId: 'agent_e\u0301' })),
    );
    expect(() => proposalDigestV2(proposal({ accountableAgentId: 'agent_\ud800' }))).toThrow();
    expect(() => proposalDigestV2(proposal({ accountableAgentId: 'agent_\udc00' }))).toThrow();
  });

  it('fails closed for malformed digests, extra fields and non-canonical counters', () => {
    expect(() => proposalDigestV2(proposal({ actorRefDigest: 'A'.repeat(64) }))).toThrow();
    expect(() => proposalDigestV2(proposal({ delegationChainDigest: '' }))).toThrow();
    expect(() => proposalDigestV2(proposal({ controlEpoch: '07' }))).toThrow();
    expect(() => proposalDigestV2(proposal({ expectedLifecycleCounter: '-1' }))).toThrow();
    expect(() => proposalDigestV2({ ...proposal(), unexpected: 'field' } as ProposalV2)).toThrow();
  });

  it('dispatches by exact version and blocks V2 payload downgrade to V1', () => {
    const v1 = v1Proposal();
    const v1Digest = proposalDigest(v1);
    expect(verifyProposalDigestEnvelope({ digestVersion: 1, proposal: v1, digest: v1Digest })).toBe(true);
    expect(
      verifyProposalDigestEnvelope(
        { digestVersion: 2, proposal: vector.proposal, digest: vector.expectedProposalDigest },
        currentState,
      ),
    ).toBe(true);
    expect(
      verifyProposalDigestEnvelope({ digestVersion: 1, proposal: vector.proposal, digest: proposalDigest(vector.proposal) }),
    ).toBe(false);
    expect(
      verifyProposalDigestEnvelope(
        { digestVersion: 2, proposal: vector.proposal, digest: v1Digest },
        currentState,
      ),
    ).toBe(false);
    expect(
      verifyProposalDigestEnvelope(
        { digestVersion: 3, proposal: vector.proposal, digest: vector.expectedProposalDigest },
        currentState,
      ),
    ).toBe(false);
  });

  it('requires current authoritative epoch and lifecycle state', () => {
    const envelope = { digestVersion: 2, proposal: vector.proposal, digest: vector.expectedProposalDigest };
    expect(verifyProposalDigestEnvelope(envelope)).toBe(false);
    expect(verifyProposalDigestEnvelope(envelope, { ...currentState, currentControlEpoch: '8' })).toBe(false);
    expect(verifyProposalDigestEnvelope(envelope, { ...currentState, currentLifecycleCounter: '4' })).toBe(false);
    expect(verifyProposalDigestEnvelope(envelope, currentState)).toBe(true);
  });
});
