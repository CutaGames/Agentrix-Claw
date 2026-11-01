/**
 * 访客约时间 + 付定金 + 写主人日历 v0（L5 C5，backlog backend 8 / web 6；10-03）。
 *
 * - 主人给分身设可约的时段（每周几、几点到几点、每段多长、往后开放几天），并指定一项"定金"服务（订单目录里的
 *   `consultation_deposit`）。
 * - 访客（登录用户）挑一个空的时段：服务端先占住这个时段，再按那项定金服务下一笔订单（钱只走订单托管）。
 *   订单付了款，预约就算确认；订单取消或付款期限过了，占位作废、时段放回。
 * - 写主人日历由主人确认后做（复用连接器的日历回写：门禁、写同意、二次确认、读回），预约只给出要写的事件。
 * - 时间一律按主人设的固定时差换算（v0 不处理夏令时）；同一只分身同一个开始时间只能有一个有效预约（数据库唯一）。
 * - 开关 `VISITOR_BOOKING_V0_ENABLED` 默认关（关着时路由一律 404）。
 */

export const VISITOR_BOOKING_STATUSES_V0 = ['held', 'confirmed', 'cancelled', 'expired'] as const;
export type VisitorBookingStatusV0 = (typeof VISITOR_BOOKING_STATUSES_V0)[number];

export const BOOKING_SLOT_MINUTES_V0 = [30, 45, 60, 90] as const;
export const BOOKING_HORIZON_MAX_DAYS_V0 = 30;
export const BOOKING_WINDOWS_MAX_V0 = 21;
export const BOOKING_SLOTS_MAX_V0 = 200;
export const BOOKING_REF_PATTERN_V0 = /^vbk_[0-9a-f]{32}$/;
const OFFER_REF = /^ofr_[0-9a-f]{32}$/;
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export const VISITOR_BOOKING_ROUTES_V0 = {
  slots: 'GET /api/visitor-booking/:agentId/slots',
  book: 'POST /api/visitor-booking/:agentId/bookings',
  availability: 'PUT /api/visitor-booking/:agentId/availability',
  ownerBookings: 'GET /api/visitor-booking/:agentId/bookings',
} as const;

export interface BookingWindowV0 {
  /** ISO 周几：1 = 周一 … 7 = 周日（主人所在地）。 */
  weekday: number;
  start: string;
  end: string;
}

export interface BookingAvailabilityV0 {
  schemaVersion: 0;
  /** 主人所在地相对 UTC 的分钟数（东八区 = 480）。 */
  timezoneOffsetMinutes: number;
  windows: BookingWindowV0[];
  slotMinutes: (typeof BOOKING_SLOT_MINUTES_V0)[number];
  horizonDays: number;
  /** 定金用哪一项服务（订单目录的 `consultation_deposit`）。 */
  depositOfferRef: string;
}

export interface BookingSlotV0 {
  startIso: string;
  endIso: string;
}

export interface VisitorBookingViewV0 {
  bookingRef: string;
  agentId: string;
  startIso: string;
  endIso: string;
  status: VisitorBookingStatusV0;
  /** 定金订单（买方去订单页付款）。 */
  orderId: string;
  /** 占位到什么时候（付款期限），确认后为 null。 */
  holdExpiresAt: string | null;
}

/** 主人看到的预约：多一个要写进日历的事件（主人确认后才写）。 */
export interface VisitorBookingOwnerViewV0 extends VisitorBookingViewV0 {
  calendarEvent: { summary: string; startIso: string; endIso: string } | null;
}

export interface BookVisitorSlotRequestV0 {
  startIso: string;
  /** 想聊什么（进定金订单的备注）。 */
  note: string;
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** 服务端用：主人设的时段。窗口不能重叠、开始早于结束、放得下至少一段。 */
export function validateBookingAvailabilityV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['schemaVersion', 'timezoneOffsetMinutes', 'windows', 'slotMinutes', 'horizonDays', 'depositOfferRef'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (value.schemaVersion !== 0) errors.push('schemaVersion: 0');
  if (!Number.isInteger(value.timezoneOffsetMinutes) || (value.timezoneOffsetMinutes as number) < -720 || (value.timezoneOffsetMinutes as number) > 840) errors.push('timezoneOffsetMinutes: -720..840');
  if (!(BOOKING_SLOT_MINUTES_V0 as readonly unknown[]).includes(value.slotMinutes)) errors.push(`slotMinutes: one of ${BOOKING_SLOT_MINUTES_V0.join(', ')}`);
  if (!Number.isInteger(value.horizonDays) || (value.horizonDays as number) < 1 || (value.horizonDays as number) > BOOKING_HORIZON_MAX_DAYS_V0) errors.push(`horizonDays: 1..${BOOKING_HORIZON_MAX_DAYS_V0}`);
  if (typeof value.depositOfferRef !== 'string' || !OFFER_REF.test(value.depositOfferRef)) errors.push('depositOfferRef: invalid');
  const windows = value.windows;
  if (!Array.isArray(windows) || windows.length === 0 || windows.length > BOOKING_WINDOWS_MAX_V0) {
    errors.push(`windows: 1..${BOOKING_WINDOWS_MAX_V0}`);
  } else {
    const slot = typeof value.slotMinutes === 'number' ? value.slotMinutes : 30;
    windows.forEach((window, index) => {
      if (!isRecord(window) || !Number.isInteger(window.weekday) || (window.weekday as number) < 1 || (window.weekday as number) > 7 || typeof window.start !== 'string' || typeof window.end !== 'string' || !HHMM.test(window.start) || !HHMM.test(window.end)) {
        errors.push(`windows[${index}]: weekday 1..7, start and end HH:MM`);
        return;
      }
      if (minutesOf(window.end) - minutesOf(window.start) < slot) errors.push(`windows[${index}]: shorter than one slot`);
      const overlaps = windows.some((other, j) => j !== index && isRecord(other) && other.weekday === window.weekday && typeof other.start === 'string' && typeof other.end === 'string'
        && HHMM.test(other.start) && HHMM.test(other.end) && minutesOf(other.start) < minutesOf(window.end as string) && minutesOf(window.start as string) < minutesOf(other.end));
      if (overlaps) errors.push(`windows[${index}]: overlaps another window`);
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 空的时段：从现在起到 `horizonDays` 天后，按主人的时差把每个窗口切成 `slotMinutes` 一段，去掉已经开始的、
 * 和已有有效预约重叠的。最多 `BOOKING_SLOTS_MAX_V0` 个，按时间先后。
 */
export function bookingSlotsV0(availability: BookingAvailabilityV0, taken: readonly BookingSlotV0[], nowMs: number): BookingSlotV0[] {
  const offsetMs = availability.timezoneOffsetMinutes * 60_000;
  const slotMs = availability.slotMinutes * 60_000;
  const busy = taken.map((slot) => [Date.parse(slot.startIso), Date.parse(slot.endIso)] as const);
  const out: BookingSlotV0[] = [];
  const localNow = new Date(nowMs + offsetMs);
  const dayStartLocal = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
  for (let day = 0; day <= availability.horizonDays && out.length < BOOKING_SLOTS_MAX_V0; day += 1) {
    const localMidnight = dayStartLocal + day * 86_400_000;
    const weekday = ((new Date(localMidnight).getUTCDay() + 6) % 7) + 1;
    const windows = availability.windows.filter((window) => window.weekday === weekday).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (const window of windows) {
      for (let start = minutesOf(window.start); start + availability.slotMinutes <= minutesOf(window.end); start += availability.slotMinutes) {
        const startMs = localMidnight + start * 60_000 - offsetMs;
        const endMs = startMs + slotMs;
        if (startMs <= nowMs || startMs > nowMs + availability.horizonDays * 86_400_000) continue;
        if (busy.some(([from, to]) => from < endMs && startMs < to)) continue;
        out.push({ startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() });
        if (out.length >= BOOKING_SLOTS_MAX_V0) break;
      }
    }
  }
  return out;
}

/** 服务端用：预约请求。 */
export function validateBookVisitorSlotRequestV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!['startIso', 'note', 'idempotencyKey'].includes(key)) errors.push(`${key}: unexpected field`);
  if (typeof value.startIso !== 'string' || !ISO.test(value.startIso)) errors.push('startIso: ISO 8601 UTC');
  if (typeof value.note !== 'string' || value.note.trim().length === 0 || value.note.length > 1500) errors.push('note: 1..1500 characters');
  if (typeof value.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value.idempotencyKey)) errors.push('idempotencyKey: invalid');
  return { valid: errors.length === 0, errors };
}

/** 三端用：解码一个预约视图。 */
export function decodeVisitorBookingViewV0(value: unknown): VisitorBookingViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.bookingRef !== 'string' || !BOOKING_REF_PATTERN_V0.test(value.bookingRef)) return null;
  if (typeof value.agentId !== 'string' || value.agentId.length === 0 || value.agentId.length > 120) return null;
  if (typeof value.startIso !== 'string' || !ISO.test(value.startIso) || typeof value.endIso !== 'string' || !ISO.test(value.endIso)) return null;
  if (!(VISITOR_BOOKING_STATUSES_V0 as readonly unknown[]).includes(value.status)) return null;
  if (typeof value.orderId !== 'string' || !/^ord_[0-9a-f]{32}$/.test(value.orderId)) return null;
  if (value.holdExpiresAt !== null && (typeof value.holdExpiresAt !== 'string' || !ISO.test(value.holdExpiresAt))) return null;
  return {
    bookingRef: value.bookingRef,
    agentId: value.agentId,
    startIso: value.startIso,
    endIso: value.endIso,
    status: value.status as VisitorBookingStatusV0,
    orderId: value.orderId,
    holdExpiresAt: value.holdExpiresAt as string | null,
  };
}

/** 三端用：解码空时段列表。 */
export function decodeBookingSlotsV0(value: unknown): BookingSlotV0[] | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > BOOKING_SLOTS_MAX_V0) return null;
  const out: BookingSlotV0[] = [];
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.startIso !== 'string' || !ISO.test(item.startIso) || typeof item.endIso !== 'string' || !ISO.test(item.endIso)) return null;
    out.push({ startIso: item.startIso, endIso: item.endIso });
  }
  return out;
}
