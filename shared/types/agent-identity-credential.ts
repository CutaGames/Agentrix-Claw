/**
 * Agent identity credential, v1 (L5 backend 9, option B).
 *
 * The platform signing key (KMS first) signs an `AgentIdentityCredential` onto the Agent's did:pkh: its public ID
 * (`agentRef`), passport number, `ownerVerified: true` and the day it was issued. "Owner verified" means the signed-in
 * owner of the Agent asked for it (`signed_in_owner`); it is not an ID check. Anyone can verify it offline against the
 * platform's published issuer address. An Agent without a wallet has no DID, so nothing to sign.
 *
 * Owner only: anyone else, admin and service scopes included, gets the same 404 as an unknown Agent.
 * Server switch: `SOUL_CORE_IDENTITY_VC_ENABLED` exactly `1`; otherwise both routes answer 404.
 * Web: `NEXT_PUBLIC_SOUL_CORE_IDENTITY_VC_ENABLED` exactly `1` shows the panel (issue + download).
 * Mobile: `EXPO_PUBLIC_SOUL_CORE_IDENTITY_VC_ENABLED` exactly `1` shows a read-only card on the passport screen.
 *
 * Both routes answer `{ success, data: { did, credential, verified, ... } }`; POST adds `created`, `issuerKeyHistory`
 * and `howToVerify`, which the state decoder ignores.
 */

export const AGENT_IDENTITY_CREDENTIAL_ROUTES_V1 = {
  /** GET: the issued credential, or `credential: null` before the first issue. POST: issue (once per Agent + DID). */
  credential: '/api/agent-accounts/:id/identity-credential',
} as const;

export const AGENT_IDENTITY_CREDENTIAL_TYPE_V1 = 'AgentIdentityCredential';

/** The path under the API base for one Agent, as the Web and the phone call it. */
export function agentIdentityCredentialPathV1(agentAccountId: string): string {
  return `/agent-accounts/${encodeURIComponent(agentAccountId)}/identity-credential`;
}

export interface IdentityCredentialSubjectV1 {
  id: string;
  kind: 'identity';
  agentRef: string;
  passportNumber: string;
  ownerVerified: true;
  ownerVerification: string;
  issuedOn: string;
}

export interface IdentityCredentialV1 {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: IdentityCredentialSubjectV1;
  proof: { type: string; jws: string; verificationMethod: string };
}

export interface IdentityCredentialStateV1 {
  /** `null` when the Agent has no wallet, so no DID to sign for. */
  did: string | null;
  credential: IdentityCredentialV1 | null;
  verified: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : null;
}

/** Type includes AgentIdentityCredential, issuer and subject are DIDs, ownerVerified is true, issuedOn is a day. */
export function decodeIdentityCredentialV1(value: unknown): IdentityCredentialV1 | null {
  const vc = record(value);
  const subject = record(vc?.credentialSubject);
  const proof = record(vc?.proof);
  const context = strings(vc?.['@context']);
  const type = strings(vc?.type);
  if (!vc || !subject || !proof || !context || !type || !type.includes(AGENT_IDENTITY_CREDENTIAL_TYPE_V1)) return null;
  if (typeof vc.issuer !== 'string' || !vc.issuer.startsWith('did:') || typeof vc.issuanceDate !== 'string') return null;
  if (typeof proof.type !== 'string' || typeof proof.jws !== 'string' || !proof.jws || typeof proof.verificationMethod !== 'string') return null;
  if (
    typeof subject.id !== 'string' || !subject.id.startsWith('did:')
    || subject.kind !== 'identity'
    || typeof subject.agentRef !== 'string'
    || typeof subject.passportNumber !== 'string'
    || subject.ownerVerified !== true
    || typeof subject.ownerVerification !== 'string'
    || typeof subject.issuedOn !== 'string' || !DAY.test(subject.issuedOn)
  ) return null;
  return {
    '@context': context,
    type,
    issuer: vc.issuer,
    issuanceDate: vc.issuanceDate,
    credentialSubject: {
      id: subject.id,
      kind: 'identity',
      agentRef: subject.agentRef,
      passportNumber: subject.passportNumber,
      ownerVerified: true,
      ownerVerification: subject.ownerVerification,
      issuedOn: subject.issuedOn,
    },
    proof: { type: proof.type, jws: proof.jws, verificationMethod: proof.verificationMethod },
  };
}

/** `{ success, data: { did, credential, verified } }`; the credential must be about that DID. Anything else is unreadable. */
export function decodeIdentityCredentialStateV1(body: unknown): IdentityCredentialStateV1 | null {
  const data = record(record(body)?.data);
  if (!data || typeof data.verified !== 'boolean') return null;
  const did = data.did === null ? null : typeof data.did === 'string' && data.did.startsWith('did:') ? data.did : undefined;
  if (did === undefined) return null;
  if (data.credential === null) return { did, credential: null, verified: false };
  const credential = decodeIdentityCredentialV1(data.credential);
  if (!credential || credential.credentialSubject.id !== did) return null;
  return { did, credential, verified: data.verified };
}
