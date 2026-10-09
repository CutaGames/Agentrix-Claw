/**
 * E1 / E2 对话里建定时和触发任务，合同 v0 草案（L4 第 3 项；capability-parity-v1 E1 / E2；对标任务 T1）。
 * **只有合同，没有实现。**
 *
 * E1：Agent 在对话里只能"提议"一个自动化（定时或触发），主人确认以后才生效；没确认就不建（T1 的失败条件）。
 * E2：每次运行和对话用同一套工具、授权和预算（花钱走 D1 `reserve()`，`spend-budget.ts`），结果保存下来，
 * 送到对话、推送或主人已绑定的渠道（A2，`agent-channel.ts`）。现在的 `workflow` 模块只记运行状态、不留结果，
 * 也不能由 Agent 在对话里建；它保持原样，v0 不迁移旧工作流。
 *
 * 三端用到的：对话里的提议事件（`decodeAutomationProposalEventV0`）、自动化详情和列表（`decodeAutomationViewV0`、
 * `decodeAutomationListV0`）、运行记录（`decodeAutomationRunV0`）、时间表的说明文字（`describeAutomationScheduleV0`）、
 * 按钮（`automationActionsV0`）。服务端用：`validateAutomationProposalV0` 校验 Agent 提的内容。
 */

// ── 开关和上限 ──────────────────────────────────────────────────────────────────────

/** 默认关。关着时自动化路由一律 404，对话不发提议事件，已有的自动化也不运行。 */
export const AUTOMATION_V0_FLAG = 'AGENT_AUTOMATION_V0_ENABLED';

export const AUTOMATION_LIMITS_V0 = {
  /** 每只 Agent 同时生效（active + paused）的自动化最多几个。 */
  maxLivePerAgent: 20,
  /** 每只 Agent 每天（UTC）最多运行几次，所有自动化合计；超了的那次记 `skipped`。 */
  maxRunsPerAgentPerDay: 24,
  titleMaxChars: 60,
  instructionMaxChars: 2000,
  resultSummaryMaxChars: 2000,
  deliveryMax: 3,
  toolsMax: 20,
  sourcesMax: 20,
  /** 提议没人处理，24 小时后作废。 */
  proposalTtlSeconds: 24 * 60 * 60,
  /** 连续失败几次自动暂停（`pausedReason: 'failures'`）。 */
  pauseAfterFailures: 3,
} as const;

// ── 触发条件 ──────────────────────────────────────────────────────────────────────

export const AUTOMATION_TRIGGER_KINDS_V0 = ['schedule', 'email_received', 'calendar_event', 'web_page_changed', 'payment_received'] as const;
export type AutomationTriggerKindV0 = (typeof AUTOMATION_TRIGGER_KINDS_V0)[number];
/**
 * v0 实现的只有这两种。收到邮件、日历事件要连接器（C2 / Agent 邮箱，等 OA-95 账号），网页变化要云端沙箱；
 * 这三种在服务端没配置时，确认提议返回 409 `AUTOMATION_TRIGGER_NOT_CONFIGURED`，不悄悄改成别的触发方式。
 */
export const AUTOMATION_TRIGGER_KINDS_LIVE_V0 = ['schedule', 'payment_received'] as const;

/**
 * 定时：每天、每周几、每小时。不用 cron 字符串，三端能直接显示、服务端能直接校验。
 * 最密是每小时一次（和旧 `workflow` 的最小间隔 60 分钟一致）。
 */
export interface AutomationScheduleV0 {
  kind: 'schedule';
  every: 'day' | 'week' | 'hour';
  /** 24 小时制 `HH:MM`；`every: 'hour'` 时只看分钟，小时写 `00`。 */
  at: string;
  /** `every: 'week'` 时必填：ISO 星期 1–7（周一到周日），升序不重复；其他情况不带。 */
  days?: number[];
  /** IANA 时区，例如 `Asia/Shanghai`。按主人的时区算，夏令时由服务端处理。 */
  timezone: string;
}

/** 事件触发。`summary` 是给主人看的一句话；`filter` 只给服务端用（发件人域名、日历编号、网址），不放凭据。 */
export interface AutomationEventTriggerV0 {
  kind: Exclude<AutomationTriggerKindV0, 'schedule'>;
  summary: string;
  filter?: Record<string, string>;
}

export type AutomationTriggerV0 = AutomationScheduleV0 | AutomationEventTriggerV0;

// ── 送达 ─────────────────────────────────────────────────────────────────────────

export const AUTOMATION_DELIVERY_CHANNELS_V0 = ['chat', 'push', 'telegram', 'whatsapp'] as const;
export type AutomationDeliveryChannelV0 = (typeof AUTOMATION_DELIVERY_CHANNELS_V0)[number];

/**
 * `chat` 送回建它的那只 Agent 的对话；`push` 走主人的推送；`telegram` / `whatsapp` 要带 A2 的 `bindingRef`，
 * 服务端核对绑定属于这个主人、还生效，否则这一路记 `not_delivered`，别的路照送。
 */
export interface AutomationDeliveryV0 {
  channel: AutomationDeliveryChannelV0;
  bindingRef?: string;
}

// ── E1：对话里的提议 ──────────────────────────────────────────────────────────────

export const AUTOMATION_PROPOSAL_REF_PATTERN_V0 = /^apr_[0-9a-f]{32}$/;
export const AUTOMATION_REF_PATTERN_V0 = /^aut_[0-9a-f]{32}$/;
export const AUTOMATION_RUN_REF_PATTERN_V0 = /^aur_[0-9a-f]{32}$/;
const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;
const BINDING_REF = /^acb_[0-9a-f]{32}$/;

/**
 * Agent 提的自动化。主人在卡片上看到全部内容（含 `instruction` 全文和要用的工具）再确认。
 * `spendCapCentsPerRun` 是每次运行最多花多少（美分，走 D1 预算，D1 的日 / 月限额照样管）；0 表示不能花钱。
 */
export interface AutomationProposalV0 {
  proposalRef: string;
  agentAccountId: string;
  title: string;
  instruction: string;
  trigger: AutomationTriggerV0;
  delivery: AutomationDeliveryV0[];
  spendCapCentsPerRun: number;
  /** 运行时只能用这些工具；空数组表示只回答、不调工具。 */
  tools: string[];
  expiresAt: string;
}

/** 两条对话路径发同一种事件（`chat-path-parity` 测试要覆盖）。 */
export interface AutomationProposalEventV0 {
  type: 'automation_proposal';
  proposal: AutomationProposalV0;
}

/**
 * - `POST /api/automations/proposals/:proposalRef/confirm`、`/decline`：只认本人登录凭据（`type: 'user'`）。
 *   `spendCapCentsPerRun > 0` 的确认要最近登录（`auth-step-up.ts` 的标准 403）；拒绝不用。幂等：第二次返回第一次的结果。
 *   确认的响应体是 `AutomationViewV0`；拒绝是 `{ proposalRef, status: 'declined' }`。
 * - `GET /api/automations?agentAccountId=`：主人这只 Agent 的自动化，`SpendApproval` 一样不包一层，响应体 `AutomationListV0`。
 * - `GET /api/automations/:automationRef`、`…/runs`（最近 20 次，新的在前）。
 * - `POST …/pause`、`…/resume`、`…/end`：只认本人登录凭据；`end` 以后不能恢复。恢复急停或预算暂停的，要先解除原因。
 * - 别人的 Agent 的一律 404 `AUTOMATION_NOT_FOUND`。
 */
export const AUTOMATION_ROUTES_V0 = {
  confirmProposal: 'POST /api/automations/proposals/:proposalRef/confirm',
  declineProposal: 'POST /api/automations/proposals/:proposalRef/decline',
  list: 'GET /api/automations?agentAccountId=:agentAccountId',
  read: 'GET /api/automations/:automationRef',
  runs: 'GET /api/automations/:automationRef/runs',
  pause: 'POST /api/automations/:automationRef/pause',
  resume: 'POST /api/automations/:automationRef/resume',
  end: 'POST /api/automations/:automationRef/end',
} as const;

export const AUTOMATION_ERROR_CODES_V0 = {
  /** 403：不是本人登录凭据。 */
  signInRequired: 'AUTOMATION_SIGN_IN_REQUIRED',
  /** 404：没有，或者不是你的 Agent 的。 */
  notFound: 'AUTOMATION_NOT_FOUND',
  /** 409：提议过期了，或者已经处理过（响应体带当前状态）。 */
  proposalExpired: 'AUTOMATION_PROPOSAL_EXPIRED',
  /** 409：这种触发方式服务端还没配置（邮件、日历、网页变化）。 */
  triggerNotConfigured: 'AUTOMATION_TRIGGER_NOT_CONFIGURED',
  /** 409：这只 Agent 生效的自动化已经到上限。 */
  limitReached: 'AUTOMATION_LIMIT_REACHED',
  /** 409：送达用的渠道绑定不是你的，或者已经解除。 */
  bindingInvalid: 'AUTOMATION_BINDING_INVALID',
  /** 409：急停拉着时不能恢复，先解除急停（第 1 片实现时加）。 */
  resumeBlocked: 'AUTOMATION_RESUME_BLOCKED',
} as const;

// ── 自动化和运行记录 ──────────────────────────────────────────────────────────────

export const AUTOMATION_STATUSES_V0 = ['active', 'paused', 'ended'] as const;
export type AutomationStatusV0 = (typeof AUTOMATION_STATUSES_V0)[number];
export const AUTOMATION_PAUSED_REASONS_V0 = ['owner', 'emergency_stop', 'failures', 'budget'] as const;
export type AutomationPausedReasonV0 = (typeof AUTOMATION_PAUSED_REASONS_V0)[number];
/**
 * `skipped`：没跑（当天次数到上限、急停、Agent 不可用）；`budget_denied`：要花钱但 D1 预算拒绝；
 * `not_delivered`：跑完了、结果保存了，但一路都没送到。
 */
export const AUTOMATION_RUN_STATUSES_V0 = ['running', 'succeeded', 'failed', 'skipped', 'budget_denied', 'not_delivered'] as const;
export type AutomationRunStatusV0 = (typeof AUTOMATION_RUN_STATUSES_V0)[number];

/**
 * 一次运行。`resultSummary` 是保存下来的结果（E2）；不放凭据，不放第三方原文的全文（T1：别人的邮件正文不能全文出现，
 * 只能摘要并带来源）。`sources` 的 `url` 只能是 https。
 */
export interface AutomationRunV0 {
  runRef: string;
  automationRef: string;
  status: AutomationRunStatusV0;
  startedAt: string;
  finishedAt: string | null;
  resultSummary: string | null;
  sources: Array<{ label: string; url: string | null }>;
  deliveredTo: AutomationDeliveryChannelV0[];
  spentCents: number;
}

export interface AutomationViewV0 {
  automationRef: string;
  agentAccountId: string;
  title: string;
  instruction: string;
  trigger: AutomationTriggerV0;
  delivery: AutomationDeliveryV0[];
  spendCapCentsPerRun: number;
  tools: string[];
  status: AutomationStatusV0;
  pausedReason: AutomationPausedReasonV0 | null;
  createdAt: string;
  /** 下次什么时候跑（定时才有；暂停、结束、事件触发是 null）。 */
  nextRunAt: string | null;
  lastRun: AutomationRunV0 | null;
}

export interface AutomationListV0 {
  items: AutomationViewV0[];
}

// ── 校验和解码 ────────────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE = /^(UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;
const MAX_CENTS = 100_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** 定时的校验。`every: 'week'` 要有 `days`，别的不能带。 */
export function validateAutomationScheduleV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value) || value.kind !== 'schedule') return { valid: false, errors: ['trigger: expected a schedule'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!['kind', 'every', 'at', 'days', 'timezone'].includes(key)) errors.push(`${key}: unknown field`);
  if (value.every !== 'day' && value.every !== 'week' && value.every !== 'hour') errors.push('every: day | week | hour');
  const at = value.at;
  if (typeof at !== 'string' || !HH_MM.test(at)) errors.push('at: HH:MM');
  else if (value.every === 'hour' && !at.startsWith('00:')) errors.push('at: hourly schedules use 00:MM');
  const days = value.days;
  if (value.every === 'week') {
    const ok = Array.isArray(days) && days.length > 0 && days.length <= 7
      && days.every((d, i) => Number.isInteger(d) && d >= 1 && d <= 7 && (i === 0 || d > days[i - 1]));
    if (!ok) errors.push('days: ISO weekdays 1-7, ascending, no repeats');
  } else if (days !== undefined) {
    errors.push('days: only for weekly schedules');
  }
  if (typeof value.timezone !== 'string' || !TIMEZONE.test(value.timezone)) errors.push('timezone: IANA name');
  return { valid: errors.length === 0, errors };
}

function triggerErrors(value: unknown): string[] {
  if (!isRecord(value)) return ['trigger: expected object'];
  if (value.kind === 'schedule') return validateAutomationScheduleV0(value).errors;
  if (!oneOf(AUTOMATION_TRIGGER_KINDS_V0, value.kind)) return ['trigger.kind: unknown'];
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!['kind', 'summary', 'filter'].includes(key)) errors.push(`trigger.${key}: unknown field`);
  if (!text(value.summary, 120)) errors.push('trigger.summary: 1-120 characters');
  const filter = value.filter;
  if (filter !== undefined) {
    const entries = isRecord(filter) ? Object.entries(filter) : null;
    if (!entries || entries.length > 5 || entries.some(([k, v]) => !/^[a-z][a-z0-9_]{0,31}$/.test(k) || typeof v !== 'string' || v.length > 200)) {
      errors.push('trigger.filter: up to 5 short string fields');
    }
  }
  return errors;
}

function deliveryErrors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > AUTOMATION_LIMITS_V0.deliveryMax) return [`delivery: 1-${AUTOMATION_LIMITS_V0.deliveryMax} entries`];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !oneOf(AUTOMATION_DELIVERY_CHANNELS_V0, entry.channel)) {
      errors.push('delivery.channel: chat | push | telegram | whatsapp');
      continue;
    }
    const channel = entry.channel;
    const binding = entry.bindingRef;
    const external = channel === 'telegram' || channel === 'whatsapp';
    if (external && (typeof binding !== 'string' || !BINDING_REF.test(binding))) errors.push(`delivery.${channel}: bindingRef required`);
    if (!external && binding !== undefined) errors.push(`delivery.${channel}: no bindingRef`);
    const key = `${channel}:${typeof binding === 'string' ? binding : ''}`;
    if (seen.has(key)) errors.push(`delivery.${channel}: duplicate`);
    seen.add(key);
  }
  return errors;
}

function toolsErrors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > AUTOMATION_LIMITS_V0.toolsMax) return [`tools: up to ${AUTOMATION_LIMITS_V0.toolsMax} names`];
  if (!value.every((tool) => typeof tool === 'string' && TOOL_NAME.test(tool))) return ['tools: lower-case tool names'];
  return new Set(value).size === value.length ? [] : ['tools: duplicate'];
}

/** 服务端用：Agent 提的自动化内容对不对。触发方式有没有配置、上限到没到由服务端另查。 */
export function validateAutomationProposalV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['proposal: expected object'] };
  const errors: string[] = [];
  if (!text(value.title, AUTOMATION_LIMITS_V0.titleMaxChars)) errors.push(`title: 1-${AUTOMATION_LIMITS_V0.titleMaxChars} characters`);
  if (!text(value.instruction, AUTOMATION_LIMITS_V0.instructionMaxChars)) errors.push(`instruction: 1-${AUTOMATION_LIMITS_V0.instructionMaxChars} characters`);
  errors.push(...triggerErrors(value.trigger), ...deliveryErrors(value.delivery), ...toolsErrors(value.tools));
  const cap = value.spendCapCentsPerRun;
  if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 0 || cap > MAX_CENTS) errors.push(`spendCapCentsPerRun: integer cents, 0-${MAX_CENTS}`);
  return { valid: errors.length === 0, errors };
}

/** 确认这个提议要不要最近登录：会花钱的要（E84 B，和放宽预算一样）。 */
export function automationConfirmNeedsStepUpV0(proposal: Pick<AutomationProposalV0, 'spendCapCentsPerRun'>): boolean {
  return proposal.spendCapCentsPerRun > 0;
}

function decodeProposal(value: unknown): AutomationProposalV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.proposalRef !== 'string' || !AUTOMATION_PROPOSAL_REF_PATTERN_V0.test(value.proposalRef)) return null;
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return null;
  if (!validateAutomationProposalV0(value).valid || !isIso(value.expiresAt)) return null;
  return {
    proposalRef: value.proposalRef,
    agentAccountId: value.agentAccountId,
    title: value.title as string,
    instruction: value.instruction as string,
    trigger: value.trigger as AutomationTriggerV0,
    delivery: (value.delivery as AutomationDeliveryV0[]).map((d) => (d.bindingRef === undefined ? { channel: d.channel } : { channel: d.channel, bindingRef: d.bindingRef })),
    spendCapCentsPerRun: value.spendCapCentsPerRun as number,
    tools: [...(value.tools as string[])],
    expiresAt: value.expiresAt,
  };
}

/** 客户端用：从对话流里读一个自动化提议。字段坏了返回 null（不显示确认按钮）；过期的照样解出来，按钮由 `expiresAt` 决定。 */
export function decodeAutomationProposalEventV0(value: unknown): AutomationProposalEventV0 | null {
  if (!isRecord(value) || value.type !== 'automation_proposal') return null;
  const proposal = decodeProposal(value.proposal);
  return proposal ? { type: 'automation_proposal', proposal } : null;
}

/** 运行记录。来源的链接只认 https；不认的整条丢掉。 */
export function decodeAutomationRunV0(value: unknown): AutomationRunV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.runRef !== 'string' || !AUTOMATION_RUN_REF_PATTERN_V0.test(value.runRef)) return null;
  if (typeof value.automationRef !== 'string' || !AUTOMATION_REF_PATTERN_V0.test(value.automationRef)) return null;
  if (!oneOf(AUTOMATION_RUN_STATUSES_V0, value.status) || !isIso(value.startedAt)) return null;
  if (value.finishedAt !== null && !isIso(value.finishedAt)) return null;
  const summary = value.resultSummary;
  if (summary !== null && (typeof summary !== 'string' || summary.length > AUTOMATION_LIMITS_V0.resultSummaryMaxChars)) return null;
  const sources = value.sources;
  if (!Array.isArray(sources) || sources.length > AUTOMATION_LIMITS_V0.sourcesMax) return null;
  const decodedSources: Array<{ label: string; url: string | null }> = [];
  for (const source of sources) {
    if (!isRecord(source) || !text(source.label, 120)) return null;
    const url = source.url;
    if (url !== null && (typeof url !== 'string' || !/^https:\/\/[^\s]{1,2000}$/.test(url))) return null;
    decodedSources.push({ label: source.label as string, url: url as string | null });
  }
  const delivered = value.deliveredTo;
  if (!Array.isArray(delivered) || !delivered.every((c) => oneOf(AUTOMATION_DELIVERY_CHANNELS_V0, c))) return null;
  const spent = value.spentCents;
  if (typeof spent !== 'number' || !Number.isInteger(spent) || spent < 0 || spent > MAX_CENTS) return null;
  return {
    runRef: value.runRef,
    automationRef: value.automationRef,
    status: value.status as AutomationRunStatusV0,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt as string | null,
    resultSummary: summary as string | null,
    sources: decodedSources,
    deliveredTo: [...(delivered as AutomationDeliveryChannelV0[])],
    spentCents: spent,
  };
}

/** 自动化详情。`active` 不能带暂停原因，`paused` 必须带；`ended` 和事件触发的 `nextRunAt` 是 null。 */
export function decodeAutomationViewV0(value: unknown): AutomationViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.automationRef !== 'string' || !AUTOMATION_REF_PATTERN_V0.test(value.automationRef)) return null;
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return null;
  if (!validateAutomationProposalV0(value).valid) return null;
  if (!oneOf(AUTOMATION_STATUSES_V0, value.status) || !isIso(value.createdAt)) return null;
  const status = value.status;
  const reason = value.pausedReason;
  if (status === 'paused' ? !oneOf(AUTOMATION_PAUSED_REASONS_V0, reason) : reason !== null) return null;
  const next = value.nextRunAt;
  const trigger = value.trigger as AutomationTriggerV0;
  if (next !== null && (!isIso(next) || status !== 'active' || trigger.kind !== 'schedule')) return null;
  let lastRun: AutomationRunV0 | null = null;
  if (value.lastRun !== null) {
    const run = decodeAutomationRunV0(value.lastRun);
    if (!run || run.automationRef !== value.automationRef) return null;
    lastRun = run;
  }
  return {
    automationRef: value.automationRef,
    agentAccountId: value.agentAccountId,
    title: value.title as string,
    instruction: value.instruction as string,
    trigger,
    delivery: (value.delivery as AutomationDeliveryV0[]).map((d) => (d.bindingRef === undefined ? { channel: d.channel } : { channel: d.channel, bindingRef: d.bindingRef })),
    spendCapCentsPerRun: value.spendCapCentsPerRun as number,
    tools: [...(value.tools as string[])],
    status,
    pausedReason: (reason ?? null) as AutomationPausedReasonV0 | null,
    createdAt: value.createdAt,
    nextRunAt: next as string | null,
    lastRun,
  };
}

/** 列表：解不开的单条丢掉，其余照服务端的顺序；整体不对返回 null。 */
export function decodeAutomationListV0(value: unknown): AutomationListV0 | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > AUTOMATION_LIMITS_V0.maxLivePerAgent * 5) return null;
  const items: AutomationViewV0[] = [];
  for (const item of value.items) {
    const view = decodeAutomationViewV0(item);
    if (view) items.push(view);
  }
  return { items };
}

/** 卡片按钮：生效的能暂停；主人或预算暂停的能恢复（急停要先解除急停，连续失败的恢复要主人自己点）；没结束的都能结束。 */
export function automationActionsV0(view: Pick<AutomationViewV0, 'status' | 'pausedReason'>): { pause: boolean; resume: boolean; end: boolean } {
  return {
    pause: view.status === 'active',
    resume: view.status === 'paused' && view.pausedReason !== 'emergency_stop',
    end: view.status !== 'ended',
  };
}

const WEEKDAYS = {
  zh: ['一', '二', '三', '四', '五', '六', '日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const;

/** 时间表的说明文字，三端一致。例：`每天 08:00（Asia/Shanghai）`、`Every Mon, Wed at 08:00 (Asia/Shanghai)`。 */
export function describeAutomationScheduleV0(schedule: AutomationScheduleV0, locale: 'zh' | 'en'): string {
  const minute = schedule.at.slice(3);
  if (locale === 'zh') {
    if (schedule.every === 'hour') return `每小时第 ${Number(minute)} 分（${schedule.timezone}）`;
    if (schedule.every === 'day') return `每天 ${schedule.at}（${schedule.timezone}）`;
    return `每周${(schedule.days ?? []).map((d) => WEEKDAYS.zh[d - 1]).join('、')} ${schedule.at}（${schedule.timezone}）`;
  }
  if (schedule.every === 'hour') return `Every hour at :${minute} (${schedule.timezone})`;
  if (schedule.every === 'day') return `Every day at ${schedule.at} (${schedule.timezone})`;
  return `Every ${(schedule.days ?? []).map((d) => WEEKDAYS.en[d - 1]).join(', ')} at ${schedule.at} (${schedule.timezone})`;
}
