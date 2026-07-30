/**
 * T17 / W8 · Cross-impl conformance. The pure-TS v1.1 modules must reproduce the FROZEN golden
 * vectors that tools/soul-core-l1/simulator.mjs recomputes with node:crypto. Any implementation
 * (applet, host SDK, backend, Authority) that agrees with these vectors is digest-compatible.
 * Evidence level: simulator / protocol_only.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { proposalDigest, type ProposalV1 } from '../v1_1/proposal-digest';
import { checkApdu, checkProposalType, type CapabilityName } from '../v1_1/profiles';
import { applyLifecycleTransition, type LifecycleSnapshot, type LifecycleState } from '../v1_1/lifecycle';

const golden: {
  proposals: { name: string; proposal: ProposalV1; expectedProposalDigest: string }[];
  profileDecisions: { profileId: string; apdu: string; requiredCapability: string; expectedAllowed: boolean }[];
  proposalTypeDecisions: { profileId: string; proposalType: string; expectedAllowed: boolean }[];
  lifecycleTransitions: { from: string; to: string; expectedOk: boolean }[];
} = JSON.parse(readFileSync(join(__dirname, '..', 'v1_1', 'golden-vectors.json'), 'utf8'));

describe('Soul Core L1 v1.1 cross-impl conformance (T17)', () => {
  it('every proposal reproduces its frozen ProposalDigestV1 (TS pure-sha256 == node-crypto)', () => {
    for (const v of golden.proposals) {
      expect(v.expectedProposalDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(proposalDigest(v.proposal as ProposalV1)).toBe(v.expectedProposalDigest);
    }
  });

  it('profile/capability APDU decisions match the golden matrix', () => {
    for (const d of golden.profileDecisions) {
      expect(checkApdu(d.profileId, d.apdu, d.requiredCapability as CapabilityName).allowed).toBe(d.expectedAllowed);
    }
  });

  it('proposal-type decisions match the golden matrix', () => {
    for (const d of golden.proposalTypeDecisions) {
      expect(checkProposalType(d.profileId, d.proposalType).allowed).toBe(d.expectedAllowed);
    }
  });

  it('lifecycle transition validity matches the golden table', () => {
    for (const t of golden.lifecycleTransitions) {
      const snap: LifecycleSnapshot = { state: t.from as LifecycleState, lifecycleCounter: 0 };
      const r = applyLifecycleTransition(snap, { to: t.to as LifecycleState, expectedCounter: 0, actor: 'conformance', occurredAt: '2026-07-16T00:00:00Z' });
      expect(r.ok).toBe(t.expectedOk);
    }
  });
});
