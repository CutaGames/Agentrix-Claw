/**
 * Owner alerts (L8 R1; L9 M4b adds four about selling used things) as the owner reads them in the app: which things are alerted, which push type each one
 * rides, and the words for the in-app row and the daily digest in both languages. Backend (the row it writes, in
 * Chinese) and web (the row it shows, in the interface language) read the same table, so the two cannot drift.
 *
 * Rows reuse the two push copy sets in `push-notification.ts` (`PUSH_GENERIC_TEXT`); nothing here repeats them.
 * Only the digest labels are new, because the push copy has no per-kind count wording. Every text is fixed: it never
 * carries what a visitor wrote, a name, a contact, an amount or which Agent sent a request.
 */
import { PUSH_GENERIC_TEXT, PUSH_INTRODUCTION_REF_PREFIX, type PushLocale, type PushType } from './push-notification';

export const OWNER_ALERT_KINDS = [
  'twin_lead',
  'agent_request',
  'share_reply',
  'booking_new',
  'deposit_paid',
  // L9 M4b (design 5.5, D15, D18): three told to the seller, the fourth (`resale_reply`) to the buyer of one conversation.
  'resale_message',
  'resale_disclosure',
  'resale_wanted_match',
  'resale_reply',
] as const;
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
  // L9: all four ride one push type (one channel, one row title); the digest counts them apart.
  resale_message: 'resale_update',
  resale_disclosure: 'resale_update',
  resale_wanted_match: 'resale_update',
  resale_reply: 'resale_update',
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
  resale_message: { zh: '二手新消息', en: 'Selling messages' },
  resale_disclosure: { zh: '待批准的地点', en: 'Places to approve' },
  resale_wanted_match: { zh: '在找的命中', en: 'Wanted matches' },
  resale_reply: { zh: '问过的东西有回复', en: 'Replies about items you asked about' },
};

/**
 * L9 P1-4: the three introduction alerts. They are a separate list on purpose: the kinds above keep their push
 * types, digest labels and web links exactly as before. L9 package 3: the three ride one phone push type,
 * `introduction_update` (see `OWNER_ALERT_INTRODUCTION_PUSH_TYPE`), with the generic copy of that type.
 * Every text is fixed: no visitor words, no name, no contact, no amount, nothing that names the other person.
 */
export const OWNER_ALERT_INTRODUCTION_KINDS = ['introduction_approval', 'introduction_replied', 'introduction_received'] as const;
export type OwnerAlertIntroductionKind = (typeof OWNER_ALERT_INTRODUCTION_KINDS)[number];

export function isOwnerAlertIntroductionKind(value: unknown): value is OwnerAlertIntroductionKind {
  return typeof value === 'string' && (OWNER_ALERT_INTRODUCTION_KINDS as readonly string[]).includes(value);
}

/** All three introduction alerts ride one push type (one channel, one generic text; no kind is named on the lock screen). */
export const OWNER_ALERT_INTRODUCTION_PUSH_TYPE: Readonly<Record<OwnerAlertIntroductionKind, PushType>> = {
  introduction_approval: 'introduction_update',
  introduction_replied: 'introduction_update',
  introduction_received: 'introduction_update',
};

/** Any kind `OwnerAlertsService.notify` accepts: the five instant alerts and the three introduction alerts. */
export type OwnerAlertAnyKind = OwnerAlertKind | OwnerAlertIntroductionKind;

export function isOwnerAlertAnyKind(value: unknown): value is OwnerAlertAnyKind {
  return isOwnerAlertKind(value) || isOwnerAlertIntroductionKind(value);
}

/** The phone push type of any alert kind. */
export function ownerAlertAnyPushType(kind: OwnerAlertAnyKind): PushType {
  return isOwnerAlertIntroductionKind(kind) ? OWNER_ALERT_INTRODUCTION_PUSH_TYPE[kind] : OWNER_ALERT_PUSH_TYPE[kind];
}

/** The push `ref` of any alert kind: an introduction id gets the `int_` prefix, every other ref is sent as it is. */
export function ownerAlertPushRef(kind: OwnerAlertAnyKind, ref: string): string {
  return isOwnerAlertIntroductionKind(kind) ? `${PUSH_INTRODUCTION_REF_PREFIX}${ref}` : ref;
}

/** "A referral is waiting for you to approve", "the person you referred a client to has replied", "someone referred a client to you". */
export const OWNER_ALERT_INTRODUCTION_COPY: Readonly<Record<OwnerAlertIntroductionKind, Record<PushLocale, { title: string; body: string }>>> = {
  introduction_approval: {
    zh: { title: '有一个转介等你批准', body: '打开 Agentrix 查看并处理。' },
    en: { title: 'A referral is waiting for your approval', body: 'Open Agentrix to review it.' },
  },
  introduction_replied: {
    zh: { title: '你转出的客户，对方已回复', body: '打开 Agentrix 查看。' },
    en: { title: 'The client you referred has had a reply', body: 'Open Agentrix to see it.' },
  },
  introduction_received: {
    zh: { title: '有人把客户转给你', body: '打开 Agentrix 查看并决定。' },
    en: { title: 'Someone referred a client to you', body: 'Open Agentrix to look and decide.' },
  },
};

export function ownerAlertIntroductionCopy(kind: OwnerAlertIntroductionKind, locale: PushLocale): { title: string; body: string } {
  return OWNER_ALERT_INTRODUCTION_COPY[kind][locale === 'en' ? 'en' : 'zh'];
}

/** Title and body of any alert kind in one language. */
export function ownerAlertAnyCopy(kind: OwnerAlertAnyKind, locale: PushLocale): { title: string; body: string } {
  return isOwnerAlertIntroductionKind(kind) ? ownerAlertIntroductionCopy(kind, locale) : ownerAlertCopy(kind, locale);
}

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
