/** T16 / W8 · ProposalDigestV1 domain binding, role allow-list, nonce anti-replay, quorum honesty. */
import {
  encodeProposal,
  proposalDigest,
  signProposal,
  evaluateQuorum,
  PROPOSAL_DIGEST_DOMAIN,
  type ProposalV1,
  type CardSignerContext,
  type ProposalSignatureRecord,
} from '../v1_1/proposal-digest';

const proposal = (over: Partial<ProposalV1> = {}): ProposalV1 => ({
  kitId: 'kit_personal_recovery_duo',
  accountId: 'acct_1',
  chainId: '1439',
  authorityId: 'auth_1',
  proposalType: 'recover',
  payloadHash: 'p'.repeat(64),
  policyVersion: 'v1',
  proposalNonce: 'nonce-1',
  expiresAtOrEpoch: '2999-01-01T00:00:00Z',
  requiredRole: 'recovery-guardian',
  ...over,
});

const ctx = (over: Partial<CardSignerContext> = {}): CardSignerContext => ({
  profileId: 'recovery-guardian',
  cardIdRef: 'cardref_guardian_A',
  signerKeyRef: 'key_guardian_A',
  lifecycleCounter: 3,
  recentProposalNonces: [],
  proposalCounter: 0,
  now: '2026-07-16T00:00:00Z',
  ...over,
});

describe('Soul Core L1 v1.1 ProposalDigestV1 (T16)', () => {
  it('digest is domain-separated and changes with any field (Property 14)', () => {
    const d1 = proposalDigest(proposal());
    expect(encodeProposal(proposal()).startsWith(PROPOSAL_DIGEST_DOMAIN)).toBe(true);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(proposalDigest(proposal({ accountId: 'acct_2' }))).not.toBe(d1);
    expect(proposalDigest(proposal({ chainId: '1' }))).not.toBe(d1);
    expect(proposalDigest(proposal({ proposalType: 'freeze' }))).not.toBe(d1);
    expect(proposalDigest(proposal())).toBe(d1); // deterministic across "cards"
  });

  it('guardian may sign recover; may NOT sign session_issue (role allow-list + capability)', () => {
    const ok = signProposal(ctx(), proposal({ proposalType: 'recover' })) as any;
    expect(ok.ok).toBe(true);
    expect(ok.record.quorumComplete).toBe(false); // Property 15
    expect(ok.record.profileId).toBe('recovery-guardian');
    expect(ok.record.signatureKind).toBe('deterministic-simulator-not-cryptographic');
    expect(signProposal(ctx(), proposal({ proposalType: 'session_issue', requiredRole: 'operator' }))).toMatchObject({
      ok: false,
      reason: 'proposal-type-not-allowed',
    });
  });

  it('nonce replay is rejected and replays the prior record when available', () => {
    const first = signProposal(ctx(), proposal()) as any;
    expect(first.ok).toBe(true);
    const priorByNonce = { 'nonce-1': first.record as ProposalSignatureRecord };
    const replay = signProposal(ctx({ recentProposalNonces: ['nonce-1'] }), proposal(), priorByNonce) as any;
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe('proposal-nonce-replay');
    expect(replay.replayedRecord?.proposalDigest).toBe(first.record.proposalDigest);
  });

  it('expired proposal is rejected', () => {
    expect(signProposal(ctx(), proposal({ expiresAtOrEpoch: '2000-01-01T00:00:00Z' }))).toMatchObject({
      ok: false,
      reason: 'proposal-expired',
    });
  });

  it('empty/invalid fields fail closed', () => {
    expect(signProposal(ctx(), proposal({ accountId: '' }))).toMatchObject({ ok: false, reason: 'proposal-field-invalid' });
  });

  describe('external quorum (Authority side, NOT on-card)', () => {
    const digest = proposalDigest(proposal());
    const rec = (over: Partial<ProposalSignatureRecord>): ProposalSignatureRecord => ({
      proposalDigest: digest,
      signerKeyRef: 'k1',
      cardIdRef: 'c1',
      profileId: 'recovery-guardian',
      lifecycleCounter: 1,
      proposalCounter: 1,
      proposalType: 'recover',
      signature: 'sim',
      signatureKind: 'deterministic-simulator-not-cryptographic',
      quorumComplete: false,
      ...over,
    });

    it('2-of-3 completes only with distinct signers', () => {
      const q = evaluateQuorum(
        [rec({ cardIdRef: 'c1', signerKeyRef: 'k1' }), rec({ cardIdRef: 'c2', signerKeyRef: 'k2' })],
        digest,
        { threshold: 2 },
      );
      expect(q.quorumComplete).toBe(true);
      expect(q.distinctSigners).toBe(2);
    });

    it('duplicate signer does NOT count twice (no self-quorum)', () => {
      const q = evaluateQuorum(
        [rec({ cardIdRef: 'c1', signerKeyRef: 'k1' }), rec({ cardIdRef: 'c1', signerKeyRef: 'k1' })],
        digest,
        { threshold: 2 },
      );
      expect(q.quorumComplete).toBe(false);
      expect(q.distinctSigners).toBe(1);
      expect(q.reasons).toContain('duplicate-signer');
    });

    it('mixed proposal digests never complete quorum (domain integrity)', () => {
      const q = evaluateQuorum(
        [rec({ cardIdRef: 'c1', signerKeyRef: 'k1' }), rec({ cardIdRef: 'c2', signerKeyRef: 'k2', proposalDigest: 'deadbeef' })],
        digest,
        { threshold: 2 },
      );
      expect(q.quorumComplete).toBe(false);
      expect(q.reasons).toContain('mixed-proposal-digest');
    });

    it('required distinct roles enforced (3-card governance)', () => {
      const gov = proposalDigest(proposal({ proposalType: 'governance', requiredRole: 'governance-member' }));
      const grec = (p: any, c: string, k: string): ProposalSignatureRecord =>
        rec({ proposalDigest: gov, profileId: p, cardIdRef: c, signerKeyRef: k, proposalType: 'governance' });
      const q = evaluateQuorum(
        [grec('governance-member', 'c1', 'k1'), grec('finance-approver', 'c2', 'k2'), grec('operator-policy-admin', 'c3', 'k3')],
        gov,
        { threshold: 2, requiredRoles: ['governance-member', 'finance-approver'] },
      );
      expect(q.quorumComplete).toBe(true);
      const missing = evaluateQuorum([grec('governance-member', 'c1', 'k1'), grec('governance-member', 'c2', 'k2')], gov, {
        threshold: 2,
        requiredRoles: ['governance-member', 'finance-approver'],
      });
      expect(missing.quorumComplete).toBe(false);
      expect(missing.reasons).toContain('required-role-missing');
    });
  });
});
