/**
 * T12 / W6 · Profile Registry + capability bits + single-CAP policy (Property 10).
 * Evidence level: simulator / protocol_only.
 */
import {
  CAPABILITY_BITS,
  CAPABILITY_NAMES,
  PROFILE_IDS,
  PROFILE_REGISTRY,
  PROPOSAL_TYPES,
  capabilityMask,
  hasCapability,
  checkApdu,
  checkProposalType,
  canTransitionProfile,
  getProfile,
  isKnownProfile,
} from '../v1_1/profiles';

describe('Soul Core L1 v1.1 Profile Registry (T12)', () => {
  it('freezes exactly 7 profiles and 11 capability bits with unique indices', () => {
    expect(PROFILE_IDS).toHaveLength(7);
    expect(CAPABILITY_NAMES).toHaveLength(11);
    const indices = CAPABILITY_NAMES.map((c) => CAPABILITY_BITS[c]);
    expect(new Set(indices).size).toBe(11);
    expect(Math.max(...indices)).toBe(10);
  });

  it('every profile in the registry is complete and self-consistent', () => {
    for (const id of PROFILE_IDS) {
      const def = PROFILE_REGISTRY[id];
      expect(def.id).toBe(id);
      expect(def.capabilities.length).toBeGreaterThan(0);
      // capabilityMask reflects exactly the declared capabilities
      const expected = def.capabilities.reduce((m, c) => m | (1 << CAPABILITY_BITS[c]), 0);
      expect(capabilityMask(id)).toBe(expected);
    }
  });

  it('hasCapability is a double check: unknown profile or unknown bit fails closed', () => {
    expect(hasCapability('personal-primary', 'CAP_TAP_SIGN')).toBe(true);
    expect(hasCapability('recovery-guardian', 'CAP_TAP_SIGN')).toBe(false); // guardian has no daily spend
    expect(hasCapability('unknown-profile', 'CAP_TAP_SIGN')).toBe(false);
    expect(hasCapability('personal-primary', 'CAP_MADE_UP')).toBe(false);
  });

  it('recovery-guardian can freeze/rotate/recover but NOT sign tx or issue session (least privilege)', () => {
    expect(hasCapability('recovery-guardian', 'CAP_FREEZE')).toBe(true);
    expect(hasCapability('recovery-guardian', 'CAP_ROTATE')).toBe(true);
    expect(hasCapability('recovery-guardian', 'CAP_RECOVER')).toBe(true);
    expect(hasCapability('recovery-guardian', 'CAP_SESSION_ISSUE')).toBe(false);
    expect(checkApdu('recovery-guardian', 'SIGN_TX', 'CAP_TAP_SIGN').allowed).toBe(false);
    expect(checkApdu('recovery-guardian', 'SIGN_TX', 'CAP_TAP_SIGN').reason).toBe('apdu-not-allowed-for-profile');
  });

  it('checkApdu enforces profile + apdu allow-list + required capability', () => {
    expect(checkApdu('personal-primary', 'SIGN_TX', 'CAP_TAP_SIGN').allowed).toBe(true);
    expect(checkApdu('personal-primary', 'SET_LIMITS', 'CAP_POLICY_ADMIN').allowed).toBe(true);
    // governance-member cannot SET_LIMITS (no policy admin, apdu not listed)
    expect(checkApdu('governance-member', 'SET_LIMITS', 'CAP_POLICY_ADMIN').allowed).toBe(false);
    // unknown profile / unknown apdu fail closed
    expect(checkApdu('nope', 'SIGN_TX').reason).toBe('profile-unknown');
    expect(checkApdu('personal-primary', 'MADE_UP').reason).toBe('apdu-not-allowed-for-profile');
  });

  it('read-only APDUs need only a known profile (secure channel assumed by transport)', () => {
    expect(checkApdu('finance-approver', 'GET_PROFILE').allowed).toBe(true);
    expect(checkApdu('finance-approver', 'GET_ATTESTATION').allowed).toBe(true);
    expect(checkApdu('nope', 'GET_PROFILE').allowed).toBe(false);
  });

  it('proposal type allow-list: finance-approver signs finance only; governance-member governance only', () => {
    expect(checkProposalType('finance-approver', 'finance').allowed).toBe(true);
    expect(checkProposalType('finance-approver', 'governance').allowed).toBe(false);
    expect(checkProposalType('governance-member', 'governance').allowed).toBe(true);
    expect(checkProposalType('governance-member', 'finance').allowed).toBe(false);
    expect(checkProposalType('recovery-guardian', 'recover').allowed).toBe(true);
    expect(checkProposalType('recovery-guardian', 'session_issue').allowed).toBe(false);
    expect(checkProposalType('personal-primary', 'made_up').reason).toBe('proposal-type-not-allowed');
  });

  it('developer-test has every capability but is flagged testOnly (never production)', () => {
    for (const cap of CAPABILITY_NAMES) expect(hasCapability('developer-test', cap)).toBe(true);
    expect(PROFILE_REGISTRY['developer-test'].testOnly).toBe(true);
  });

  it('resident-executor requires an approved resident host and can execute + tap-sign only', () => {
    expect(PROFILE_REGISTRY['resident-executor'].residentHostRequired).toBe(true);
    expect(hasCapability('resident-executor', 'CAP_RESIDENT_EXECUTION')).toBe(true);
    expect(hasCapability('resident-executor', 'CAP_POLICY_ADMIN')).toBe(false);
  });

  it('all profile transitions are forbidden by default (new-card issuance policy)', () => {
    for (const from of PROFILE_IDS) {
      for (const to of PROFILE_IDS) {
        expect(canTransitionProfile(from, to).allowed).toBe(false);
      }
    }
    expect(canTransitionProfile('developer-test', 'personal-primary').reason).toBe('profile-transition-forbidden');
    expect(canTransitionProfile('recovery-guardian', 'personal-primary').reason).toBe('profile-transition-forbidden');
  });

  it('getProfile / isKnownProfile fail closed on unknown ids', () => {
    expect(getProfile('personal-primary')?.id).toBe('personal-primary');
    expect(getProfile('nope')).toBeNull();
    expect(isKnownProfile('governance-member')).toBe(true);
    expect(isKnownProfile('ghost')).toBe(false);
  });

  it('no non-developer profile may bypass its forbidden actions via capability set', () => {
    // finance cannot change governance; governance cannot execute funds; guardian cannot issue session
    expect(hasCapability('finance-approver', 'CAP_GOVERNANCE_PROPOSAL')).toBe(false);
    expect(hasCapability('governance-member', 'CAP_TAP_SIGN')).toBe(false);
    expect(hasCapability('governance-member', 'CAP_FINANCE_PROPOSAL')).toBe(false);
  });
});
