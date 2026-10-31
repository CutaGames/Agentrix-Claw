/**
 * 推送类型（合同 v1 草案，CONTRACTS.md；产品文档 5.2、5.4、5.6；REQ-mobile-004）。
 *
 * 起点是 mobile 的本地草案（`rebuild/mobile-20260927` `src/services/mobilePush.ts`，M0-c / M1-c）。
 *
 * 规则：
 * - 推送只带引用，不带正文：`data` 只有 `{ v, type, ref, agentId? }`。接收端只读这几个键，其余一律忽略；
 *   接收端永远不跟随推送里的 URL 或深链，落点只由 `type` 决定（`PUSH_DESTINATIONS`）。
 * - `title` / `body` 只用按类型生成的通用文案（`pushGenericText`），不带访客问题、收入、金额、来源、
 *   对方名字（5.4：锁屏不显示访客问题、收入和来源）。发送端（backend）用 `buildPushMessageV1` 生成。
 * - Android 通道按类型分；分身摘要、回执、旧的交易通道在锁屏上完全不显示（secret），其余隐藏内容（private）。
 */
import type { NavDestination, NavZoneId } from './nav-catalog';

export const PUSH_SCHEMA_VERSION = 'agentrix.push.v1' as const;
/** 接收端在过渡期也接受 mobile 本地草案的版本号。 */
export const PUSH_ACCEPTED_SCHEMA_VERSIONS = [PUSH_SCHEMA_VERSION, 'agentrix.push.v0-draft'] as const;

export const PUSH_TYPES = [
  'approval_required',
  'incoming_call',
  'agenda_reminder',
  'handoff_ready',
  'twin_digest',
  'goal_update',
  'receipt_ready',
  'device_paired',
  'order_update',
  // L8 R1 (owner alerts): something new happened that the owner should hear about at once.
  'twin_lead',
  'agent_request',
  'share_reply',
  'booking_new',
  'alert_digest',
] as const;
export type PushType = (typeof PUSH_TYPES)[number];

export const PUSH_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

/** 推送 `data`：只允许这几个键。 */
export interface PushDataV1 {
  v: typeof PUSH_SCHEMA_VERSION;
  type: PushType;
  /** 落点页签里的条目引用（审批 id、通话会话 id……），见 `PUSH_DESTINATIONS[type].refKind`。 */
  ref: string;
  agentId?: string;
}

export const PUSH_DATA_KEYS: readonly (keyof PushDataV1)[] = ['v', 'type', 'ref', 'agentId'];

export interface PushDestinationV1 extends NavDestination<NavZoneId> {
  /** `ref` 指向的对象种类。 */
  refKind: string;
}

/** 每个类型的落点（区 + 页签，引用导航目录合同）。 */
export const PUSH_DESTINATIONS: Readonly<Record<PushType, Omit<PushDestinationV1, 'ref'>>> = {
  approval_required: { zone: 'matters', tab: 'pending', refKind: 'approval' },
  incoming_call: { zone: 'companion', tab: 'call', refKind: 'call_session' },
  agenda_reminder: { zone: 'matters', tab: 'schedule', refKind: 'agenda_item' },
  handoff_ready: { zone: 'matters', tab: 'pending', refKind: 'handoff' },
  twin_digest: { zone: 'twin', tab: 'visitors', refKind: 'twin_digest' },
  goal_update: { zone: 'matters', tab: 'goals', refKind: 'goal' },
  receipt_ready: { zone: 'companion', tab: 'activity', refKind: 'action_receipt' },
  /** E30：每次新配对都通知主人；`ref` 是 `dev_…` 设备 id，落到"我的 → 设备"，该设备可一键解绑。 */
  device_paired: { zone: 'my', tab: 'devices', refKind: 'device' },
  /**
   * T7（`order-escrow.ts`）：订单有了要你处理或要你知道的变化（卖方：已付款待交付、争议；买方：已交付待验收、
   * 已退款）。`ref` 是 `ord_…` 订单 id，落到"事项 → 待我处理"，打开后按调用方显示买方或卖方视图。
   */
  order_update: { zone: 'matters', tab: 'pending', refKind: 'order' },
  /** L8 R1：分身收到一条访客留言。`ref` 是线索 id，落到"分身 → 访客与线索"。 */
  twin_lead: { zone: 'twin', tab: 'visitors', refKind: 'lead' },
  /** L8 R1：别人的 Agent 向主人发来一个请求。`ref` 是请求 id，落到"事项 → 待我处理"。 */
  agent_request: { zone: 'matters', tab: 'pending', refKind: 'collaboration_request' },
  /** L8 R1：共享页收到一条回复。`ref` 是共享页 id，落到"分身 → 访客与线索"。 */
  share_reply: { zone: 'twin', tab: 'visitors', refKind: 'share_page' },
  /** L8 R1：有人预约了主人的时间。`ref` 是预约号，落到"分身 → 预约"。 */
  booking_new: { zone: 'twin', tab: 'bookings', refKind: 'booking' },
  /** L8 R1：每日提醒摘要（只有条数）。`ref` 是摘要通知 id，落到"事项 → 待我处理"。 */
  alert_digest: { zone: 'matters', tab: 'pending', refKind: 'alert_digest' },
};

export type PushImportance = 'max' | 'high' | 'default';
export type PushLockscreen = 'private' | 'secret';

export interface PushChannelV1 {
  id: string;
  name: { zh: string; en: string };
  importance: PushImportance;
  lockscreen: PushLockscreen;
}

export const PUSH_CHANNELS: Readonly<Record<PushType, PushChannelV1>> = {
  approval_required: { id: 'approvals', name: { zh: '待你批准', en: 'Approvals' }, importance: 'max', lockscreen: 'private' },
  incoming_call: { id: 'calls', name: { zh: '来电', en: 'Calls from your AI' }, importance: 'max', lockscreen: 'private' },
  agenda_reminder: { id: 'agenda', name: { zh: '日程提醒', en: 'Agenda reminders' }, importance: 'high', lockscreen: 'private' },
  handoff_ready: { id: 'handoffs', name: { zh: '交接', en: 'Handoffs' }, importance: 'high', lockscreen: 'private' },
  twin_digest: { id: 'twin', name: { zh: '分身来访摘要', en: 'Twin digest' }, importance: 'default', lockscreen: 'secret' },
  goal_update: { id: 'goals', name: { zh: '目标进展', en: 'Goal progress' }, importance: 'default', lockscreen: 'private' },
  receipt_ready: { id: 'receipts', name: { zh: '回执', en: 'Receipts' }, importance: 'default', lockscreen: 'secret' },
  // 单独的安全通道：用户关掉审批通知时，安全提醒不受影响。
  device_paired: { id: 'security', name: { zh: '账号安全', en: 'Account security' }, importance: 'high', lockscreen: 'private' },
  // 涉及钱：锁屏完全不显示。
  order_update: { id: 'orders', name: { zh: '订单', en: 'Orders' }, importance: 'high', lockscreen: 'secret' },
  // L8 R1：来访和预约涉及对方，锁屏完全不显示。每种一个通道，用户可以在系统设置里单独关（比如只关摘要）。
  twin_lead: { id: 'leads', name: { zh: '分身新留言', en: 'Twin messages' }, importance: 'high', lockscreen: 'secret' },
  agent_request: { id: 'requests', name: { zh: '别人的请求', en: 'Requests from other Agents' }, importance: 'high', lockscreen: 'secret' },
  share_reply: { id: 'replies', name: { zh: '共享页回复', en: 'Share page replies' }, importance: 'high', lockscreen: 'secret' },
  booking_new: { id: 'bookings', name: { zh: '新预约', en: 'New bookings' }, importance: 'high', lockscreen: 'secret' },
  alert_digest: { id: 'digest', name: { zh: '每日提醒摘要', en: 'Daily alert digest' }, importance: 'default', lockscreen: 'secret' },
};

/** 旧通道：现有后端发 `transactions`，保留它，避免旧推送落到系统默认通道。涉及钱，锁屏不显示。 */
export const PUSH_LEGACY_CHANNELS: readonly PushChannelV1[] = [
  { id: 'transactions', name: { zh: '交易通知', en: 'Transactions' }, importance: 'default', lockscreen: 'secret' },
];

export type PushLocale = 'zh' | 'en';

/**
 * 登记推送设备时手机带来的语言：只认 `zh` / `en`（含 `en-US`、`zh_CN` 这类带地区的写法，大小写不论），
 * 其余（缺省、空、别的语言、不是字符串）一律返回 null，发送端按 `'zh'` 处理。
 */
export function parsePushLocale(value: unknown): PushLocale | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16) return null;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'zh' || primary === 'en' ? primary : null;
}

/** 通用文案：只说"有什么事"，不说具体内容、金额、来源或对方是谁。 */
export const PUSH_GENERIC_TEXT: Readonly<Record<PushType, Record<PushLocale, { title: string; body: string }>>> = {
  approval_required: {
    zh: { title: '有一件事等你批准', body: '打开 Agentrix 查看并处理。' },
    en: { title: 'Something needs your approval', body: 'Open Agentrix to review it.' },
  },
  incoming_call: {
    zh: { title: '你的 AI 来电', body: '打开 Agentrix 接听。' },
    en: { title: 'Your AI is calling', body: 'Open Agentrix to answer.' },
  },
  agenda_reminder: {
    zh: { title: '日程提醒', body: '有一项日程快到了。' },
    en: { title: 'Agenda reminder', body: 'Something on your agenda is coming up.' },
  },
  handoff_ready: {
    zh: { title: '有一项交接等你处理', body: '打开 Agentrix 查看。' },
    en: { title: 'A handoff is ready', body: 'Open Agentrix to take a look.' },
  },
  twin_digest: {
    zh: { title: '分身有新的来访摘要', body: '打开 Agentrix 查看。' },
    en: { title: 'New twin digest', body: 'Open Agentrix to read it.' },
  },
  goal_update: {
    zh: { title: '目标有新进展', body: '打开 Agentrix 查看。' },
    en: { title: 'Goal update', body: 'Open Agentrix to see progress.' },
  },
  receipt_ready: {
    zh: { title: '有一张新回执', body: '打开 Agentrix 查看。' },
    en: { title: 'New receipt', body: 'Open Agentrix to view it.' },
  },
  // 不带设备名、型号、IP、位置。
  device_paired: {
    zh: { title: '有新设备连接到你的账号', body: '如果不是你本人操作，打开 Agentrix 解绑。' },
    en: { title: 'A new device was connected to your account', body: "If this wasn't you, open Agentrix to unpair it." },
  },
  // 不带金额、买方、问题内容、服务名，也不说是付款还是退款。
  order_update: {
    zh: { title: '有一笔订单有新进展', body: '打开 Agentrix 查看。' },
    en: { title: 'An order has an update', body: 'Open Agentrix to view it.' },
  },
  // L8 R1：只说"有什么事"，不带访客写的内容、名字、联系方式、金额、对方是哪只 Agent。
  twin_lead: {
    zh: { title: '你的分身收到一条新留言', body: '打开 Agentrix 查看。' },
    en: { title: 'Your twin received a new message', body: 'Open Agentrix to read it.' },
  },
  agent_request: {
    zh: { title: '有别的 Agent 向你发来一个请求', body: '打开 Agentrix 查看并决定。' },
    en: { title: 'Another Agent sent you a request', body: 'Open Agentrix to review it.' },
  },
  share_reply: {
    zh: { title: '你分享的页面收到一条回复', body: '打开 Agentrix 查看。' },
    en: { title: 'A page you shared got a reply', body: 'Open Agentrix to read it.' },
  },
  booking_new: {
    zh: { title: '有人预约了你的时间', body: '打开 Agentrix 查看。' },
    en: { title: 'Someone booked your time', body: 'Open Agentrix to view it.' },
  },
  alert_digest: {
    zh: { title: '过去一天的提醒摘要', body: '打开 Agentrix 查看。' },
    en: { title: 'Your alerts from the last day', body: 'Open Agentrix to see them.' },
  },
};

export function isPushType(value: unknown): value is PushType {
  return typeof value === 'string' && (PUSH_TYPES as readonly string[]).includes(value);
}

export function isPushRef(value: unknown): value is string {
  return typeof value === 'string' && PUSH_REF_PATTERN.test(value);
}

export interface PushMessageV1 {
  title: string;
  body: string;
  data: PushDataV1;
  channelId: string;
}

/**
 * 发送端用：按类型生成完整推送。只接受类型和引用，拿不到正文，也就没法把正文放进推送。
 * `ref` / `agentId` 不合规时抛错（发送端应当丢弃这条推送，而不是发一个空引用）。
 */
export function buildPushMessageV1(input: {
  type: PushType;
  ref: string;
  agentId?: string;
  locale?: PushLocale;
}): PushMessageV1 {
  if (!isPushType(input.type)) throw new Error('unknown push type');
  if (!isPushRef(input.ref)) throw new Error('invalid push ref');
  if (input.agentId !== undefined && !isPushRef(input.agentId)) throw new Error('invalid push agentId');
  const text = PUSH_GENERIC_TEXT[input.type][input.locale === 'en' ? 'en' : 'zh'];
  return {
    title: text.title,
    body: text.body,
    data: {
      v: PUSH_SCHEMA_VERSION,
      type: input.type,
      ref: input.ref,
      ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
    },
    channelId: PUSH_CHANNELS[input.type].id,
  };
}

export type PushDataParseResult =
  | { ok: true; data: Omit<PushDataV1, 'v'>; ignoredKeys: string[] }
  | { ok: false; reason: 'not_an_object' | 'unsupported_version' | 'unknown_type' | 'invalid_ref' | 'invalid_agent'; ignoredKeys: string[] };

/**
 * 接收端用：严格解析 `data`。只读 `v`、`type`、`ref`、`agentId`，其余键记入 `ignoredKeys` 后丢弃。
 * （旧后端的 `{ notificationId, type }` 由各端自己按旧逻辑处理，不在合同里。）
 */
export function parsePushDataV1(value: unknown): PushDataParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'not_an_object', ignoredKeys: [] };
  }
  const record = value as Record<string, unknown>;
  const ignoredKeys = Object.keys(record)
    .filter((key) => !(PUSH_DATA_KEYS as readonly string[]).includes(key))
    .sort();
  if (!(PUSH_ACCEPTED_SCHEMA_VERSIONS as readonly unknown[]).includes(record.v)) {
    return { ok: false, reason: 'unsupported_version', ignoredKeys };
  }
  if (!isPushType(record.type)) return { ok: false, reason: 'unknown_type', ignoredKeys };
  if (!isPushRef(record.ref)) return { ok: false, reason: 'invalid_ref', ignoredKeys };
  if (record.agentId !== undefined && !isPushRef(record.agentId)) {
    return { ok: false, reason: 'invalid_agent', ignoredKeys };
  }
  return {
    ok: true,
    data: {
      type: record.type,
      ref: record.ref,
      ...(record.agentId !== undefined ? { agentId: record.agentId as string } : {}),
    },
    ignoredKeys,
  };
}

/** 推送落点：类型 → 区 + 页签 + ref。 */
export function pushDestination(data: Pick<PushDataV1, 'type' | 'ref'>): NavDestination<NavZoneId> {
  const destination = PUSH_DESTINATIONS[data.type];
  return { zone: destination.zone, tab: destination.tab, ref: data.ref };
}
