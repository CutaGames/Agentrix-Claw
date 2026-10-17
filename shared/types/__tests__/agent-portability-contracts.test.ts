import {
  AGENT_PORTABILITY_SCHEMA_VERSION,
  PortabilityValidationError,
  computeSovereignAgentPackageDigest,
  decodeImportedAgentSourceV1,
  decodeSovereignAgentPackageV1,
  encodeSovereignAgentPackageV1,
  findPortableSecretViolations,
  parseSovereignAgentPackageV1,
  sealSovereignAgentPackageV1,
  validateSovereignAgentPackageV1,
  verifySovereignAgentPackageIntegrity,
  type SovereignAgentPackageV1,
  type UnsealedSovereignAgentPackageV1,
} from '../agent-portability';
import {
  AGENT_PORTABILITY_FIXTURE_TENANT_REF,
  IMPORTED_AGENT_SOURCE_FIXTURE_V1,
  SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1,
} from '../agent-portability-fixtures';
import { computeDigest } from '../trust-loop-primitives';

function cloneFixture(): SovereignAgentPackageV1 {
  return JSON.parse(JSON.stringify(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1)) as SovereignAgentPackageV1;
}

function reseal(input: SovereignAgentPackageV1): SovereignAgentPackageV1 {
  const cloned = JSON.parse(JSON.stringify(input)) as SovereignAgentPackageV1;
  const { contentDigest: _discardedDigest, ...manifest } = cloned.manifest;
  const unsealed: UnsealedSovereignAgentPackageV1 = {
    manifest,
    sources: cloned.sources,
    identityClaims: cloned.identityClaims,
    items: cloned.items,
    attachments: cloned.attachments,
    provenance: cloned.provenance,
    consentEvidence: cloned.consentEvidence,
    extensionData: cloned.extensionData,
  };
  const sealed = sealSovereignAgentPackageV1(unsealed);
  return {
    ...sealed,
    integrityProofs: [
      {
        schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
        kind: 'digest',
        payloadDigest: sealed.manifest.contentDigest,
      },
    ],
  };
}

function issueCodes(input: unknown): string[] {
  return validateSovereignAgentPackageV1(input, {
    expectedTenantRef: AGENT_PORTABILITY_FIXTURE_TENANT_REF,
  }).issues.map((entry) => entry.code);
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== 'object' || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).reverse()) {
    output[key] = reverseObjectKeys((value as Record<string, unknown>)[key]);
  }
  return output;
}

describe('AP-01 SovereignAgentPackageV1 golden contract', () => {
  test('the deterministic package fixture passes strict validation', () => {
    const result = validateSovereignAgentPackageV1(
      SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1,
      { expectedTenantRef: AGENT_PORTABILITY_FIXTURE_TENANT_REF },
    );
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1);
    expect(verifySovereignAgentPackageIntegrity(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1)).toBe(true);
  });

  test('the package digest is reproducible and frozen', () => {
    const digest = computeSovereignAgentPackageDigest(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1);
    expect(digest).toEqual(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1.manifest.contentDigest);
    expect(digest.value).toBe('955ec8c87632b1ac6c69fc7643aa39ceac150c0cd870929748bc80d41bd73794');
  });

  test('canonical encoding is key-order independent', () => {
    const reordered = reverseObjectKeys(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1);
    const decoded = decodeSovereignAgentPackageV1(reordered, {
      expectedTenantRef: AGENT_PORTABILITY_FIXTURE_TENANT_REF,
    });
    expect(encodeSovereignAgentPackageV1(decoded)).toBe(
      encodeSovereignAgentPackageV1(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1),
    );
  });

  test('encode/parse round-trip preserves namespaced extensionData', () => {
    const encoded = encodeSovereignAgentPackageV1(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1, {
      expectedTenantRef: AGENT_PORTABILITY_FIXTURE_TENANT_REF,
    });
    const parsed = parseSovereignAgentPackageV1(encoded, {
      expectedTenantRef: AGENT_PORTABILITY_FIXTURE_TENANT_REF,
    });
    expect(parsed.extensionData).toEqual(SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1.extensionData);
    expect(parsed.manifest.extensionData).toEqual(
      SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1.manifest.extensionData,
    );
    expect(encodeSovereignAgentPackageV1(parsed)).toBe(encoded);
  });

  test('source contract validates independently and is tenant-bound', () => {
    expect(
      decodeImportedAgentSourceV1(IMPORTED_AGENT_SOURCE_FIXTURE_V1, {
        expectedTenantRef: AGENT_PORTABILITY_FIXTURE_TENANT_REF,
      }),
    ).toBe(IMPORTED_AGENT_SOURCE_FIXTURE_V1);
    expect(() =>
      decodeImportedAgentSourceV1(IMPORTED_AGENT_SOURCE_FIXTURE_V1, {
        expectedTenantRef: 'tenant_wrong_0001',
      }),
    ).toThrow(PortabilityValidationError);
  });
});

describe('AP-01 strict fail-closed decoding', () => {
  test('unknown top-level and nested fields are rejected', () => {
    const topLevel = cloneFixture() as SovereignAgentPackageV1 & { unexpected?: string };
    topLevel.unexpected = 'must fail';
    expect(issueCodes(topLevel)).toContain('unknown_field');

    const nested = cloneFixture() as SovereignAgentPackageV1 & {
      manifest: SovereignAgentPackageV1['manifest'] & { unexpected?: string };
    };
    nested.manifest.unexpected = 'must fail';
    expect(issueCodes(nested)).toContain('unknown_field');
  });

  test('unknown major versions fail closed even with a recomputed digest', () => {
    const changed = cloneFixture();
    (changed.manifest as { schemaVersion: string }).schemaVersion = '2.0';
    const resigned = reseal(changed);
    expect(issueCodes(resigned)).toContain('unsupported_schema');
  });

  test('invalid extension namespaces fail closed', () => {
    const changed = cloneFixture();
    changed.extensionData = { not_namespaced: true };
    const resigned = reseal(changed);
    expect(issueCodes(resigned)).toContain('extension_invalid');
  });

  test('malformed JSON throws a typed validation error', () => {
    expect(() => parseSovereignAgentPackageV1('{not-json')).toThrow(
      PortabilityValidationError,
    );
  });

  test('caller item budgets are enforced', () => {
    const result = validateSovereignAgentPackageV1(
      SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1,
      { maxItems: 1 },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain('resource_limit');
  });
});

describe('AP-01 integrity, tenant, reference, and secret invariants', () => {
  test('tampering an item payload trips both item and package digests', () => {
    const changed = cloneFixture();
    changed.items[0].payload = { name: 'Tampered Atlas' };
    const codes = issueCodes(changed);
    expect(codes).toContain('item_digest_mismatch');
    expect(codes).toContain('package_integrity_failed');
  });

  test('tampering package metadata trips the package digest', () => {
    const changed = cloneFixture();
    changed.manifest.ownerPrincipalRef = 'principal_tampered';
    expect(issueCodes(changed)).toContain('package_integrity_failed');
  });

  test('cross-tenant sources fail even when package integrity is recomputed', () => {
    const changed = cloneFixture();
    changed.sources[0].tenantRef = 'tenant_wrong_0001';
    const resigned = reseal(changed);
    expect(issueCodes(resigned)).toContain('tenant_mismatch');
  });

  test('unresolved package-local source refs fail after a valid reseal', () => {
    const changed = cloneFixture();
    changed.items[0].sourceRefs[0].id = 'source_missing_0001';
    const resigned = reseal(changed);
    expect(issueCodes(resigned)).toContain('unresolved_ref');
  });

  test('credential-shaped keys are prohibited even when all digests are valid', () => {
    const changed = cloneFixture();
    changed.items[0].payload = {
      name: 'Atlas',
      apiKey: 'fixture-value-that-must-never-be-portable',
    };
    changed.items[0].contentDigest = computeDigest(changed.items[0].payload);
    const resigned = reseal(changed);
    const result = validateSovereignAgentPackageV1(resigned);
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain('secret_prohibited');
    expect(findPortableSecretViolations(resigned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'forbidden_key' }),
      ]),
    );
  });

  test('token-shaped values are prohibited without storing the value in issues', () => {
    const changed = cloneFixture();
    const sentinel = `sk-${'A'.repeat(24)}`;
    changed.items[1].payload = { note: sentinel };
    changed.items[1].contentDigest = computeDigest(changed.items[1].payload);
    const resigned = reseal(changed);
    const result = validateSovereignAgentPackageV1(resigned);
    expect(result.issues.map((entry) => entry.code)).toContain('secret_prohibited');
    expect(JSON.stringify(result.issues)).not.toContain(sentinel);
  });
});
