/**
 * Client endorsements (L8 batch 2, R5). After a real booking is done, the client can leave one sentence of
 * recommendation. It starts pending; only the Agent's owner can approve or reject it, and only an approved one is shown.
 * An approved endorsement of a live (real-money) booking is signed as a verifiable credential by the platform; the
 * passport and the card show "N verified clients recommend". Behind `CLIENT_ENDORSEMENTS_V1_ENABLED` (server, default
 * off); every route answers 404 while it is off.
 *
 * A booking is done when it is `confirmed` and its end time has passed, or when the order escrow has released the money
 * (never a refunded, cancelled or merely held booking). One endorsement per booking, written by the client who made it.
 * Test-mode orders can be endorsed and approved (so the flow can be rehearsed) but are never counted, shown on the
 * passport or signed: only live orders are real deals.
 *
 * Routes (`/client-endorsements`):
 * - `GET  bookings/:bookingRef/eligibility`  client → `{ success, data: { eligible, reason } }`
 * - `POST bookings/:bookingRef`              client, body `{ text }` → `{ success, data: ClientEndorsementClientViewV1 }`
 * - `GET  mine`                              client → `{ success, data: { items } }`
 * - `DELETE :endorsementRef`                 the client who wrote it
 * - `GET  agents/:agentId?status=`           owner → `{ success, data: { items: ClientEndorsementOwnerViewV1[] } }`
 * - `POST :endorsementRef/decision`          owner, body `{ decision: 'approve' | 'reject' }`
 * - `GET  agents/:agentId/public`            anyone → `{ success, data: ClientEndorsementPublicV1 }` (approved + live only)
 */
export const CLIENT_ENDORSEMENTS_FLAG_V1 = 'CLIENT_ENDORSEMENTS_V1_ENABLED';

export const CLIENT_ENDORSEMENT_STATUSES_V1 = ['pending', 'approved', 'rejected'] as const;
export type ClientEndorsementStatusV1 = (typeof CLIENT_ENDORSEMENT_STATUSES_V1)[number];

export const CLIENT_ENDORSEMENT_DECISIONS_V1 = ['approve', 'reject'] as const;
export type ClientEndorsementDecisionV1 = (typeof CLIENT_ENDORSEMENT_DECISIONS_V1)[number];

export const CLIENT_ENDORSEMENT_ENVIRONMENTS_V1 = ['test', 'live'] as const;
export type ClientEndorsementEnvironmentV1 = (typeof CLIENT_ENDORSEMENT_ENVIRONMENTS_V1)[number];

export const CLIENT_ENDORSEMENT_TEXT_MAX_V1 = 280;

export const CLIENT_ENDORSEMENT_ELIGIBILITY_REASONS_V1 = [
  'ok',
  'booking_not_done',
  'already_endorsed',
  'own_agent',
] as const;
export type ClientEndorsementEligibilityReasonV1 = (typeof CLIENT_ENDORSEMENT_ELIGIBILITY_REASONS_V1)[number];

export interface ClientEndorsementEligibilityV1 {
  eligible: boolean;
  reason: ClientEndorsementEligibilityReasonV1;
}

/** What the client who wrote it sees. */
export interface ClientEndorsementClientViewV1 {
  endorsementRef: string;
  bookingRef: string;
  text: string;
  status: ClientEndorsementStatusV1;
  createdAt: string;
}

/** What the owner sees: the text, who is asking is the owner, never the client's account id. */
export interface ClientEndorsementOwnerViewV1 {
  endorsementRef: string;
  bookingRef: string;
  text: string;
  status: ClientEndorsementStatusV1;
  environment: ClientEndorsementEnvironmentV1;
  /** True once the platform signed it (live and approved). */
  signed: boolean;
  createdAt: string;
  decidedAt: string | null;
}

export interface ClientEndorsementPublicItemV1 {
  text: string;
  /** `YYYY-MM`, never the exact day. */
  month: string;
}

/** What the card and the passport show: approved endorsements of live bookings only. */
export interface ClientEndorsementPublicV1 {
  verifiedClients: number;
  items: ClientEndorsementPublicItemV1[];
}

/** Reserved: anchoring a signed endorsement on chain. Not wired and not called in this release. */
export interface ClientEndorsementAnchorPortV1 {
  anchor(credentialId: string): Promise<{ status: 'not_anchored' | 'pending' | 'anchored'; txHash?: string }>;
}

export function clientEndorsementEligibilityPathV1(bookingRef: string): string {
  return `/client-endorsements/bookings/${encodeURIComponent(bookingRef)}/eligibility`;
}
export function clientEndorsementCreatePathV1(bookingRef: string): string {
  return `/client-endorsements/bookings/${encodeURIComponent(bookingRef)}`;
}
export const CLIENT_ENDORSEMENT_MINE_PATH_V1 = '/client-endorsements/mine';
export function clientEndorsementOwnerListPathV1(agentId: string, status?: ClientEndorsementStatusV1): string {
  return `/client-endorsements/agents/${encodeURIComponent(agentId)}${status ? `?status=${status}` : ''}`;
}
export function clientEndorsementDecisionPathV1(endorsementRef: string): string {
  return `/client-endorsements/${encodeURIComponent(endorsementRef)}/decision`;
}
export function clientEndorsementPublicPathV1(agentId: string): string {
  return `/client-endorsements/agents/${encodeURIComponent(agentId)}/public`;
}

/** Trim, drop control characters, collapse blank runs; `null` when empty or too long. The server and the clients share it. */
export function normalizeClientEndorsementTextV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return text.length >= 1 && text.length <= CLIENT_ENDORSEMENT_TEXT_MAX_V1 ? text : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}
function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

export function decodeClientEndorsementEligibilityV1(body: unknown): ClientEndorsementEligibilityV1 | null {
  const data = record(record(body)?.data);
  if (!data || typeof data.eligible !== 'boolean' || !isOneOf(CLIENT_ENDORSEMENT_ELIGIBILITY_REASONS_V1, data.reason)) return null;
  // `eligible` and `reason` must agree: only `ok` is eligible.
  if (data.eligible !== (data.reason === 'ok')) return null;
  return { eligible: data.eligible, reason: data.reason };
}

function decodeClientView(value: unknown): ClientEndorsementClientViewV1 | null {
  const row = record(value);
  if (!row || typeof row.endorsementRef !== 'string' || typeof row.bookingRef !== 'string') return null;
  const text = normalizeClientEndorsementTextV1(row.text);
  if (text === null || !isOneOf(CLIENT_ENDORSEMENT_STATUSES_V1, row.status) || !isIso(row.createdAt)) return null;
  return { endorsementRef: row.endorsementRef, bookingRef: row.bookingRef, text, status: row.status, createdAt: row.createdAt };
}

export function decodeClientEndorsementClientViewV1(body: unknown): ClientEndorsementClientViewV1 | null {
  return decodeClientView(record(body)?.data);
}

export function decodeClientEndorsementClientListV1(body: unknown): ClientEndorsementClientViewV1[] | null {
  const items = record(record(body)?.data)?.items;
  if (!Array.isArray(items) || items.length > 100) return null;
  const out: ClientEndorsementClientViewV1[] = [];
  for (const item of items) {
    const view = decodeClientView(item);
    if (!view) return null;
    out.push(view);
  }
  return out;
}

export function decodeClientEndorsementOwnerListV1(body: unknown): ClientEndorsementOwnerViewV1[] | null {
  const items = record(record(body)?.data)?.items;
  if (!Array.isArray(items) || items.length > 200) return null;
  const out: ClientEndorsementOwnerViewV1[] = [];
  for (const item of items) {
    const row = record(item);
    const text = normalizeClientEndorsementTextV1(row?.text);
    if (
      !row || typeof row.endorsementRef !== 'string' || typeof row.bookingRef !== 'string' || text === null
      || !isOneOf(CLIENT_ENDORSEMENT_STATUSES_V1, row.status) || !isOneOf(CLIENT_ENDORSEMENT_ENVIRONMENTS_V1, row.environment)
      || typeof row.signed !== 'boolean' || !isIso(row.createdAt) || !(row.decidedAt === null || isIso(row.decidedAt))
    ) return null;
    // Only an approved live endorsement can be signed.
    if (row.signed && !(row.status === 'approved' && row.environment === 'live')) return null;
    out.push({ endorsementRef: row.endorsementRef, bookingRef: row.bookingRef, text, status: row.status, environment: row.environment, signed: row.signed, createdAt: row.createdAt, decidedAt: row.decidedAt as string | null });
  }
  return out;
}

export function decodeClientEndorsementPublicV1(body: unknown): ClientEndorsementPublicV1 | null {
  const data = record(record(body)?.data);
  if (!data || !Number.isInteger(data.verifiedClients) || (data.verifiedClients as number) < 0 || !Array.isArray(data.items) || data.items.length > 50) return null;
  const items: ClientEndorsementPublicItemV1[] = [];
  for (const raw of data.items) {
    const row = record(raw);
    const text = normalizeClientEndorsementTextV1(row?.text);
    if (!row || text === null || typeof row.month !== 'string' || !/^\d{4}-\d{2}$/.test(row.month)) return null;
    items.push({ text, month: row.month });
  }
  return { verifiedClients: data.verifiedClients as number, items };
}

/** The line the card and the passport show. Zero shows nothing. */
export function clientEndorsementsLabelV1(count: number, locale: 'zh' | 'en'): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return locale === 'zh' ? `${count} 位已核实客户的推荐` : `${count} verified client${count === 1 ? '' : 's'} recommend`;
}
