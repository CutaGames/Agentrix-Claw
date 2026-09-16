import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  canonicalizeEmbeddedJsonV1,
  computeCertificateChainDigestV1,
  computeEmbeddedClaimChallengeDigestV1,
  computeEmbeddedClaimRequestDigestV1,
  computeRevocationFenceSetDigestV1,
  computeSignedShellCommandPayloadDigestV1,
  parseEmbeddedJsonV1,
  projectEmbeddedClaimRequestDigestPayloadV1,
  validateSignedShellCommandSigningPayloadV1,
  validateSignedShellCommandV1,
  type AesSunClaimProofV1,
  type EmbeddedClaimChallengeV1,
  type EmbeddedClaimCommandV1,
  type RevocationFenceSetV1,
  type SignedShellCommandSigningPayloadV1,
} from '../soul-core-embedded';
import { validateShellCommandEnvelopeV1 } from '../shell-session-binding';
import type { RecordRef } from '../trust-loop-primitives';

const VECTORS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.kiro',
  'specs',
  'soul-core-embedded',
  'vectors',
  'EMB-01.2-canonicalization-golden-vectors.json',
);

interface VectorEntry {
  canonicalJson: string;
  sha256: string;
}

interface VectorFile {
  canonicalizationProfile: string;
  digestProfile: string;
  languageParity: {
    typescript: string;
    c: string;
    java: string;
    byteForByteCrossLanguageParityComplete: boolean;
    parityGate: string;
    cReference: string;
    javaReference: string;
  };
  vectors: {
    claimChallenge: VectorEntry;
    claimRequestDigestPayload: VectorEntry & { ownerAuthorizationRefExcluded: boolean };
    revocationFenceSet: VectorEntry;
    signedShellCommandSigningPayload: VectorEntry;
    certificateChainTarget: { derChainLeafToRootHex: string[]; sha256: string };
  };
}

const frozen = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as VectorFile;

const T0 = '2026-07-30T00:00:00.000Z';
const T1 = '2026-07-30T00:00:30.000Z';
const T2 = '2026-07-30T00:01:00.000Z';
const H64 = '0'.repeat(64);

const ref = (type: RecordRef['type'], id: string, version?: number): RecordRef =>
  version === undefined ? { type, id } : { type, id, version };

const challenge: EmbeddedClaimChallengeV1 = {
  schemaVersion: 1,
  challengeId: 'challenge-1',
  elementRef: ref('embedded_element', 'element-1'),
  batchRef: ref('embedded_batch', 'batch-1'),
  targetAgentId: 'agent-1',
  accountableAgentId: 'agent-1',
  authorityRootRef: { kind: 'soul_core', soulCoreId: 'soul-core-1' },
  principalRef: ref('actor_identity', 'owner-1'),
  audience: ['agentrix.claim', 'mobile'],
  channel: 'mobile-nfc',
  proofProtocol: 'aes-sun',
  nonce: 'challenge-nonce-1',
  idempotencyKey: 'claim-idempotency-1',
  issuedAt: T0,
  expiresAt: T1,
};

const proof: AesSunClaimProofV1 = {
  schemaVersion: 1,
  protocol: 'aes-sun',
  challengeId: 'challenge-1',
  elementRef: challenge.elementRef,
  batchRef: challenge.batchRef,
  keyVersion: 1,
  counter: '1',
  sunMessage: 'AQID',
  mac: 'BAUG',
  collectedAt: T1,
};

const command: EmbeddedClaimCommandV1 = {
  schemaVersion: 1,
  challenge,
  ownerAuthorizationRef: ref('authority_decision', 'owner-decision-1', 1),
  proof,
  requestedCapabilities: ['companion.read', 'companion.sign'],
  runtimeRef: ref('runtime', 'runtime-1'),
};

const fenceSet: RevocationFenceSetV1 = {
  schemaVersion: 1,
  policyVersion: 'embedded-fence-policy-v1',
  entries: [
    { aggregateKind: 'element', aggregateRef: ref('embedded_element', 'element-1'), observedEpoch: 0 },
    { aggregateKind: 'batch', aggregateRef: ref('embedded_batch', 'batch-1'), observedEpoch: 0 },
  ],
};

const signingPayload: SignedShellCommandSigningPayloadV1 = {
  wrapperSchemaVersion: 1,
  domain: 'agentrix:shell-command:v1',
  canonicalizationProfile: 'rfc8785-utf8-sha256-v1',
  digestProfile: 'sha256-rfc8785-v1',
  signatureEncoding: 'base64url-p1363',
  envelope: {
    schemaVersion: 1,
    bindingId: 'binding-1',
    bindingVersion: 1,
    nonceDomain: 'shell-command-v1',
    nonce: '0123456789abcdef0123456789abcdef',
    idempotencyKey: 'command-1',
    requestDigest: H64,
    issuedAt: T0,
    expiresAt: T2,
  },
  signerRef: 'embedded-key-1',
  keyVersion: 1,
  algorithm: 'ecdsa-p256-sha256',
};

const nodeSha256 = (utf8: string): string =>
  createHash('sha256').update(Buffer.from(utf8, 'utf8')).digest('hex');

describe('EMB-01.2 frozen canonicalization vectors', () => {
  test('profiles stay frozen and cross-language parity is claimed only with a runnable gate', () => {
    expect(frozen.canonicalizationProfile).toBe('rfc8785-utf8-sha256-v1');
    expect(frozen.digestProfile).toBe('sha256-rfc8785-v1');
    expect(frozen.languageParity.typescript).toBe('verified-by-regression-test');
    expect(frozen.languageParity.c).toBe('verified-by-parity-gate');
    expect(frozen.languageParity.java).toBe('verified-by-parity-gate');
    expect(frozen.languageParity.byteForByteCrossLanguageParityComplete).toBe(true);
    // The claim is only honest while the gate and both references actually exist on disk.
    for (const relative of [
      frozen.languageParity.parityGate,
      frozen.languageParity.cReference,
      frozen.languageParity.javaReference,
    ]) {
      expect(typeof relative).toBe('string');
      expect(existsSync(join(__dirname, '..', '..', '..', relative))).toBe(true);
    }
  });

  test('claim challenge bytes and digest match the frozen vector', () => {
    expect(canonicalizeEmbeddedJsonV1(challenge)).toBe(frozen.vectors.claimChallenge.canonicalJson);
    expect(computeEmbeddedClaimChallengeDigestV1(challenge)).toBe(frozen.vectors.claimChallenge.sha256);
  });

  test('claim request payload excludes only the owner authorization ref', () => {
    const projected = projectEmbeddedClaimRequestDigestPayloadV1(command);
    expect(canonicalizeEmbeddedJsonV1(projected)).toBe(
      frozen.vectors.claimRequestDigestPayload.canonicalJson,
    );
    expect(computeEmbeddedClaimRequestDigestV1(command)).toBe(
      frozen.vectors.claimRequestDigestPayload.sha256,
    );
    expect(frozen.vectors.claimRequestDigestPayload.ownerAuthorizationRefExcluded).toBe(true);
    expect(frozen.vectors.claimRequestDigestPayload.canonicalJson).not.toContain('ownerAuthorizationRef');
    for (const signed of ['challenge', 'proof', 'requestedCapabilities', 'runtimeRef']) {
      expect(frozen.vectors.claimRequestDigestPayload.canonicalJson).toContain(signed);
    }
  });

  test('fence set and signed wrapper bytes match the frozen vectors', () => {
    expect(canonicalizeEmbeddedJsonV1(fenceSet)).toBe(frozen.vectors.revocationFenceSet.canonicalJson);
    expect(computeRevocationFenceSetDigestV1(fenceSet)).toBe(frozen.vectors.revocationFenceSet.sha256);
    expect(canonicalizeEmbeddedJsonV1(signingPayload)).toBe(
      frozen.vectors.signedShellCommandSigningPayload.canonicalJson,
    );
    expect(computeSignedShellCommandPayloadDigestV1(signingPayload)).toBe(
      frozen.vectors.signedShellCommandSigningPayload.sha256,
    );
  });

  test('certificate chain target digest matches the frozen length-prefixed framing', () => {
    const chain = frozen.vectors.certificateChainTarget.derChainLeafToRootHex.map(
      (hex) => new Uint8Array(Buffer.from(hex, 'hex')),
    );
    expect(computeCertificateChainDigestV1(chain)).toBe(frozen.vectors.certificateChainTarget.sha256);
  });

  test('the bundled SHA-256 agrees with an independent Node crypto oracle', () => {
    for (const entry of [
      frozen.vectors.claimChallenge,
      frozen.vectors.claimRequestDigestPayload,
      frozen.vectors.revocationFenceSet,
      frozen.vectors.signedShellCommandSigningPayload,
    ]) {
      expect(nodeSha256(entry.canonicalJson)).toBe(entry.sha256);
    }
  });

  test('any signed-field mutation changes the frozen digest', () => {
    expect(computeSignedShellCommandPayloadDigestV1({
      ...signingPayload,
      envelope: { ...signingPayload.envelope, nonce: 'ffffffffffffffffffffffffffffffff' },
    })).not.toBe(frozen.vectors.signedShellCommandSigningPayload.sha256);
    expect(computeEmbeddedClaimChallengeDigestV1({
      ...challenge,
      audience: ['agentrix.claim', 'mobile', 'web'],
    })).not.toBe(frozen.vectors.claimChallenge.sha256);
  });
});

/**
 * EMB-01.2 §8.3 mutation matrix. Every row must fail closed or change the signed preimage;
 * none of these fixtures contains a real key, a real signature or a real certificate.
 */
describe('EMB-01.2 mutation and rejection matrix', () => {
  const lowS = (): string => {
    const bytes = Buffer.alloc(64);
    bytes[31] = 1;
    bytes[63] = 1;
    return bytes.toString('base64url');
  };
  const certificatePair = {
    ref: ref('embedded_certificate', 'certificate-1', 3),
    canonicalDigest: frozen.vectors.certificateChainTarget.sha256,
    digestProfile: 'sha256-der-chain-lp-v1' as const,
  };
  const attestationPair = {
    ref: ref('assurance_evidence', 'assurance-1', 2),
    canonicalDigest: 'a'.repeat(64),
    digestProfile: 'sha256-rfc8785-assurance-evidence-v1' as const,
  };

  test('accepts both algorithms and both encodings, with and without signed artifact pairs', () => {
    const derLowS = Buffer.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]).toString('base64url');
    for (const algorithm of ['ecdsa-p256-sha256', 'ecdsa-secp256k1-sha256'] as const) {
      for (const [signatureEncoding, signature] of [
        ['base64url-p1363', lowS()],
        ['base64url-der', derLowS],
      ] as const) {
        const payload = { ...signingPayload, algorithm, signatureEncoding };
        expect(validateSignedShellCommandV1({ signingPayload: payload, signature }).valid).toBe(true);
        expect(
          validateSignedShellCommandV1({
            signingPayload: { ...payload, certificateChain: certificatePair, attestationEvidence: attestationPair },
            signature,
          }).valid,
        ).toBe(true);
      }
    }
  });

  test('rejects every wrapper-level mutation and any unsigned outer field', () => {
    const mutations: Array<Record<string, unknown>> = [
      { wrapperSchemaVersion: 2 },
      { domain: 'agentrix:shell-command:v2' },
      { canonicalizationProfile: 'rfc8785-utf8-sha512-v1' },
      { digestProfile: 'sha512-rfc8785-v1' },
      { signatureEncoding: 'base64url-asn1' },
      { algorithm: 'ed25519' },
      { keyVersion: 0 },
      { signerRef: '' },
      { unsignedDispatchHint: 'x' },
    ];
    for (const mutation of mutations) {
      expect(
        validateSignedShellCommandSigningPayloadV1({ ...signingPayload, ...mutation }).valid,
      ).toBe(false);
    }
    expect(
      validateSignedShellCommandV1({
        signingPayload,
        signature: lowS(),
        bindingId: 'binding-1',
      }).valid,
    ).toBe(false);
  });

  test('mutating any one envelope field changes the signed digest', () => {
    const base = computeSignedShellCommandPayloadDigestV1(signingPayload);
    const envelopeMutations: Array<Record<string, unknown>> = [
      { bindingId: 'binding-2' },
      { bindingVersion: 2 },
      { nonceDomain: 'shell-command-v2' },
      { nonce: 'ffffffffffffffffffffffffffffffff' },
      { idempotencyKey: 'command-2' },
      { requestDigest: 'f'.repeat(64) },
      { issuedAt: '2026-07-30T00:00:00.001Z' },
      { expiresAt: '2026-07-30T00:01:00.001Z' },
    ];
    for (const mutation of envelopeMutations) {
      const mutated = { ...signingPayload, envelope: { ...signingPayload.envelope, ...mutation } };
      expect(validateSignedShellCommandSigningPayloadV1(mutated).valid).toBe(true);
      expect(computeSignedShellCommandPayloadDigestV1(mutated)).not.toBe(base);
    }
  });

  test('signed artifact pairs are all-or-nothing with an exact immutable target', () => {
    const partials: Array<Record<string, unknown>> = [
      { ref: certificatePair.ref },
      { ref: certificatePair.ref, canonicalDigest: certificatePair.canonicalDigest },
      { ...certificatePair, ref: ref('embedded_certificate', 'certificate-1') },
      { ...certificatePair, ref: { ...certificatePair.ref, digest: { algorithm: 'sha-256', canonicalization: 'jcs/1', value: 'b'.repeat(64) } } },
      { ...certificatePair, digestProfile: 'sha256-rfc8785-assurance-evidence-v1' },
      { ...certificatePair, canonicalDigest: 'NOTHEX' },
      { ...certificatePair, ref: ref('assurance_evidence', 'assurance-1', 2) },
    ];
    for (const partial of partials) {
      expect(
        validateSignedShellCommandSigningPayloadV1({
          ...signingPayload,
          certificateChain: partial as never,
        }).valid,
      ).toBe(false);
    }
    // A target-version change alters the signed preimage rather than being silently accepted.
    expect(
      computeSignedShellCommandPayloadDigestV1({
        ...signingPayload,
        certificateChain: { ...certificatePair, ref: ref('embedded_certificate', 'certificate-1', 4) },
      }),
    ).not.toBe(
      computeSignedShellCommandPayloadDigestV1({ ...signingPayload, certificateChain: certificatePair }),
    );
  });

  test('rejects padded, wrong-length, cross-encoded and non-minimal signatures', () => {
    const derPayload = { ...signingPayload, signatureEncoding: 'base64url-der' as const };
    const cases: Array<[SignedShellCommandSigningPayloadV1, string]> = [
      [signingPayload, `${lowS()}=`],
      [signingPayload, Buffer.alloc(63).toString('base64url')],
      [signingPayload, Buffer.alloc(65).toString('base64url')],
      [signingPayload, Buffer.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]).toString('base64url')],
      [derPayload, lowS()],
      [derPayload, Buffer.from([0x30, 0x07, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01, 0x00]).toString('base64url')],
      [derPayload, Buffer.from([0x30, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x01]).toString('base64url')],
    ];
    for (const [payload, signature] of cases) {
      expect(validateSignedShellCommandV1({ signingPayload: payload, signature }).valid).toBe(false);
    }
  });

  test('the strict decoder fails closed before a structural validator ever runs', () => {
    const canonical = frozen.vectors.signedShellCommandSigningPayload.canonicalJson;
    expect(() => parseEmbeddedJsonV1(canonical)).not.toThrow();
    expect(() => parseEmbeddedJsonV1(canonical.replace('"algorithm"', '"domain"'))).toThrow(
      /Duplicate JSON key/,
    );
    expect(() => parseEmbeddedJsonV1('{"keyVersion":1e999}')).toThrow(/number/);
    expect(() => parseEmbeddedJsonV1('{"a":Infinity}')).toThrow();
    expect(() => parseEmbeddedJsonV1(canonical, 10)).toThrow(/byte limit/);
    expect(() => parseEmbeddedJsonV1('{"a":{"b":{"c":1}}}', 1000, 2)).toThrow(/nesting/);
  });

  test('the CURRENT V1 envelope contract keeps its own looser timestamp behaviour', () => {
    const loose = { ...signingPayload.envelope, issuedAt: '2026-07-30T00:00:00Z' };
    // Standalone CURRENT V1 still accepts a second-precision timestamp ...
    expect(validateShellCommandEnvelopeV1(loose).valid).toBe(true);
    // ... while the new signed wrapper requires the canonical millisecond form.
    expect(
      validateSignedShellCommandSigningPayloadV1({ ...signingPayload, envelope: loose }).valid,
    ).toBe(false);
  });
});
