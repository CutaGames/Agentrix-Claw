/**
 * Soul Core L1 v1.1 · Attestation class ladder + reference values + Test-CA cert chain + status (T14 / W7).
 *
 * A verifier NEVER trusts host-claimed chains. It must check, in order (Property 12 — a valid
 * signature alone is NOT enough): challenge/nonce, attestation signature by the leaf key, CA path +
 * usage, reference values (hardwarePlatformId/capDigest/appletVersion/profileSchemaVersion),
 * card/cert/applet/batch status + freshness, and whether the attested lifecycle/Profile allows the
 * target. Any failure → assurance is NOT upgraded (fail-closed downgrade). Attestation/anchor never
 * modify reputation and never prove outcome truth.
 *
 * Crypto is INJECTED (`VerifySignatureFn`) so this stays framework-agnostic (no bundled crypto lib,
 * never holds a private key) — mirrors the trust-verifier-sdk pattern. Evidence level: `simulator`
 * for the logic, `test_ca_card` at most for a real Test-CA chain; `production_hardware` needs the
 * manufacturing HSM/Production CA (roadmap, physically blocked).
 */
import { canonicalize } from './canonical';
import type { ProfileId } from './profiles';
import type { LifecycleState } from './lifecycle';

export const ATTESTATION_CLASSES = ['self_attested_dev', 'test_ca_card', 'pilot_hardware', 'production_hardware'] as const;
export type AttestationClass = (typeof ATTESTATION_CLASSES)[number];

/** Maximum Assurance an attestation class may ever justify. */
export const ATTESTATION_MAX_ASSURANCE: Record<AttestationClass, string> = {
  self_attested_dev: 'development',
  test_ca_card: 'engineering_pilot',
  pilot_hardware: 'pilot',
  production_hardware: 'production_hardware',
};

export const REGISTRY_STATUSES = ['valid', 'suspended', 'revoked', 'retired', 'unknown'] as const;
export type RegistryStatus = (typeof REGISTRY_STATUSES)[number];

export const ATTESTATION_REJECT_CODES = [
  'attestation-nonce-mismatch',
  'attestation-signature-invalid',
  'attestation-chain-invalid',
  'attestation-reference-mismatch',
  'attestation-status-invalid',
  'attestation-stale',
  'attestation-lifecycle-not-allowed',
] as const;
export type AttestationRejectCode = (typeof ATTESTATION_REJECT_CODES)[number];

export interface ReferenceValues {
  hardwarePlatformId: string;
  capDigest: string;
  appletVersion: string;
  profileSchemaVersion: number;
}

export interface AttestationCertificate {
  subjectKeyId: string;
  subjectPubKey: string;
  issuerKeyId: string;
  /** Signature by the issuer over canonicalized {subjectKeyId, subjectPubKey, usage, notBefore, notAfter}. */
  signature: string;
  issuerPubKey: string;
  usage: 'root' | 'intermediate' | 'attestation-leaf';
  notBefore: string;
  notAfter: string;
}

export interface AttestationPayloadV1 {
  cardIdRef: string;
  attestationClass: AttestationClass;
  fundingPubKey: string;
  attestationPubKey: string;
  profileId: ProfileId;
  lifecycleState: LifecycleState;
  lifecycleCounter: number;
  referenceValues: ReferenceValues;
  certificateRef: string;
  certificateChainDigest: string;
  verifierNonce: string;
  issuedAt: string;
}

export interface RegistryStatusView {
  card: RegistryStatus;
  certificate: RegistryStatus;
  applet: RegistryStatus;
  batch: RegistryStatus;
  /** When the status snapshot was produced (freshness). */
  asOf: string;
}

/** Injected signature verifier: true iff `signature` over `message` recovers/verifies to `pubKey`. */
export type VerifySignatureFn = (message: string, signature: string, pubKey: string) => boolean;

export interface VerifyAttestationInput {
  payload: AttestationPayloadV1;
  /** Signature over the canonical attestation message by the leaf attestation key. */
  signature: string;
  certChain: AttestationCertificate[];
  trustedRootKeyIds: string[];
  expectedNonce: string;
  expectedReferenceValues: ReferenceValues;
  status: RegistryStatusView;
  /** Max age (seconds) for status + attestation freshness. */
  freshnessSeconds: number;
  now: string;
  verifySig: VerifySignatureFn;
  /** Lifecycle states that permit the target action (default: user_activated only). */
  allowedLifecycleStates?: LifecycleState[];
}

export interface VerifyAttestationResult {
  verified: boolean;
  attestationClass: AttestationClass;
  /** Assurance actually justified. `none` when any check fails (fail-closed downgrade). */
  effectiveAssurance: 'none' | 'development' | 'engineering_pilot' | 'pilot' | 'production_hardware';
  reasons: AttestationRejectCode[];
}

/** Canonical message that the leaf attestation key signs. verifierNonce is included (anti-replay). */
export function buildAttestationMessage(payload: AttestationPayloadV1): string {
  return canonicalize({
    domain: 'AGENTRIX_SOUL_ATTESTATION_V1',
    cardIdRef: payload.cardIdRef,
    attestationClass: payload.attestationClass,
    fundingPubKey: payload.fundingPubKey,
    attestationPubKey: payload.attestationPubKey,
    profileId: payload.profileId,
    lifecycleState: payload.lifecycleState,
    lifecycleCounter: payload.lifecycleCounter,
    referenceValues: payload.referenceValues,
    certificateRef: payload.certificateRef,
    certificateChainDigest: payload.certificateChainDigest,
    verifierNonce: payload.verifierNonce,
    issuedAt: payload.issuedAt,
  });
}

function certMessage(cert: AttestationCertificate): string {
  return canonicalize({
    subjectKeyId: cert.subjectKeyId,
    subjectPubKey: cert.subjectPubKey,
    usage: cert.usage,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
  });
}

function withinValidity(cert: AttestationCertificate, nowMs: number): boolean {
  const nb = Date.parse(cert.notBefore);
  const na = Date.parse(cert.notAfter);
  if (Number.isNaN(nb) || Number.isNaN(na)) return false;
  return nowMs >= nb && nowMs <= na;
}

/**
 * Verify Root → Intermediate → leaf: each cert signed by its issuer, issuer chains to a trusted
 * root key id, usages ordered correctly, all within validity. Returns the leaf pubkey iff valid.
 */
export function verifyCertChain(
  chain: AttestationCertificate[],
  trustedRootKeyIds: string[],
  verifySig: VerifySignatureFn,
  nowMs: number,
): { ok: boolean; leafPubKey?: string } {
  if (!Array.isArray(chain) || chain.length < 2) return { ok: false };
  const root = chain[0];
  const leaf = chain[chain.length - 1];
  if (root.usage !== 'root' || leaf.usage !== 'attestation-leaf') return { ok: false };
  if (!trustedRootKeyIds.includes(root.subjectKeyId)) return { ok: false };
  // root is self-signed by its own key
  if (root.issuerKeyId !== root.subjectKeyId || root.issuerPubKey !== root.subjectPubKey) return { ok: false };

  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    if (!withinValidity(cert, nowMs)) return { ok: false };
    if (!verifySig(certMessage(cert), cert.signature, cert.issuerPubKey)) return { ok: false };
    if (i > 0) {
      const parent = chain[i - 1];
      if (cert.issuerKeyId !== parent.subjectKeyId || cert.issuerPubKey !== parent.subjectPubKey) return { ok: false };
      // middle certs must be intermediate
      if (i < chain.length - 1 && cert.usage !== 'intermediate') return { ok: false };
    }
  }
  return { ok: true, leafPubKey: leaf.subjectPubKey };
}

function referencesMatch(a: ReferenceValues, b: ReferenceValues): boolean {
  return (
    a.hardwarePlatformId === b.hardwarePlatformId &&
    a.capDigest === b.capDigest &&
    a.appletVersion === b.appletVersion &&
    a.profileSchemaVersion === b.profileSchemaVersion
  );
}

/**
 * Full fail-closed attestation verification. Assurance is upgraded ONLY when every check passes;
 * otherwise `effectiveAssurance='none'` with the failing reasons.
 */
export function verifyAttestation(input: VerifyAttestationInput): VerifyAttestationResult {
  const reasons: AttestationRejectCode[] = [];
  const nowMs = Date.parse(input.now);
  const p = input.payload;
  const allowedStates = input.allowedLifecycleStates ?? ['user_activated'];

  if (p.verifierNonce !== input.expectedNonce) reasons.push('attestation-nonce-mismatch');

  const chain = verifyCertChain(input.certChain, input.trustedRootKeyIds, input.verifySig, nowMs);
  if (!chain.ok) reasons.push('attestation-chain-invalid');

  // attestation signature must verify against the (chain-proven) leaf key = payload.attestationPubKey
  const leafKey = chain.ok ? chain.leafPubKey! : p.attestationPubKey;
  const sigOk = input.verifySig(buildAttestationMessage(p), input.signature, leafKey);
  if (!sigOk) reasons.push('attestation-signature-invalid');
  if (chain.ok && chain.leafPubKey !== p.attestationPubKey) reasons.push('attestation-chain-invalid');

  if (!referencesMatch(p.referenceValues, input.expectedReferenceValues)) reasons.push('attestation-reference-mismatch');

  const s = input.status;
  const anyBad = [s.card, s.certificate, s.applet, s.batch].some((x) => x !== 'valid');
  if (anyBad) reasons.push('attestation-status-invalid');
  const statusAgeMs = nowMs - Date.parse(s.asOf);
  const issuedAgeMs = nowMs - Date.parse(p.issuedAt);
  if (Number.isNaN(statusAgeMs) || statusAgeMs > input.freshnessSeconds * 1000) reasons.push('attestation-stale');
  else if (Number.isNaN(issuedAgeMs) || issuedAgeMs > input.freshnessSeconds * 1000) reasons.push('attestation-stale');

  if (!allowedStates.includes(p.lifecycleState)) reasons.push('attestation-lifecycle-not-allowed');

  const verified = reasons.length === 0;
  const maxAssurance = ATTESTATION_MAX_ASSURANCE[p.attestationClass] as VerifyAttestationResult['effectiveAssurance'];
  return {
    verified,
    attestationClass: p.attestationClass,
    effectiveAssurance: verified ? maxAssurance : 'none',
    reasons,
  };
}
