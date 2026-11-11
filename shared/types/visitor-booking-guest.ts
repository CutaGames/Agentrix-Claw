/**
 * 免注册预约，不收定金版（L9 P2-4；开关 `VISITOR_BOOKING_GUEST_V1_ENABLED`，只认精确的 `'1'`，默认关）。
 *
 * - 访客不登录：选一个空档，留姓名和一种联系方式（邮件，或手机和 WhatsApp 号），勾选同意。服务端把姓名、联系方式、备注封存
 *   （`OwnerSealedBlobService`），表里只有联系方式的 HMAC（限频用）和令牌的 SHA-256 哈希。
 * - 主人收到提醒后确认或婉拒；联系方式只在主人确认之后才交给主人（`contact` 接口），婉拒、访客撤回、过期立即清空。
 * - 空档设置不再强制绑定定金报价：主人用 `guest-availability` 设空档，body 里没有 `depositOfferRef`。
 * - 免登录入口的规则同转介（`shared/types/introduction.ts` 的令牌、限频、E.164）：令牌 ≥128 位，不存在、过期、格式不对、
 *   别人的、主人不在名单里，一律同一个 404；响应里不回显姓名和联系方式；90 天后清空。
 * - 不收钱：本文件没有任何金额、订单、定金字段。
 */
import {
  INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1,
  decodeIntroductionContactV1,
  type IntroductionContactKindV1,
  type IntroductionContactV1,
} from './introduction';
import {
  BOOKING_REF_PATTERN_V0,
  validateBookingAvailabilityV0,
  type BookingAvailabilityV0,
  type VisitorBookingStatusV0,
} from './visitor-booking';

export const VISITOR_BOOKING_GUEST_V1_FLAG = 'VISITOR_BOOKING_GUEST_V1_ENABLED';
export const BOOKING_GUEST_SCHEMA_VERSION_V1 = 1;
/** 访客同意页的文案版本；文案变了就换一个值，旧值被拒。 */
export const BOOKING_GUEST_CONSENT_VERSION_V1 = 'booking-guest-2026-11-01';

/**
 * 访客勾选的同意文字（版本 `BOOKING_GUEST_CONSENT_VERSION_V1`），中英意思相同。每一句在代码里的对应写在 e-impl.md「E-R1」。
 * `free` 只在这次预约没有定金时显示；有定金时（G 线 P3-3 定金版）不出现，由定金版换成自己的文字和版本号。
 */
export const BOOKING_GUEST_CONSENT_COPY_V1 = {
  version: BOOKING_GUEST_CONSENT_VERSION_V1,
  zh: {
    terms: '我同意把名字交给对方；名字和联系方式加密保存，联系方式在对方确认后才给对方看。对方婉拒、我撤回或 48 小时没答复时立即删除，最长保留 90 天。',
    free: '这次预约不收任何费用。',
  },
  en: {
    terms:
      'I agree to give my name to them. My name and contact are stored encrypted, and my contact is shown to them only after they confirm. Both are deleted at once if they decline, if I withdraw, or if there is no reply within 48 hours, and are kept for 90 days at most.',
    free: 'There is no charge for this booking.',
  },
} as const;

/** 访客看到的同意文字：没有定金时带上「不收任何费用」那一句，有定金时不带。 */
export function bookingGuestConsentTextV1(language: 'zh' | 'en', options: { deposit: boolean }): string {
  const copy = BOOKING_GUEST_CONSENT_COPY_V1[language];
  if (options.deposit) return copy.terms;
  return language === 'en' ? `${copy.terms} ${copy.free}` : `${copy.terms}${copy.free}`;
}

export const BOOKING_GUEST_LIMITS_V1 = {
  nameMax: 100,
  noteMax: 300,
  /** 主人多久内要确认；也不晚于空档开始的时间。 */
  requestHoldHours: 48,
  retentionDays: 90,
  /** 每令牌每分钟。 */
  tokenPerMinute: 30,
  /** 每网络地址每分钟（所有免登录预约接口合计）。 */
  ipPerMinute: 60,
  /** 提交预约：每网络地址每小时。 */
  bookPerIpPerHour: 10,
  /** 同一个联系方式 24 小时内对同一个分身。 */
  bookPerContactPerAgentPerDay: 2,
  /** 每个分身每天最多收到的免注册预约。 */
  bookPerAgentPerDay: 20,
  ownerListMax: 50,
} as const;

export const BOOKING_GUEST_ERROR_CODES_V1 = {
  /** 不存在、过期、格式不对、别人的、主人不在名单里、开关关着：全是它，防枚举。 */
  notFound: 'BOOKING_NOT_FOUND',
  invalid: 'BOOKING_INVALID',
  slotTaken: 'BOOKING_SLOT_TAKEN',
  rateLimited: 'BOOKING_RATE_LIMITED',
  notConfigured: 'BOOKING_GUEST_NOT_CONFIGURED',
  notPending: 'BOOKING_NOT_PENDING',
} as const;

export const VISITOR_BOOKING_GUEST_ROUTES_V1 = {
  slots: 'GET /api/visitor-booking/guest/:agentId/slots',
  book: 'POST /api/visitor-booking/guest/:agentId/book',
  status: 'POST /api/visitor-booking/guest/status',
  cancel: 'POST /api/visitor-booking/guest/status/cancel',
  availability: 'PUT /api/visitor-booking/:agentId/guest-availability',
  /** 主人读自己的免注册空档设置（e-build-rest 补）。 */
  availabilityGet: 'GET /api/visitor-booking/:agentId/guest-availability',
  /** 主人关闭免注册预约（只关免注册标记，不删行，e-build-rest 补）。 */
  availabilityClose: 'DELETE /api/visitor-booking/:agentId/guest-availability',
  requests: 'GET /api/visitor-booking/:agentId/guest-requests',
  confirm: 'POST /api/visitor-booking/:agentId/guest-requests/:bookingRef/confirm',
  decline: 'POST /api/visitor-booking/:agentId/guest-requests/:bookingRef/decline',
  contact: 'GET /api/visitor-booking/:agentId/guest-requests/:bookingRef/contact',
} as const;

/** 访客一侧看到的状态。 */
export const BOOKING_GUEST_STATUSES_V1 = ['requested', 'confirmed', 'declined', 'cancelled', 'expired'] as const;
export type BookingGuestStatusV1 = (typeof BOOKING_GUEST_STATUSES_V1)[number];
export const BOOKING_GUEST_OUTCOMES_V1 = ['declined', 'withdrawn'] as const;
export type BookingGuestOutcomeV1 = (typeof BOOKING_GUEST_OUTCOMES_V1)[number];

/** 预约行的状态加主人婉拒还是访客撤回，换成访客看得懂的五个状态。预约行没有新状态：待确认 = `held`。 */
export function bookingGuestStatusOfV1(bookingStatus: VisitorBookingStatusV0, outcome: string | null | undefined): BookingGuestStatusV1 {
  if (bookingStatus === 'held') return 'requested';
  if (bookingStatus === 'confirmed') return 'confirmed';
  if (bookingStatus === 'expired') return 'expired';
  return outcome === 'declined' ? 'declined' : 'cancelled';
}

// ── 小工具 ─────────────────────────────────────────────────────────────────────────

export type BookingGuestDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: string; field: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(reasonCode: string, field: string): { ok: false; reasonCode: string; field: string } {
  return { ok: false, reasonCode, field };
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

/** 只许这些键，多了报 `unknown_field`，少了（必填的）报 `missing_field`。 */
function strictRecord(value: unknown, required: readonly string[], optional: readonly string[] = [], field = 'body'): { ok: true; value: Record<string, unknown> } | { ok: false; reasonCode: string; field: string } {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return { ok: true, value };
}

// ── 主人设空档（不带定金） ──────────────────────────────────────────────────────────

/** 免注册版的空档设置：和 `BookingAvailabilityV0` 一样，只是没有 `depositOfferRef`。 */
export type GuestBookingAvailabilityInputV1 = Omit<BookingAvailabilityV0, 'depositOfferRef'>;

const GUEST_AVAILABILITY_KEYS = ['schemaVersion', 'timezoneOffsetMinutes', 'windows', 'slotMinutes', 'horizonDays'] as const;
const PLACEHOLDER_OFFER_REF = `ofr_${'0'.repeat(32)}`;

/** 服务端用：窗口、时差、时长的规则与 V0 完全相同（直接调 V0 的校验）；带 `depositOfferRef` 或别的字段一律拒。 */
export function validateGuestBookingAvailabilityV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!(GUEST_AVAILABILITY_KEYS as readonly string[]).includes(key)) errors.push(`${key}: unexpected field`);
  const inner = validateBookingAvailabilityV0({ ...value, depositOfferRef: PLACEHOLDER_OFFER_REF });
  for (const error of inner.errors) if (!errors.includes(error) && !error.startsWith('depositOfferRef')) errors.push(error);
  return { valid: errors.length === 0, errors };
}

/** 主人读到的免注册空档：开着给设置（没有定金字段），关着 `availability` 为 null。 */
export interface GuestBookingAvailabilityViewV1 {
  open: boolean;
  availability: GuestBookingAvailabilityInputV1 | null;
}

export function decodeGuestBookingAvailabilityViewV1(value: unknown): BookingGuestDecodeResultV1<GuestBookingAvailabilityViewV1> {
  const rec = strictRecord(value, ['open', 'availability']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (typeof v.open !== 'boolean') return fail('invalid_type', 'open');
  if (v.availability === null) return v.open ? fail('invalid_value', 'availability') : { ok: true, value: { open: false, availability: null } };
  if (!v.open || !validateGuestBookingAvailabilityV1(v.availability).valid) return fail('invalid_value', 'availability');
  return { ok: true, value: { open: true, availability: v.availability as GuestBookingAvailabilityInputV1 } };
}

/** 存进空档行的 jsonb 里的标记：只有主人用免注册入口设过空档，访客入口才开。 */
export function bookingAvailabilityIsGuestOpenV1(value: unknown): boolean {
  return isRecord(value) && value.guestEnabled === true;
}

// ── 访客提交 ───────────────────────────────────────────────────────────────────────

export interface GuestBookingRequestV1 {
  startIso: string;
  name: string;
  /** 邮件（小写）或手机（E.164）；格式不对服务端拒绝。 */
  contact: IntroductionContactV1;
  note: string;
  consentVersion: string;
}

/**
 * 解码访客提交。联系方式用转介同一套规则（`normalizeIntroductionContactV1`：E.164、新加坡 `+65` 后 8 位、邮件 ≤254）。
 * 出错只给原因码和字段名，不回显访客填的值。必须勾选同意，并带当前的文案版本。
 */
export function decodeGuestBookingRequestV1(value: unknown): BookingGuestDecodeResultV1<GuestBookingRequestV1> {
  const rec = strictRecord(value, ['startIso', 'name', 'contact', 'consent', 'consentVersion'], ['note']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (!isIso(v.startIso)) return fail('invalid_value', 'startIso');
  if (typeof v.name !== 'string') return fail('invalid_type', 'name');
  const name = v.name.trim();
  if (name.length === 0 || Array.from(name).length > BOOKING_GUEST_LIMITS_V1.nameMax || CONTROL.test(name)) return fail('invalid_value', 'name');
  const contact = decodeIntroductionContactV1(v.contact, 'contact');
  if (contact.ok === false) return fail(contact.reasonCode, contact.field);
  let note = '';
  if (v.note !== undefined) {
    if (typeof v.note !== 'string') return fail('invalid_type', 'note');
    note = v.note.trim();
    if (Array.from(note).length > BOOKING_GUEST_LIMITS_V1.noteMax) return fail('note_too_long', 'note');
    if (CONTROL.test(note.replace(/[\n\r\t]/g, ' '))) return fail('invalid_value', 'note');
  }
  if (v.consent !== true) return fail('consent_required', 'consent');
  if (v.consentVersion !== BOOKING_GUEST_CONSENT_VERSION_V1) return fail('consent_version_mismatch', 'consentVersion');
  return { ok: true, value: { startIso: v.startIso, name, contact: contact.value, note, consentVersion: v.consentVersion } };
}

/** 状态页和撤回：令牌放请求体，不放网址。格式不对由服务端当作不存在（统一 404）。 */
export function decodeGuestBookingTokenCommandV1(value: unknown): BookingGuestDecodeResultV1<{ token: string }> {
  const rec = strictRecord(value, ['token']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.token !== 'string' || !INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1.test(rec.value.token)) return fail('invalid_value', 'token');
  return { ok: true, value: { token: rec.value.token } };
}

// ── 响应 ───────────────────────────────────────────────────────────────────────────

/** 提交结果：状态页令牌只在这里出现一次（服务端只存哈希）。不回显姓名和联系方式。 */
export interface GuestBookingResultV1 {
  schemaVersion: typeof BOOKING_GUEST_SCHEMA_VERSION_V1;
  statusToken: string;
  status: 'requested';
  startIso: string;
  endIso: string;
  requestExpiresAt: string;
}

export function decodeGuestBookingResultV1(value: unknown): BookingGuestDecodeResultV1<GuestBookingResultV1> {
  const rec = strictRecord(value, ['schemaVersion', 'statusToken', 'status', 'startIso', 'endIso', 'requestExpiresAt']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (v.schemaVersion !== BOOKING_GUEST_SCHEMA_VERSION_V1) return fail('invalid_value', 'schemaVersion');
  if (typeof v.statusToken !== 'string' || !INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1.test(v.statusToken)) return fail('invalid_value', 'statusToken');
  if (v.status !== 'requested') return fail('invalid_value', 'status');
  if (!isIso(v.startIso)) return fail('invalid_value', 'startIso');
  if (!isIso(v.endIso)) return fail('invalid_value', 'endIso');
  if (!isIso(v.requestExpiresAt)) return fail('invalid_value', 'requestExpiresAt');
  return {
    ok: true,
    value: { schemaVersion: BOOKING_GUEST_SCHEMA_VERSION_V1, statusToken: v.statusToken, status: 'requested', startIso: v.startIso, endIso: v.endIso, requestExpiresAt: v.requestExpiresAt },
  };
}

/** 访客状态页：只有状态、时间、分身的公开名称；没有姓名和联系方式。 */
export interface GuestBookingStatusViewV1 {
  schemaVersion: typeof BOOKING_GUEST_SCHEMA_VERSION_V1;
  status: BookingGuestStatusV1;
  startIso: string;
  endIso: string;
  agentName: string | null;
  /** 主人要在这个时间前确认；确认或结束后为 null。 */
  requestExpiresAt: string | null;
}

export function decodeGuestBookingStatusViewV1(value: unknown): BookingGuestDecodeResultV1<GuestBookingStatusViewV1> {
  const rec = strictRecord(value, ['schemaVersion', 'status', 'startIso', 'endIso', 'agentName', 'requestExpiresAt']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (v.schemaVersion !== BOOKING_GUEST_SCHEMA_VERSION_V1) return fail('invalid_value', 'schemaVersion');
  if (!(BOOKING_GUEST_STATUSES_V1 as readonly unknown[]).includes(v.status)) return fail('invalid_value', 'status');
  if (!isIso(v.startIso)) return fail('invalid_value', 'startIso');
  if (!isIso(v.endIso)) return fail('invalid_value', 'endIso');
  if (v.agentName !== null && (typeof v.agentName !== 'string' || v.agentName.length > 200)) return fail('invalid_value', 'agentName');
  if (v.requestExpiresAt !== null && !isIso(v.requestExpiresAt)) return fail('invalid_value', 'requestExpiresAt');
  return {
    ok: true,
    value: {
      schemaVersion: BOOKING_GUEST_SCHEMA_VERSION_V1,
      status: v.status as BookingGuestStatusV1,
      startIso: v.startIso,
      endIso: v.endIso,
      agentName: v.agentName as string | null,
      requestExpiresAt: v.requestExpiresAt as string | null,
    },
  };
}

/** 主人的列表：有姓名，没有联系方式的值（确认后才能取，见 `GuestBookingContactViewV1`）。 */
export interface GuestBookingOwnerItemV1 {
  bookingRef: string;
  status: BookingGuestStatusV1;
  startIso: string;
  endIso: string;
  guestName: string;
  contactKind: IntroductionContactKindV1 | null;
  requestExpiresAt: string | null;
  createdAt: string;
}

export function decodeGuestBookingOwnerListV1(value: unknown): BookingGuestDecodeResultV1<{ items: GuestBookingOwnerItemV1[] }> {
  const rec = strictRecord(value, ['items']);
  if (rec.ok === false) return rec;
  const items = rec.value.items;
  if (!Array.isArray(items) || items.length > BOOKING_GUEST_LIMITS_V1.ownerListMax) return fail('invalid_value', 'items');
  const out: GuestBookingOwnerItemV1[] = [];
  for (const [index, item] of items.entries()) {
    const field = `items[${index}]`;
    const one = strictRecord(item, ['bookingRef', 'status', 'startIso', 'endIso', 'guestName', 'contactKind', 'requestExpiresAt', 'createdAt'], [], field);
    if (one.ok === false) return one;
    const v = one.value;
    if (typeof v.bookingRef !== 'string' || !BOOKING_REF_PATTERN_V0.test(v.bookingRef)) return fail('invalid_value', `${field}.bookingRef`);
    if (!(BOOKING_GUEST_STATUSES_V1 as readonly unknown[]).includes(v.status)) return fail('invalid_value', `${field}.status`);
    if (!isIso(v.startIso) || !isIso(v.endIso) || !isIso(v.createdAt)) return fail('invalid_value', `${field}.time`);
    if (typeof v.guestName !== 'string' || v.guestName.length > 400) return fail('invalid_value', `${field}.guestName`);
    if (v.contactKind !== null && v.contactKind !== 'email' && v.contactKind !== 'phone') return fail('invalid_value', `${field}.contactKind`);
    if (v.requestExpiresAt !== null && !isIso(v.requestExpiresAt)) return fail('invalid_value', `${field}.requestExpiresAt`);
    out.push({
      bookingRef: v.bookingRef,
      status: v.status as BookingGuestStatusV1,
      startIso: v.startIso,
      endIso: v.endIso,
      guestName: v.guestName,
      contactKind: v.contactKind as IntroductionContactKindV1 | null,
      requestExpiresAt: v.requestExpiresAt as string | null,
      createdAt: v.createdAt,
    });
  }
  return { ok: true, value: { items: out } };
}

/** 主人确认后才能取：访客的姓名、联系方式、备注。 */
export interface GuestBookingContactViewV1 {
  bookingRef: string;
  name: string;
  contact: IntroductionContactV1;
  note: string;
}

export function decodeGuestBookingContactViewV1(value: unknown): BookingGuestDecodeResultV1<GuestBookingContactViewV1> {
  const rec = strictRecord(value, ['bookingRef', 'name', 'contact', 'note']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (typeof v.bookingRef !== 'string' || !BOOKING_REF_PATTERN_V0.test(v.bookingRef)) return fail('invalid_value', 'bookingRef');
  if (typeof v.name !== 'string' || v.name.length > 400) return fail('invalid_value', 'name');
  if (typeof v.note !== 'string' || v.note.length > 1200) return fail('invalid_value', 'note');
  const contact = decodeIntroductionContactV1(v.contact, 'contact');
  if (contact.ok === false) return fail(contact.reasonCode, contact.field);
  return { ok: true, value: { bookingRef: v.bookingRef, name: v.name, contact: contact.value, note: v.note } };
}
