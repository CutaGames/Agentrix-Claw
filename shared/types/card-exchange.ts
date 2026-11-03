/**
 * Card exchange (L8 batch 2, R6). Two people meet and each scans the other's code. Only when BOTH have seen who the
 * other is and confirmed, each side's relationship book gets one entry (where they met, an optional event label,
 * verification `mutual_scan`). Nothing is written to either book before that, and a cancelled or expired exchange
 * writes nothing. No contact details are exchanged; the entry carries the name the other person chose to show.
 *
 * Behind `CARD_EXCHANGE_V1_ENABLED` (server, default off, exactly `'1'`) and it needs `RELATIONSHIP_BOOK_V1_ENABLED`
 * on as well; every route answers 404 while either is off. Clients: web `NEXT_PUBLIC_CARD_EXCHANGE_ENABLED`, mobile
 * `EXPO_PUBLIC_CARD_EXCHANGE`.
 *
 * Routes (`/card-exchange`, signed in; each person sees only their own exchange):
 * - `POST /`            body `CardExchangeCreateInputV1` → `CardExchangeCreatedV1` (the one-time code; shown as a QR code)
 * - `POST /claim`       body `{ code, displayName? }`   → `CardExchangeViewV1` (the scanner; sees who made the code)
 * - `GET  /:exchangeRef`                                → `CardExchangeViewV1` (either person; poll while waiting)
 * - `POST /:exchangeRef/confirm`                        → `CardExchangeViewV1` (either person, after seeing the other)
 * - `POST /:exchangeRef/cancel`                         → `CardExchangeViewV1`
 *
 * The code lives 5 minutes; once scanned, the two have 10 minutes to confirm. The server stores only a hash of the code.
 * The code travels in the link's fragment (`/exchange#<code>`), which a browser never sends to a server.
 */
import { RELATIONSHIP_LIMITS_V1, cleanRelationshipTextV1 } from './relationship-book';

export const CARD_EXCHANGE_FLAG_V1 = 'CARD_EXCHANGE_V1_ENABLED';
export const CARD_EXCHANGE_WEB_FLAG_V1 = 'NEXT_PUBLIC_CARD_EXCHANGE_ENABLED';
export const CARD_EXCHANGE_MOBILE_FLAG_V1 = 'EXPO_PUBLIC_CARD_EXCHANGE';

export const CARD_EXCHANGE_PATH_V1 = '/card-exchange';
export const CARD_EXCHANGE_CLAIM_PATH_V1 = '/card-exchange/claim';
export const CARD_EXCHANGE_CODE_TTL_SECONDS_V1 = 300;
export const CARD_EXCHANGE_CONFIRM_TTL_SECONDS_V1 = 600;
export const CARD_EXCHANGE_CODE_PATTERN_V1 = /^[0-9a-f]{32}$/;
export const CARD_EXCHANGE_REF_PATTERN_V1 = /^cx_[0-9a-f]{32}$/;
export const CARD_EXCHANGE_OPEN_PER_USER_MAX_V1 = 5;

export const CARD_EXCHANGE_STATES_V1 = ['open', 'claimed', 'confirmed', 'cancelled'] as const;
export type CardExchangeStateV1 = (typeof CARD_EXCHANGE_STATES_V1)[number];
/** What a person is shown: the stored state, or `expired` once the time has run out without a confirmed exchange. */
export type CardExchangeShownStateV1 = CardExchangeStateV1 | 'expired';

export interface CardExchangeCreateInputV1 {
  /** The name shown to the other person. Optional: leave it out to show none. */
  displayName?: string | null;
  /** Where we met (free text). */
  metNote?: string | null;
  /** An optional event label. */
  eventTag?: string | null;
}

export interface CardExchangeClaimInputV1 {
  code: string;
  displayName?: string | null;
}

export interface CardExchangeCreatedV1 {
  exchangeRef: string;
  /** Shown once, as a QR code. */
  code: string;
  expiresAt: string;
}

export interface CardExchangeViewV1 {
  exchangeRef: string;
  /** `initiator` made the code, `claimer` scanned it. */
  role: 'initiator' | 'claimer';
  state: CardExchangeShownStateV1;
  /** The other person's chosen name; the code maker sees it only once someone has scanned. */
  counterpartName: string | null;
  /** Whether anyone has scanned yet (always true for the scanner). */
  counterpartPresent: boolean;
  metNote: string | null;
  eventTag: string | null;
  youConfirmed: boolean;
  theyConfirmed: boolean;
  /** True once both books carry the entry. */
  recorded: boolean;
  expiresAt: string;
}

export function cardExchangeLinkV1(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/exchange#${code}`;
}

/** The code out of a link fragment (`#<code>`), or `null`. */
export function cardExchangeCodeFromFragmentV1(fragment: string | null | undefined): string | null {
  const code = (fragment ?? '').replace(/^#/, '').trim().toLowerCase();
  return CARD_EXCHANGE_CODE_PATTERN_V1.test(code) ? code : null;
}

export function cardExchangePathV1(exchangeRef: string, action?: 'confirm' | 'cancel'): string {
  return `${CARD_EXCHANGE_PATH_V1}/${encodeURIComponent(exchangeRef)}${action ? `/${action}` : ''}`;
}

export function isCardExchangeClientEnabledV1(value: string | undefined): boolean {
  return value === '1';
}

// ── decoding ──────────────────────────────────────────────────────────────────────────────────

export type CardExchangeDecodeResultV1<T> = { ok: true; value: T } | { ok: false; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(raw: unknown, max: number): { ok: true; value: string | null | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const cleaned = cleanRelationshipTextV1(raw, max);
  return cleaned === null ? { ok: false } : { ok: true, value: cleaned };
}

/** Unknown fields are refused; an empty string is not a name. */
export function decodeCardExchangeCreateInputV1(value: unknown): CardExchangeDecodeResultV1<CardExchangeCreateInputV1> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (!isRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'displayName' && key !== 'metNote' && key !== 'eventTag') return { ok: false, field: key };
  const out: CardExchangeCreateInputV1 = {};
  const name = optionalText(value.displayName, RELATIONSHIP_LIMITS_V1.displayNameMax);
  if (!name.ok) return { ok: false, field: 'displayName' };
  if (name.value !== undefined) out.displayName = name.value;
  const met = optionalText(value.metNote, RELATIONSHIP_LIMITS_V1.metNoteMax);
  if (!met.ok) return { ok: false, field: 'metNote' };
  if (met.value !== undefined) out.metNote = met.value;
  const tag = optionalText(value.eventTag, RELATIONSHIP_LIMITS_V1.eventTagMax);
  if (!tag.ok) return { ok: false, field: 'eventTag' };
  if (tag.value !== undefined) out.eventTag = tag.value;
  return { ok: true, value: out };
}

export function decodeCardExchangeClaimInputV1(value: unknown): CardExchangeDecodeResultV1<CardExchangeClaimInputV1> {
  if (!isRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'code' && key !== 'displayName') return { ok: false, field: key };
  if (typeof value.code !== 'string' || !CARD_EXCHANGE_CODE_PATTERN_V1.test(value.code)) return { ok: false, field: 'code' };
  const name = optionalText(value.displayName, RELATIONSHIP_LIMITS_V1.displayNameMax);
  if (!name.ok) return { ok: false, field: 'displayName' };
  return { ok: true, value: { code: value.code, ...(name.value !== undefined ? { displayName: name.value } : {}) } };
}

function unwrap(body: unknown): unknown {
  return isRecord(body) && isRecord(body.data) && body.exchangeRef === undefined ? body.data : body;
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

export function decodeCardExchangeCreatedV1(body: unknown): CardExchangeCreatedV1 | null {
  const value = unwrap(body);
  if (!isRecord(value)) return null;
  if (typeof value.exchangeRef !== 'string' || !CARD_EXCHANGE_REF_PATTERN_V1.test(value.exchangeRef)) return null;
  if (typeof value.code !== 'string' || !CARD_EXCHANGE_CODE_PATTERN_V1.test(value.code)) return null;
  if (!isIso(value.expiresAt)) return null;
  return { exchangeRef: value.exchangeRef, code: value.code, expiresAt: value.expiresAt };
}

export function decodeCardExchangeViewV1(body: unknown): CardExchangeViewV1 | null {
  const value = unwrap(body);
  if (!isRecord(value)) return null;
  if (typeof value.exchangeRef !== 'string' || !CARD_EXCHANGE_REF_PATTERN_V1.test(value.exchangeRef)) return null;
  if (value.role !== 'initiator' && value.role !== 'claimer') return null;
  if (typeof value.state !== 'string' || !([...CARD_EXCHANGE_STATES_V1, 'expired'] as string[]).includes(value.state)) return null;
  for (const key of ['counterpartName', 'metNote', 'eventTag'] as const) if (value[key] !== null && typeof value[key] !== 'string') return null;
  for (const key of ['counterpartPresent', 'youConfirmed', 'theyConfirmed', 'recorded'] as const) if (typeof value[key] !== 'boolean') return null;
  if (!isIso(value.expiresAt)) return null;
  return {
    exchangeRef: value.exchangeRef,
    role: value.role,
    state: value.state as CardExchangeShownStateV1,
    counterpartName: value.counterpartName as string | null,
    counterpartPresent: value.counterpartPresent as boolean,
    metNote: value.metNote as string | null,
    eventTag: value.eventTag as string | null,
    youConfirmed: value.youConfirmed as boolean,
    theyConfirmed: value.theyConfirmed as boolean,
    recorded: value.recorded as boolean,
    expiresAt: value.expiresAt,
  };
}

// ── words for the screens ─────────────────────────────────────────────────────────────────────

export const CARD_EXCHANGE_STATE_COPY_V1: Readonly<Record<CardExchangeShownStateV1, { zh: string; en: string }>> = {
  open: { zh: '等对方扫码', en: 'Waiting for the other person to scan' },
  claimed: { zh: '对方已扫码，请核对后确认', en: 'Scanned. Check who it is, then confirm' },
  confirmed: { zh: '已互相确认', en: 'Both confirmed' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  expired: { zh: '已过期', en: 'Expired' },
};
