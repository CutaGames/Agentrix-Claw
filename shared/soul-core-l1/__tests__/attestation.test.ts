/** T14 / W7 · Attestation cert chain + reference values + status/freshness fail-closed (Property 12). */
import { sha256Hex, canonicalize } from '../v1_1/canonical';
import {
  buildAttestationMessage,
  verifyAttestation,
  verifyCertChain,
  type AttestationCertificate,
  type AttestationPayloadV1,
  type ReferenceValues,
  type RegistryStatusView,
  type VerifyAttestationInput,
} from '../v1_1/attestation';

// Deterministic stand-in signer (NOT cryptographic; honest simulator evidence):
// a valid signature over `message` by `pubKey` is exactly sha256(pubKey|message).
const signWith = (pubKey: string, message: string) => sha256Hex(`${pubKey}|${message}`);
const verifySig = (message: string, signature: string, pubKey: string) => signature === signWith(pubKey, message);

const REF: ReferenceValues = { hardwarePlatformId: 'J3R180', capDigest: 'cap_' + 'a'.repeat(60), appletVersion: '1.1.0', profileSchemaVersion: 1 };

// mirror attestation.ts certMessage(): canonicalize of the 5 signed fields
function certMsg(c: AttestationCertificate): string {
  return canonicalize({ subjectKeyId: c.subjectKeyId, subjectPubKey: c.subjectPubKey, usage: c.usage, notBefore: c.notBefore, notAfter: c.notAfter });
}

function sign(cert: Omit<AttestationCertificate, 'signature'>): AttestationCertificate {
  const withSig = { ...cert, signature: '' } as AttestationCertificate;
  return { ...withSig, signature: signWith(cert.issuerPubKey, certMsg(withSig)) };
}

function buildChain(): AttestationCertificate[] {
  const nb = '2026-01-01T00:00:00Z';
  const na = '2030-01-01T00:00:00Z';
  const root = sign({ subjectKeyId: 'root-test-ca', subjectPubKey: 'PK_ROOT', issuerKeyId: 'root-test-ca', issuerPubKey: 'PK_ROOT', usage: 'root', notBefore: nb, notAfter: na });
  const inter = sign({ subjectKeyId: 'inter-test-ca', subjectPubKey: 'PK_INTER', issuerKeyId: 'root-test-ca', issuerPubKey: 'PK_ROOT', usage: 'intermediate', notBefore: nb, notAfter: na });
  const leaf = sign({ subjectKeyId: 'leaf-card-1', subjectPubKey: 'PK_LEAF', issuerKeyId: 'inter-test-ca', issuerPubKey: 'PK_INTER', usage: 'attestation-leaf', notBefore: nb, notAfter: na });
  return [root, inter, leaf];
}

const payload: AttestationPayloadV1 = {
  cardIdRef: 'cardref_1',
  attestationClass: 'test_ca_card',
  fundingPubKey: 'PK_FUND',
  attestationPubKey: 'PK_LEAF',
  profileId: 'personal-primary',
  lifecycleState: 'user_activated',
  lifecycleCounter: 3,
  referenceValues: REF,
  certificateRef: 'certref_1',
  certificateChainDigest: 'chaindigest_1',
  verifierNonce: 'vnonce-1',
  issuedAt: '2026-07-16T00:00:00Z',
};

const status: RegistryStatusView = { card: 'valid', certificate: 'valid', applet: 'valid', batch: 'valid', asOf: '2026-07-16T00:00:30Z' };

function baseInput(over: Partial<VerifyAttestationInput> = {}): VerifyAttestationInput {
  return {
    payload,
    signature: signWith('PK_LEAF', buildAttestationMessage(payload)),
    certChain: buildChain(),
    trustedRootKeyIds: ['root-test-ca'],
    expectedNonce: 'vnonce-1',
    expectedReferenceValues: REF,
    status,
    freshnessSeconds: 300,
    now: '2026-07-16T00:01:00Z',
    verifySig,
    ...over,
  };
}

describe('Soul Core L1 v1.1 attestation (T14)', () => {
  it('cert chain root→intermediate→leaf verifies and yields the leaf key', () => {
    const r = verifyCertChain(buildChain(), ['root-test-ca'], verifySig, Date.parse('2026-07-16T00:00:00Z'));
    expect(r.ok).toBe(true);
    expect(r.leafPubKey).toBe('PK_LEAF');
  });

  it('happy path: verified test_ca_card → engineering_pilot assurance', () => {
    const r = verifyAttestation(baseInput());
    expect(r.verified).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.effectiveAssurance).toBe('engineering_pilot');
  });

  it('self_attested_dev caps assurance at development even when valid', () => {
    const p = { ...payload, attestationClass: 'self_attested_dev' as const };
    const r = verifyAttestation(baseInput({ payload: p, signature: signWith('PK_LEAF', buildAttestationMessage(p)) }));
    expect(r.verified).toBe(true);
    expect(r.effectiveAssurance).toBe('development');
  });

  it('nonce mismatch fails closed (anti-replay)', () => {
    const r = verifyAttestation(baseInput({ expectedNonce: 'other' }));
    expect(r.verified).toBe(false);
    expect(r.effectiveAssurance).toBe('none');
    expect(r.reasons).toContain('attestation-nonce-mismatch');
  });

  it('bad attestation signature fails closed', () => {
    const r = verifyAttestation(baseInput({ signature: 'deadbeef' }));
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('attestation-signature-invalid');
  });

  it('untrusted root / broken chain fails closed', () => {
    const r = verifyAttestation(baseInput({ trustedRootKeyIds: ['some-other-root'] }));
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('attestation-chain-invalid');
  });

  it('reference value mismatch fails closed (wrong applet version / cap digest)', () => {
    const r = verifyAttestation(baseInput({ expectedReferenceValues: { ...REF, appletVersion: '9.9.9' } }));
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('attestation-reference-mismatch');
  });

  it('revoked/suspended status fails closed', () => {
    const r = verifyAttestation(baseInput({ status: { ...status, certificate: 'revoked' } }));
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('attestation-status-invalid');
    const r2 = verifyAttestation(baseInput({ status: { ...status, card: 'unknown' } }));
    expect(r2.reasons).toContain('attestation-status-invalid');
  });

  it('stale status fails closed', () => {
    const r = verifyAttestation(baseInput({ status: { ...status, asOf: '2020-01-01T00:00:00Z' } }));
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('attestation-stale');
  });

  it('lifecycle not allowed (e.g. frozen when action needs user_activated) fails closed', () => {
    const p = { ...payload, lifecycleState: 'frozen' as const };
    const r = verifyAttestation(baseInput({ payload: p, signature: signWith('PK_LEAF', buildAttestationMessage(p)) }));
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('attestation-lifecycle-not-allowed');
  });
});
