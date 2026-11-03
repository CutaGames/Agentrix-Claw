/**
 * Share pages, v1 (L6-2).
 *
 * The owner shares a quote, a plan, meeting notes or a twin answer by link. Whoever opens the link reads it, can
 * leave a reply for the owner, and can follow the owner's booking link (the existing twin booking flow; no new payment
 * code). Links can be revoked and can expire. The public view never carries the owner's id, email or account data.
 *
 * Retention (privacy page 5A): a visitor's reply is deleted 180 days after it was left, whether or not the switch is
 * on; the owner can delete one earlier (`deleteReply`).
 *
 * Server switch: `SHARE_PAGES_V1_ENABLED` exactly `1`; otherwise every route answers 404.
 * Web: `NEXT_PUBLIC_SHARE_PAGES_ENABLED` exactly `1`.
 */

export const SHARE_PAGES_ROUTES_V1 = {
  create: 'POST /api/share-pages',
  mine: 'GET /api/share-pages',
  revoke: 'POST /api/share-pages/:shareId/revoke',
  replies: 'GET /api/share-pages/:shareId/replies',
  /** The owner deletes one reply on their page; answers `{ deleted: true }`, or 404 for anyone else's. */
  deleteReply: 'DELETE /api/share-pages/:shareId/replies/:replyId',
  publicRead: 'GET /api/share-pages/public/:token',
  publicReply: 'POST /api/share-pages/public/:token/replies',
} as const;

/** Days a visitor's reply is kept after it was left. */
export const SHARE_PAGES_REPLY_RETENTION_DAYS_V1 = 180;

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
  /** Only in the owner's list (`mine`): totals for the attribution window; null while attribution is off. */
  stats?: SharePageStatsV1 | null;
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

/**
 * Referral attribution for share pages (L6-2 v1 part 2), on the same privacy terms as card attribution (E101,
 * `share-attribution.ts`):
 * - The visitor's browser reports two events for a live page: it was opened (once per browser session) and its
 *   booking link was followed. Nothing about the visitor is sent or stored: one row per (page, UTC day, kind) with a
 *   count that only goes up, at most `maxCountPerDay` per row, deleted after `windowDays`.
 * - A new account claims the page it arrived from, once, with its own sign-in. It counts only for an account created
 *   at most `claimWindowMinutes` ago, a live page, not the account's own page, and an account that never claimed
 *   before: the claim marker is the card-attribution table `share_attribution_claims`, so one account counts once
 *   whichever kind of link it came from.
 * - The owner's list carries per-page totals for the last `windowDays`: opens, booking clicks, sign-ups. Never who.
 *
 * Server switch: `SHARE_PAGES_ATTRIBUTION_V1_ENABLED` exactly `1`, on top of `SHARE_PAGES_V1_ENABLED`. While it is
 * off, events answer 404, a claim answers `{ recorded: false, reason: 'disabled' }` and `stats` is null.
 * Web: `NEXT_PUBLIC_SHARE_PAGES_ATTRIBUTION_ENABLED` exactly `1`. Switch either on only after `/privacy` describes it.
 */
export const SHARE_PAGES_ATTRIBUTION_FLAG_V1 = 'SHARE_PAGES_ATTRIBUTION_V1_ENABLED';

export const SHARE_PAGES_ATTRIBUTION_ROUTES_V1 = {
  /** Public; body `{ event }`; 202 `{ received: true }`. */
  event: 'POST /api/share-pages/public/:token/events',
  /** The new account's own sign-in; body `{ token }`; 200 with a `SharePageClaimResultV1`. */
  claim: 'POST /api/share-pages/claim',
} as const;

export const SHARE_PAGE_VISITOR_EVENTS_V1 = ['open', 'booking_click'] as const;
export type SharePageVisitorEventV1 = (typeof SHARE_PAGE_VISITOR_EVENTS_V1)[number];

/** What the per-day table counts: the two visitor events plus claimed sign-ups. */
export const SHARE_PAGE_COUNT_KINDS_V1 = ['open', 'booking_click', 'signup'] as const;
export type SharePageCountKindV1 = (typeof SHARE_PAGE_COUNT_KINDS_V1)[number];

export const SHARE_PAGES_ATTRIBUTION_LIMITS_V1 = {
  windowDays: 90,
  claimWindowMinutes: 30,
  maxCountPerDay: 2000,
} as const;

export interface SharePageStatsV1 {
  windowDays: typeof SHARE_PAGES_ATTRIBUTION_LIMITS_V1.windowDays;
  opens: number;
  bookingClicks: number;
  signups: number;
}

/** The client does not tell these apart and never shows them to the visitor. */
export const SHARE_PAGE_CLAIM_REASONS_V1 = ['disabled', 'not_new', 'already_claimed', 'page_unavailable', 'own_page'] as const;
export type SharePageClaimReasonV1 = (typeof SHARE_PAGE_CLAIM_REASONS_V1)[number];

export interface SharePageClaimResultV1 {
  recorded: boolean;
  reason?: SharePageClaimReasonV1;
}

export function decodeSharePageVisitorEventV1(value: unknown): { event: SharePageVisitorEventV1 } | null {
  if (!isRecord(value) || typeof value.event !== 'string') return null;
  return (SHARE_PAGE_VISITOR_EVENTS_V1 as readonly string[]).includes(value.event) ? { event: value.event as SharePageVisitorEventV1 } : null;
}

export function decodeSharePageClaimV1(value: unknown): { token: string } | null {
  if (!isRecord(value) || typeof value.token !== 'string' || !SHARE_PAGE_TOKEN_PATTERN_V1.test(value.token)) return null;
  return { token: value.token };
}

export function decodeSharePageStatsV1(value: unknown): SharePageStatsV1 | null {
  if (!isRecord(value) || value.windowDays !== SHARE_PAGES_ATTRIBUTION_LIMITS_V1.windowDays) return null;
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (!count(value.opens) || !count(value.bookingClicks) || !count(value.signups)) return null;
  return { windowDays: SHARE_PAGES_ATTRIBUTION_LIMITS_V1.windowDays, opens: value.opens, bookingClicks: value.bookingClicks, signups: value.signups };
}

export function decodeSharePagePublicViewV1(value: unknown): SharePagePublicViewV1 | null {
  if (!isRecord(value)) return null;
  const L = SHARE_PAGES_LIMITS_V1;
  if (typeof value.kind !== 'string' || !(SHARE_PAGE_KINDS_V1 as readonly string[]).includes(value.kind)) return null;
  if (typeof value.title !== 'string' || value.title.length > L.titleMax || typeof value.body !== 'string' || value.body.length > L.bodyMax) return null;
  if (value.bookingUrl !== null && !isSafeSharePageBookingUrlV1(value.bookingUrl)) return null;
  return { kind: value.kind as SharePageKindV1, title: value.title, body: value.body, bookingUrl: value.bookingUrl as string | null };
}
