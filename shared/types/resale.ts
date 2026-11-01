/**
 * L9 devices and assets (E138): selling one used thing to people the owner knows. A listing is made from a "My things"
 * row (`device-assets.ts`); the item page opens only with its link and is never offered to search engines (D13); buyers
 * sign in to ask and offer (D6); the platform never touches the money and does not take a share (D2). The lowest price
 * (`floor`) never leaves the server: no public view, buyer view or model input has a field for it.
 *
 * Behind `RESALE_LISTINGS_V1_ENABLED` (server, exactly `'1'`), which needs the ledger switch and
 * `OWNER_DATA_KEYS_V1_ENABLED === '1'`: conversation text and approved places are only ever stored sealed. Twin replies
 * (`RESALE_TWIN_REPLIES_V1_ENABLED`) and "I'm looking for" (`RESALE_WANTED_V1_ENABLED`, also needs the relationship
 * book) have their own switches. Web: `NEXT_PUBLIC_RESALE_ENABLED`, `NEXT_PUBLIC_RESALE_RECYCLE_DRAFTS_ENABLED`,
 * `NEXT_PUBLIC_RESALE_WANTED_ENABLED`, `NEXT_PUBLIC_RESALE_SALE_RECEIPTS_ENABLED`.
 *
 * Everything here is pure and shared by the server and the clients: limits, the state table, the copy, the text guard
 * (`resaleTextGuardV1`), the payment safety hint (D21), the twin reply guard (D23), the recycle list, the platform
 * draft builder and the view decoders.
 */
import {
  DEVICE_ASSET_CONDITIONS_V1,
  DEVICE_ASSET_CONDITION_COPY_V1,
  DEVICE_ASSET_REF_PATTERN_V1,
  RESALE_CATEGORIES_V1,
  RESALE_CATEGORY_COPY_V1,
  deviceAssetsShapeV1,
  deviceAssetsTodayV1,
  isDeviceAssetMoneyV1,
  isIsoDateV1,
  type DeviceAssetConditionV1,
  type DeviceAssetRecycleQuoteInputV1,
  type DeviceAssetsShapeCheckV1,
  type ResaleCategoryV1,
} from './device-assets';

// ── switches and settings ─────────────────────────────────────────────────────────────────────

export const RESALE_LISTINGS_FLAG_V1 = 'RESALE_LISTINGS_V1_ENABLED' as const;
export const RESALE_TWIN_REPLIES_FLAG_V1 = 'RESALE_TWIN_REPLIES_V1_ENABLED' as const;
export const RESALE_WANTED_FLAG_V1 = 'RESALE_WANTED_V1_ENABLED' as const;
export const RESALE_SALE_RECEIPTS_FLAG_V1 = 'RESALE_SALE_RECEIPTS_V1_ENABLED' as const;
export const RESALE_WEB_FLAG_V1 = 'NEXT_PUBLIC_RESALE_ENABLED' as const;
export const RESALE_RECYCLE_DRAFTS_WEB_FLAG_V1 = 'NEXT_PUBLIC_RESALE_RECYCLE_DRAFTS_ENABLED' as const;
export const RESALE_WANTED_WEB_FLAG_V1 = 'NEXT_PUBLIC_RESALE_WANTED_ENABLED' as const;
export const RESALE_SALE_RECEIPTS_WEB_FLAG_V1 = 'NEXT_PUBLIC_RESALE_SALE_RECEIPTS_ENABLED' as const;

/** Settings, not switches: a value that is not an integer in range falls back to the default (D10). */
export const RESALE_DAILY_CAP_SETTINGS_V1 = {
  RESALE_DRAFT_DAILY_CAP: { min: 1, max: 50, fallback: 10 },
  RESALE_TWIN_REPLY_DAILY_CAP_LISTING: { min: 1, max: 200, fallback: 30 },
  RESALE_TWIN_REPLY_DAILY_CAP_OWNER: { min: 1, max: 1000, fallback: 100 },
} as const;
export type ResaleDailyCapSettingV1 = keyof typeof RESALE_DAILY_CAP_SETTINGS_V1;

// ── refs ──────────────────────────────────────────────────────────────────────────────────────

/** All refs are a prefix and 128 random bits in lower-case hex; the item page URL is the listing ref. */
export const RESALE_LISTING_REF_PATTERN_V1 = /^rsl_[0-9a-f]{32}$/;
export const RESALE_THREAD_REF_PATTERN_V1 = /^rst_[0-9a-f]{32}$/;
export const RESALE_DISCLOSURE_CARD_REF_PATTERN_V1 = /^rsd_[0-9a-f]{32}$/;
export const RESALE_WANTED_REF_PATTERN_V1 = /^rsw_[0-9a-f]{32}$/;
export const RESALE_SALE_RECEIPT_REF_PATTERN_V1 = /^rsr_[0-9a-f]{32}$/;
/** A photo id; the stored file is `<photoId>.jpg` in the public upload directory. */
export const RESALE_PHOTO_ID_PATTERN_V1 = /^rs_[0-9a-f]{32}$/;

// ── paths ─────────────────────────────────────────────────────────────────────────────────────

export const RESALE_LISTINGS_PATH_V1 = '/resale/listings';
export const RESALE_PUBLIC_LISTINGS_PATH_V1 = '/resale/public/listings';
export const RESALE_THREADS_PATH_V1 = '/resale/threads';
export const RESALE_DISCLOSURE_CARDS_PATH_V1 = '/resale/disclosure-cards';
export const RESALE_WANTED_PATH_V1 = '/resale/wanted';
export function resaleListingPathV1(listingRef: string): string {
  return `${RESALE_LISTINGS_PATH_V1}/${encodeURIComponent(listingRef)}`;
}
export function resalePublicListingPathV1(listingRef: string): string {
  return `${RESALE_PUBLIC_LISTINGS_PATH_V1}/${encodeURIComponent(listingRef)}`;
}
export function resaleMyThreadPathV1(listingRef: string): string {
  return `${resalePublicListingPathV1(listingRef)}/my-thread`;
}
export function resaleThreadPathV1(threadRef: string): string {
  return `${RESALE_THREADS_PATH_V1}/${encodeURIComponent(threadRef)}`;
}
/** The web item page. */
export function resaleItemPagePathV1(listingRef: string): string {
  return `/i/${encodeURIComponent(listingRef)}`;
}
/** L3 (S18): the seller's sale receipt and card choice for one listing (`GET`, `POST` asks the buyer to confirm). */
export function resaleListingSaleReceiptPathV1(listingRef: string): string {
  return `${resaleListingPathV1(listingRef)}/sale-receipt`;
}
/** L3 (S18): `PUT { onCard }`, whether this listing shows on the seller's card. */
export function resaleListingOnCardPathV1(listingRef: string): string {
  return `${resaleListingPathV1(listingRef)}/on-card`;
}
/** L3 (S18): the buyer's side of the sale receipt of their conversation (`GET`; `POST …/confirm`). */
export function resaleThreadSaleReceiptPathV1(threadRef: string): string {
  return `${resaleThreadPathV1(threadRef)}/sale-receipt`;
}
export const RESALE_PUBLIC_SELLERS_PATH_V1 = '/resale/public/sellers';
/** L3 (S18): what a seller's card shows (no login; only items the seller put on the card). */
export function resaleSellerSummaryPathV1(agentId: string): string {
  return `${RESALE_PUBLIC_SELLERS_PATH_V1}/${encodeURIComponent(agentId)}/summary`;
}

// ── vocabulary ────────────────────────────────────────────────────────────────────────────────

/** Only this coarse: never a street, a block or a postcode. */
export const RESALE_AREAS_V1 = ['north', 'south', 'east', 'west', 'central'] as const;
export type ResaleAreaV1 = (typeof RESALE_AREAS_V1)[number];
export const RESALE_AREA_COPY_V1: Record<ResaleAreaV1, { zh: string; en: string }> = {
  north: { zh: '北部', en: 'North' },
  south: { zh: '南部', en: 'South' },
  east: { zh: '东部', en: 'East' },
  west: { zh: '西部', en: 'West' },
  central: { zh: '中部', en: 'Central' },
};
export const RESALE_HANDOVERS_V1 = ['meetup', 'pickup', 'either'] as const;
export type ResaleHandoverV1 = (typeof RESALE_HANDOVERS_V1)[number];
export const RESALE_HANDOVER_COPY_V1: Record<ResaleHandoverV1, { zh: string; en: string }> = {
  meetup: { zh: '约地方见面', en: 'Meet up' },
  pickup: { zh: '上门自取', en: 'Collect from the seller' },
  either: { zh: '见面或自取都行', en: 'Meet up or collect' },
};

export const RESALE_LISTING_LIMITS_V1 = {
  titleMin: 4,
  titleMax: 80,
  descriptionMax: 1000,
  faqMax: 8,
  faqQuestionMax: 120,
  faqAnswerMax: 300,
  photosMax: 4,
  photoBytesMax: 8 * 1024 * 1024,
  pickupPointMax: 120,
  /** SGD minor units: S$1 to S$10,000, the same as the order catalogue. */
  askingMinorMin: 100,
  askingMinorMax: 1_000_000,
  floorMinorMin: 100,
  /** Published or reserved at the same time, per owner. */
  openPerOwnerMax: 20,
  draftNoteMax: 300,
  draftTitleMax: 80,
  draftDescriptionMax: 600,
} as const;

export const RESALE_LISTING_STATUSES_V1 = ['draft', 'published', 'reserved', 'sold', 'withdrawn', 'expired'] as const;
export type ResaleListingStatusV1 = (typeof RESALE_LISTING_STATUSES_V1)[number];
/** Ended: never published again (sell it again from the ledger row with a new listing). */
export const RESALE_LISTING_ENDED_STATUSES_V1 = ['sold', 'withdrawn', 'expired'] as const;
/** The item page and the buyer side are readable only in these. */
export const RESALE_LISTING_OPEN_STATUSES_V1 = ['published', 'reserved'] as const;
export type ResaleListingOpenStatusV1 = (typeof RESALE_LISTING_OPEN_STATUSES_V1)[number];
/**
 * Allowed moves. Every move is a conditional update (`WHERE status = <from>`); the loser of a race gets 409
 * `listing_state_changed`. `published → sold` is "mark sold" without an accepted offer (sold to someone off the page);
 * `reserved → expired` is a cancelled arrangement whose 30 days have already run out.
 */
export const RESALE_LISTING_TRANSITIONS_V1: Record<ResaleListingStatusV1, readonly ResaleListingStatusV1[]> = {
  draft: ['published', 'withdrawn'],
  published: ['reserved', 'sold', 'withdrawn', 'expired'],
  reserved: ['published', 'sold', 'withdrawn', 'expired'],
  sold: [],
  withdrawn: [],
  expired: [],
};
export function resaleListingCanMoveV1(from: ResaleListingStatusV1, to: ResaleListingStatusV1): boolean {
  return (RESALE_LISTING_TRANSITIONS_V1[from] ?? []).indexOf(to) >= 0;
}

export const RESALE_LISTING_TTL_DAYS_V1 = 30;
/** A reserved listing nobody marked sold or cancelled goes back to published after this many days (not a setting). */
export const RESALE_RESERVE_TTL_DAYS_V1 = 14;
/** Conversations, offers and approval cards are deleted this many days after the listing ended. */
export const RESALE_RETENTION_DAYS_V1 = 90;
export const RESALE_DISCLOSURE_CARD_TTL_HOURS_V1 = 24;
/** Published this long without any conversation → the owner side shows the recycle list (`nudge: 'recycle'`). */
export const RESALE_NUDGE_AFTER_HOURS_V1 = 48;
export const RESALE_WANTED_TTL_DAYS_V1 = 90;
/** Code constants, not settings: raising them makes the floor easier to find out (D12). Per UTC day. */
export const RESALE_OFFER_LIMITS_V1 = { perThreadPerDay: 3, perThreadTotal: 6 } as const;
export const RESALE_THREAD_LIMITS_V1 = {
  newThreadsPerBuyerPerDay: 5,
  messagesPerSidePerDay: 20,
  messageMin: 1,
  messageMax: 500,
  /** A thread view carries at most the latest this many messages. */
  messagesInViewMax: 200,
} as const;
export const RESALE_WANTED_LIMITS_V1 = { activePerUser: 3, matchAlertsPerDay: 5 } as const;
export const RESALE_TWIN_LIMITS_V1 = {
  /** Only buyer and twin text messages, the latest this many, go to the model (D19). */
  contextTurnsMax: 6,
  replyMax: 300,
  timeoutMs: 15_000,
} as const;
/** Seller and buyer display names are cut to this length (never an email, an account id or `agentrixId`). */
export const RESALE_DISPLAY_NAME_MAX_V1 = 80;

export const RESALE_ERROR_CODES_V1 = [
  'not_found',
  'invalid_input',
  'device_assets_unavailable',
  'listing_state_changed',
  'device_reported_lost',
  'device_status_unavailable',
  'photo_invalid',
  'photo_unreadable',
  'photo_limit',
  'photo_store_unavailable',
  'draft_rejected',
  'model_unavailable',
  'model_failed',
  'daily_cap_reached',
  'message_contains_contact',
  'own_listing',
  'thread_exists',
  'thread_closed',
  'listing_not_open',
  'rate_limited',
  'card_decided',
  'card_expired',
  'wanted_limit',
  'listing_exists',
  'listing_limit',
  'asset_not_owned',
  // L3 (S18): sale receipts.
  'sale_receipt_unavailable',
  'sale_receipt_exists',
] as const;
export type ResaleErrorCodeV1 = (typeof RESALE_ERROR_CODES_V1)[number];
/** Error bodies carry `code` and this one line in both languages (a field name or a reason goes after it in brackets). */
export const RESALE_ERROR_MESSAGES_V1: Record<ResaleErrorCodeV1, string> = {
  not_found: '没有找到。 Not found.',
  invalid_input: '有一项填得不对。 One of the fields is not valid.',
  device_assets_unavailable: '「我的东西」暂时用不了，请稍后再试。 My things is unavailable right now. Please try again later.',
  listing_state_changed: '这件东西的状态刚变了，请刷新再试。 This listing just changed. Refresh and try again.',
  device_reported_lost: '这台设备登记为报失或被盗，不能出售。 This device is reported lost or stolen and cannot be sold.',
  device_status_unavailable: '暂时读不到设备状态，请稍后再试。 The device status cannot be read right now. Please try again later.',
  photo_invalid: '只收 8 MB 以内的 JPEG、PNG 或 WebP 照片。 Only JPEG, PNG or WebP photos up to 8 MB.',
  photo_unreadable: '这张照片打不开，换一张试试。 This photo cannot be read. Try another one.',
  photo_limit: '最多 4 张照片。 Up to 4 photos.',
  photo_store_unavailable: '照片暂时存不了，请稍后再试。 Photos cannot be saved right now. Please try again later.',
  draft_rejected: '这次起草的文字不能用，可以再试一次。 This draft could not be used. You can try again.',
  model_unavailable: 'AI 分身暂时用不了，请稍后再试。 The AI twin is unavailable right now. Please try again later.',
  model_failed: 'AI 分身这次没有写出来，可以再试一次。 The AI twin could not write this time. You can try again.',
  daily_cap_reached: '今天的次数用完了，明天再试。 You have used today’s allowance. Try again tomorrow.',
  message_contains_contact: '不能发链接、邮箱、电话或联系软件。 Links, email addresses, phone numbers and messaging apps cannot be sent.',
  own_listing: '这是你自己在卖的东西。 This is your own listing.',
  thread_exists: '你已经在问这件东西了。 You already have a conversation about this item.',
  thread_closed: '你已删除你在这里说的话，不能再问。 You deleted what you wrote here and cannot ask again.',
  listing_not_open: '这件东西现在不能提问。 This item is not open for questions right now.',
  rate_limited: '太频繁了，请稍后再试。 Too many tries. Please try again later.',
  card_decided: '这张卡已经处理过了。 This request has already been decided.',
  card_expired: '这张卡已经过期。 This request has expired.',
  wanted_limit: '最多同时登记 3 条「我在找」。 You can have up to 3 active wanted items.',
  listing_exists: '这件东西已经有一个没结束的挂牌。 This item already has an open listing.',
  listing_limit: '最多同时卖 20 件东西。 You can have up to 20 items for sale at the same time.',
  asset_not_owned: '只有「持有中」的东西才能卖。 Only items you still own can be sold.',
  sale_receipt_unavailable: '平台暂时签不了成交回执，请稍后再试。 The platform cannot sign sale receipts right now. Please try again later.',
  sale_receipt_exists: '这件东西已经有一张双方确认的成交回执。 This item already has a sale receipt both sides confirmed.',
};

// ── copy ──────────────────────────────────────────────────────────────────────────────────────

/** System, offer and hand-off rows store only one of these codes; clients show the words. No numbers in any of them. */
export const RESALE_SYSTEM_COPY_CODES_V1 = [
  'offer_forwarded',
  'offer_below_floor',
  'offer_accepted',
  'offer_declined',
  'offer_superseded',
  'disclosure_denied',
  'handoff',
  'reserve_cancelled',
] as const;
export type ResaleSystemCopyCodeV1 = (typeof RESALE_SYSTEM_COPY_CODES_V1)[number];
export const RESALE_SYSTEM_COPY_V1: Record<ResaleSystemCopyCodeV1, { zh: string; en: string }> = {
  offer_forwarded: { zh: '已转给主人确认', en: 'Sent to the owner to decide' },
  offer_below_floor: { zh: '这个价低于主人能接受的价格，你可以再出一个价', en: 'This offer is below what the owner can accept. You can make another offer.' },
  offer_accepted: { zh: '主人接受了这个出价', en: 'The owner accepted this offer' },
  offer_declined: { zh: '主人没有接受这个出价', en: 'The owner did not accept this offer' },
  offer_superseded: { zh: '主人已经和另一位买家约好了', en: 'The owner has agreed with another buyer' },
  disclosure_denied: { zh: '主人会再和你约', en: 'The owner will arrange this with you another way' },
  handoff: { zh: '这个问题我转给主人了', en: 'I have passed this question to the owner' },
  reserve_cancelled: { zh: '主人取消了这次约定，这件东西重新开放', en: 'The owner cancelled this arrangement. The item is open again.' },
};
/** Always on the item page and in the conversation (design 3.3 item 6). */
export const RESALE_FIXED_SAFETY_LINE_V1 = {
  zh: '当面验货、当面付款。不要预付，不要点对方发来的付款链接。',
  en: 'Inspect the item and pay in person. Do not pay in advance, and do not open payment links sent to you.',
} as const;
/** Where no recycle destination fits the category. */
export const RESALE_RECYCLE_NONE_COPY_V1 = {
  zh: '这一类没有回收报价，看看 Carousell 上同类在卖多少',
  en: 'There is no trade-in quote for this kind of item. See what similar items sell for on Carousell.',
} as const;

// ── text guard (design 5.7) ──────────────────────────────────────────────────────────────────────

/** Suffixes that make `name.suffix` a link (D21): common ones, phishing favourites and short-link domains. */
export const RESALE_LINK_TLDS_V1 = [
  'com', 'sg', 'net', 'org', 'io', 'me', 'ly', 'co', 'cc', 'top', 'xyz', 'shop', 'click',
  'link', 'info', 'biz', 'site', 'online', 'app', 'vip', 'store', 'page', 'to', 'gl', 'ws', 'my',
] as const;
/** `public`: title, description, Q&A, drafts. `message`: conversation text. `disclosure`: an approved place or time. */
export type ResaleTextGuardModeV1 = 'public' | 'message' | 'disclosure';
export type ResaleTextGuardReasonV1 = 'link' | 'email' | 'phone' | 'contact_app' | 'invisible_char' | 'control_char';
export type ResaleTextGuardResultV1 = { ok: true } | { ok: false; reason: ResaleTextGuardReasonV1 };

// Line breaks and tabs are text; every other C0 / C1 control character is refused.
// eslint-disable-next-line no-control-regex
const GUARD_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
/** Zero-width characters and direction overrides. */
const GUARD_INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]/;
const GUARD_LINK_SCHEME = /https?:\/\/|www\./i;
const GUARD_LINK_TLD = new RegExp(`[a-z0-9-]+\\.(?:${RESALE_LINK_TLDS_V1.join('|')})\\b`, 'i');
/** Any `name.letters/path`, whatever the suffix (`carousell-pay.anything/abc`). */
const GUARD_LINK_PATH = /[a-z0-9-]{2,}\.[a-z]{2,24}\/\S/i;
const GUARD_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
const GUARD_CONTACT_APP = /wa\.me|t\.me|telegram|whatsapp/i;
// A Singapore number, 8 digits starting 3, 6, 8 or 9, not inside a longer run of digits. Written without a lookbehind
// (older Safari cannot parse one): "start or a non-digit" in front is the same test.
const GUARD_PHONE_SG = /(?:^|\D)[3689]\d{3}[\s-]?\d{4}(?!\d)/;
/** `+` and a country code followed by at least 3 more digits (so "+12 个月保修" and "+128GB" pass). */
const GUARD_PHONE_INTL = /\+\d{1,3}[\s-]?\d{3,}/;
/** Ten or more digits in a row, checked on the original text (spaces are not removed first). */
const GUARD_PHONE_LONG = /\d{10,}/;

/**
 * Refuses what opens the door to off-platform scams: links in all three modes; email addresses, phone numbers and
 * messaging-app handles in `public` and `message` (an approved disclosure may be an address or a number, so it only
 * gets the link and invisible-character rules). Case does not matter. `paynow` passes: paying in person by PayNow is
 * normal; a number or a link next to it is still refused. Known false positive: "box.me" without a space.
 */
export function resaleTextGuardV1(text: string, mode: ResaleTextGuardModeV1): ResaleTextGuardResultV1 {
  if (typeof text !== 'string' || GUARD_CONTROL.test(text)) return { ok: false, reason: 'control_char' };
  if (GUARD_INVISIBLE.test(text)) return { ok: false, reason: 'invisible_char' };
  const personal = mode === 'public' || mode === 'message';
  if (personal && GUARD_EMAIL.test(text)) return { ok: false, reason: 'email' };
  if (personal && GUARD_CONTACT_APP.test(text)) return { ok: false, reason: 'contact_app' };
  if (GUARD_LINK_SCHEME.test(text) || GUARD_LINK_TLD.test(text) || GUARD_LINK_PATH.test(text)) return { ok: false, reason: 'link' };
  if (personal && (GUARD_PHONE_SG.test(text) || GUARD_PHONE_INTL.test(text) || GUARD_PHONE_LONG.test(text))) return { ok: false, reason: 'phone' };
  return { ok: true };
}

// ── payment safety hint (D21) ────────────────────────────────────────────────────────────────────

/** Matched as lower-case substrings. They only trigger the hint; the text guard decides what is refused. */
export const RESALE_PAYMENT_HINT_TERMS_V1 = [
  'paynow',
  'pay now',
  'paylah',
  '转账',
  '转帐',
  '轉賬',
  '轉帳',
  'bank transfer',
  'transfer money',
  '汇款',
  '匯款',
  '打款',
  '预付',
  '預付',
  'prepay',
  'pre-pay',
  'pay in advance',
  'advance payment',
  '定金',
  '订金',
  '訂金',
  'deposit',
] as const;
export const RESALE_PAYMENT_SAFETY_HINT_V1 = {
  zh: '当面验货以后再付款，不要提前转账或付定金。',
  en: 'Check the item in person before you pay. Do not transfer money or pay a deposit in advance.',
} as const;
/**
 * Whether a message talks about paying. Pure, no model. Views mark only the earliest matching text message of a
 * thread (`paymentSafetyHint: true`), so buyer and seller each see the hint once, in the same place.
 */
export function resalePaymentHintV1(text: string): boolean {
  if (typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return RESALE_PAYMENT_HINT_TERMS_V1.some((term) => lower.indexOf(term) >= 0);
}

// ── twin reply guard (D23) ───────────────────────────────────────────────────────────────────────

/** A currency sign or code followed by a number, or a number followed by a currency word. */
export const RESALE_TWIN_MONEY_PATTERN_V1 =
  /(?:S\$|US\$|\$|SGD|USD|RM|¥|￥)\s?\d|\d[\d,.]*\s?(?:元|块|新币|新元|刀|dollars?|bucks|sgd)(?![a-z])/i;
/** Words that bargain or promise (the 24 listed in design review round 3, M1). Lower-case substrings. */
export const RESALE_TWIN_COMMITMENT_TERMS_V1 = [
  '便宜', '优惠', '打折', '折扣', '降价', '让价', '可以给你', '留给你', '给你留', '答应', '保证', '成交', '最低',
  'deal', 'discount', 'cheaper', 'lower price', 'promise', 'guarantee', 'hold it', 'reserve it', 'accept', 'agreed', 'lowest',
] as const;
export type ResaleTwinReplyGuardResultV1 = { ok: true } | { ok: false; reason: ResaleTextGuardReasonV1 | 'money' | 'commitment' };
/**
 * A twin reply goes out only if it passes the message guard, names no amount at all and uses none of the bargaining
 * words; otherwise it is dropped and the buyer gets a hand-off. Checked here, not left to the system prompt. A false
 * positive ("accepts USB-C") is a hand-off, which is the safe way to fail.
 */
export function resaleTwinReplyGuardV1(text: string): ResaleTwinReplyGuardResultV1 {
  const base = resaleTextGuardV1(text, 'message');
  if (base.ok === false) return base;
  if (RESALE_TWIN_MONEY_PATTERN_V1.test(text)) return { ok: false, reason: 'money' };
  const lower = text.toLowerCase();
  if (RESALE_TWIN_COMMITMENT_TERMS_V1.some((term) => lower.indexOf(term) >= 0)) return { ok: false, reason: 'commitment' };
  return { ok: true };
}

// ── offers ──────────────────────────────────────────────────────────────────────────────────────

/** Decided by code, never by a model: at or above the floor goes to the owner, below it is declined automatically. */
export function resaleOfferVerdictV1(amountMinor: number, floorMinor: number): 'forward' | 'below_floor' {
  return amountMinor >= floorMinor ? 'forward' : 'below_floor';
}

// ── recycle list (design 5.4, D11) ──────────────────────────────────────────────────────────────

/** The categories a recycle list is ever shown for; other categories get `RESALE_RECYCLE_NONE_COPY_V1`. */
export const RESALE_RECYCLE_CATEGORIES_V1 = ['phone', 'tablet', 'laptop', 'camera', 'wearable'] as const;
export interface ResaleRecycleDestinationV1 {
  id: string;
  name: string;
  /** A public quote page. Opened in a new window with `rel="noopener noreferrer"`, never with parameters. */
  url: string;
  categories: readonly ResaleCategoryV1[];
  note: { zh: string; en: string };
}
/** First five (D11); URLs checked as public pages on 2026-10-29. Staging only until the lawyer has seen it. */
export const RESALE_RECYCLE_DESTINATIONS_V1: readonly ResaleRecycleDestinationV1[] = [
  {
    id: 'carousell',
    name: 'Sell to Carousell',
    url: 'https://sellto.carousell.sg/',
    categories: ['phone', 'tablet', 'laptop'],
    note: { zh: 'Carousell 的回收服务：网上先估价，再到合作门店交机', en: "Carousell's trade-in service: get a quote online, then drop the device at a partner store" },
  },
  {
    id: 'apple_trade_in',
    name: 'Apple Trade In',
    url: 'https://www.apple.com/sg/trade-in/',
    categories: ['phone', 'tablet', 'laptop', 'wearable'],
    note: { zh: '苹果官方以旧换新，只收苹果设备', en: "Apple's own trade-in, Apple devices only" },
  },
  {
    id: 'samsung_trade_in',
    name: 'Samsung Trade-In',
    url: 'https://www.samsung.com/sg/trade-in/',
    categories: ['phone', 'tablet', 'wearable'],
    note: { zh: '三星以旧换新，买新三星设备时抵扣', en: 'Samsung trade-in, credited when you buy a new Samsung device' },
  },
  {
    id: 'mobilerelation',
    name: 'MobileRelation',
    url: 'https://mobilerelation.com.sg/trade-in/',
    categories: ['phone'],
    note: { zh: '手机回收店：网上估价，门店验机后付款', en: 'Phone buyback shop: quote online, paid in store after a check' },
  },
  {
    id: 'compasia',
    name: 'CompAsia',
    url: 'https://compasia.sg/',
    categories: ['phone', 'tablet'],
    note: { zh: '二手设备回收商，网上或合作门店估价', en: 'Used-device trade-in, quotes online or at partner stores' },
  },
];
export function resaleRecycleDestinationsForV1(category: ResaleCategoryV1): ResaleRecycleDestinationV1[] {
  if ((RESALE_RECYCLE_CATEGORIES_V1 as readonly string[]).indexOf(category) < 0) return [];
  return RESALE_RECYCLE_DESTINATIONS_V1.filter((destination) => destination.categories.indexOf(category) >= 0);
}

export type ResaleRecycleQuoteResultV1 = { ok: true; value: DeviceAssetRecycleQuoteInputV1 } | { ok: false; code: 'invalid_input'; field: string };
/** `POST /device-assets/items/:assetRef/recycle-quote`: a known destination, an amount, a day not after today. */
export function validateResaleRecycleQuoteInputV1(value: unknown, options: { today?: string } = {}): ResaleRecycleQuoteResultV1 {
  const bad = (field: string): ResaleRecycleQuoteResultV1 => ({ ok: false, code: 'invalid_input', field });
  const today = options.today ?? deviceAssetsTodayV1();
  if (!deviceAssetsShapeV1.isRecord(value)) return bad('$');
  for (const key of Object.keys(value)) if (key !== 'destinationId' && key !== 'amount' && key !== 'quotedOn') return bad(key);
  const id = value.destinationId;
  if (typeof id !== 'string' || !RESALE_RECYCLE_DESTINATIONS_V1.some((destination) => destination.id === id)) return bad('destinationId');
  const amount = value.amount;
  if (!isDeviceAssetMoneyV1(amount)) return bad('amount');
  const quotedOn = value.quotedOn;
  if (!isIsoDateV1(quotedOn) || quotedOn > today) return bad('quotedOn');
  return { ok: true, value: { destinationId: id, amount: { amountMinor: amount.amountMinor, currency: amount.currency }, quotedOn } };
}

// ── platform drafts (design 5.4) ────────────────────────────────────────────────────────────────

export type ResalePlatformV1 = 'carousell' | 'facebook';
export type ResaleLangV1 = 'zh' | 'en';
/** `S$650`, `S$650.50`. */
export function formatResaleSgdV1(amountMinor: number): string {
  const whole = Math.floor(amountMinor / 100);
  const cents = amountMinor % 100;
  return cents === 0 ? `S$${whole}` : `S$${whole}.${cents < 10 ? `0${cents}` : cents}`;
}
const DRAFT_TITLE_MAX: Record<ResalePlatformV1, number> = { carousell: 80, facebook: 100 };
function scrubDraftText(text: string): string {
  return text
    .replace(/agentrix|yowo/gi, '')
    .replace(/@/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
/**
 * Text the owner copies into another platform by hand. Pure, run in the browser; the server has no route for it. Order:
 * condition, price, area, handover, description. Never a link, an email, a phone number or our name: the title and
 * description go out only if they pass the public text guard, and our names and `@` are removed anyway.
 */
export function buildResalePlatformDraftV1(
  listing: Pick<ResaleListingPublicV1, 'title' | 'description' | 'category' | 'condition' | 'asking' | 'area' | 'handover'>,
  platform: ResalePlatformV1,
  lang: ResaleLangV1,
): { title: string; body: string } {
  const safe = (text: string | null): string => (text && resaleTextGuardV1(text, 'public').ok ? scrubDraftText(text) : '');
  const title = (safe(listing.title) || RESALE_CATEGORY_COPY_V1[listing.category][lang]).slice(0, DRAFT_TITLE_MAX[platform]);
  const labels = lang === 'zh'
    ? { condition: '成色', price: '要价', area: '区域', handover: '交收方式' }
    : { condition: 'Condition', price: 'Price', area: 'Area', handover: 'Handover' };
  const sep = lang === 'zh' ? '：' : ': ';
  const lines = [
    `${labels.condition}${sep}${DEVICE_ASSET_CONDITION_COPY_V1[listing.condition][lang]}`,
    `${labels.price}${sep}${formatResaleSgdV1(listing.asking.amountMinor)}`,
    `${labels.area}${sep}${RESALE_AREA_COPY_V1[listing.area][lang]}`,
    `${labels.handover}${sep}${RESALE_HANDOVER_COPY_V1[listing.handover][lang]}`,
  ];
  const description = safe(listing.description);
  return { title, body: description ? `${lines.join('\n')}\n\n${description}` : lines.join('\n') };
}

// ── views ───────────────────────────────────────────────────────────────────────────────────────

export interface ResaleMoneySgdV1 {
  amountMinor: number;
  currency: 'SGD';
}
export interface ResaleFaqItemV1 {
  q: string;
  a: string;
}
export interface ResalePhotoV1 {
  photoId: string;
  /** Same-origin path or https URL of the re-encoded JPEG (no metadata). */
  url: string;
}
export type ResalePickupPointStateV1 = 'none' | 'sealed' | 'unreadable';

/** The owner's own listing. The only view with the floor and the preset pickup point. */
export interface ResaleListingOwnerViewV1 {
  schemaVersion: 1;
  listingRef: string;
  assetRef: string;
  status: ResaleListingStatusV1;
  /** A draft may not have these yet; publishing requires them. */
  title: string | null;
  description: string | null;
  category: ResaleCategoryV1;
  condition: DeviceAssetConditionV1;
  asking: ResaleMoneySgdV1 | null;
  floor: ResaleMoneySgdV1 | null;
  area: ResaleAreaV1 | null;
  handover: ResaleHandoverV1 | null;
  faq: ResaleFaqItemV1[];
  photos: ResalePhotoV1[];
  /** The owner allowed the twin to answer on this item (D7). */
  twinReplies: boolean;
  pickupPointState: ResalePickupPointStateV1;
  /** Only when `pickupPointState` is `sealed`. */
  pickupPoint: string | null;
  sellerLabel: string;
  blockedContactAttempts: number;
  publishedAt: string | null;
  expiresAt: string | null;
  reservedAt: string | null;
  closedAt: string | null;
  sold: ResaleMoneySgdV1 | null;
  /** `recycle`: published 48 hours without a conversation, show the recycle list. Never pushed, never stored. */
  nudge: 'recycle' | null;
  createdAt: string;
  updatedAt: string;
}
export interface ResaleListingOwnerListV1 {
  schemaVersion: 1;
  items: ResaleListingOwnerViewV1[];
}
/** The item page. No floor, no pickup point, no private fields, no account id, no `seller_agent_id`: the type has no room. */
export interface ResaleListingPublicV1 {
  schemaVersion: 1;
  listingRef: string;
  status: ResaleListingOpenStatusV1;
  title: string;
  description: string | null;
  category: ResaleCategoryV1;
  condition: DeviceAssetConditionV1;
  asking: ResaleMoneySgdV1;
  area: ResaleAreaV1;
  handover: ResaleHandoverV1;
  photos: ResalePhotoV1[];
  faq: ResaleFaqItemV1[];
  /** Public card name, else a nickname without `@`, else "Agentrix 用户 / Agentrix user". */
  sellerLabel: string;
  /** "<seller>'s AI twin" when the twin answers on this item, otherwise `null`. */
  authorLabel: string | null;
  publishedAt: string;
  expiresAt: string;
}

/** `GET /resale/public/listings/:listingRef/my-thread`; 404 means "no conversation you can open". */
export type ResaleMyThreadV1 = { role: 'buyer'; threadRef: string; status: 'open' | 'closed' } | { role: 'owner' };

export const RESALE_OFFER_STATUSES_V1 = ['none', 'pending', 'declined_auto', 'accepted', 'declined', 'superseded'] as const;
export type ResaleOfferStatusV1 = (typeof RESALE_OFFER_STATUSES_V1)[number];
export const RESALE_MESSAGE_AUTHORS_V1 = ['buyer', 'owner', 'twin', 'system'] as const;
export type ResaleMessageAuthorV1 = (typeof RESALE_MESSAGE_AUTHORS_V1)[number];
export const RESALE_MESSAGE_KINDS_V1 = ['text', 'offer', 'offer_decision', 'disclosure', 'handoff', 'system'] as const;
export type ResaleMessageKindV1 = (typeof RESALE_MESSAGE_KINDS_V1)[number];
export const RESALE_DISCLOSURE_FIELDS_V1 = ['pickup_point', 'meetup_time'] as const;
export type ResaleDisclosureFieldV1 = (typeof RESALE_DISCLOSURE_FIELDS_V1)[number];
export const RESALE_THREAD_STATUSES_V1 = ['open', 'blocked', 'closed'] as const;
export type ResaleThreadStatusV1 = (typeof RESALE_THREAD_STATUSES_V1)[number];
export const RESALE_DISCLOSURE_CARD_STATUSES_V1 = ['pending', 'approved', 'denied', 'expired'] as const;
export type ResaleDisclosureCardStatusV1 = (typeof RESALE_DISCLOSURE_CARD_STATUSES_V1)[number];
export const RESALE_WANTED_STATUSES_V1 = ['active', 'paused', 'expired'] as const;
export type ResaleWantedStatusV1 = (typeof RESALE_WANTED_STATUSES_V1)[number];

export interface ResaleBuyerMessageV1 {
  author: ResaleMessageAuthorV1;
  kind: ResaleMessageKindV1;
  /** ISO time. */
  at: string;
  /** Only on `text` / `disclosure` rows, opened. */
  text?: string;
  /** A `text` / `disclosure` row that cannot be opened; then there is no `text`. */
  unreadable?: true;
  /** Only on the other kinds. */
  code?: ResaleSystemCopyCodeV1;
  /** Only on `offer` rows (this buyer's own offer). */
  amountMinor?: number;
  /** Only on `disclosure` rows. */
  disclosureField?: ResaleDisclosureFieldV1;
  /** D21: on the earliest text message of the thread that talks about paying, and on no other. */
  paymentSafetyHint?: true;
}
/** The owner sees the same message shape (every message of the thread, offers included). */
export type ResaleOwnerMessageV1 = ResaleBuyerMessageV1;
export interface ResalePendingDisclosureV1 {
  cardRef: string;
  field: ResaleDisclosureFieldV1;
  requestedAt: string;
  expiresAt: string;
}
export interface ResaleThreadOfferV1 {
  status: ResaleOfferStatusV1;
  amountMinor: number | null;
  currency: 'SGD';
}
/** The buyer's own conversation. No floor, preset pickup point, account ids, `seller_agent_id` or message row ids. */
export interface ResaleThreadBuyerViewV1 {
  schemaVersion: 1;
  threadRef: string;
  listingRef: string;
  listingStatus: ResaleListingOpenStatusV1;
  status: 'open' | 'closed';
  sellerLabel: string;
  /** "<seller>'s AI twin"; `null` when the twin does not answer on this item. */
  twinLabel: string | null;
  /** Oldest first, the latest 200 at most. */
  messages: ResaleBuyerMessageV1[];
  offer: ResaleThreadOfferV1;
  /** From `RESALE_OFFER_LIMITS_V1` and the thread's counters; never below 0. */
  offerAllowance: { todayRemaining: number; totalRemaining: number };
  /** Without values. */
  pendingDisclosures: ResalePendingDisclosureV1[];
}
export interface ResaleThreadOwnerViewV1 {
  schemaVersion: 1;
  threadRef: string;
  listingRef: string;
  listingStatus: ResaleListingStatusV1;
  status: ResaleThreadStatusV1;
  /** A nickname without `@`, else "Agentrix 用户"; "已删除的账号 / Deleted account" after the buyer deleted the account. */
  buyerLabel: string;
  messages: ResaleOwnerMessageV1[];
  offer: ResaleThreadOfferV1;
  pendingDisclosures: ResalePendingDisclosureV1[];
  createdAt: string;
  updatedAt: string;
}
export interface ResaleOwnerThreadListV1 {
  schemaVersion: 1;
  items: ResaleThreadOwnerViewV1[];
}
/** An approval card as the owner sees it: no value until the owner gives one. */
export interface ResaleDisclosureCardOwnerViewV1 {
  cardRef: string;
  listingRef: string;
  listingTitle: string;
  threadRef: string;
  buyerLabel: string;
  field: ResaleDisclosureFieldV1;
  status: ResaleDisclosureCardStatusV1;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
}
export interface ResaleDisclosureCardListV1 {
  schemaVersion: 1;
  items: ResaleDisclosureCardOwnerViewV1[];
}
/** "I'm looking for": no free text at all (nothing about children or addresses can be typed in). */
export interface ResaleWantedV1 {
  wantedRef: string;
  category: ResaleCategoryV1;
  maxPrice: ResaleMoneySgdV1 | null;
  area: ResaleAreaV1 | null;
  status: ResaleWantedStatusV1;
  expiresAt: string;
  createdAt: string;
}
export interface ResaleWantedMatchV1 {
  wantedRef: string;
  listingRef: string;
  title: string;
  asking: ResaleMoneySgdV1;
  area: ResaleAreaV1;
  matchedAt: string;
}
export interface ResaleWantedListV1 {
  schemaVersion: 1;
  items: ResaleWantedV1[];
  matches: ResaleWantedMatchV1[];
}
/** The only thing the twin reply service accepts: the public view and buyer / twin text turns, never the owner's words. */
export interface ResaleTwinContextV1 {
  listing: ResaleListingPublicV1;
  /** The latest 6 at most, oldest first. */
  turns: { author: 'buyer' | 'twin'; text: string }[];
}

/** The seller's unread badge: buyer messages after the seller's last own message (no stored read state). */
export function resaleOwnerUnreadCountV1(view: Pick<ResaleThreadOwnerViewV1, 'messages'>): number {
  let count = 0;
  for (const message of view.messages) {
    if (message.author === 'owner') count = 0;
    else if (message.author === 'buyer') count += 1;
  }
  return count;
}

// ── owner inputs (design 5.3) ───────────────────────────────────────────────────────────────────

/** `PATCH /resale/listings/:listingRef`: only the keys sent change; `null` clears a field. Texts are trimmed. */
export interface ResaleListingPatchV1 {
  title?: string | null;
  description?: string | null;
  condition?: DeviceAssetConditionV1;
  asking?: ResaleMoneySgdV1 | null;
  floor?: ResaleMoneySgdV1 | null;
  area?: ResaleAreaV1 | null;
  handover?: ResaleHandoverV1 | null;
  faq?: ResaleFaqItemV1[];
  twinReplies?: boolean;
  pickupPoint?: string | null;
}
/** `guard` is set when a text was refused by the text guard (the server answers 400 `message_contains_contact`). */
export type ResaleInputResultV1<T> = { ok: true; value: T } | { ok: false; field: string; guard?: ResaleTextGuardReasonV1 };
export interface ResaleDraftTextInputV1 {
  lang: ResaleLangV1;
  note?: string;
}
export interface ResaleMarkSoldInputV1 {
  soldPrice?: ResaleMoneySgdV1;
  /** The conversation it was sold through (one of this listing's); without `soldPrice`, an accepted offer's amount is used. */
  threadRef?: string;
}
/** `POST …/threads` and `POST /resale/threads/:threadRef/messages`: one message, 1–500 characters, message text guard. */
export interface ResaleMessageInputV1 {
  message: string;
}
/** `POST /resale/threads/:threadRef/offer`: SGD, at least S$1 and at most the asking price. */
export interface ResaleOfferInputV1 {
  amount: ResaleMoneySgdV1;
}
/** `POST /resale/threads/:threadRef/offer/decision` (the owner). */
export interface ResaleOfferDecisionInputV1 {
  decision: 'accept' | 'decline';
}
/** `POST /resale/threads/:threadRef/disclosure-requests` (the buyer): which one to ask for; nothing else is accepted. */
export interface ResaleDisclosureRequestInputV1 {
  field: ResaleDisclosureFieldV1;
}
/**
 * `POST /resale/disclosure-cards/:cardRef/decision` (the owner): this one card only. There is no "always allow": no key
 * for it exists, and any key but these two is refused. `value` only with `approve` (at most 120 characters, the
 * disclosure text guard); without it the listing's preset pickup point is used (pickup point cards only).
 */
export interface ResaleDisclosureDecisionInputV1 {
  decision: 'approve' | 'deny';
  value?: string;
}
/** What the twin wrote; only shown to the owner, saved only when the owner uses it. */
export interface ResaleDraftTextV1 {
  schemaVersion: 1;
  title: string;
  description: string;
}

function inputRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sgd(value: unknown, min: number): ResaleMoneySgdV1 | null {
  if (!inputRecord(value) || Object.keys(value).some((key) => key !== 'amountMinor' && key !== 'currency')) return null;
  const amount = value.amountMinor;
  if (value.currency !== 'SGD' || typeof amount !== 'number' || !Number.isInteger(amount)) return null;
  return amount >= min && amount <= RESALE_LISTING_LIMITS_V1.askingMinorMax ? { amountMinor: amount, currency: 'SGD' } : null;
}
type TextCheck = { ok: true; value: string | null } | { ok: false; guard?: ResaleTextGuardReasonV1 };
function guardedText(value: unknown, options: { min: number; max: number; mode: ResaleTextGuardModeV1; nullable: boolean }): TextCheck {
  if (value === null) return options.nullable ? { ok: true, value: null } : { ok: false };
  if (typeof value !== 'string') return { ok: false };
  const text = value.trim();
  if (text.length === 0 && options.nullable && options.min <= 1) return { ok: true, value: null };
  if (text.length < options.min || text.length > options.max) return { ok: false };
  const guard = resaleTextGuardV1(text, options.mode);
  return guard.ok === false ? { ok: false, guard: guard.reason } : { ok: true, value: text };
}

const PATCH_KEYS = ['title', 'description', 'condition', 'asking', 'floor', 'area', 'handover', 'faq', 'twinReplies', 'pickupPoint'] as const;
/** Checks one listing edit: lengths and enums first, then the text guard (public texts; the pickup point as a disclosure). */
export function validateResaleListingPatchV1(value: unknown): ResaleInputResultV1<ResaleListingPatchV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if ((PATCH_KEYS as readonly string[]).indexOf(key) < 0) return { ok: false, field: key };
  const limits = RESALE_LISTING_LIMITS_V1;
  const out: ResaleListingPatchV1 = {};
  const texts: Array<[keyof ResaleListingPatchV1, { min: number; max: number; mode: ResaleTextGuardModeV1 }]> = [
    ['title', { min: limits.titleMin, max: limits.titleMax, mode: 'public' }],
    ['description', { min: 1, max: limits.descriptionMax, mode: 'public' }],
    ['pickupPoint', { min: 1, max: limits.pickupPointMax, mode: 'disclosure' }],
  ];
  for (const [key, options] of texts) {
    if (value[key] === undefined) continue;
    const checked = guardedText(value[key], { ...options, nullable: true });
    if (checked.ok === false) return { ok: false, field: key, guard: checked.guard };
    (out as unknown as Record<string, unknown>)[key] = checked.value;
  }
  if (value.condition !== undefined) {
    if ((DEVICE_ASSET_CONDITIONS_V1 as readonly unknown[]).indexOf(value.condition) < 0) return { ok: false, field: 'condition' };
    out.condition = value.condition as DeviceAssetConditionV1;
  }
  for (const key of ['asking', 'floor'] as const) {
    if (value[key] === undefined) continue;
    if (value[key] === null) {
      out[key] = null;
      continue;
    }
    const money = sgd(value[key], key === 'asking' ? limits.askingMinorMin : limits.floorMinorMin);
    if (!money) return { ok: false, field: key };
    out[key] = money;
  }
  if (out.asking && out.floor && out.floor.amountMinor > out.asking.amountMinor) return { ok: false, field: 'floor' };
  if (value.area !== undefined) {
    if (value.area !== null && (RESALE_AREAS_V1 as readonly unknown[]).indexOf(value.area) < 0) return { ok: false, field: 'area' };
    out.area = value.area as ResaleAreaV1 | null;
  }
  if (value.handover !== undefined) {
    if (value.handover !== null && (RESALE_HANDOVERS_V1 as readonly unknown[]).indexOf(value.handover) < 0) return { ok: false, field: 'handover' };
    out.handover = value.handover as ResaleHandoverV1 | null;
  }
  if (value.twinReplies !== undefined) {
    if (typeof value.twinReplies !== 'boolean') return { ok: false, field: 'twinReplies' };
    out.twinReplies = value.twinReplies;
  }
  if (value.faq !== undefined) {
    if (!Array.isArray(value.faq) || value.faq.length > limits.faqMax) return { ok: false, field: 'faq' };
    const faq: ResaleFaqItemV1[] = [];
    for (const item of value.faq) {
      if (!inputRecord(item) || Object.keys(item).some((key) => key !== 'q' && key !== 'a')) return { ok: false, field: 'faq' };
      const q = guardedText(item.q, { min: 1, max: limits.faqQuestionMax, mode: 'public', nullable: false });
      if (q.ok === false) return { ok: false, field: 'faq', guard: q.guard };
      const a = guardedText(item.a, { min: 1, max: limits.faqAnswerMax, mode: 'public', nullable: false });
      if (a.ok === false) return { ok: false, field: 'faq', guard: a.guard };
      faq.push({ q: q.value as string, a: a.value as string });
    }
    out.faq = faq;
  }
  return { ok: true, value: out };
}

/** `POST …/publish`: the owner confirms all three, every time. */
export function validateResalePublishInputV1(value: unknown): ResaleInputResultV1<true> {
  if (!inputRecord(value) || Object.keys(value).some((key) => key !== 'declarations')) return { ok: false, field: 'declarations' };
  const d = value.declarations;
  if (!inputRecord(d)) return { ok: false, field: 'declarations' };
  const declared: Record<string, unknown> = d;
  const keys = ['notProhibited', 'ownItem', 'notReportedLost'];
  if (Object.keys(declared).length !== keys.length || keys.some((key) => declared[key] !== true)) return { ok: false, field: 'declarations' };
  return { ok: true, value: true };
}

/** `POST …/draft-text`: the language and one optional line from the owner (public text guard). */
export function validateResaleDraftTextInputV1(value: unknown): ResaleInputResultV1<ResaleDraftTextInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'lang' && key !== 'note') return { ok: false, field: key };
  const lang = value.lang;
  if (lang !== 'zh' && lang !== 'en') return { ok: false, field: 'lang' };
  if (value.note === undefined || value.note === null) return { ok: true, value: { lang } };
  const note = guardedText(value.note, { min: 1, max: RESALE_LISTING_LIMITS_V1.draftNoteMax, mode: 'public', nullable: true });
  if (note.ok === false) return { ok: false, field: 'note', guard: note.guard };
  return { ok: true, value: note.value === null ? { lang } : { lang, note: note.value } };
}

/** `POST …/mark-sold`: optionally the price it went for and the conversation it was sold through. */
export function validateResaleMarkSoldInputV1(value: unknown): ResaleInputResultV1<ResaleMarkSoldInputV1> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'soldPrice' && key !== 'threadRef') return { ok: false, field: key };
  const out: ResaleMarkSoldInputV1 = {};
  if (value.soldPrice !== undefined) {
    const money = sgd(value.soldPrice, 0);
    if (!money) return { ok: false, field: 'soldPrice' };
    out.soldPrice = money;
  }
  if (value.threadRef !== undefined) {
    if (typeof value.threadRef !== 'string' || !RESALE_THREAD_REF_PATTERN_V1.test(value.threadRef)) return { ok: false, field: 'threadRef' };
    out.threadRef = value.threadRef;
  }
  return { ok: true, value: out };
}

/** One conversation message: trimmed, 1–500 characters, the `message` text guard (`guard` set when it refused). */
export function validateResaleMessageInputV1(value: unknown): ResaleInputResultV1<ResaleMessageInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'message') return { ok: false, field: key };
  const checked = guardedText(value.message, { min: RESALE_THREAD_LIMITS_V1.messageMin, max: RESALE_THREAD_LIMITS_V1.messageMax, mode: 'message', nullable: false });
  if (checked.ok === false) return { ok: false, field: 'message', guard: checked.guard };
  return { ok: true, value: { message: checked.value as string } };
}

/** An offer: SGD, at least `askingMinorMin` and at most this listing's asking price. */
export function validateResaleOfferInputV1(value: unknown, askingMinor: number): ResaleInputResultV1<ResaleOfferInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'amount') return { ok: false, field: key };
  const money = sgd(value.amount, RESALE_LISTING_LIMITS_V1.askingMinorMin);
  if (!money || money.amountMinor > askingMinor) return { ok: false, field: 'amount' };
  return { ok: true, value: { amount: money } };
}

/** The owner's answer to the pending offer. */
export function validateResaleOfferDecisionInputV1(value: unknown): ResaleInputResultV1<ResaleOfferDecisionInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'decision') return { ok: false, field: key };
  if (value.decision !== 'accept' && value.decision !== 'decline') return { ok: false, field: 'decision' };
  return { ok: true, value: { decision: value.decision } };
}

/** The buyer asks for the pickup point or a meeting time: `field` only. */
export function validateResaleDisclosureRequestInputV1(value: unknown): ResaleInputResultV1<ResaleDisclosureRequestInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'field') return { ok: false, field: key };
  const field = value.field;
  if (typeof field !== 'string' || (RESALE_DISCLOSURE_FIELDS_V1 as readonly string[]).indexOf(field) < 0) return { ok: false, field: 'field' };
  return { ok: true, value: { field: field as ResaleDisclosureFieldV1 } };
}

/**
 * The owner's answer to one card: `decision`, and with `approve` an optional `value` (trimmed, 1–120 characters, the
 * `disclosure` guard: an address or a number may pass, a link may not). Any other key (`always`, `remember`, …) is refused.
 */
export function validateResaleDisclosureDecisionInputV1(value: unknown): ResaleInputResultV1<ResaleDisclosureDecisionInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'decision' && key !== 'value') return { ok: false, field: key };
  if (value.decision !== 'approve' && value.decision !== 'deny') return { ok: false, field: 'decision' };
  if (value.value === undefined || value.value === null) return { ok: true, value: { decision: value.decision } };
  if (value.decision === 'deny') return { ok: false, field: 'value' };
  const checked = guardedText(value.value, { min: 1, max: RESALE_LISTING_LIMITS_V1.pickupPointMax, mode: 'disclosure', nullable: false });
  if (checked.ok === false) return { ok: false, field: 'value', guard: checked.guard };
  return { ok: true, value: { decision: 'approve', value: checked.value as string } };
}

/**
 * `POST /resale/wanted`: what kind of thing, and optionally the most you would pay (SGD, S$1–S$10,000) and an area.
 * There is no free text at all: any other key (`note`, `title`, …) is refused.
 */
export interface ResaleWantedInputV1 {
  category: ResaleCategoryV1;
  maxPrice: ResaleMoneySgdV1 | null;
  area: ResaleAreaV1 | null;
}
export function validateResaleWantedInputV1(value: unknown): ResaleInputResultV1<ResaleWantedInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'category' && key !== 'maxPrice' && key !== 'area') return { ok: false, field: key };
  const category = value.category;
  if (typeof category !== 'string' || (RESALE_CATEGORIES_V1 as readonly string[]).indexOf(category) < 0) return { ok: false, field: 'category' };
  let maxPrice: ResaleMoneySgdV1 | null = null;
  if (value.maxPrice !== undefined && value.maxPrice !== null) {
    maxPrice = sgd(value.maxPrice, RESALE_LISTING_LIMITS_V1.askingMinorMin);
    if (!maxPrice) return { ok: false, field: 'maxPrice' };
  }
  let area: ResaleAreaV1 | null = null;
  if (value.area !== undefined && value.area !== null) {
    if ((RESALE_AREAS_V1 as readonly unknown[]).indexOf(value.area) < 0) return { ok: false, field: 'area' };
    area = value.area as ResaleAreaV1;
  }
  return { ok: true, value: { category: category as ResaleCategoryV1, maxPrice, area } };
}
/** Said wherever "I'm looking for" is offered (design 5.6): who can set off an alert, and who cannot. */
export const RESALE_WANTED_WHO_COPY_V1 = {
  zh: '只有你通过交换名片或账号确认过的人，他们卖东西时你才会收到提醒；你手动记下的人不算。卖家看不到你在找什么。',
  en: 'You are only told when someone you confirmed by exchanging cards or by their account sells something; people you wrote down by hand do not count. Sellers cannot see what you are looking for.',
} as const;

// ── decoding (web, mobile) ──────────────────────────────────────────────────────────────────────

export type ResaleDecodeResultV1<T> = { ok: true; value: T } | { ok: false; field: string };
type Check = DeviceAssetsShapeCheckV1;
const S = deviceAssetsShapeV1;
const LABEL: Check = S.text(120);
const MONEY_SGD: Check = S.object({ amountMinor: S.int(0, RESALE_LISTING_LIMITS_V1.askingMinorMax), currency: S.literal('SGD') });
const PHOTO: Check = S.object({
  photoId: S.pattern(RESALE_PHOTO_ID_PATTERN_V1),
  url: (v) => typeof v === 'string' && v.length <= 500 && /^(?:https:\/\/|\/)[^\s"'<>]*$/.test(v),
});
const FAQ: Check = S.object({ q: S.text(RESALE_LISTING_LIMITS_V1.faqQuestionMax), a: S.text(RESALE_LISTING_LIMITS_V1.faqAnswerMax) });
const PENDING_DISCLOSURE: Check = S.object({
  cardRef: S.pattern(RESALE_DISCLOSURE_CARD_REF_PATTERN_V1),
  field: S.oneOf(RESALE_DISCLOSURE_FIELDS_V1),
  requestedAt: S.isoTime,
  expiresAt: S.isoTime,
});
const OFFER: Check = S.object({
  status: S.oneOf(RESALE_OFFER_STATUSES_V1),
  amountMinor: S.nullable(S.int(0, RESALE_LISTING_LIMITS_V1.askingMinorMax)),
  currency: S.literal('SGD'),
});
const MESSAGE_SHAPE: Check = S.object(
  { author: S.oneOf(RESALE_MESSAGE_AUTHORS_V1), kind: S.oneOf(RESALE_MESSAGE_KINDS_V1), at: S.isoTime },
  {
    text: S.text(RESALE_THREAD_LIMITS_V1.messageMax),
    unreadable: S.literal(true),
    code: S.oneOf(RESALE_SYSTEM_COPY_CODES_V1),
    amountMinor: S.int(0, RESALE_LISTING_LIMITS_V1.askingMinorMax),
    disclosureField: S.oneOf(RESALE_DISCLOSURE_FIELDS_V1),
    paymentSafetyHint: S.literal(true),
  },
);
/** Shape, then which optional keys go with which kind. */
const MESSAGE: Check = (v) => {
  if (!MESSAGE_SHAPE(v)) return false;
  const m = v as ResaleBuyerMessageV1;
  const has = (key: keyof ResaleBuyerMessageV1): boolean => Object.prototype.hasOwnProperty.call(m, key);
  const freeText = m.kind === 'text' || m.kind === 'disclosure';
  if (freeText) {
    if (has('text') === has('unreadable') || has('code') || has('amountMinor')) return false;
    if (has('disclosureField') !== (m.kind === 'disclosure')) return false;
    return !has('paymentSafetyHint') || m.kind === 'text';
  }
  if (has('text') || has('unreadable') || has('disclosureField') || has('paymentSafetyHint') || !has('code')) return false;
  return has('amountMinor') === (m.kind === 'offer');
};
const MESSAGES: Check = S.arrayOf(MESSAGE, RESALE_THREAD_LIMITS_V1.messagesInViewMax);
const LISTING_STATUS: Check = S.oneOf(RESALE_LISTING_STATUSES_V1);
const OPEN_STATUS: Check = S.oneOf(RESALE_LISTING_OPEN_STATUSES_V1);

const LISTING_OWNER_KEYS: Record<string, Check> = {
  schemaVersion: S.literal(1),
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  assetRef: S.pattern(DEVICE_ASSET_REF_PATTERN_V1),
  status: LISTING_STATUS,
  title: S.nullable(S.text(RESALE_LISTING_LIMITS_V1.titleMax)),
  description: S.nullable(S.text(RESALE_LISTING_LIMITS_V1.descriptionMax)),
  category: S.oneOf(RESALE_CATEGORIES_V1),
  condition: S.oneOf(DEVICE_ASSET_CONDITIONS_V1),
  asking: S.nullable(MONEY_SGD),
  floor: S.nullable(MONEY_SGD),
  area: S.nullable(S.oneOf(RESALE_AREAS_V1)),
  handover: S.nullable(S.oneOf(RESALE_HANDOVERS_V1)),
  faq: S.arrayOf(FAQ, RESALE_LISTING_LIMITS_V1.faqMax),
  photos: S.arrayOf(PHOTO, RESALE_LISTING_LIMITS_V1.photosMax),
  twinReplies: S.bool,
  pickupPointState: S.oneOf(['none', 'sealed', 'unreadable']),
  pickupPoint: S.nullable(S.text(RESALE_LISTING_LIMITS_V1.pickupPointMax)),
  sellerLabel: LABEL,
  blockedContactAttempts: S.int(0, Number.MAX_SAFE_INTEGER),
  publishedAt: S.nullable(S.isoTime),
  expiresAt: S.nullable(S.isoTime),
  reservedAt: S.nullable(S.isoTime),
  closedAt: S.nullable(S.isoTime),
  sold: S.nullable(MONEY_SGD),
  nudge: S.nullable(S.literal('recycle')),
  createdAt: S.isoTime,
  updatedAt: S.isoTime,
};
const LISTING_OWNER: Check = (v) => S.object(LISTING_OWNER_KEYS)(v) && (((v as ResaleListingOwnerViewV1).pickupPoint !== null) === ((v as ResaleListingOwnerViewV1).pickupPointState === 'sealed'));
const LISTING_PUBLIC_KEYS: Record<string, Check> = {
  schemaVersion: S.literal(1),
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  status: OPEN_STATUS,
  title: S.text(RESALE_LISTING_LIMITS_V1.titleMax),
  description: S.nullable(S.text(RESALE_LISTING_LIMITS_V1.descriptionMax)),
  category: S.oneOf(RESALE_CATEGORIES_V1),
  condition: S.oneOf(DEVICE_ASSET_CONDITIONS_V1),
  asking: MONEY_SGD,
  area: S.oneOf(RESALE_AREAS_V1),
  handover: S.oneOf(RESALE_HANDOVERS_V1),
  photos: S.arrayOf(PHOTO, RESALE_LISTING_LIMITS_V1.photosMax),
  faq: S.arrayOf(FAQ, RESALE_LISTING_LIMITS_V1.faqMax),
  sellerLabel: LABEL,
  authorLabel: S.nullable(LABEL),
  publishedAt: S.isoTime,
  expiresAt: S.isoTime,
};
const THREAD_BUYER_KEYS: Record<string, Check> = {
  schemaVersion: S.literal(1),
  threadRef: S.pattern(RESALE_THREAD_REF_PATTERN_V1),
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  listingStatus: OPEN_STATUS,
  status: S.oneOf(['open', 'closed']),
  sellerLabel: LABEL,
  twinLabel: S.nullable(LABEL),
  messages: MESSAGES,
  offer: OFFER,
  offerAllowance: S.object({
    todayRemaining: S.int(0, RESALE_OFFER_LIMITS_V1.perThreadPerDay),
    totalRemaining: S.int(0, RESALE_OFFER_LIMITS_V1.perThreadTotal),
  }),
  pendingDisclosures: S.arrayOf(PENDING_DISCLOSURE, RESALE_DISCLOSURE_FIELDS_V1.length),
};
const THREAD_OWNER_KEYS: Record<string, Check> = {
  schemaVersion: S.literal(1),
  threadRef: S.pattern(RESALE_THREAD_REF_PATTERN_V1),
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  listingStatus: LISTING_STATUS,
  status: S.oneOf(RESALE_THREAD_STATUSES_V1),
  buyerLabel: LABEL,
  messages: MESSAGES,
  offer: OFFER,
  pendingDisclosures: S.arrayOf(PENDING_DISCLOSURE, RESALE_DISCLOSURE_FIELDS_V1.length),
  createdAt: S.isoTime,
  updatedAt: S.isoTime,
};
const DISCLOSURE_CARD: Check = S.object({
  cardRef: S.pattern(RESALE_DISCLOSURE_CARD_REF_PATTERN_V1),
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  listingTitle: S.text(RESALE_LISTING_LIMITS_V1.titleMax),
  threadRef: S.pattern(RESALE_THREAD_REF_PATTERN_V1),
  buyerLabel: LABEL,
  field: S.oneOf(RESALE_DISCLOSURE_FIELDS_V1),
  status: S.oneOf(RESALE_DISCLOSURE_CARD_STATUSES_V1),
  requestedAt: S.isoTime,
  expiresAt: S.isoTime,
  decidedAt: S.nullable(S.isoTime),
});
const WANTED: Check = S.object({
  wantedRef: S.pattern(RESALE_WANTED_REF_PATTERN_V1),
  category: S.oneOf(RESALE_CATEGORIES_V1),
  maxPrice: S.nullable(MONEY_SGD),
  area: S.nullable(S.oneOf(RESALE_AREAS_V1)),
  status: S.oneOf(RESALE_WANTED_STATUSES_V1),
  expiresAt: S.isoTime,
  createdAt: S.isoTime,
});
const WANTED_MATCH: Check = S.object({
  wantedRef: S.pattern(RESALE_WANTED_REF_PATTERN_V1),
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  title: S.text(RESALE_LISTING_LIMITS_V1.titleMax),
  asking: MONEY_SGD,
  area: S.oneOf(RESALE_AREAS_V1),
  matchedAt: S.isoTime,
});

function decodeExact<T>(body: unknown, keys: Record<string, Check>, extra?: (value: T) => string | null): ResaleDecodeResultV1<T> {
  const value = S.unwrap(body);
  if (!S.isRecord(value)) return { ok: false, field: '$' };
  const field = S.exactKeysFailure(value, keys);
  if (field !== null) return { ok: false, field };
  const typed = value as unknown as T;
  const extraField = extra ? extra(typed) : null;
  return extraField === null ? { ok: true, value: typed } : { ok: false, field: extraField };
}

/** The item page. Any key not in the contract (a `floorMinor`, an account id) makes it unreadable. */
export function decodeResaleListingPublicV1(body: unknown): ResaleDecodeResultV1<ResaleListingPublicV1> {
  return decodeExact<ResaleListingPublicV1>(body, LISTING_PUBLIC_KEYS);
}
export function decodeResaleListingOwnerViewV1(body: unknown): ResaleDecodeResultV1<ResaleListingOwnerViewV1> {
  return decodeExact<ResaleListingOwnerViewV1>(body, LISTING_OWNER_KEYS, (v) => (LISTING_OWNER(v) ? null : 'pickupPoint'));
}
export function decodeResaleListingOwnerListV1(body: unknown): ResaleDecodeResultV1<ResaleListingOwnerListV1> {
  return decodeExact<ResaleListingOwnerListV1>(body, { schemaVersion: S.literal(1), items: S.arrayOf(LISTING_OWNER, 500) });
}
export function decodeResaleMyThreadV1(body: unknown): ResaleDecodeResultV1<ResaleMyThreadV1> {
  const value = S.unwrap(body);
  if (S.isRecord(value) && value.role === 'owner') return decodeExact<ResaleMyThreadV1>(value, { role: S.literal('owner') });
  return decodeExact<ResaleMyThreadV1>(value, {
    role: S.literal('buyer'),
    threadRef: S.pattern(RESALE_THREAD_REF_PATTERN_V1),
    status: S.oneOf(['open', 'closed']),
  });
}
/** The buyer's conversation. Any key not in the contract (a `floorMinor`, a buyer id) makes it unreadable. */
export function decodeResaleThreadBuyerViewV1(body: unknown): ResaleDecodeResultV1<ResaleThreadBuyerViewV1> {
  return decodeExact<ResaleThreadBuyerViewV1>(body, THREAD_BUYER_KEYS);
}
export function decodeResaleThreadOwnerViewV1(body: unknown): ResaleDecodeResultV1<ResaleThreadOwnerViewV1> {
  return decodeExact<ResaleThreadOwnerViewV1>(body, THREAD_OWNER_KEYS);
}
export function decodeResaleOwnerThreadListV1(body: unknown): ResaleDecodeResultV1<ResaleOwnerThreadListV1> {
  return decodeExact<ResaleOwnerThreadListV1>(body, { schemaVersion: S.literal(1), items: S.arrayOf(S.object(THREAD_OWNER_KEYS), 500) });
}
export function decodeResaleDisclosureCardListV1(body: unknown): ResaleDecodeResultV1<ResaleDisclosureCardListV1> {
  return decodeExact<ResaleDisclosureCardListV1>(body, { schemaVersion: S.literal(1), items: S.arrayOf(DISCLOSURE_CARD, 500) });
}
export function decodeResaleDraftTextV1(body: unknown): ResaleDecodeResultV1<ResaleDraftTextV1> {
  return decodeExact<ResaleDraftTextV1>(body, {
    schemaVersion: S.literal(1),
    title: S.text(RESALE_LISTING_LIMITS_V1.draftTitleMax),
    description: S.text(RESALE_LISTING_LIMITS_V1.draftDescriptionMax),
  });
}
export function decodeResaleWantedListV1(body: unknown): ResaleDecodeResultV1<ResaleWantedListV1> {
  return decodeExact<ResaleWantedListV1>(body, {
    schemaVersion: S.literal(1),
    items: S.arrayOf(WANTED, 50),
    matches: S.arrayOf(WANTED_MATCH, 500),
  });
}

// ── sale receipts both sides confirm, and the seller's card (L3, S18) ─────────────────────────────
//
// Behind `RESALE_SALE_RECEIPTS_V1_ENABLED` (needs the listing switch) and, on the web,
// `NEXT_PUBLIC_RESALE_SALE_RECEIPTS_ENABLED`. While a listing is reserved with one buyer's accepted offer, the seller
// asks that buyer to confirm the sale; the buyer confirms on the item page; then the platform signs a receipt
// (`resale-sale-receipt+jwt`, the platform signer port). The receipt names the item, the seller's Agent and the times:
// never the buyer, never a price. Which listings show on the seller's card is chosen one by one (off by default); the
// card shows only those that are for sale and how many of them were sold with a receipt both sides confirmed.

export const RESALE_SALE_RECEIPT_TYP_V1 = 'resale-sale-receipt+jwt' as const;
export const RESALE_SALE_RECEIPT_STATUSES_V1 = ['pending', 'confirmed'] as const;
export type ResaleSaleReceiptStatusV1 = (typeof RESALE_SALE_RECEIPT_STATUSES_V1)[number];
/** At most this many items for sale on one card (the same as one seller's open listings). */
export const RESALE_CARD_ITEMS_MAX_V1 = RESALE_LISTING_LIMITS_V1.openPerOwnerMax;
/** A compact JWS: three base64url parts. */
export const RESALE_SALE_RECEIPT_TOKEN_PATTERN_V1 = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const RESALE_SALE_RECEIPT_TOKEN_MAX_V1 = 4096;
const RESALE_UUID_PATTERN_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESALE_HTTPS_ORIGIN_PATTERN_V1 = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?$/;

/** The seller's view of the one receipt of a listing. `threadRef` is `null` once that conversation is gone. */
export interface ResaleSaleReceiptOwnerV1 {
  receiptRef: string;
  threadRef: string | null;
  status: ResaleSaleReceiptStatusV1;
  requestedAt: string;
  /** Only once confirmed (then also `token`). */
  confirmedAt: string | null;
  /** The signed receipt (compact JWS), once confirmed. */
  token: string | null;
}
/** `GET|POST /resale/listings/:listingRef/sale-receipt`, `PUT …/on-card`: the seller's side for one listing. */
export interface ResaleSaleReceiptOwnerStateV1 {
  schemaVersion: 1;
  listingRef: string;
  /** Shown on the seller's card (off unless the seller turned it on for this listing). */
  onCard: boolean;
  receipt: ResaleSaleReceiptOwnerV1 | null;
}
export interface ResaleSaleReceiptBuyerV1 {
  receiptRef: string;
  status: ResaleSaleReceiptStatusV1;
  requestedAt: string;
  confirmedAt: string | null;
  token: string | null;
}
/**
 * `GET|POST /resale/threads/:threadRef/sale-receipt[/confirm]`: the buyer's side. `receipt` is the one waiting for this
 * buyer (while their offer is the accepted one) or the one they confirmed; otherwise `null`.
 */
export interface ResaleSaleReceiptBuyerViewV1 {
  schemaVersion: 1;
  threadRef: string;
  listingRef: string;
  receipt: ResaleSaleReceiptBuyerV1 | null;
}
/** One thing for sale on a seller's card: what the item page shows anyway, nothing more. */
export interface ResaleCardListingV1 {
  listingRef: string;
  title: string;
  category: ResaleCategoryV1;
  asking: ResaleMoneySgdV1;
}
/** `GET /resale/public/sellers/:agentId/summary`: no buyer, no price paid, no account id. */
export interface ResaleSellerCardSummaryV1 {
  schemaVersion: 1;
  items: ResaleCardListingV1[];
  /** Sales of listings on the card that both sides confirmed. */
  confirmedSales: number;
}
/** The signed receipt's claims: which item, which Agent sold it, when each side confirmed. No buyer, no price. */
export interface ResaleSaleReceiptClaimsV1 {
  iss: string;
  jti: string;
  iat: number;
  receipt_ref: string;
  listing_ref: string;
  /** The seller's primary Agent when the listing was published; `null` when there was none. */
  seller_agent_id: string | null;
  category: ResaleCategoryV1;
  /** When the seller asked (the seller's confirmation). */
  requested_at: string;
  /** When the buyer confirmed. */
  confirmed_at: string;
}

/** `POST /resale/listings/:listingRef/sale-receipt`: the conversation of the buyer whose offer was accepted. */
export interface ResaleSaleReceiptRequestInputV1 {
  threadRef: string;
}
/** `PUT /resale/listings/:listingRef/on-card`. */
export interface ResaleOnCardInputV1 {
  onCard: boolean;
}
export function validateResaleSaleReceiptRequestInputV1(value: unknown): ResaleInputResultV1<ResaleSaleReceiptRequestInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'threadRef') return { ok: false, field: key };
  if (typeof value.threadRef !== 'string' || !RESALE_THREAD_REF_PATTERN_V1.test(value.threadRef)) return { ok: false, field: 'threadRef' };
  return { ok: true, value: { threadRef: value.threadRef } };
}
/** `POST /resale/threads/:threadRef/sale-receipt/confirm`: no body, or an empty object. */
export function validateResaleSaleReceiptConfirmInputV1(value: unknown): ResaleInputResultV1<true> {
  if (value === undefined || value === null) return { ok: true, value: true };
  if (!inputRecord(value)) return { ok: false, field: '$' };
  const keys = Object.keys(value);
  return keys.length === 0 ? { ok: true, value: true } : { ok: false, field: keys[0] };
}
export function validateResaleOnCardInputV1(value: unknown): ResaleInputResultV1<ResaleOnCardInputV1> {
  if (!inputRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'onCard') return { ok: false, field: key };
  if (typeof value.onCard !== 'boolean') return { ok: false, field: 'onCard' };
  return { ok: true, value: { onCard: value.onCard } };
}

const RECEIPT_TOKEN: Check = (v) => typeof v === 'string' && v.length <= RESALE_SALE_RECEIPT_TOKEN_MAX_V1 && RESALE_SALE_RECEIPT_TOKEN_PATTERN_V1.test(v);
const RECEIPT_COMMON: Record<string, Check> = {
  receiptRef: S.pattern(RESALE_SALE_RECEIPT_REF_PATTERN_V1),
  status: S.oneOf(RESALE_SALE_RECEIPT_STATUSES_V1),
  requestedAt: S.isoTime,
  confirmedAt: S.nullable(S.isoTime),
  token: S.nullable(RECEIPT_TOKEN),
};
/** Confirmed exactly when it has a time and a token. */
function receiptConsistent(receipt: { status: string; confirmedAt: unknown; token: unknown }): boolean {
  const confirmed = receipt.status === 'confirmed';
  return confirmed === (receipt.confirmedAt !== null) && confirmed === (receipt.token !== null);
}
const OWNER_RECEIPT: Check = (v) =>
  S.object({ ...RECEIPT_COMMON, threadRef: S.nullable(S.pattern(RESALE_THREAD_REF_PATTERN_V1)) })(v) && receiptConsistent(v as ResaleSaleReceiptOwnerV1);
const BUYER_RECEIPT: Check = (v) => S.object(RECEIPT_COMMON)(v) && receiptConsistent(v as ResaleSaleReceiptBuyerV1);
const CARD_LISTING: Check = S.object({
  listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
  title: S.text(RESALE_LISTING_LIMITS_V1.titleMax),
  category: S.oneOf(RESALE_CATEGORIES_V1),
  asking: MONEY_SGD,
});

export function decodeResaleSaleReceiptOwnerStateV1(body: unknown): ResaleDecodeResultV1<ResaleSaleReceiptOwnerStateV1> {
  return decodeExact<ResaleSaleReceiptOwnerStateV1>(body, {
    schemaVersion: S.literal(1),
    listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
    onCard: S.bool,
    receipt: S.nullable(OWNER_RECEIPT),
  });
}
/** The buyer's side. Any key not in the contract (a price, the seller's account) makes it unreadable. */
export function decodeResaleSaleReceiptBuyerViewV1(body: unknown): ResaleDecodeResultV1<ResaleSaleReceiptBuyerViewV1> {
  return decodeExact<ResaleSaleReceiptBuyerViewV1>(body, {
    schemaVersion: S.literal(1),
    threadRef: S.pattern(RESALE_THREAD_REF_PATTERN_V1),
    listingRef: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
    receipt: S.nullable(BUYER_RECEIPT),
  });
}
/** The card. Any key not in the contract (a buyer, a sold price, an account id) makes it unreadable. */
export function decodeResaleSellerCardSummaryV1(body: unknown): ResaleDecodeResultV1<ResaleSellerCardSummaryV1> {
  return decodeExact<ResaleSellerCardSummaryV1>(body, {
    schemaVersion: S.literal(1),
    items: S.arrayOf(CARD_LISTING, RESALE_CARD_ITEMS_MAX_V1),
    confirmedSales: S.int(0, Number.MAX_SAFE_INTEGER),
  });
}
/** The receipt's claims, exactly these keys (the server checks them before it asks the platform to sign). */
export function decodeResaleSaleReceiptClaimsV1(value: unknown): ResaleDecodeResultV1<ResaleSaleReceiptClaimsV1> {
  return decodeExact<ResaleSaleReceiptClaimsV1>(value, {
    iss: S.pattern(RESALE_HTTPS_ORIGIN_PATTERN_V1),
    jti: S.pattern(/^[0-9a-f]{32}$/),
    iat: S.int(1, Number.MAX_SAFE_INTEGER),
    receipt_ref: S.pattern(RESALE_SALE_RECEIPT_REF_PATTERN_V1),
    listing_ref: S.pattern(RESALE_LISTING_REF_PATTERN_V1),
    seller_agent_id: S.nullable(S.pattern(RESALE_UUID_PATTERN_V1)),
    category: S.oneOf(RESALE_CATEGORIES_V1),
    requested_at: S.isoTime,
    confirmed_at: S.isoTime,
  });
}
