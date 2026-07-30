/**
 * TL-06.2 conformance (pure): exercises the framework-agnostic Verifier SDK
 * WITHOUT bundling a crypto library — signature recovery is injected. Covers the
 * fail-closed branches (untrusted signer, digest mismatch, missing signature,
 * recovery failure), challenge nonce/expiry, and the minimal-evidence guard.
 * A real-secp256k1 end-to-end proof lives in the backend conformance spec.
 */
import {
  buildChallenge,
  checkChallenge,
  verifyVerificationResult,
  verifyCredentialStatus,
  assertMinimalEvidence,
  VerifierErrorCode,
  VERIFIER_SDK_VERSION,
  type RecoverFn,
} from '../trust-verifier-sdk';
import { computeDigest, TRUST_LOOP_SCHEMA_VERSION, type SignedIntegrity } from '../trust-loop-primitives';
import type { CredentialStatusV1, VerificationResultV1 } from '../trust-loop-contracts';

/** Stub recover: treats the signature string itself as the recovered address. */
const stubRecover: RecoverFn = (_msg, sig) => sig;
const throwingRecover: RecoverFn = () => {
  throw new Error('bad signature');
};

const ADDR = '0xabc0000000000000000000000000000000000001';

function signedVerification(material: Omit<VerificationResultV1, 'signature'>, signer = ADDR, tamper = false): VerificationResultV1 {
  const payloadDigest = computeDigest(material);
  const signature: SignedIntegrity = {
    type: 'signature',
    payloadDigest,
    scheme: 'eip191',
    signer: { kind: 'verifier', id: 'ext', affiliation: 'external' },
    keyId: 'k1',
    signature: signer, // stubRecover returns this as the address
    signedAt: '2026-07-16T00:00:00.000Z',
  };
  const record: VerificationResultV1 = { ...material, signature };
  if (tamper) (record as { verdict: string }).verdict = 'rejected';
  return record;
}

function verificationMaterial(): Omit<VerificationResultV1, 'signature'> {
  return {
    schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
    verificationId: 'ver_conf_0001',
    subjectRefs: [{ type: 'outcome_record', id: 'out_1' }],
    verifier: { kind: 'verifier', id: 'ext', affiliation: 'external' },
    independenceClass: 'independent_external',
    method: { id: 'm1', version: '1' },
    claims: [{ claimId: 'c1', statement: 'delivered', scope: 'artifact', result: 'verified' }],
    evidenceRefs: [],
    verdict: 'verified',
    reasonCodes: ['scope_match'],
    issuedAt: '2026-07-16T00:00:00.000Z',
  };
}

describe('TL-06.2 Verifier SDK — challenge', () => {
  it('exposes a version and builds a purpose-bound, nonce-protected challenge', () => {
    expect(VERIFIER_SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const c = buildChallenge({ purpose: 'paid_task_verification', subjectRef: { type: 'outcome_record', id: 'out_1' } });
    expect(c.nonce).toHaveLength(32);
    expect(c.purpose).toBe('paid_task_verification');
  });

  it('rejects a wrong nonce and an expired challenge (fail-closed)', () => {
    const now = new Date('2026-07-16T00:00:00.000Z');
    const c = buildChallenge({ purpose: 'p', subjectRef: { type: 'outcome_record', id: 'o' }, ttlSeconds: 60, now });
    expect(checkChallenge(c, 'wrong', now).reason).toBe(VerifierErrorCode.NonceMismatch);
    expect(checkChallenge(c, c.nonce, new Date(now.getTime() + 120_000)).reason).toBe(VerifierErrorCode.ChallengeExpired);
    expect(checkChallenge(c, c.nonce, now).ok).toBe(true);
  });
});

describe('TL-06.2 Verifier SDK — signature verification (injected recover)', () => {
  it('verifies a well-formed record whose recovered signer is trusted', () => {
    const res = verifyVerificationResult(signedVerification(verificationMaterial()), [ADDR], stubRecover);
    expect(res.valid).toBe(true);
    expect(res.recoveredSigner).toBe(ADDR.toLowerCase());
  });

  it('fails closed for an untrusted signer', () => {
    const res = verifyVerificationResult(signedVerification(verificationMaterial()), ['0xdead'], stubRecover);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe(VerifierErrorCode.SignerNotTrusted);
  });

  it('fails closed when the payload was tampered after signing', () => {
    const res = verifyVerificationResult(signedVerification(verificationMaterial(), ADDR, true), [ADDR], stubRecover);
    expect(res.valid).toBe(false);
    expect(res.payloadDigestMatch).toBe(false);
  });

  it('fails closed for a missing signature and for a recovery failure', () => {
    const missing = { ...verificationMaterial() } as unknown as VerificationResultV1;
    expect(verifyVerificationResult(missing, [ADDR], stubRecover).reason).toBe(VerifierErrorCode.NotASignature);
    expect(verifyVerificationResult(signedVerification(verificationMaterial()), [ADDR], throwingRecover).reason).toBe(
      VerifierErrorCode.SignatureRecoveryFailed,
    );
  });

  it('verifies a CredentialStatus signed under its `integrity` field', () => {
    const material: Omit<CredentialStatusV1, 'integrity'> = {
      schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
      statusId: 'cst_conf_1',
      credentialRef: { type: 'verification_result', id: 'ver_conf_0001' },
      status: 'active',
      statusVersion: 1,
      effectiveAt: '2026-07-16T00:00:00.000Z',
      authority: { kind: 'status_authority', id: 'sa-1', affiliation: 'internal' },
    };
    const record: CredentialStatusV1 = {
      ...material,
      integrity: {
        type: 'signature',
        payloadDigest: computeDigest(material),
        scheme: 'eip191',
        signer: { kind: 'status_authority', id: 'sa-1', affiliation: 'internal' },
        keyId: 'k1',
        signature: ADDR,
        signedAt: '2026-07-16T00:00:00.000Z',
      },
    };
    expect(verifyCredentialStatus(record, [ADDR], stubRecover).valid).toBe(true);
  });
});

describe('TL-06.2 Verifier SDK — minimal evidence guard', () => {
  it('accepts ref/digest-only evidence and rejects inline raw payloads', () => {
    const digest = { algorithm: 'sha-256' as const, canonicalization: 'jcs/1', value: 'a'.repeat(64) };
    const ok = assertMinimalEvidence([{ evidenceId: 'e1', kind: 'artifact', digest, dataClass: 'private', createdAt: '2026-07-16T00:00:00.000Z' }]);
    expect(ok.ok).toBe(true);
    const bad = assertMinimalEvidence([
      { evidenceId: 'e2', kind: 'artifact', digest, dataClass: 'private', createdAt: '2026-07-16T00:00:00.000Z', content: 'RAW SECRET' } as any,
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.violations.join(' ')).toMatch(/inline content/);
  });
});
