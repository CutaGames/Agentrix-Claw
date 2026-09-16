/**
 * Soul Core L1 Applet v1.1 · Profile Registry + capability bits + single-CAP policy (T12 / W6).
 *
 * One audited CAP for every Kit. A card's authoritative Profile + capability bitmask lives in
 * on-card NVM; the host can never assert them. Runtime enforcement is a DOUBLE check: the acting
 * Profile must be known AND the required capability bit must be set AND the APDU / proposal type
 * must be on the Profile's allow-list. Unknown Profile / unknown bit / unlisted action all fail
 * closed (Property 10 — least privilege).
 *
 * Evidence level: `simulator` / `protocol_only`. This module is the canonical protocol logic the
 * JavaCard applet, the deterministic simulator, the host SDK and the backend all agree on. It does
 * NOT prove on-card behaviour — that requires `development_card` evidence (jcardsim + real white
 * card), which is physical-resource blocked (see readiness doc).
 */

export const SOUL_CORE_L1_PROTOCOL_VERSION_V1_1 = '1.1' as const;
export const SOUL_CORE_L1_PROFILE_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Capability bits (machine-executable allow-list; on-card bitmask)
// ---------------------------------------------------------------------------

export const CAPABILITY_BITS = {
  CAP_TAP_SIGN: 0,
  CAP_POLICY_ADMIN: 1,
  CAP_SESSION_ISSUE: 2,
  CAP_STEP_UP: 3,
  CAP_FREEZE: 4,
  CAP_ROTATE: 5,
  CAP_RECOVER: 6,
  CAP_GOVERNANCE_PROPOSAL: 7,
  CAP_FINANCE_PROPOSAL: 8,
  CAP_RESIDENT_EXECUTION: 9,
  CAP_RETIRE: 10,
} as const;

export type CapabilityName = keyof typeof CAPABILITY_BITS;
export const CAPABILITY_NAMES = Object.keys(CAPABILITY_BITS) as CapabilityName[];

// ---------------------------------------------------------------------------
// Profiles / APDU / proposal types / reject codes
// ---------------------------------------------------------------------------

export const PROFILE_IDS = [
  'personal-primary',
  'recovery-guardian',
  'operator-policy-admin',
  'governance-member',
  'finance-approver',
  'developer-test',
  'resident-executor',
] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

/** Frozen one-byte JavaCard wire ids used by T22 development personalization and SIGN_PROPOSAL_V2 responses. */
export const PROFILE_WIRE_IDS: Record<ProfileId, number> = {
  'personal-primary': 1,
  'recovery-guardian': 2,
  'operator-policy-admin': 3,
  'governance-member': 4,
  'finance-approver': 5,
  'developer-test': 6,
  'resident-executor': 7,
};

/** APDU names that are subject to Profile/capability enforcement in v1.1. */
export const APDU_NAMES_V1_1 = [
  // v1 sensitive APDUs (still gated by profile in v1.1)
  'SIGN_TX',
  'SET_LIMITS',
  'SET_WHITELIST_ROOT',
  'GET_ATTESTATION',
  // v1.1 additions
  'GET_PROFILE',
  'GET_MEASUREMENT',
  'GET_CERT_REF',
  'ACTIVATE_USER',
  'SIGN_PROPOSAL', 'SIGN_PROPOSAL_V2',
  'APPLY_LIFECYCLE_TRANSITION',
  'RETIRE',
] as const;
export type ApduNameV1_1 = (typeof APDU_NAMES_V1_1)[number];

/** Read-only APDUs any activated Profile may call (still requires secure channel). */
export const READ_ONLY_APDUS: readonly ApduNameV1_1[] = ['GET_PROFILE', 'GET_MEASUREMENT', 'GET_CERT_REF', 'GET_ATTESTATION'];

export const PROPOSAL_TYPES = [
  'session_issue',
  'policy_update',
  'step_up',
  'freeze',
  'rotate',
  'recover',
  'governance',
  'finance',
  'retire',
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROFILE_REJECT_CODES = [
  'profile-unknown',
  'capability-denied',
  'apdu-not-allowed-for-profile',
  'proposal-type-not-allowed',
  'profile-transition-forbidden',
  'legacy-dev-only',
] as const;
export type ProfileRejectCode = (typeof PROFILE_REJECT_CODES)[number];

export interface ProfileDefinition {
  id: ProfileId;
  description: string;
  capabilities: CapabilityName[];
  /** Extra sensitive APDUs (beyond read-only + the ones implied by capabilities). */
  allowedApdus: ApduNameV1_1[];
  allowedProposalTypes: ProposalType[];
  forbidden: string[];
  /** developer-test only: Test CA / test accounts, never production. */
  testOnly?: boolean;
  /** resident-executor only: valid only inside an approved Secure Resident Host. */
  residentHostRequired?: boolean;
}

// ---------------------------------------------------------------------------
// The frozen registry (design §1 table). Capabilities are the source of truth;
// allowedApdus/allowedProposalTypes are the machine-readable projection.
// ---------------------------------------------------------------------------

export const PROFILE_REGISTRY: Record<ProfileId, ProfileDefinition> = {
  'personal-primary': {
    id: 'personal-primary',
    description: 'Owner primary: owner/policy/session authorization, tap step-up, personal proposals, freeze request.',
    capabilities: ['CAP_TAP_SIGN', 'CAP_POLICY_ADMIN', 'CAP_SESSION_ISSUE', 'CAP_STEP_UP', 'CAP_FREEZE', 'CAP_RETIRE'],
    allowedApdus: ['SIGN_TX', 'SET_LIMITS', 'SET_WHITELIST_ROOT', 'SIGN_PROPOSAL_V2', 'ACTIVATE_USER', 'APPLY_LIFECYCLE_TRANSITION', 'RETIRE'],
    allowedProposalTypes: ['session_issue', 'policy_update', 'step_up', 'freeze', 'retire'],
    forbidden: ['bypass on-chain budget', 'single-card quorum completion'],
  },
  'recovery-guardian': {
    id: 'recovery-guardian',
    description: 'Recovery guardian: freeze, rotate, recover proposals only. No day-to-day spend authority.',
    capabilities: ['CAP_FREEZE', 'CAP_ROTATE', 'CAP_RECOVER'],
    allowedApdus: ['SIGN_PROPOSAL_V2', 'APPLY_LIFECYCLE_TRANSITION'],
    allowedProposalTypes: ['freeze', 'rotate', 'recover'],
    forbidden: ['daily payment / SIGN_TX', 'issue session', 'raise spending budget', 'transition to personal-primary'],
  },
  'operator-policy-admin': {
    id: 'operator-policy-admin',
    description: 'Operator policy admin: operational policy, limited session issue, step-up proposals.',
    capabilities: ['CAP_POLICY_ADMIN', 'CAP_SESSION_ISSUE', 'CAP_STEP_UP', 'CAP_RETIRE'],
    allowedApdus: ['SET_LIMITS', 'SET_WHITELIST_ROOT', 'SIGN_PROPOSAL_V2', 'APPLY_LIFECYCLE_TRANSITION', 'RETIRE'],
    allowedProposalTypes: ['policy_update', 'session_issue', 'step_up'],
    forbidden: ['exceed owner ceiling', 'impersonate finance approver'],
  },
  'governance-member': {
    id: 'governance-member',
    description: 'Governance member: governance proposal / policy digest signing only.',
    capabilities: ['CAP_GOVERNANCE_PROPOSAL'],
    allowedApdus: ['SIGN_PROPOSAL_V2'],
    allowedProposalTypes: ['governance'],
    forbidden: ['normal fund execution', 'single-card final execution'],
  },
  'finance-approver': {
    id: 'finance-approver',
    description: 'Finance approver: finance / budget proposal digest signing only.',
    capabilities: ['CAP_FINANCE_PROPOSAL'],
    allowedApdus: ['SIGN_PROPOSAL_V2'],
    allowedProposalTypes: ['finance'],
    forbidden: ['change governance members', 'bypass quorum'],
  },
  'developer-test': {
    id: 'developer-test',
    description: 'Developer/test: all test commands under Test CA only. Never Production CA / prod accounts / prod assurance.',
    capabilities: [...CAPABILITY_NAMES],
    allowedApdus: [
      'SIGN_TX', 'SET_LIMITS', 'SET_WHITELIST_ROOT', 'GET_ATTESTATION', 'GET_PROFILE', 'GET_MEASUREMENT',
      'GET_CERT_REF', 'ACTIVATE_USER', 'SIGN_PROPOSAL_V2', 'APPLY_LIFECYCLE_TRANSITION', 'RETIRE',
    ],
    allowedProposalTypes: [...PROPOSAL_TYPES],
    forbidden: ['Production CA', 'production accounts', 'production Assurance'],
    testOnly: true,
  },
  'resident-executor': {
    id: 'resident-executor',
    description: 'Resident executor: per-tx policy signing inside an approved Secure Resident Host.',
    capabilities: ['CAP_RESIDENT_EXECUTION', 'CAP_TAP_SIGN'],
    allowedApdus: ['SIGN_TX', 'SIGN_PROPOSAL_V2'],
    allowedProposalTypes: ['step_up'],
    forbidden: ['ordinary Companion Host residency', 'offline unlimited authorization'],
    residentHostRequired: true,
  },
};

/**
 * Profile transition table. Default: EVERY transition is forbidden (fail-closed). Production role
 * changes MUST be a new-card issuance + old-card revocation, never in-place escalation. Any real
 * exception requires owner/quorum + issuer dual authorization and a release review — intentionally
 * not expressible here so the applet cannot silently escalate.
 */
export const PROFILE_TRANSITIONS: Record<ProfileId, ProfileId[]> = {
  'personal-primary': [],
  'recovery-guardian': [],
  'operator-policy-admin': [],
  'governance-member': [],
  'finance-approver': [],
  'developer-test': [],
  'resident-executor': [],
};

// ---------------------------------------------------------------------------
// Pure, fail-closed checks
// ---------------------------------------------------------------------------

export function isKnownProfile(profileId: string): profileId is ProfileId {
  return (PROFILE_IDS as readonly string[]).includes(profileId);
}

export function isKnownCapability(cap: string): cap is CapabilityName {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_BITS, cap);
}

/** Compute the on-card capability bitmask for a Profile (bit index → set bit). */
export function capabilityMask(profileId: ProfileId): number {
  const def = PROFILE_REGISTRY[profileId];
  return def.capabilities.reduce((mask, cap) => mask | (1 << CAPABILITY_BITS[cap]), 0);
}

/** True only when the Profile is known AND the capability is known AND its bit is set. */
export function hasCapability(profileId: string, cap: string): boolean {
  if (!isKnownProfile(profileId) || !isKnownCapability(cap)) return false;
  return (capabilityMask(profileId) & (1 << CAPABILITY_BITS[cap])) !== 0;
}

export interface CapabilityCheck {
  allowed: boolean;
  reason?: ProfileRejectCode;
}

/**
 * Double check for an APDU invocation: Profile known + APDU allowed for Profile + (when a capability
 * is required) that capability bit set. Read-only APDUs need only a known Profile. Fail-closed.
 */
export function checkApdu(profileId: string, apdu: string, requiredCapability?: CapabilityName): CapabilityCheck {
  if (!isKnownProfile(profileId)) return { allowed: false, reason: 'profile-unknown' };
  if (!(APDU_NAMES_V1_1 as readonly string[]).includes(apdu)) return { allowed: false, reason: 'apdu-not-allowed-for-profile' };
  const def = PROFILE_REGISTRY[profileId];
  const apduName = apdu as ApduNameV1_1;
  const isReadOnly = READ_ONLY_APDUS.includes(apduName);
  if (!isReadOnly && !def.allowedApdus.includes(apduName)) {
    return { allowed: false, reason: 'apdu-not-allowed-for-profile' };
  }
  if (requiredCapability) {
    if (!isKnownCapability(requiredCapability)) return { allowed: false, reason: 'capability-denied' };
    if (!hasCapability(profileId, requiredCapability)) return { allowed: false, reason: 'capability-denied' };
  }
  return { allowed: true };
}

/** A Profile may sign a proposal type only when it is on its allow-list. Fail-closed. */
export function checkProposalType(profileId: string, proposalType: string): CapabilityCheck {
  if (!isKnownProfile(profileId)) return { allowed: false, reason: 'profile-unknown' };
  if (!(PROPOSAL_TYPES as readonly string[]).includes(proposalType)) return { allowed: false, reason: 'proposal-type-not-allowed' };
  const def = PROFILE_REGISTRY[profileId];
  if (!def.allowedProposalTypes.includes(proposalType as ProposalType)) {
    return { allowed: false, reason: 'proposal-type-not-allowed' };
  }
  return { allowed: true };
}

/** Profile transitions are forbidden by default (fail-closed). */
export function canTransitionProfile(from: string, to: string): CapabilityCheck {
  if (!isKnownProfile(from) || !isKnownProfile(to)) return { allowed: false, reason: 'profile-unknown' };
  const allowed = (PROFILE_TRANSITIONS[from] ?? []).includes(to as ProfileId);
  return allowed ? { allowed: true } : { allowed: false, reason: 'profile-transition-forbidden' };
}

export function getProfile(profileId: string): ProfileDefinition | null {
  return isKnownProfile(profileId) ? PROFILE_REGISTRY[profileId] : null;
}
