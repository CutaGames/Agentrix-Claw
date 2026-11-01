/**
 * L8-6 own wallet, web side: the ERC-8004 registration file as the wallet page checks it before `register` and
 * `revoke_registration` (design I3, W2.6, M1).
 *
 * - `agentrix.fileDigest = sha256(canonical(file without registrations))`, canonical = keys sorted, compact, UTF-8: the
 *   same bytes as `jq -S -c 'del(.registrations)'`. The strict decoder in shared refuses unknown fields and control
 *   characters, so JS and jq agree.
 * - `agentURI` is `${fileBase}/<chainId>/<sender lower-case>/registration.json`; a `data:application/json;base64,…` URI
 *   is accepted only where the caller allows it (the rehearsal, A25).
 */
import { decodeBase64, sha256, toUtf8Bytes, toUtf8String } from 'ethers';
import { decodeErc8004RegistrationFileV1, type Erc8004RegistrationFileV1 } from '../../../shared/types/agent-erc8004';

/** Sorted keys, no spaces; only JSON values (the decoded file has strings, booleans, numbers, arrays, objects). */
export function canonicalJsonV1(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical_json_number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJsonV1(v)).join(',') + ']';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJsonV1(obj[k])).join(',') + '}';
  }
  throw new Error('canonical_json_type');
}

export type OwnWalletFileCheckV1 = { ok: true; file: Erc8004RegistrationFileV1; digest: string } | { ok: false; reasonCode: 'registration_file_invalid'; field: string };

/** Parses and decodes the file text, then digests it without `registrations`. */
export function registrationFileDigestV1(text: unknown): OwnWalletFileCheckV1 {
  if (typeof text !== 'string' || text.length === 0 || text.length > 64 * 1024) return { ok: false, reasonCode: 'registration_file_invalid', field: '$' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reasonCode: 'registration_file_invalid', field: '$' };
  }
  const decoded = decodeErc8004RegistrationFileV1(json);
  if (decoded.ok === false) return { ok: false, reasonCode: 'registration_file_invalid', field: decoded.field };
  const rest: Record<string, unknown> = { ...decoded.value };
  delete rest.registrations;
  return { ok: true, file: decoded.value, digest: sha256(toUtf8Bytes(canonicalJsonV1(rest))).toLowerCase() };
}

/** The URI `register` must carry for this account. */
export function expectedAgentUriV1(fileBaseUrl: string, chainId: number, sender: string): string | null {
  if (!/^https:\/\/[^\s?#]+[^/\s?#]$/.test(fileBaseUrl)) return null;
  return `${fileBaseUrl}/${chainId}/${sender.toLowerCase()}/registration.json`;
}

const DATA_URI_PREFIX = 'data:application/json;base64,';

/** The file text inside a `data:application/json;base64,…` URI; `null` otherwise. */
export function dataUriTextV1(uri: string): string | null {
  if (typeof uri !== 'string' || !uri.startsWith(DATA_URI_PREFIX)) return null;
  const b64 = uri.slice(DATA_URI_PREFIX.length);
  if (b64.length === 0 || b64.length > 96 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    return toUtf8String(decodeBase64(b64));
  } catch {
    return null;
  }
}
