/**
 * D1 统一预算 + D2 对话内批准，合同 v0 草案（E99，REQ-backend-094）。**只有合同，没有实现。**
 *
 * D1：Agent 花钱的每条路径都只调一个服务端函数 `reserve()`，它在一条 SQL 里核对单笔 / 日 / 月限额并预占额度；
 * 付款成功 `commit`，失败或超时 `release`。单位是美元（美分整数），稳定币按 1:1。
 * D2：超过"免批准额度"的付款，两条对话路径（`/openclaw/proxy/:id/stream`、`/claude/chat`）发同一种
 * `approval_required` 事件，带 `approvalRef`；主人在三端批准以后，服务端按摘要原样执行那一次调用。
 *
 * 三端用到的：待批准事件（`decodeSpendApprovalEventV0`）、批准详情和批准结果（`decodeSpendApprovalViewV0`）、
 * 预算设置（`validateSpendBudgetSettingsV0`、`spendBudgetSettingsWideningV0`）。
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
  /** 对话里发起的付款：工具名和参数摘要，批准时按它原样执行。 */
  toolCall?: { toolName: string; argsDigest: string };
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

export interface SpendApprovalSummaryV0 {
  path: SpendPathV0;
  amountCents: number;
  /** 原币（界面显示"约 X 美元"时用）。 */
  original: { amountMinor: number; currency: string } | null;
  /** 收款方的显示名（商户、卖方 Agent），不含账号或地址。 */
  payeeLabel: string;
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
  let originalValue: { amountMinor: number; currency: string } | null = null;
  if (original !== null) {
    if (!isRecord(original) || !Number.isInteger(original.amountMinor) || (original.amountMinor as number) <= 0) return null;
    if (typeof original.currency !== 'string' || !CURRENCY.test(original.currency)) return null;
    originalValue = { amountMinor: original.amountMinor as number, currency: original.currency };
  }
  if (typeof value.payeeLabel !== 'string' || value.payeeLabel.trim().length === 0 || value.payeeLabel.length > 80) return null;
  if (typeof value.stepUpRequired !== 'boolean') return null;
  return {
    path: value.path as SpendPathV0,
    amountCents: value.amountCents,
    original: originalValue,
    payeeLabel: value.payeeLabel,
    stepUpRequired: value.stepUpRequired,
  };
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
  if (typeof value.toolName !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(value.toolName)) return null;
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
 * - `GET  /api/spend-approvals/:ref`：读一条（只给这只 Agent 的主人）。
 * - `POST /api/spend-approvals/:ref/approve`、`/reject`：只认本人登录凭据（`type: 'user'`），Agent、运行时、
 *   第三方客户端的凭据一律 403。超过 step-up 门槛的批准要最近登录，否则 403 并带 `auth-step-up.ts` 的提示。
 * - 幂等：同一个 `approvalRef` 第二次批准或拒绝，返回第一次的结果，不再执行。
 * - 批准以后，服务端按记下的工具名和参数摘要原样执行那一次调用；参数和摘要对不上就不执行（`args_changed`）。
 *   结果作为工具结果回到原来的对话里（两条对话路径一致），三端的卡片变成"已处理"。
 */
export const SPEND_APPROVAL_ROUTES_V0 = {
  read: 'GET /api/spend-approvals/:approvalRef',
  approve: 'POST /api/spend-approvals/:approvalRef/approve',
  reject: 'POST /api/spend-approvals/:approvalRef/reject',
} as const;

export const SPEND_APPROVAL_STATUSES_V0 = ['pending', 'approved', 'rejected', 'expired', 'executed', 'failed'] as const;
export type SpendApprovalStatusV0 = (typeof SPEND_APPROVAL_STATUSES_V0)[number];

export const SPEND_APPROVAL_ERROR_CODES_V0 = {
  /** 403：不是本人登录凭据。 */
  signInRequired: 'SPEND_APPROVAL_SIGN_IN_REQUIRED',
  /** 403：要最近登录（就地确认以后重试）。 */
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
  if (typeof value.toolName !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(value.toolName)) return null;
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

/** 卡片上能不能显示"批准"按钮：只有 `pending` 而且没过期。拒绝在过期前后都能点（收紧类）。 */
export function spendApprovalActionsV0(view: Pick<SpendApprovalViewV0, 'status'>): { approve: boolean; reject: boolean } {
  return { approve: view.status === 'pending', reject: view.status === 'pending' || view.status === 'expired' };
}
