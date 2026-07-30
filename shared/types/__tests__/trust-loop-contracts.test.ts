/**
 * TL-01.1 conformance: exercises the nine canonical contracts' runtime
 * validators against the golden vectors, the fail-closed schema/enum rules,
 * the honesty read-helpers (Properties 4 & 5), and canonical-JSON / digest
 * determinism (Property 1). Pure logic, no I/O — runs under root ts-jest.
 */
import {
  TRUST_LOOP_FIXTURES,
  CANONICAL_GOLDEN_SAMPLE,
  CANONICAL_GOLDEN_JSON,
} from '../trust-loop-fixtures';
import {
  TRUST_CONTRACT_VALIDATORS,
  validateTrustContract,
  isSupportedSchemaVersion,
  assertSupportedSchemaVersion,
  TrustValidationError,
  isActiveStatus,
  isVerifiedVerdict,
  isIndependentExternal,
  normalizeCredentialStatus,
  normalizeExecutionStatus,
  normalizeVerdict,
} from '../trust-loop-validation';
import {
  canonicalizeJson,
  computeDigest,
  verifyDigest,
  coerceToUnknown,
  TRUST_LOOP_SCHEMA_VERSION,
  SUPPORTED_TRUST_LOOP_SCHEMA_VERSIONS,
} from '../trust-loop-primitives';
import { TRUST_CONTRACT_NAMES, type TrustContractName } from '../trust-loop-contracts';

const CONTRACT_NAMES = Object.keys(TRUST_LOOP_FIXTURES) as TrustContractName[];

describe('TL-01.1 golden vectors validate', () => {
  test.each(CONTRACT_NAMES)('%s fixture passes its runtime validator', (name) => {
    const res = validateTrustContract(name, TRUST_LOOP_FIXTURES[name]);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });

  test('every contract name has both a validator and a fixture', () => {
    for (const n of TRUST_CONTRACT_NAMES) {
      expect(typeof TRUST_CONTRACT_VALIDATORS[n]).toBe('function');
      expect(TRUST_LOOP_FIXTURES[n]).toBeDefined();
    }
    expect(CONTRACT_NAMES.length).toBe(9);
  });
});

describe('fail-closed schema versioning (R1)', () => {
  test('the build understands its own version', () => {
    expect(isSupportedSchemaVersion(TRUST_LOOP_SCHEMA_VERSION)).toBe(true);
    expect(SUPPORTED_TRUST_LOOP_SCHEMA_VERSIONS).toContain(TRUST_LOOP_SCHEMA_VERSION);
  });

  test('an unknown schema version fails closed, never passes', () => {
    expect(isSupportedSchemaVersion('999.0')).toBe(false);
    expect(() => assertSupportedSchemaVersion('999.0')).toThrow(TrustValidationError);
    const tampered = { ...(TRUST_LOOP_FIXTURES.ActionContextV1 as Record<string, unknown>), schemaVersion: '999.0' };
    expect(validateTrustContract('ActionContextV1', tampered).valid).toBe(false);
  });
});

describe('fail-closed enums never resolve upward', () => {
  test('an unrecognized enum value invalidates the record', () => {
    const tampered = { ...(TRUST_LOOP_FIXTURES.CredentialStatusV1 as Record<string, unknown>), status: 'totally_bogus' };
    expect(validateTrustContract('CredentialStatusV1', tampered).valid).toBe(false);
  });

  test('normalizers degrade to unknown / null, never to a positive value', () => {
    expect(normalizeCredentialStatus('bogus')).toBe('unknown');
    expect(normalizeExecutionStatus('bogus')).toBe('unknown');
    expect(normalizeVerdict('bogus')).toBeNull();
    expect(coerceToUnknown('bogus', ['active', 'unknown'] as const)).toBe('unknown');
  });
});

describe('honesty read-helpers (Properties 4 & 5)', () => {
  test('isActiveStatus is true only for exactly "active"', () => {
    expect(isActiveStatus('active')).toBe(true);
    for (const v of ['stale', 'unknown', 'revoked', 'suspended', 'expired', undefined, null, '']) {
      expect(isActiveStatus(v)).toBe(false);
    }
  });

  test('isVerifiedVerdict is true only for exactly "verified"', () => {
    expect(isVerifiedVerdict('verified')).toBe(true);
    for (const v of ['unknown', 'failed', 'inconclusive', undefined]) {
      expect(isVerifiedVerdict(v)).toBe(false);
    }
  });

  test('isIndependentExternal is true only for exactly "independent_external"', () => {
    expect(isIndependentExternal('independent_external')).toBe(true);
    for (const v of ['platform', 'counterparty', 'self', 'unknown', undefined]) {
      expect(isIndependentExternal(v)).toBe(false);
    }
  });
});

describe('canonical JSON + digest determinism (Property 1)', () => {
  test('canonicalizeJson matches the frozen golden output', () => {
    expect(canonicalizeJson(CANONICAL_GOLDEN_SAMPLE)).toBe(CANONICAL_GOLDEN_JSON);
  });

  test('canonicalization is key-order independent', () => {
    expect(canonicalizeJson({ a: 1, b: 2, c: 3 })).toBe(canonicalizeJson({ c: 3, b: 2, a: 1 }));
  });

  test('computeDigest is reproducible and verifyDigest is tamper-evident', () => {
    const value = { hello: 'world', n: 3, nested: { k: [1, 2, 3] } };
    const d1 = computeDigest(value);
    const d2 = computeDigest(value);
    expect(d1.value).toBe(d2.value);
    expect(d1.algorithm).toBe('sha-256');
    expect(d1.value).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyDigest(value, d1)).toBe(true);
    expect(verifyDigest({ hello: 'world', n: 4, nested: { k: [1, 2, 3] } }, d1)).toBe(false);
  });
});
