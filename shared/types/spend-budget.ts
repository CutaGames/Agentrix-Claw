/**
 * D1 统一预算 + D2 对话内批准，合同 v0.2（E99，REQ-backend-094；v0.1 按 REQ-backend-096 三端的答复；
 * v0.2 加主人读、改预算设置的路由、视图和解码，只加不改）。
 * 已实现、都默认关：第 1 片预算本身（`reserve` / `commit` / `release`、影子模式）；第 2 片批准记录和批准路由。
 * 还没实现：批准以后按摘要执行那一次调用、对话里发待批准事件、旧检查点接到 `reserve()`。
 *
 * D1：Agent 花钱的每条路径都只调一个服务端函数 `reserve()`，它在一条 SQL 里核对单笔 / 日 / 月限额并预占额度；
 * 付款成功 `commit`，失败或超时 `release`。单位是美元（美分整数），稳定币按 1:1。
 * D2：超过"免批准额度"的付款，两条对话路径（`/openclaw/proxy/:id/stream`、`/claude/chat`）发同一种
 * `approval_required` 事件，带 `approvalRef`；主人在三端批准以后，服务端按摘要原样执行那一次调用。
 *
 * 三端用到的：待批准事件（`decodeSpendApprovalEventV0`）、批准详情和批准结果（`decodeSpendApprovalViewV0`）、
 * 预算设置（`validateSpendBudgetSettingsV0`、`spendBudgetSettingsWideningV0`；v0.2 读和改走 `SPEND_BUDGET_SETTINGS_ROUTES_V0`，
 * 响应用 `decodeSpendBudgetSettingsViewV0` 解）。
 * 推送：沿用 `push-notification.ts` 的 `approval_required`，`ref` 就是 `approvalRef`，三端按它去重。
 */

// ── 支付路径和模式 ──────────────────────────────────────────────────────────────────

export const SPEND_PATHS_V0 = [
  'x402',
  'ucp_mandate',
  'quickpay',
  'wallet_transfer',
  'skill_purchase',
  'commerce_purchase',
  'hire_escrow',
  'lsm',
  /** 主人买的平台额度（按后台售价表折算）；平台送的试用额度不算。 */
  'platform_credit',
  /** 机器经济第 3 步：租别人的设备能力（`device-capability.ts`）。 */
  'device_rental',
] as const;
export type SpendPathV0 = (typeof SPEND_PATHS_V0)[number];

/** 影子：只算、记日志、和旧检查对比，不拦；强制：按结果拦。每条路径一个强制开关，默认关（E99 ④）。 */
export const SPEND_BUDGET_MODES_V0 = ['off', 'shadow', 'enforce'] as const;
export type SpendBudgetModeV0 = (typeof SPEND_BUDGET_MODES_V0)[number];
export const SPEND_BUDGET_SHADOW_FLAG_V0 = 'SPEND_BUDGET_SHADOW_ENABLED';
export function spendBudgetEnforceFlagV0(path: SpendPathV0): string {
  return `SPEND_BUDGET_ENFORCE_${path.toUpperCase()}`;
}

/**
 * 这条路径现在的模式。强制开关只会多拦，所以它单独开着也生效；平台额度在售价表没配时只能是影子（E99 ①）。
 */
export function spendBudgetModeV0(
  path: SpendPathV0,
  flags: Readonly<Record<string, string | undefined>>,
  context: { platformCreditPriceTableConfigured: boolean } = { platformCreditPriceTableConfigured: false },
): SpendBudgetModeV0 {
  const enforce = flags[spendBudgetEnforceFlagV0(path)] === '1';
  const shadow = flags[SPEND_BUDGET_SHADOW_FLAG_V0] === '1';
  if (enforce && (path !== 'platform_credit' || context.platformCreditPriceTableConfigured)) return 'enforce';
  if (enforce || shadow) return 'shadow';
  return 'off';
}

// ── 预算设置 ─────────────────────────────────────────────────────────────────────────

/**
 * 主人对一只 Agent 设的预算（美分）。要满足：免批准额度 ≤ step-up 门槛 ≤ 日限额 ≤ 月限额，单笔 ≤ 日限额。
 * 日限额是 0（这只 Agent 不能花钱，默认如此）时，step-up 门槛不和它比，默认的 2000 照样合法。
 * 改小立即生效；改大（任何一项变宽）要就地确认（E84 B，`auth-step-up.ts`）。
 */
export interface SpendBudgetSettingsV0 {
  singleTxLimitCents: number;
  dailyLimitCents: number;
  monthlyLimitCents: number;
  /** 不超过这个数的付款不用逐笔批准；默认 0，也就是每笔都要批准。 */
  freeApprovalCents: number;
  /** 超过这个数的批准要最近登录；默认 2000（20 美元）。 */
  stepUpCents: number;
  /** 乐观并发。 */
  revision: number;
}

export const SPEND_BUDGET_DEFAULTS_V0: Readonly<Omit<SpendBudgetSettingsV0, 'revision'>> = {
  singleTxLimitCents: 0,
  dailyLimitCents: 0,
  monthlyLimitCents: 0,
  freeApprovalCents: 0,
  stepUpCents: 2000,
};

/** 一次最多 100 万美元；防溢出和输错位数。 */
export const SPEND_BUDGET_MAX_CENTS_V0 = 100_000_000;

function cents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= SPEND_BUDGET_MAX_CENTS_V0;
}

const SETTINGS_KEYS = ['singleTxLimitCents', 'dailyLimitCents', 'monthlyLimitCents', 'freeApprovalCents', 'stepUpCents', 'revision'] as const;

export function validateSpendBudgetSettingsV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['settings: expected object'] };
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (!(SETTINGS_KEYS as readonly string[]).includes(key)) errors.push(`${key}: unknown field`);
  for (const key of SETTINGS_KEYS) {
    if (key === 'revision') continue;
    if (!cents(record[key])) errors.push(`${key}: integer cents, 0-${SPEND_BUDGET_MAX_CENTS_V0}`);
  }
  if (!Number.isInteger(record.revision) || (record.revision as number) < 0) errors.push('revision: non-negative integer');
  if (errors.length > 0) return { valid: false, errors };
  const s = record as unknown as SpendBudgetSettingsV0;
  if (s.freeApprovalCents > s.stepUpCents) errors.push('freeApprovalCents: must not exceed stepUpCents');
  if (s.stepUpCents > s.dailyLimitCents && s.dailyLimitCents > 0) errors.push('stepUpCents: must not exceed dailyLimitCents');
  if (s.singleTxLimitCents > s.dailyLimitCents) errors.push('singleTxLimitCents: must not exceed dailyLimitCents');
  if (s.dailyLimitCents > s.monthlyLimitCents) errors.push('dailyLimitCents: must not exceed monthlyLimitCents');
  return { valid: errors.length === 0, errors };
}

/**
 * 从旧设置改到新设置，哪些项变宽了（要就地确认）。免批准额度和三个限额变大是变宽；
 * step-up 门槛变大也是变宽（更多付款不用最近登录）。
 */
export function spendBudgetSettingsWideningV0(
  previous: Omit<SpendBudgetSettingsV0, 'revision'>,
  next: Omit<SpendBudgetSettingsV0, 'revision'>,
): Array<keyof Omit<SpendBudgetSettingsV0, 'revision'>> {
  const keys = ['singleTxLimitCents', 'dailyLimitCents', 'monthlyLimitCents', 'freeApprovalCents', 'stepUpCents'] as const;
  return keys.filter((key) => next[key] > previous[key]);
}

// ── 预占的结果（服务端内部，影子日志和批准事件用） ─────────────────────────────────────

export const SPEND_RESERVE_OUTCOMES_V0 = ['reserved', 'approval_required', 'denied'] as const;
export type SpendReserveOutcomeV0 = (typeof SPEND_RESERVE_OUTCOMES_V0)[number];

export const SPEND_DENY_REASONS_V0 = [
  'agent_inactive',
  'over_single_limit',
  'over_daily_limit',
  'over_monthly_limit',
  /** 非美元金额取不到当天汇率（强制模式下拒绝）。 */
  'fx_unavailable',
  /** 平台额度：后台售价表没配（这条路径只能是影子）。 */
  'price_table_missing',
  /** 预算服务本身不可用：强制模式下拒绝（fail closed）。 */
  'budget_unavailable',
  /** 急停拉着。 */
  'emergency_stopped',
] as const;
export type SpendDenyReasonV0 = (typeof SPEND_DENY_REASONS_V0)[number];

export interface SpendReserveInputV0 {
  agentAccountId: string;
  path: SpendPathV0;
  /** 原币金额和币种；美元和稳定币直接是美分。 */
  amountMinor: number;
  currency: string;
  /** 同一个幂等键只预占一次（第二次返回第一次的结果）。 */
  idempotencyKey: string;
  /**
   * 对话里发起的付款：工具名和参数摘要，批准时按它原样执行。工具名要符合 `SPEND_TOOL_NAME_PATTERN_V0`。
   * 只有带了它的付款才建批准记录；不带的付款要批准时只占额度，到期自己放回（v0.1）。
   */
  toolCall?: { toolName: string; argsDigest: string };
  /** 带 `toolCall` 时必填：收款方的显示名，服务端用 `sanitizeSpendLabelV0` 清理后放进批准卡（v0.1）。 */
  payeeLabel?: string;
}

export interface SpendReserveResultV0 {
  outcome: SpendReserveOutcomeV0;
  mode: SpendBudgetModeV0;
  /** 折成美元以后的金额，和用的汇率（非美元时）。 */
  amountCents: number;
  fx: { rate: string; source: string; at: string } | null;
  reservationRef: string | null;
  approvalRef: string | null;
  reason: SpendDenyReasonV0 | null;
  /** 影子模式下：旧检查的结论，和新结论不一致的次数要先看过才开强制（E99 ④）。 */
  legacyAllowed?: boolean;
}

/**
 * 按设置决定一笔已经算成美分、也没超限额的付款要不要批准、要不要最近登录。
 * 免批准额度以内直接预占；超过就要批准；超过 step-up 门槛的批准还要最近登录。
 */
export function spendApprovalRequirementV0(
  amountCents: number,
  settings: Pick<SpendBudgetSettingsV0, 'freeApprovalCents' | 'stepUpCents'>,
): { approval: boolean; stepUp: boolean } {
  return { approval: amountCents > settings.freeApprovalCents, stepUp: amountCents > settings.stepUpCents };
}

// ── D2：对话里的待批准事件 ────────────────────────────────────────────────────────────

/**
 * 两条对话路径发同一种事件（`query-engine` 的 `approval_required`，`chat-path-parity` 测试要覆盖新字段）。
 * 付款类的多两个字段：`approvalRef` 和 `spend`。不是付款的批准（工具风险级别）没有这两个字段，客户端照旧处理。
 * 事件里不带工具的原始参数：客户端要看详情就用 `approvalRef` 读批准记录。
 */
export const SPEND_APPROVAL_REF_PATTERN_V0 = /^spa_[0-9a-f]{32}$/;
export const SPEND_APPROVAL_TTL_SECONDS_V0 = 10 * 60;
/** 事件、批准记录里的工具名。 */
export const SPEND_TOOL_NAME_PATTERN_V0 = /^[a-z][a-z0-9_]{1,63}$/;
export const SPEND_PAYEE_LABEL_MAX_V0 = 80;
export const SPEND_AGENT_LABEL_MAX_V0 = 40;

/**
 * 批准卡上显示的名字（收款方、Agent）在服务端写入前清理（v0.1，REQ-backend-096 手机第 6 条）：去掉控制字符、
 * 双向和零宽字符、尖括号和反引号、链接，压掉多余空白，截到 `maxLength`。返回空串表示没有可显示的名字。
 */
export function sanitizeSpendLabelV0(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/[<>`]/g, ' ')
    .replace(/(?:https?:\/\/|www\.)\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export interface SpendApprovalSummaryV0 {
  path: SpendPathV0;
  amountCents: number;
  /**
   * 原币（界面显示"约 X 美元"时用）；美元和稳定币是 null。`exponent` 是原币最小单位的小数位数（JPY 0、USDC 6），
   * v0.1 加的，旧记录可能没有（REQ-backend-096 桌面第 13 条）。
   */
  original: { amountMinor: number; currency: string; exponent?: number } | null;
  /** 收款方的显示名（商户、卖方 Agent），不含账号或地址。 */
  payeeLabel: string;
  /** 哪只 Agent 要付钱：显示名，不是编号（v0.1，桌面第 14 条）；旧记录可能没有。 */
  agentLabel?: string | null;
  /** 批准时要不要最近登录。 */
  stepUpRequired: boolean;
}

export interface SpendApprovalEventV0 {
  type: 'approval_required';
  toolCallId: string;
  toolName: string;
  riskLevel: 0 | 1 | 2 | 3;
  reason: string;
  approvalRef: string;
  spend: SpendApprovalSummaryV0;
  expiresAt: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const CURRENCY = /^[A-Z][A-Z0-9]{2,9}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

function decodeSummary(value: unknown): SpendApprovalSummaryV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.path !== 'string' || !(SPEND_PATHS_V0 as readonly string[]).includes(value.path)) return null;
  if (!cents(value.amountCents) || value.amountCents === 0) return null;
  // 收窄后的值在块里就取出来：手机的 jest 是 strict: false（没有 strictNullChecks），
  // 出了 if 块 `original` 会回到 unknown（REQ-mobile-102）。
  const original = value.original;
  let originalValue: { amountMinor: number; currency: string; exponent?: number } | null = null;
  if (original !== null) {
    if (!isRecord(original) || !Number.isInteger(original.amountMinor) || (original.amountMinor as number) <= 0) return null;
    if (typeof original.currency !== 'string' || !CURRENCY.test(original.currency)) return null;
    const exponent = original.exponent;
    if (exponent !== undefined && (!Number.isInteger(exponent) || (exponent as number) < 0 || (exponent as number) > 18)) return null;
    originalValue = { amountMinor: original.amountMinor as number, currency: original.currency };
    if (exponent !== undefined) originalValue.exponent = exponent as number;
  }
  const payeeLabel = value.payeeLabel;
  if (typeof payeeLabel !== 'string' || payeeLabel.trim().length === 0 || payeeLabel.length > SPEND_PAYEE_LABEL_MAX_V0) return null;
  const agentLabel = value.agentLabel;
  if (agentLabel !== undefined && agentLabel !== null
    && (typeof agentLabel !== 'string' || agentLabel.trim().length === 0 || agentLabel.length > SPEND_AGENT_LABEL_MAX_V0)) return null;
  if (typeof value.stepUpRequired !== 'boolean') return null;
  const summary: SpendApprovalSummaryV0 = {
    path: value.path as SpendPathV0,
    amountCents: value.amountCents,
    original: originalValue,
    payeeLabel,
    stepUpRequired: value.stepUpRequired,
  };
  if (agentLabel !== undefined) summary.agentLabel = agentLabel as string | null;
  return summary;
}

/**
 * 客户端用：从对话流里读一个付款批准事件。不是付款批准（没有 `approvalRef`）返回 `{ kind: 'tool' }`，
 * 客户端照旧显示普通的工具批准；字段坏了返回 null（不显示批准按钮）。
 */
export function decodeSpendApprovalEventV0(value: unknown): { kind: 'spend'; event: SpendApprovalEventV0 } | { kind: 'tool' } | null {
  if (!isRecord(value) || value.type !== 'approval_required') return null;
  if (value.approvalRef === undefined && value.spend === undefined) return { kind: 'tool' };
  if (typeof value.approvalRef !== 'string' || !SPEND_APPROVAL_REF_PATTERN_V0.test(value.approvalRef)) return null;
  if (typeof value.toolCallId !== 'string' || value.toolCallId.length === 0 || value.toolCallId.length > 200) return null;
  if (typeof value.toolName !== 'string' || !SPEND_TOOL_NAME_PATTERN_V0.test(value.toolName)) return null;
  if (value.riskLevel !== 0 && value.riskLevel !== 1 && value.riskLevel !== 2 && value.riskLevel !== 3) return null;
  if (typeof value.reason !== 'string' || value.reason.length > 300) return null;
  const spend = decodeSummary(value.spend);
  if (!spend || !isIso(value.expiresAt)) return null;
  return {
    kind: 'spend',
    event: {
      type: 'approval_required',
      toolCallId: value.toolCallId,
      toolName: value.toolName,
      riskLevel: value.riskLevel,
      reason: value.reason,
      approvalRef: value.approvalRef,
      spend,
      expiresAt: value.expiresAt,
    },
  };
}

// ── D2：批准记录和批准路由 ────────────────────────────────────────────────────────────

/**
 * - `GET  /api/spend-approvals?status=pending`（v0.1，手机第 2 条）：本人所有 Agent 还在等批准、没过期的，
 *   按 `expiresAt` 升序最多 `SPEND_APPROVAL_LIST_LIMIT_V0` 条；响应体是 `SpendApprovalListV0`。推送丢了也能列出来。
 * - `GET  /api/spend-approvals/:ref`：读一条（只给这只 Agent 的主人）；响应体就是 `SpendApprovalViewV0`。
 * - `POST /api/spend-approvals/:ref/approve`、`/reject`：只认本人登录凭据（`type: 'user'`），Agent、运行时、
 *   第三方客户端的凭据一律 403。超过 step-up 门槛的批准要最近登录，否则返回 `auth-step-up.ts` 的标准错误体
 *   403 `STEP_UP_REQUIRED` + `reasonCode: 'recent_sign_in_required'`（v0.1，三端已有的判断）。拒绝不用最近登录。
 * - 200 的响应体就是 `SpendApprovalViewV0`。409 的响应体是 `{ code, view }`，`view` 是当前的批准记录，卡片直接按它显示。
 * - 幂等：同一个 `approvalRef` 第二次批准或拒绝，返回第一次的结果（200 和那时的记录），不再执行。
 * - 所有支付路径都是 off 时，这几条路由一律 404 `SPEND_APPROVAL_NOT_FOUND`。
 * - 付款批准只能经 `POST …/approve` 生效：旧的工具批准方式（桌面的 `agentrix:approval-needed` 等），不管是哪一条，
 *   对付款类工具一律不放行（v0.1，手机第 4 条；在对话发事件的那一片加负向测试）。v0 批准不要求手机设备钥匙签名，
 *   手机能批任何风险级别的付款批准（手机第 7 条）。
 * - 批准以后，服务端按记下的工具名和参数摘要原样执行那一次调用；参数和摘要对不上就不执行（`args_changed`）。
 *   结果作为工具结果回到原来的对话里（两条对话路径一致），三端的卡片变成"已处理"。（执行在第 3 片。）
 */
export const SPEND_APPROVAL_ROUTES_V0 = {
  list: 'GET /api/spend-approvals?status=pending',
  read: 'GET /api/spend-approvals/:approvalRef',
  approve: 'POST /api/spend-approvals/:approvalRef/approve',
  reject: 'POST /api/spend-approvals/:approvalRef/reject',
} as const;
export const SPEND_APPROVAL_LIST_LIMIT_V0 = 50;

export const SPEND_APPROVAL_STATUSES_V0 = ['pending', 'approved', 'rejected', 'expired', 'executed', 'failed'] as const;
export type SpendApprovalStatusV0 = (typeof SPEND_APPROVAL_STATUSES_V0)[number];

export const SPEND_APPROVAL_ERROR_CODES_V0 = {
  /** 403：不是本人登录凭据。 */
  signInRequired: 'SPEND_APPROVAL_SIGN_IN_REQUIRED',
  /** v0 草案里的"要最近登录"。v0.1 起服务端不再发它，改发标准的 `STEP_UP_REQUIRED`；留着给已经认它的客户端。 */
  stepUpRequired: 'SPEND_APPROVAL_STEP_UP_REQUIRED',
  /** 404：没有这条，或者不是你的 Agent 的。 */
  notFound: 'SPEND_APPROVAL_NOT_FOUND',
  /** 409：已经过期。 */
  expired: 'SPEND_APPROVAL_EXPIRED',
  /** 409：执行前发现参数和批准时的摘要对不上。 */
  argsChanged: 'SPEND_APPROVAL_ARGS_CHANGED',
  /** 409：预算在批准和执行之间不够了（比如别的付款先花了）。 */
  budgetExceeded: 'SPEND_APPROVAL_BUDGET_EXCEEDED',
} as const;

export interface SpendApprovalViewV0 {
  approvalRef: string;
  agentAccountId: string;
  toolName: string;
  spend: SpendApprovalSummaryV0;
  status: SpendApprovalStatusV0;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  /** 执行以后：成功 / 失败的一句话（不含内部错误）。 */
  resultSummary: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 三端用：读批准记录。`pending` 且已过期的读成 `expired`（`nowMs`）；任何一项不对返回 null。 */
export function decodeSpendApprovalViewV0(value: unknown, nowMs: number): SpendApprovalViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.approvalRef !== 'string' || !SPEND_APPROVAL_REF_PATTERN_V0.test(value.approvalRef)) return null;
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return null;
  if (typeof value.toolName !== 'string' || !SPEND_TOOL_NAME_PATTERN_V0.test(value.toolName)) return null;
  const spend = decodeSummary(value.spend);
  if (!spend) return null;
  if (typeof value.status !== 'string' || !(SPEND_APPROVAL_STATUSES_V0 as readonly string[]).includes(value.status)) return null;
  if (!isIso(value.createdAt) || !isIso(value.expiresAt)) return null;
  if (value.decidedAt !== null && !isIso(value.decidedAt)) return null;
  if (value.resultSummary !== null && (typeof value.resultSummary !== 'string' || value.resultSummary.length > 200)) return null;
  const status = value.status === 'pending' && Date.parse(value.expiresAt) <= nowMs ? 'expired' : (value.status as SpendApprovalStatusV0);
  return {
    approvalRef: value.approvalRef,
    agentAccountId: value.agentAccountId,
    toolName: value.toolName,
    spend,
    status,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    decidedAt: value.decidedAt as string | null,
    resultSummary: value.resultSummary as string | null,
  };
}

/** `GET /api/spend-approvals?status=pending` 的响应体（v0.1）。 */
export interface SpendApprovalListV0 {
  items: SpendApprovalViewV0[];
}

/** 三端用：读待批准列表。解不开的单条丢掉，其余照服务端的顺序；整体不对返回 null。 */
export function decodeSpendApprovalListV0(value: unknown, nowMs: number): SpendApprovalListV0 | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > SPEND_APPROVAL_LIST_LIMIT_V0) return null;
  const items: SpendApprovalViewV0[] = [];
  for (const item of value.items) {
    const view = decodeSpendApprovalViewV0(item, nowMs);
    if (view) items.push(view);
  }
  return { items };
}

/** 卡片上能不能显示"批准"按钮：只有 `pending` 而且没过期。拒绝在过期前后都能点（收紧类）。 */
export function spendApprovalActionsV0(view: Pick<SpendApprovalViewV0, 'status'>): { approve: boolean; reject: boolean } {
  return { approve: view.status === 'pending', reject: view.status === 'pending' || view.status === 'expired' };
}

// ── 预算设置的读和改（v0.2，D1 设置入口） ─────────────────────────────────────────────

/**
 * 主人读、改一只 Agent 的预算设置。只认主人本人的登录凭据（`type: 'user'`，不是访客）；别人的 Agent、
 * 不存在的 Agent 都读成 404。所有支付路径都关着时也是 404（和批准路由一样）。
 * - 读：从没设过时回默认值（`SPEND_BUDGET_DEFAULTS_V0`），`revision` 是 0，`updatedAt` 是 null。
 * - 改：请求体就是完整的 `SpendBudgetSettingsV0`，`revision` 填读到的那个。先过 `validateSpendBudgetSettingsV0`
 *   （不合法 400），再在同一个事务里核对 revision（对不上 409，带现在的 `view`）。有任何一项变宽
 *   （`spendBudgetSettingsWideningV0`）要最近登录，不然回标准的 403 `STEP_UP_REQUIRED`，客户端就地确认后原样重发；
 *   没有变宽（改小或不变）立即生效。成功回新的视图，`revision` 加 1。
 */
export const SPEND_BUDGET_SETTINGS_ROUTES_V0 = {
  read: 'GET /api/spend-budgets/:agentAccountId',
  update: 'PUT /api/spend-budgets/:agentAccountId',
} as const;

export const SPEND_BUDGET_SETTINGS_ERROR_CODES_V0 = {
  /** 403：不是本人登录凭据。 */
  signInRequired: 'SPEND_BUDGET_SIGN_IN_REQUIRED',
  /** 404：没有这只 Agent，或者不是你的。 */
  notFound: 'SPEND_BUDGET_NOT_FOUND',
  /** 400：设置不合法，`errors` 是 `validateSpendBudgetSettingsV0` 给的原因。 */
  invalid: 'SPEND_BUDGET_SETTINGS_INVALID',
  /** 409：别处先改了（revision 对不上），`view` 是现在的设置。 */
  stale: 'SPEND_BUDGET_SETTINGS_STALE',
} as const;

/** `GET` / `PUT /api/spend-budgets/:agentAccountId` 的响应体；409 里的 `view` 也是它。 */
export interface SpendBudgetSettingsViewV0 extends SpendBudgetSettingsV0 {
  agentAccountId: string;
  /** 最后一次改的时间；从没设过是 null。 */
  updatedAt: string | null;
}

/** 三端用：读预算设置。只取认识的字段（服务端以后多给的字段不影响）；任何一项不对返回 null。 */
export function decodeSpendBudgetSettingsViewV0(value: unknown): SpendBudgetSettingsViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return null;
  if (value.updatedAt !== null && !isIso(value.updatedAt)) return null;
  const settings: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) settings[key] = value[key];
  if (!validateSpendBudgetSettingsV0(settings).valid) return null;
  const s = settings as unknown as SpendBudgetSettingsV0;
  return {
    agentAccountId: value.agentAccountId,
    updatedAt: value.updatedAt as string | null,
    singleTxLimitCents: s.singleTxLimitCents,
    dailyLimitCents: s.dailyLimitCents,
    monthlyLimitCents: s.monthlyLimitCents,
    freeApprovalCents: s.freeApprovalCents,
    stepUpCents: s.stepUpCents,
    revision: s.revision,
  };
}
