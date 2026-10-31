/**
 * TL-06.2 · Verifier SDK (design §10.2; R4, R5, R12, R14).
 *
 * A framework-agnostic, dependency-light helper set that an EXTERNAL verifier (or
 * Agentrix, as a relying party) can use to build challenges, assemble minimal
 * evidence packages, and — crucially — VERIFY a signed `VerificationResultV1` /
 * `CredentialStatusV1` by recovering the signer and comparing against a known set
 * of issuer addresses.
 *
 * Honesty / security invariants:
 *  - This SDK NEVER holds or asks for a private key. External verifiers sign the
 *    canonical message ({@link canonicalMessageFor}) with their OWN key material;
 *    Agentrix only ever calls the verify-side helpers. There is deliberately no
 *    `sign()` here that takes a raw key.
 *  - Verification is FAIL-CLOSED: an unknown signer, a digest mismatch, or a
 *    malformed record all return `valid: false` with a reason.
 *  - Minimal-evidence checks reject inline raw payloads — only refs/digests are
 *    allowed to travel.
 */
import {
  canonicalizeJson,
  computeDigest,
  type DigestRef,
  type EvidenceRef,
  type RecordRef,
  type SignedIntegrity,
} from './trust-loop-primitives';
import type { CredentialStatusV1, VerificationResultV1 } from './trust-loop-contracts';

export const VERIFIER_SDK_VERSION = '1.0.0';

/**
 * Signature recovery is INJECTED so this SDK stays dependency-light and never
 * bundles a specific crypto library. The caller (e.g. Agentrix backend) supplies
 * an EIP-191 recover such as `ethers.verifyMessage`. The SDK never holds a private
 * key — it only recovers a signer address from a message + signature.
 */
export type RecoverFn = (message: string, signature: string) => string;

export enum VerifierErrorCode {
  NotASignature = 'not_a_signature',
  PayloadDigestMismatch = 'payload_digest_mismatch',
  SignatureRecoveryFailed = 'signature_recovery_failed',
  SignerNotTrusted = 'signer_not_trusted',
  MalformedRecord = 'malformed_record',
  RawPayloadNotAllowed = 'raw_payload_not_allowed',
  ChallengeExpired = 'challenge_expired',
  NonceMismatch = 'nonce_mismatch',
}

export interface VerifierChallenge {
  challengeId: string;
  nonce: string;
  purpose: string;
  subjectRef: RecordRef;
  issuedAt: string;
  expiresAt: string;
}

export interface SignatureVerification {
  valid: boolean;
  recoveredSigner: string | null;
  payloadDigestMatch: boolean;
  reason?: VerifierErrorCode;
}

function randomHex(bytes = 16): string {
  let out = '';
  for (let i = 0; i < bytes; i += 1) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  return out;
}

/** Build a purpose-bound, nonce-protected challenge for a subject. */
export function buildChallenge(params: {
  purpose: string;
  subjectRef: RecordRef;
  ttlSeconds?: number;
  now?: Date;
}): VerifierChallenge {
  const now = params.now ?? new Date();
  return {
    challengeId: `chl_${randomHex(12)}`,
    nonce: randomHex(16),
    purpose: params.purpose,
    subjectRef: params.subjectRef,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (params.ttlSeconds ?? 300) * 1000).toISOString(),
  };
}

/** Validate a challenge response's nonce + freshness (fail-closed). */
export function checkChallenge(challenge: VerifierChallenge, responseNonce: string, now = new Date()): { ok: boolean; reason?: VerifierErrorCode } {
  if (responseNonce !== challenge.nonce) return { ok: false, reason: VerifierErrorCode.NonceMismatch };
  if (new Date(challenge.expiresAt).getTime() < now.getTime()) return { ok: false, reason: VerifierErrorCode.ChallengeExpired };
  return { ok: true };
}

/**
 * The exact canonical message an external verifier must sign with THEIR OWN key.
 * Agentrix never sees the key — it only recovers the signer from the signature.
 */
export function canonicalMessageFor(recordWithoutIntegrity: Record<string, unknown>): string {
  return canonicalizeJson(recordWithoutIntegrity);
}

function verifySigned(
  record: Record<string, unknown>,
  integrity: SignedIntegrity | undefined,
  trustedAddresses: string[],
  recover: RecoverFn,
): SignatureVerification {
  const base: SignatureVerification = { valid: false, recoveredSigner: null, payloadDigestMatch: false };
  if (!integrity || integrity.type !== 'signature' || !integrity.signature) {
    return { ...base, reason: VerifierErrorCode.NotASignature };
  }
  const material: Record<string, unknown> = { ...record };
  delete material.integrity;
  delete material.signature;
  const recomputed: DigestRef = computeDigest(material);
  const payloadDigestMatch = recomputed.value === integrity.payloadDigest?.value;
  let recovered: string | null = null;
  try {
    recovered = recover(canonicalizeJson(material), integrity.signature).toLowerCase();
  } catch {
    return { ...base, payloadDigestMatch, reason: VerifierErrorCode.SignatureRecoveryFailed };
  }
  const trusted = new Set(trustedAddresses.map((a) => a.toLowerCase()));
  const signerTrusted = recovered !== null && trusted.has(recovered);
  return {
    valid: payloadDigestMatch && signerTrusted,
    recoveredSigner: recovered,
    payloadDigestMatch,
    reason: !payloadDigestMatch
      ? VerifierErrorCode.PayloadDigestMismatch
      : signerTrusted
        ? undefined
        : VerifierErrorCode.SignerNotTrusted,
  };
}

/** Verify a `VerificationResultV1` signature against a known set of issuer addresses. */
export function verifyVerificationResult(record: VerificationResultV1, trustedAddresses: string[], recover: RecoverFn): SignatureVerification {
  if (!record || typeof record !== 'object' || !record.verificationId) {
    return { valid: false, recoveredSigner: null, payloadDigestMatch: false, reason: VerifierErrorCode.MalformedRecord };
  }
  // VerificationResultV1 carries its integrity under `signature` (see contract).
  const integrity = (record as unknown as { signature?: SignedIntegrity }).signature;
  return verifySigned(record as unknown as Record<string, unknown>, integrity, trustedAddresses, recover);
}

/** Verify a `CredentialStatusV1` signature against a known set of issuer addresses. */
export function verifyCredentialStatus(record: CredentialStatusV1, trustedAddresses: string[], recover: RecoverFn): SignatureVerification {
  if (!record || typeof record !== 'object' || !record.statusId) {
    return { valid: false, recoveredSigner: null, payloadDigestMatch: false, reason: VerifierErrorCode.MalformedRecord };
  }
  return verifySigned(record as unknown as Record<string, unknown>, record.integrity, trustedAddresses, recover);
}

/**
 * Minimal-evidence guard: an evidence package may only carry refs + digests, never
 * an inline raw payload. Returns the offending fields (empty = ok).
 */
export function assertMinimalEvidence(pkg: EvidenceRef[]): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  pkg.forEach((e, i) => {
    if (!e.digest?.value) violations.push(`evidence[${i}]: missing digest`);
    if ((e as unknown as { content?: unknown }).content !== undefined) violations.push(`evidence[${i}]: inline content not allowed`);
    if ((e as unknown as { payload?: unknown }).payload !== undefined) violations.push(`evidence[${i}]: inline payload not allowed`);
  });
  return { ok: violations.length === 0, violations };
}
