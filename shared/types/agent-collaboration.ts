/**
 * Agent collaboration protocol, v0 (L6-1).
 *
 * Another party's Agent (Yowo, Instinct, Muse, ChatGPT, ...) reaches the owner's Agent and asks a question, proposes
 * a booking, announces a deposit or offers a file. The owner sorts counterparts into three tiers (client,
 * collaborator, family); anyone else is a stranger and may only ask. Every accepted request gets a receipt and waits
 * for the owner: v0 never books, charges or downloads anything by itself. Requests are rate limited per counterpart
 * and per owner.
 *
 * The counterpart's identity is a claim in v0 (`verification: 'unverified'`). v1 (owner 10-06) lets a counterpart
 * prove a passport or a domain by signing the request (`proof`, EIP-191 over `agentCollaborationProofMessageV1`):
 * a passport is an active Agentrix Agent whose registered key recovers from the signature; a domain publishes the
 * signing address in a DNS TXT record at `_agentrix.<domain>` (`agentrix-agent=v1 address=0x…`). Email stays a
 * claim until DMARC (OA-77). Everything a counterpart writes is outside content: wrap it with
 * `wrapUntrustedContentV0` before a model sees it.
 *
 * Retention (privacy page 5B): a request and how it was verified are deleted 180 days after it arrived, whether or
 * not the switch is on; the owner can delete one earlier (`deleteRequest`).
 *
 * Server switch: `AGENT_COLLABORATION_V0_ENABLED` exactly `1`; otherwise every route answers 404. Verification also
 * needs `AGENT_COLLABORATION_VERIFY_V1_ENABLED` exactly `1`; while it is off every request stays unverified.
 * Web: `NEXT_PUBLIC_AGENT_COLLABORATION_ENABLED` exactly `1`.
 */

export const AGENT_COLLABORATION_ROUTES_V0 = {
  /** Public: a counterpart Agent sends a request to the owner of this agent account. */
  inbound: 'POST /api/agent-collaboration/inbound/:agentAccountId',
  requests: 'GET /api/agent-collaboration/requests',
  /** The owner deletes one of their requests; answers `{ deleted: true }`, or 404 for anyone else's. */
  deleteRequest: 'DELETE /api/agent-collaboration/requests/:requestId',
  relationships: 'GET /api/agent-collaboration/relationships',
  setRelationship: 'PUT /api/agent-collaboration/relationships',
} as const;

/** Days a request (and its verification record) is kept after it arrived. */
export const AGENT_COLLABORATION_RETENTION_DAYS_V1 = 180;

export const AGENT_COLLABORATION_TIERS_V0 = ['client', 'collaborator', 'family'] as const;
export type AgentCollaborationTierV0 = (typeof AGENT_COLLABORATION_TIERS_V0)[number];
export type AgentCollaborationAudienceV0 = AgentCollaborationTierV0 | 'stranger';

export const AGENT_COLLABORATION_KINDS_V0 = ['ask', 'book', 'deposit_intent', 'file_offer'] as const;
export type AgentCollaborationKindV0 = (typeof AGENT_COLLABORATION_KINDS_V0)[number];

export const AGENT_COLLABORATION_SCOPES_V0: Readonly<Record<AgentCollaborationAudienceV0, readonly AgentCollaborationKindV0[]>> = {
  stranger: ['ask'],
  client: ['ask', 'book', 'deposit_intent'],
  collaborator: ['ask', 'book', 'file_offer'],
  family: ['ask', 'book', 'file_offer'],
};

export const AGENT_COLLABORATION_IDENTITY_KINDS_V0 = ['email', 'domain', 'passport'] as const;
export type AgentCollaborationIdentityKindV0 = (typeof AGENT_COLLABORATION_IDENTITY_KINDS_V0)[number];

export const AGENT_COLLABORATION_LIMITS_V0 = {
  nameMax: 80,
  messageMax: 2000,
  fileUrlMax: 500,
  /** Minor units (cents); a deposit intent above this is refused. */
  amountMinorMax: 1_000_000,
  perCounterpartPerHour: 10,
  perOwnerPerDay: 200,
} as const;

export const AGENT_COLLABORATION_ERROR_CODES_V0 = {
  invalid: 'AGENT_COLLABORATION_INVALID',
  notFound: 'AGENT_COLLABORATION_NOT_FOUND',
  scopeNotAllowed: 'AGENT_COLLABORATION_SCOPE_NOT_ALLOWED',
  rateLimited: 'AGENT_COLLABORATION_RATE_LIMITED',
  signInRequired: 'AGENT_COLLABORATION_SIGN_IN_REQUIRED',
} as const;

export interface AgentCollaborationIdentityV0 {
  kind: AgentCollaborationIdentityKindV0;
  value: string;
}

export const AGENT_COLLABORATION_VERIFIERS_V1 = ['passport', 'dns'] as const;
export type AgentCollaborationVerifierV1 = (typeof AGENT_COLLABORATION_VERIFIERS_V1)[number];
export type AgentCollaborationVerificationV1 = 'unverified' | 'verified';

export const AGENT_COLLABORATION_DNS_TXT_LABEL_V1 = '_agentrix';
export const AGENT_COLLABORATION_PROOF_MAX_SKEW_MS_V1 = 5 * 60 * 1000;

/** v1: the counterpart's signature over `agentCollaborationProofMessageV1`. */
export interface AgentCollaborationProofV1 {
  signedAt: string;
  /** EIP-191 personal_sign signature, `0x` + 130 hex. */
  signature: string;
}

export interface AgentCollaborationInboundV0 {
  counterpart: { name: string; identity: AgentCollaborationIdentityV0 };
  kind: AgentCollaborationKindV0;
  message: string;
  /** book: proposed start (ISO). */
  proposedStartAt?: string;
  /** deposit_intent: amount in minor units and ISO currency. */
  amountMinor?: number;
  currency?: string;
  /** file_offer: an https link; v0 never fetches it. */
  fileUrl?: string;
  /** v1, optional: proves a passport or domain identity. */
  proof?: AgentCollaborationProofV1;
}

export interface AgentCollaborationReceiptV0 {
  receiptId: string;
  kind: AgentCollaborationKindV0;
  audience: AgentCollaborationAudienceV0;
  status: 'pending_owner';
  verification: AgentCollaborationVerificationV1;
  /** v1: set only when `verification` is `verified`. */
  verifiedBy?: AgentCollaborationVerifierV1;
  receivedAt: string;
}

export interface AgentCollaborationRequestViewV0 extends AgentCollaborationReceiptV0 {
  counterpartName: string;
  identity: AgentCollaborationIdentityV0;
  /** Outside content: show as text, never render as markup, wrap before a model sees it. */
  message: string;
  proposedStartAt: string | null;
  amountMinor: number | null;
  currency: string | null;
  fileUrl: string | null;
}

export interface AgentCollaborationRelationshipViewV0 {
  identity: AgentCollaborationIdentityV0;
  tier: AgentCollaborationTierV0;
  updatedAt: string;
}

const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const DOMAIN = /^(?=.{3,253}$)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;
const PASSPORT = /^[a-z0-9:_-]{6,128}$/;
const CURRENCY = /^[A-Z]{3}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Lower-cases and checks the shape; anything else gives null. */
export function normalizeAgentCollaborationIdentityV0(value: unknown): AgentCollaborationIdentityV0 | null {
  if (!isRecord(value) || typeof value.value !== 'string' || value.value.length > 254) return null;
  const v = value.value.trim().toLowerCase();
  if (value.kind === 'email' && EMAIL.test(v)) return { kind: 'email', value: v };
  if (value.kind === 'domain' && DOMAIN.test(v)) return { kind: 'domain', value: v };
  if (value.kind === 'passport' && PASSPORT.test(v)) return { kind: 'passport', value: v };
  return null;
}

export function isAgentCollaborationTierV0(value: unknown): value is AgentCollaborationTierV0 {
  return typeof value === 'string' && (AGENT_COLLABORATION_TIERS_V0 as readonly string[]).includes(value);
}

export function agentCollaborationAllowsV0(audience: AgentCollaborationAudienceV0, kind: AgentCollaborationKindV0): boolean {
  return AGENT_COLLABORATION_SCOPES_V0[audience].includes(kind);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const ADDRESS = /address=(0x[0-9a-fA-F]{40})(?![0-9a-fA-F])/;

/** Absent gives undefined; a present proof of the wrong shape gives null (the request is refused). */
function decodeProof(value: unknown): AgentCollaborationProofV1 | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.signedAt !== 'string' || typeof value.signature !== 'string') return null;
  if (value.signedAt.length > 40 || Number.isNaN(Date.parse(value.signedAt)) || !SIGNATURE.test(value.signature)) return null;
  return { signedAt: value.signedAt, signature: value.signature };
}

/**
 * The exact text a counterpart signs: every field the owner will see, bound to the target Agent and the signing time.
 * Built from the decoded request (trimmed name and message, lower-case identity, start as `toISOString()`), so a
 * counterpart signs those forms. Lines are joined with `\n`; absent fields are `-`.
 */
export function agentCollaborationProofMessageV1(targetAgentAccountId: string, request: AgentCollaborationInboundV0, signedAt: string): string {
  const { counterpart, kind, message } = request;
  return [
    'Agentrix agent collaboration request v1',
    `to: ${targetAgentAccountId}`,
    `from: ${counterpart.identity.kind}:${counterpart.identity.value}`,
    `name: ${counterpart.name}`,
    `kind: ${kind}`,
    `start: ${request.proposedStartAt ?? '-'}`,
    `amount: ${request.amountMinor !== undefined ? `${request.amountMinor} ${request.currency}` : '-'}`,
    `file: ${request.fileUrl ?? '-'}`,
    `signed-at: ${signedAt}`,
    'message:',
    message,
  ].join('\n');
}

export function agentCollaborationProofTimelyV1(signedAt: string, nowMs: number): boolean {
  const at = Date.parse(signedAt);
  return Number.isFinite(at) && Math.abs(nowMs - at) <= AGENT_COLLABORATION_PROOF_MAX_SKEW_MS_V1;
}

/** Signing addresses (lower case) published in the TXT records at `_agentrix.<domain>`. */
export function agentCollaborationDnsTxtAddressesV1(records: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const out = new Set<string>();
  for (const chunks of records) {
    const record = chunks.join('').trim();
    if (!/^agentrix-agent=v1(\s|;|$)/i.test(record)) continue;
    const match = ADDRESS.exec(record);
    if (match) out.add(match[1].toLowerCase());
  }
  return [...out];
}

/** For clients: the verification part of a receipt, or null when it does not match the contract. */
export function decodeAgentCollaborationVerificationV1(value: { verification?: unknown; verifiedBy?: unknown }): Pick<AgentCollaborationReceiptV0, 'verification' | 'verifiedBy'> | null {
  if (value.verification === 'unverified' && (value.verifiedBy === undefined || value.verifiedBy === null)) return { verification: 'unverified' };
  if (value.verification === 'verified' && (AGENT_COLLABORATION_VERIFIERS_V1 as readonly unknown[]).includes(value.verifiedBy)) {
    return { verification: 'verified', verifiedBy: value.verifiedBy as AgentCollaborationVerifierV1 };
  }
  return null;
}

/** Passport identities are stored lower case; Agent refs are `AGT-<ms>-<base36>` (or `PET-AGT-…`), prefix upper case. */
export function agentCollaborationPassportRefV1(value: string): string {
  return value.replace(/^((?:[a-z]+-)+)(?=\d)/, (prefix) => prefix.toUpperCase());
}

/** Keeps known fields only; each kind carries exactly its own extra field. */
export function decodeAgentCollaborationInboundV0(value: unknown): AgentCollaborationInboundV0 | null {
  if (!isRecord(value) || !isRecord(value.counterpart)) return null;
  const L = AGENT_COLLABORATION_LIMITS_V0;
  const name = text(value.counterpart.name, L.nameMax);
  const identity = normalizeAgentCollaborationIdentityV0(value.counterpart.identity);
  const message = text(value.message, L.messageMax);
  const kind = value.kind;
  const proof = decodeProof(value.proof);
  if (!name || !identity || !message || proof === null || typeof kind !== 'string' || !(AGENT_COLLABORATION_KINDS_V0 as readonly string[]).includes(kind)) return null;
  const base = { counterpart: { name, identity }, kind: kind as AgentCollaborationKindV0, message, ...(proof ? { proof } : {}) };
  if (kind === 'book') {
    const at = value.proposedStartAt;
    if (typeof at !== 'string' || at.length > 40 || Number.isNaN(Date.parse(at))) return null;
    return { ...base, proposedStartAt: new Date(at).toISOString() };
  }
  if (kind === 'deposit_intent') {
    const amount = value.amountMinor;
    if (!Number.isInteger(amount) || (amount as number) <= 0 || (amount as number) > L.amountMinorMax) return null;
    if (typeof value.currency !== 'string' || !CURRENCY.test(value.currency)) return null;
    return { ...base, amountMinor: amount as number, currency: value.currency };
  }
  if (kind === 'file_offer') {
    const url = value.fileUrl;
    if (typeof url !== 'string' || url.length > L.fileUrlMax || !isHttpsUrl(url)) return null;
    return { ...base, fileUrl: url };
  }
  return base;
}
