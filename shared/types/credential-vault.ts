/**
 * Credential custody, v0 contract only (L7-7): the Agent logs in for the owner through a password manager partner.
 * Yowo never stores or sees the secret; it keeps an opaque item reference bound to one https origin. It waits for a
 * partner and for L6-7's outbound policy and credential swap, so nothing reads this in v0.
 */

/** Future server switch; nothing reads it in v0. */
export const CREDENTIAL_VAULT_V0_FLAG = 'CREDENTIAL_VAULT_V0_ENABLED';

/** How long the owner's approval of one login stays valid. */
export const CREDENTIAL_APPROVAL_TTL_MS_V0 = 10 * 60 * 1000;

export interface CredentialRefV0 {
  /** Partner id, lowercase; no partner is chosen yet. */
  provider: string;
  /** Opaque item reference inside the partner's vault. */
  itemRef: string;
  /** The only origin the login may be used on; https only. */
  origin: string;
}

export interface CredentialUseRequestV0 {
  ref: CredentialRefV0;
  /** Origin of the page asking for the login. */
  requestOrigin: string;
  /** L6-7's outbound policy is on for this run. */
  outboundPolicyOn: boolean;
  /** When the owner approved this login; null when not asked. */
  ownerApprovedAt: string | null;
}

/** Only these keys; anything else (a password, a token, a cookie) means a secret came through and is refused. */
const REF_KEYS = ['provider', 'itemRef', 'origin'];

/** Only on the exact origin, only with the outbound policy on, only after a fresh owner approval. */
export function credentialUseAllowedV0(request: CredentialUseRequestV0, nowMs: number): boolean {
  if (request.outboundPolicyOn !== true || request.requestOrigin !== request.ref.origin) return false;
  const approvedAt = request.ownerApprovedAt;
  if (typeof approvedAt !== 'string') return false;
  const at = Date.parse(approvedAt);
  return !Number.isNaN(at) && at <= nowMs && nowMs - at <= CREDENTIAL_APPROVAL_TTL_MS_V0;
}

/** `https://host[:port]` with nothing after it; null for anything else. */
export function credentialOriginV0(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  return url.origin;
}

export function decodeCredentialRefV0(value: unknown): CredentialRefV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !REF_KEYS.includes(key))) return null;
  const { provider, itemRef, origin } = raw;
  if (typeof provider !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(provider)) return null;
  if (typeof itemRef !== 'string' || !/^[A-Za-z0-9_:/-]{1,256}$/.test(itemRef)) return null;
  if (typeof origin !== 'string') return null;
  const normalized = credentialOriginV0(origin);
  if (normalized === null) return null;
  return { provider, itemRef, origin: normalized };
}
