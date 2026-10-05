/**
 * Share pages, v1 (L6-2).
 *
 * The owner shares a quote, a plan, meeting notes or a twin answer by link. Whoever opens the link reads it, can
 * leave a reply for the owner, and can follow the owner's booking link (the existing twin booking flow; no new payment
 * code). Links can be revoked and can expire. The public view never carries the owner's id, email or account data.
 *
 * Server switch: `SHARE_PAGES_V1_ENABLED` exactly `1`; otherwise every route answers 404.
 * Web: `NEXT_PUBLIC_SHARE_PAGES_ENABLED` exactly `1`.
 */

export const SHARE_PAGES_ROUTES_V1 = {
  create: 'POST /api/share-pages',
  mine: 'GET /api/share-pages',
  revoke: 'POST /api/share-pages/:shareId/revoke',
  replies: 'GET /api/share-pages/:shareId/replies',
  publicRead: 'GET /api/share-pages/public/:token',
  publicReply: 'POST /api/share-pages/public/:token/replies',
} as const;

export const SHARE_PAGE_KINDS_V1 = ['quote', 'plan', 'notes', 'twin_answer'] as const;
export type SharePageKindV1 = (typeof SHARE_PAGE_KINDS_V1)[number];

export const SHARE_PAGES_LIMITS_V1 = {
  titleMax: 120,
  bodyMax: 20000,
  replyNameMax: 80,
  replyContactMax: 254,
  replyMessageMax: 2000,
  repliesPerSharePerHour: 20,
  repliesPerShareTotal: 500,
  maxDays: 365,
} as const;

/** 43 base64url characters (32 random bytes). */
export const SHARE_PAGE_TOKEN_PATTERN_V1 = /^[A-Za-z0-9_-]{43}$/;

export const SHARE_PAGES_ERROR_CODES_V1 = {
  invalid: 'SHARE_PAGE_INVALID',
  /** Unknown, revoked or expired: never told apart. */
  notFound: 'SHARE_PAGE_NOT_FOUND',
  rateLimited: 'SHARE_PAGE_RATE_LIMITED',
  signInRequired: 'SHARE_PAGE_SIGN_IN_REQUIRED',
} as const;

export interface SharePageCreateV1 {
  kind: SharePageKindV1;
  title: string;
  body: string;
  /** Optional: where "book" goes. A path on this site (`/...`) or an https URL on agentrix.top. */
  bookingUrl?: string;
  /** Optional: 1-365 days; no expiry when absent. */
  expiresInDays?: number;
}

export interface SharePageOwnerViewV1 {
  shareId: string;
  token: string;
  kind: SharePageKindV1;
  title: string;
  body: string;
  bookingUrl: string | null;
  status: 'active' | 'revoked';
  expiresAt: string | null;
  createdAt: string;
  replyCount: number;
}

export interface SharePagePublicViewV1 {
  kind: SharePageKindV1;
  title: string;
  body: string;
  bookingUrl: string | null;
}

export interface SharePageReplyInputV1 {
  name: string;
  contact?: string;
  message: string;
}

export interface SharePageReplyViewV1 {
  replyId: string;
  name: string;
  contact: string | null;
  message: string;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

/** Same-site path (no `//`, no backslash) or https on agentrix.top / a subdomain, without credentials. */
export function isSafeSharePageBookingUrlV1(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('\\');
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (host === 'agentrix.top' || host.endsWith('.agentrix.top'));
  } catch {
    return false;
  }
}

export function decodeSharePageCreateV1(value: unknown): SharePageCreateV1 | null {
  if (!isRecord(value)) return null;
  const L = SHARE_PAGES_LIMITS_V1;
  const title = text(value.title, L.titleMax);
  const body = text(value.body, L.bodyMax);
  if (!title || !body || typeof value.kind !== 'string' || !(SHARE_PAGE_KINDS_V1 as readonly string[]).includes(value.kind)) return null;
  const out: SharePageCreateV1 = { kind: value.kind as SharePageKindV1, title, body };
  if (value.bookingUrl !== undefined) {
    if (!isSafeSharePageBookingUrlV1(value.bookingUrl)) return null;
    out.bookingUrl = value.bookingUrl;
  }
  if (value.expiresInDays !== undefined) {
    if (!Number.isInteger(value.expiresInDays) || (value.expiresInDays as number) < 1 || (value.expiresInDays as number) > L.maxDays) return null;
    out.expiresInDays = value.expiresInDays as number;
  }
  return out;
}

export function decodeSharePageReplyV1(value: unknown): SharePageReplyInputV1 | null {
  if (!isRecord(value)) return null;
  const L = SHARE_PAGES_LIMITS_V1;
  const name = text(value.name, L.replyNameMax);
  const message = text(value.message, L.replyMessageMax);
  if (!name || !message) return null;
  if (value.contact === undefined || value.contact === '') return { name, message };
  const contact = text(value.contact, L.replyContactMax);
  return contact ? { name, contact, message } : null;
}

export function decodeSharePagePublicViewV1(value: unknown): SharePagePublicViewV1 | null {
  if (!isRecord(value)) return null;
  const L = SHARE_PAGES_LIMITS_V1;
  if (typeof value.kind !== 'string' || !(SHARE_PAGE_KINDS_V1 as readonly string[]).includes(value.kind)) return null;
  if (typeof value.title !== 'string' || value.title.length > L.titleMax || typeof value.body !== 'string' || value.body.length > L.bodyMax) return null;
  if (value.bookingUrl !== null && !isSafeSharePageBookingUrlV1(value.bookingUrl)) return null;
  return { kind: value.kind as SharePageKindV1, title: value.title, body: value.body, bookingUrl: value.bookingUrl as string | null };
}
