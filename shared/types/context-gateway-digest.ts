import { sha256Hex, utf8Encode } from './trust-loop-primitives';

export const CONTEXT_CANONICALIZATION_V1 = 'jcs/1' as const;

export const CONTEXT_DIGEST_DOMAINS_V1 = {
  request: 'AGENTRIX_CONTEXT_REQUEST_V1',
  runtimeBinding: 'AGENTRIX_CONTEXT_RUNTIME_BINDING_V1',
  policy: 'AGENTRIX_CONTEXT_POLICY_V1',
  source: 'AGENTRIX_CONTEXT_SOURCE_SNAPSHOT_V1',
  payload: 'AGENTRIX_CONTEXT_PAYLOAD_V1',
  decision: 'AGENTRIX_CONTEXT_DECISION_V1',
  projection: 'AGENTRIX_CONTEXT_PROJECTION_V1',
  disclosureReceipt: 'AGENTRIX_CONTEXT_DISCLOSURE_RECEIPT_V1',
  actRequest: 'AGENTRIX_CONTEXT_ACT_REQUEST_V1',
  ingestCandidate: 'AGENTRIX_CONTEXT_INGEST_CANDIDATE_V1',
  lifecycleEvent: 'AGENTRIX_CONTEXT_LIFECYCLE_EVENT_V1',
  relayRequest: 'AGENTRIX_CONTEXT_RELAY_REQUEST_V1',
  relayResponse: 'AGENTRIX_CONTEXT_RELAY_RESPONSE_V1',
  mcpInvocation: 'AGENTRIX_CONTEXT_MCP_INVOCATION_V1',
} as const;

export type ContextDigestDomainV1 =
  (typeof CONTEXT_DIGEST_DOMAINS_V1)[keyof typeof CONTEXT_DIGEST_DOMAINS_V1];

export interface ContextDigestV1 {
  algorithm: 'sha-256';
  canonicalization: typeof CONTEXT_CANONICALIZATION_V1;
  domain: ContextDigestDomainV1;
  value: string;
}

export class ContextCanonicalizationError extends Error {
  readonly code = 'context_canonicalization_error';

  constructor(message: string) {
    super(message);
    this.name = 'ContextCanonicalizationError';
  }
}

/**
 * Strict JCS-style JSON serialization used by every Context Gateway digest.
 * Unlike JSON.stringify, it rejects undefined at every depth, sparse arrays,
 * non-JSON objects, non-finite numbers, bigint and unpaired UTF-16 surrogates.
 */
export function canonicalizeContextJsonV1(value: unknown): string {
  const ancestors = new Set<object>();
  return writeCanonical(value, '$', ancestors);
}

function writeCanonical(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      assertValidUnicode(value, path);
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new ContextCanonicalizationError(`${path}: non-finite number`);
      }
      return JSON.stringify(value);
    case 'undefined':
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new ContextCanonicalizationError(`${path}: non-JSON ${typeof value}`);
    case 'object':
      break;
    default:
      throw new ContextCanonicalizationError(`${path}: unsupported value`);
  }

  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new ContextCanonicalizationError(`${path}: cyclic value`);
  }
  ancestors.add(objectValue);
  try {
    if (Array.isArray(value)) {
      const values: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new ContextCanonicalizationError(`${path}[${index}]: sparse array`);
        }
        values.push(writeCanonical(value[index], `${path}[${index}]`, ancestors));
      }
      return `[${values.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ContextCanonicalizationError(`${path}: non-plain object`);
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries: string[] = [];
    for (const key of keys) {
      assertValidUnicode(key, `${path} key`);
      entries.push(
        `${JSON.stringify(key)}:${writeCanonical(record[key], `${path}.${key}`, ancestors)}`,
      );
    }
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(objectValue);
  }
}

function assertValidUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new ContextCanonicalizationError(`${path}: unpaired high surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new ContextCanonicalizationError(`${path}: unpaired low surrogate`);
    }
  }
}

/** Domain separation is part of the canonical preimage, not a string prefix. */
export function computeContextDigestV1(
  domain: ContextDigestDomainV1,
  payload: unknown,
): ContextDigestV1 {
  const canonical = canonicalizeContextJsonV1({ domain, payload });
  return {
    algorithm: 'sha-256',
    canonicalization: CONTEXT_CANONICALIZATION_V1,
    domain,
    value: sha256Hex(utf8Encode(canonical)),
  };
}

export function verifyContextDigestV1(
  domain: ContextDigestDomainV1,
  payload: unknown,
  digest: ContextDigestV1,
): boolean {
  if (
    digest?.algorithm !== 'sha-256' ||
    digest?.canonicalization !== CONTEXT_CANONICALIZATION_V1 ||
    digest?.domain !== domain ||
    !/^[0-9a-f]{64}$/.test(digest?.value ?? '')
  ) {
    return false;
  }
  const expected = computeContextDigestV1(domain, payload).value;
  return constantTimeEqual(expected, digest.value);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
