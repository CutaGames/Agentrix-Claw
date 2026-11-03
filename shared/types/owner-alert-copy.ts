/**
 * Owner alerts (L8 R1) as the owner reads them in the app: which five things are alerted, which push type each one
 * rides, and the words for the in-app row and the daily digest in both languages. Backend (the row it writes, in
 * Chinese) and web (the row it shows, in the interface language) read the same table, so the two cannot drift.
 *
 * Rows reuse the two push copy sets in `push-notification.ts` (`PUSH_GENERIC_TEXT`); nothing here repeats them.
 * Only the digest labels are new, because the push copy has no per-kind count wording. Every text is fixed: it never
 * carries what a visitor wrote, a name, a contact, an amount or which Agent sent a request.
 */
import { PUSH_GENERIC_TEXT, type PushLocale, type PushType } from './push-notification';

export const OWNER_ALERT_KINDS = ['twin_lead', 'agent_request', 'share_reply', 'booking_new', 'deposit_paid'] as const;
export type OwnerAlertKind = (typeof OWNER_ALERT_KINDS)[number];

export function isOwnerAlertKind(value: unknown): value is OwnerAlertKind {
  return typeof value === 'string' && (OWNER_ALERT_KINDS as readonly string[]).includes(value);
}

/** A paid deposit keeps the `order_update` push the order escrow already sends. */
export const OWNER_ALERT_PUSH_TYPE: Readonly<Record<OwnerAlertKind, PushType>> = {
  twin_lead: 'twin_lead',
  agent_request: 'agent_request',
  share_reply: 'share_reply',
  booking_new: 'booking_new',
  deposit_paid: 'order_update',
};

/** `data.alertKind` of the daily digest row itself; it is not one of the five kinds and is excluded when counting. */
export const OWNER_ALERT_DIGEST_KIND = 'digest';

/** The neutral line every stored in-app row carries (the row is written in Chinese; web shows the push copy instead). */
export const OWNER_ALERT_NEUTRAL_BODY_ZH = '打开 Agentrix 查看。';

/** Title and body of one alert in one language: the same words the push carries. */
export function ownerAlertCopy(kind: OwnerAlertKind, locale: PushLocale): { title: string; body: string } {
  return PUSH_GENERIC_TEXT[OWNER_ALERT_PUSH_TYPE[kind]][locale === 'en' ? 'en' : 'zh'];
}

/** How the digest names each kind next to its count. */
export const OWNER_ALERT_DIGEST_LABEL: Readonly<Record<OwnerAlertKind, Record<PushLocale, string>>> = {
  twin_lead: { zh: '新留言', en: 'New messages' },
  agent_request: { zh: '别的 Agent 的请求', en: 'Requests from other Agents' },
  share_reply: { zh: '共享页回复', en: 'Share page replies' },
  booking_new: { zh: '新预约', en: 'New bookings' },
  deposit_paid: { zh: '定金到账', en: 'Deposits received' },
};

/** Alert counts per kind; the digest row keeps them in `data.counts` so a reader can word them in its own language. */
export type OwnerAlertDigestCounts = Partial<Record<OwnerAlertKind, number>>;

export function ownerAlertDigestTitle(locale: PushLocale): string {
  return PUSH_GENERIC_TEXT.alert_digest[locale === 'en' ? 'en' : 'zh'].title;
}

/**
 * "新留言 2 条，新预约 1 条" / "New messages: 2, New bookings: 1": counts only, in the fixed kind order, no content.
 * An empty or all-zero map gives an empty string.
 */
export function ownerAlertDigestSentence(counts: OwnerAlertDigestCounts, locale: PushLocale): string {
  const lang = locale === 'en' ? 'en' : 'zh';
  return OWNER_ALERT_KINDS.filter((kind) => (counts[kind] ?? 0) > 0)
    .map((kind) => (lang === 'en' ? `${OWNER_ALERT_DIGEST_LABEL[kind].en}: ${counts[kind]}` : `${OWNER_ALERT_DIGEST_LABEL[kind].zh} ${counts[kind]} 条`))
    .join(lang === 'en' ? ', ' : '，');
}

/** Reads `data.counts` of a digest row: known kinds with whole, positive numbers only; anything else is dropped. */
export function decodeOwnerAlertDigestCounts(value: unknown): OwnerAlertDigestCounts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const counts: OwnerAlertDigestCounts = {};
  for (const kind of OWNER_ALERT_KINDS) {
    const n = raw[kind];
    if (typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 1_000_000) counts[kind] = n;
  }
  return Object.keys(counts).length > 0 ? counts : null;
}
