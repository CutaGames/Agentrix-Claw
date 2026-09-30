/**
 * 分身的每周复核提醒（合同 v1，backend、web 已评审，REQ-mobile-067 / 070；REQ-web-019 第 6 件，E56 下交给 mobile，REQ-mobile-064.re-backend）。
 *
 * 现在复核摘要只能由主人在第 9 步手动"发一份到站内通知"（`POST twin/review/digest/deliver`）。
 * 这里加一个主人明确的选择：每周自动发一次。
 *
 * 规则：
 * - 默认不发。没有这条记录（`reviewSchedule` 缺省）就是 `off`；只有主人本人选了 `weekly` 才发。
 *   复核偏好（`interim_seed_review_preference`）是访谈里的自由文字，不当成选择。
 * - 存在 interim 状态里：`DigitalTwinInterimStateV1.reviewSchedule`（`interim_seed_review_schedule`），
 *   不是授权，也不是可见性改动（只影响发给主人自己的站内通知），所以不走 D16 预览和 step-up。
 * - 发送时间固定：每周一 09:00 新加坡时间（UTC+8，没有夏令时）。同一只分身同一周最多发一次，
 *   "周"按新加坡日期算 ISO 周（`digitalTwinReviewWeekKeyV1`）。
 * - 发的内容和手动发一样：只在站内，只有计数和打码的样例；不发邮件，推送里没有正文。
 * - 分身已急停、复核能力（`DIGITAL_TWIN_REVIEW_ENABLED`）或分身总开关关着、提醒开关
 *   （`DIGITAL_TWIN_REVIEW_WEEKLY_REMINDER_ENABLED`，默认关）关着：都不发。主人的选择照样保存，
 *   视图里 `delivery` 如实写"现在发不出去"和原因。
 *
 * 主人路由（和别的分身主人路由一样：只认主人本人，不是主人返回同一个拒绝）：
 *   GET /api/v1/agents/:agentId/twin/review/schedule                     → DigitalTwinReviewScheduleViewV1
 *   PUT /api/v1/agents/:agentId/twin/review/schedule  { cadence, expectedVersion } → DigitalTwinReviewScheduleViewV1
 * 响应信封和别的分身主人路由一样：`{ success: true, data: DigitalTwinCommandResultV1<…> }`。
 *
 * PUT 的判定顺序（REQ-mobile-067.re-backend）：
 * 1. 先比 `expectedVersion`：对不上就返回 `version_conflict`，即使主人想要的 `cadence` 已经是当前值。
 *    这样丢了响应的重试会拿到 `version_conflict`，客户端重新读一次就能看到已经生效；
 * 2. 版本对上、`cadence` 也和当前一样：返回 `replayed`，版本不变；
 * 3. 否则写入，版本 +1。
 * 写入用带版本条件的原子更新（`jsonb_set … WHERE COALESCE((state->'reviewSchedule'->>'version')::int, 0) = $expected`），
 * 两次 PUT 之间不会互相覆盖。已知风险：别的服务把读旧了的整份 interim 写回，会盖掉这次选择
 * （`putInterim` 没有 CAS，是早就有的问题，概率很低，主人再读一次就能看到）；给 `putInterim` 加 CAS 另外排期。
 *
 * 发送（实现片）：
 * - 每次都先查闸门（提醒开关、分身总开关、复核能力、急停、Agent 仍归这个主人且 active），都过了才领取。
 * - 领取 = 在 `digital_twin_operations` 插一行 kind `review_reminder`，幂等键 `digitalTwinReviewReminderIdempotencyKeyV1`；
 *   唯一索引挡住第二个进程。领到才发；发失败这一周不补。
 * - **错过就等下一周**：周一 09:00 那一刻没有进程在跑，这一周就不发，不做补发。
 */

export const DIGITAL_TWIN_REVIEW_SCHEDULE_SCHEMA_VERSION = 'agentrix.twin-review-schedule.v0' as const;

export const DIGITAL_TWIN_REVIEW_CADENCES_V1 = ['off', 'weekly'] as const;
export type DigitalTwinReviewCadenceV1 = (typeof DIGITAL_TWIN_REVIEW_CADENCES_V1)[number];

/** 运行时读取；默认关。 */
export const DIGITAL_TWIN_REVIEW_WEEKLY_REMINDER_FLAG = 'DIGITAL_TWIN_REVIEW_WEEKLY_REMINDER_ENABLED' as const;

/** 每周一 09:00 新加坡时间。`cron` 配合 `timeZone` 用（`@nestjs/schedule`）。 */
export const DIGITAL_TWIN_REVIEW_WEEKLY_SLOT_V1 = {
  isoWeekday: 1,
  hour: 9,
  timeZone: 'Asia/Singapore',
  utcOffsetMinutes: 8 * 60,
  cron: '0 9 * * 1',
} as const;

export const DIGITAL_TWIN_REVIEW_SCHEDULE_ROUTES = {
  get: 'GET /api/v1/agents/:agentId/twin/review/schedule',
  put: 'PUT /api/v1/agents/:agentId/twin/review/schedule',
} as const;

/** 存在 interim 状态里的那条记录。 */
export interface DigitalTwinReviewScheduleRecordV1 {
  record: 'interim_seed_review_schedule';
  notAGrant: true;
  cadence: DigitalTwinReviewCadenceV1;
  /** 每次改动 +1；第一次写入是 1。 */
  version: number;
  updatedAt: string;
}

export type DigitalTwinReviewReminderDeliveryV1 =
  | { state: 'available' }
  /** `blockedBy` 取自 `DIGITAL_TWIN_REVIEW_REMINDER_BLOCKERS_V1`（`twin_stop:` 后面跟急停次数）。 */
  | { state: 'unavailable'; blockedBy: string };

/**
 * `delivery.blockedBy` 的全部取值（REQ-mobile-067.re-web 第 1 条）。客户端按 `classifyDigitalTwinReviewReminderBlockerV1`
 * 换成普通话；表外的值一律当 `other`（"现在发不出去"）。
 * - `reminder_off`：提醒开关没开。web 这时不给选项（"自动提醒还没开放"），主人已有的选择照样保存。
 * - `review_off` / `twin_off` / `policy`：复核能力、分身总开关关着，或者 Seed Trial 硬关。
 * - `stopped`：分身急停了。
 * - `notification_unavailable`：通知模块没接上。
 */
export const DIGITAL_TWIN_REVIEW_REMINDER_BLOCKERS_V1 = {
  reminderOff: `flag:${DIGITAL_TWIN_REVIEW_WEEKLY_REMINDER_FLAG}`,
  reviewOff: 'flag:DIGITAL_TWIN_REVIEW_ENABLED',
  twinOff: 'flag:DIGITAL_TWIN_ENABLED',
  policy: 'policy:seed_trial_hard_off',
  stoppedPrefix: 'twin_stop:',
  notificationUnavailable: 'module:notification',
} as const;

export type DigitalTwinReviewReminderBlockerKindV1 = 'reminder_off' | 'review_off' | 'twin_off' | 'policy' | 'stopped' | 'notification_unavailable' | 'other';

export function classifyDigitalTwinReviewReminderBlockerV1(blockedBy: unknown): DigitalTwinReviewReminderBlockerKindV1 {
  const b = DIGITAL_TWIN_REVIEW_REMINDER_BLOCKERS_V1;
  if (typeof blockedBy !== 'string') return 'other';
  if (blockedBy === b.reminderOff) return 'reminder_off';
  if (blockedBy === b.reviewOff) return 'review_off';
  if (blockedBy === b.twinOff) return 'twin_off';
  if (blockedBy === b.policy) return 'policy';
  if (blockedBy === b.notificationUnavailable) return 'notification_unavailable';
  if (blockedBy.startsWith(b.stoppedPrefix) && /^\d+$/.test(blockedBy.slice(b.stoppedPrefix.length))) return 'stopped';
  return 'other';
}

export interface DigitalTwinReviewScheduleViewV1 {
  schemaVersion: typeof DIGITAL_TWIN_REVIEW_SCHEDULE_SCHEMA_VERSION;
  /** 主人的选择；没有记录时是 `off`。 */
  cadence: DigitalTwinReviewCadenceV1;
  /** 没有记录时是 0。 */
  version: number;
  /** 此刻真发得出去吗。发不出去时 `cadence` 仍然照实显示主人的选择。 */
  delivery: DigitalTwinReviewReminderDeliveryV1;
  /** `cadence = weekly` 且 `delivery` 可用时，下一次发送的时间；否则 `null`。 */
  nextAt: string | null;
}

export interface PutDigitalTwinReviewScheduleCommandV1 {
  cadence: DigitalTwinReviewCadenceV1;
  /** 读到的 `version`（没有记录时是 0）。 */
  expectedVersion: number;
}

export type DigitalTwinReviewScheduleViewDecodeResultV1 = { ok: true; value: DigitalTwinReviewScheduleViewV1 } | { ok: false; reason: string };

/**
 * 客户端解码（REQ-mobile-067.re-web 第 2 条；web 和手机同一条规则）：只取已知字段，任何一条不对就整条拒绝。
 * `nextAt` 只在 `weekly` 且 `available` 时是时间，否则必须是 `null`；没有记录（`version` 0）时只能是 `off`。
 */
export function decodeDigitalTwinReviewScheduleViewV1(input: unknown): DigitalTwinReviewScheduleViewDecodeResultV1 {
  if (!isRecord(input) || input.schemaVersion !== DIGITAL_TWIN_REVIEW_SCHEDULE_SCHEMA_VERSION) return { ok: false, reason: 'schema' };
  if (!(DIGITAL_TWIN_REVIEW_CADENCES_V1 as readonly unknown[]).includes(input.cadence)) return { ok: false, reason: 'cadence' };
  const cadence = input.cadence as DigitalTwinReviewCadenceV1;
  if (typeof input.version !== 'number' || !Number.isInteger(input.version) || input.version < 0) return { ok: false, reason: 'version' };
  if (input.version === 0 && cadence !== 'off') return { ok: false, reason: 'version' };
  const raw = input.delivery;
  let delivery: DigitalTwinReviewReminderDeliveryV1;
  if (isRecord(raw) && raw.state === 'available') delivery = { state: 'available' };
  else if (isRecord(raw) && raw.state === 'unavailable' && typeof raw.blockedBy === 'string' && raw.blockedBy.length > 0 && raw.blockedBy.length <= 120) {
    delivery = { state: 'unavailable', blockedBy: raw.blockedBy };
  } else return { ok: false, reason: 'delivery' };
  const expectsNext = cadence === 'weekly' && delivery.state === 'available';
  if (expectsNext ? typeof input.nextAt !== 'string' || !ISO_INSTANT.test(input.nextAt) || !Number.isFinite(Date.parse(input.nextAt)) : input.nextAt !== null) {
    return { ok: false, reason: 'nextAt' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_REVIEW_SCHEDULE_SCHEMA_VERSION,
      cadence,
      version: input.version,
      delivery,
      nextAt: expectsNext ? (input.nextAt as string) : null,
    },
  };
}

export type DigitalTwinReviewScheduleValidationV1 =
  | { ok: true; value: PutDigitalTwinReviewScheduleCommandV1 }
  | { ok: false; errors: string[] };

export function validatePutDigitalTwinReviewScheduleCommandV1(input: unknown): DigitalTwinReviewScheduleValidationV1 {
  if (!isRecord(input)) return { ok: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(input)) if (key !== 'cadence' && key !== 'expectedVersion') errors.push(`${key}: unexpected field`);
  if (!(DIGITAL_TWIN_REVIEW_CADENCES_V1 as readonly unknown[]).includes(input.cadence)) errors.push('cadence: off or weekly');
  if (typeof input.expectedVersion !== 'number' || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    errors.push('expectedVersion: non-negative integer');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { cadence: input.cadence as DigitalTwinReviewCadenceV1, expectedVersion: input.expectedVersion as number } };
}

/** 读 interim 里的记录；缺省或格式不对都当 `off`、版本 0（格式不对不猜成 weekly）。 */
export function readDigitalTwinReviewScheduleV1(record: unknown): { cadence: DigitalTwinReviewCadenceV1; version: number } {
  if (!isRecord(record) || record.record !== 'interim_seed_review_schedule') return { cadence: 'off', version: 0 };
  const version = typeof record.version === 'number' && Number.isInteger(record.version) && record.version > 0 ? record.version : 0;
  return { cadence: record.cadence === 'weekly' && version > 0 ? 'weekly' : 'off', version };
}

/** Only the `toISOString()` form, so both ends read the same instant (REQ-mobile-067.re-backend). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_OFFSET_MS = DIGITAL_TWIN_REVIEW_WEEKLY_SLOT_V1.utcOffsetMinutes * 60 * 1000;

/** 新加坡日期所在的 ISO 周，例如 `2026-W40`。周一 00:00 SGT 换周。 */
export function digitalTwinReviewWeekKeyV1(nowMs: number): string {
  const local = new Date(nowMs + SLOT_OFFSET_MS);
  const day = local.getUTCDay() || 7; // 1 = Monday … 7 = Sunday
  const thursday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 4 - day));
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 严格晚于 `nowMs` 的下一个周一 09:00 SGT（ISO 字符串，UTC）。 */
export function nextDigitalTwinReviewWeeklySlotV1(nowMs: number): string {
  const local = new Date(nowMs + SLOT_OFFSET_MS);
  const day = local.getUTCDay() || 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (day - 1), DIGITAL_TWIN_REVIEW_WEEKLY_SLOT_V1.hour);
  let slot = mondayLocal - SLOT_OFFSET_MS;
  if (slot <= nowMs) slot += 7 * DAY_MS;
  return new Date(slot).toISOString();
}

/** 每周提醒的幂等键：同一只分身同一周只有一个。 */
export function digitalTwinReviewReminderIdempotencyKeyV1(agentAccountId: string, weekKey: string): string {
  return `review-weekly:${agentAccountId}:${weekKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
