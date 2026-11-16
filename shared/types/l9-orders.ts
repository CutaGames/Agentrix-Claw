/**
 * L9 G 线「订单」共用契约（coord 10-31，owner E145；L9.2 第 10 批 11-06 加了真钱路的合同，见文件末尾）。
 *
 * 钱的总规矩：
 * - 记账单（`rail_mode = none`，今天的全部订单）一切只走测试模式，不碰任何支付通道。这个文件不置位任何开关；
 *   `L9_REAL_MONEY_FLAGS_V1` 里的两个开关（`AGENTRIX_ORDERS_LIVE_MONEY_ENABLED`、`REAL_MONEY_WAVE1_ENABLED`）
 *   在 L9 真钱总开关（`L9_LIVE_MONEY_V1_ENABLED`）没开时只被读来拒绝记账单，从不被置位。
 * - 真钱单（第 10 批的 V2 视图、`L9_LIVE_*` 常量）只在总开关、种类名单、卖方名单和一整套闸门都成立之后才会产生，
 *   默认全关，开一次要 owner 逐次批准（E95）；闸门的实现在 `backend/src/modules/order-escrow/order-live-gate.ts`，这里只放合同。
 * - 每个新开关默认关，只认精确的 `'1'`（`l9FlagOnV1`）。
 */

import { ORDER_STATUSES, normalizeOrderVisitorEmailV1, orderPlatformFeeV1, orderSellerNetProceedsV1 } from './order-escrow';
import { L9_LIVE_LIMITS_V1 } from './real-money-wave1';

/** 只认精确的 '1'。 */
export function l9FlagOnV1(env: Record<string, string | undefined>, name: string): boolean {
  return env[name] === '1';
}

/** 真钱开关。本线的代码只读它们来拒绝，不置位，也不依赖它们为真。 */
export const L9_REAL_MONEY_FLAGS_V1 = ['AGENTRIX_ORDERS_LIVE_MONEY_ENABLED', 'REAL_MONEY_WAVE1_ENABLED'] as const;

// ── L9.2 G2 持牌行业账户：按账户关掉一切钱的入口 ───────────────────────────────────────

/** 服务端环境变量：逗号分隔的持牌行业主人 id。只认精确 id；`*` 当没写；空名单在所有环境都没有人。 */
export const L9_REGULATED_USER_IDS_VAR = 'L9_REGULATED_USER_IDS';
/** 只读接口：我是不是持牌行业账户。不改 `/l9/cohort/me`（三端解码器拒收多出的字段）。 */
export const L9_REGULATED_ROUTE_V1 = '/l9/regulated/me';

/**
 * 持牌名单规则（前后端、测试共用一份）。只认名单里精确出现的 id：`*` 不算通配，空名单（含没设）在生产和非生产都没有人，
 * 没有主人 id（匿名）一律不在。和 `l9CohortAdmitsV1`（`*` = 全体、非生产空名单 = 全允许）刻意相反：这里宁可漏标也不误标全体。
 */
export function l9RegulatedAdmitsV1(input: { userId: string | null | undefined; raw: string | undefined }): boolean {
  if (typeof input.userId !== 'string' || input.userId.length === 0 || input.userId === '*') return false;
  const ids = (input.raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '*');
  return ids.includes(input.userId);
}

/** `GET /l9/regulated/me` 的回答：只有这一个布尔。 */
export interface L9RegulatedStatusV1 {
  schemaVersion: 1;
  regulated: boolean;
}

/** 严格解码：多一个字段、少一个字段、类型不对都返回 null（网页读不到时按「不是持牌账户」照旧显示）。 */
export function decodeL9RegulatedStatusV1(value: unknown): L9RegulatedStatusV1 | null {
  if (!isRecordV1(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('schemaVersion') || !keys.includes('regulated')) return null;
  if (value.schemaVersion !== 1 || typeof value.regulated !== 'boolean') return null;
  return { schemaVersion: 1, regulated: value.regulated };
}

// ── P3-1 订单关联转介 ──────────────────────────────────────────────────────────────────

/** P3-1：退款冲回走全部退款路径、卡住的冲回自动重试、引荐双方能看到关联订单的分成状态。默认关。 */
export const INTRODUCTION_ORDER_LINK_FLAG_V1 = 'INTRODUCTION_ORDER_LINK_V1_ENABLED';

export const INTRODUCTION_LINKED_ORDER_STATES_V1 = ['recorded', 'reversed', 'skipped_live', 'skipped'] as const;
export type IntroductionLinkedOrderStateV1 = (typeof INTRODUCTION_LINKED_ORDER_STATES_V1)[number];

/**
 * 引荐双方（A、B 的主人）看到的一条关联订单。不放订单号、买方身份和邮箱；金额是卖方所得（base）和分成（share）。
 */
export interface IntroductionLinkedOrderV1 {
  /** 旁表 `introduction_orders.id`，不是订单号。 */
  linkId: string;
  shareState: IntroductionLinkedOrderStateV1;
  baseMinor: string;
  shareMinor: string;
  currency: string;
  environment: 'test' | 'live';
  createdAt: string;
  updatedAt: string;
}

export interface IntroductionLinkedOrdersResponseV1 {
  items: IntroductionLinkedOrderV1[];
}

// ── P3-5 对想要的配对打开分成 ────────────────────────────────────────────────────────

/**
 * P3-5：分成只在 A、B 双方各点过一次「要」、而且比例相同时才付；比例上限一成；持牌行业不开。默认关。
 * 开关开着时，分成比例以双方点「要」时的比例为准（不再读引荐上的 `shareBps`）；没有双方的「要」，订单照常成交、不付分成。
 * 开关关着时，行为和今天一样（读引荐的 `shareBps`，上限 10%）。
 */
export const INTRODUCTION_SHARE_OPTIN_FLAG_V1 = 'INTRODUCTION_SHARE_OPTIN_V1_ENABLED';
/** 默认上限：一成（1000 基点），和 `INTRODUCTION_SHARE_MAX_BPS_V1`、`REFERRAL_SHARE_MAX_BPS_V0` 同一个数。 */
export const INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1 = 1000;
/** 只能把上限调低的环境变量；不是 1 到 1000 的整数就忽略（上限仍是一成）。 */
export const INTRODUCTION_SHARE_OPTIN_MAX_BPS_ENV_V1 = 'INTRODUCTION_SHARE_OPTIN_MAX_BPS';

export const INTRODUCTION_SHARE_OPTIN_PARTIES_V1 = ['a', 'b'] as const;
export type IntroductionShareOptinPartyV1 = (typeof INTRODUCTION_SHARE_OPTIN_PARTIES_V1)[number];

/** 可开分成的服务类别（自报，封闭清单）。 */
export const INTRODUCTION_SHARE_CATEGORIES_V1 = [
  'design_creative',
  'photography_video',
  'tutoring_coaching',
  'event_planning',
  'marketing_content',
  'software_it',
  'home_services',
  'translation_writing',
  'other_unlicensed',
] as const;
export type IntroductionShareCategoryV1 = (typeof INTRODUCTION_SHARE_CATEGORIES_V1)[number];

/** 持牌或受监管的行业：不开分成。点「要」时选到这些，直接拒绝。 */
export const INTRODUCTION_LICENSED_CATEGORIES_V1 = [
  'legal',
  'medical_health',
  'financial_investment',
  'insurance',
  'accounting_audit_tax',
  'real_estate_agency',
  'immigration',
] as const;

const LICENSED_PURPOSE_PATTERN_V1 =
  /(?:律师|法律|诉讼|官司|医生|医疗|诊所|医院|处方|药品|看病|诊断|治疗|投资|理财|基金|股票|证券|炒币|保险|会计|审计|报税|地产中介|房产中介|买房|卖房|移民|签证)|\b(?:lawyer|attorney|solicitor|legal advice|litigation|medical|doctor|physician|clinic|prescription|diagnos\w*|therap\w*|invest\w*|financial advis\w*|wealth management|securities|insurance|accountant|accounting|audit\w*|tax filing|real estate agent|property agent|conveyanc\w*|immigration|visa)\b/i;

/** 引荐的「为什么介绍」里提到了持牌行业的词。宁可误拦（安全的失败）：被拦只是不开分成，订单照常成交。 */
export function introductionPurposeLooksLicensedV1(purpose: unknown): boolean {
  return typeof purpose === 'string' && LICENSED_PURPOSE_PATTERN_V1.test(purpose);
}

/** 类别是持牌行业，或不在可开清单里，或引荐的说明里提到持牌行业词：都不开。 */
export function introductionShareLicensedV1(category: unknown, purpose: unknown): boolean {
  if (typeof category !== 'string') return true;
  if (!(INTRODUCTION_SHARE_CATEGORIES_V1 as readonly string[]).includes(category)) return true;
  return introductionPurposeLooksLicensedV1(purpose);
}

/** 当前生效的上限：一成，环境变量只能往下调。 */
export function introductionShareCapBpsV1(env: Record<string, string | undefined> = process.env): number {
  const raw = env[INTRODUCTION_SHARE_OPTIN_MAX_BPS_ENV_V1];
  if (typeof raw === 'string' && /^[1-9][0-9]{0,3}$/.test(raw)) {
    const value = Number(raw);
    if (value >= 1 && value <= INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1) return value;
  }
  return INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1;
}

export const INTRODUCTION_SHARE_OPTIN_REASONS_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  'share_over_cap',
  'licensed_industry',
] as const;
export type IntroductionShareOptinReasonV1 = (typeof INTRODUCTION_SHARE_OPTIN_REASONS_V1)[number];

/** 点「要」：自己愿意按多少基点分，自己的服务类别。引荐号在路径里，身份取登录态。 */
export interface IntroductionShareOptinRequestV1 {
  schemaVersion: 1;
  bps: number;
  category: IntroductionShareCategoryV1;
}

export type IntroductionShareOptinDecodeV1<T> = { ok: true; value: T } | { ok: false; reasonCode: IntroductionShareOptinReasonV1; field: string };

export function decodeIntroductionShareOptinRequestV1(value: unknown): IntroductionShareOptinDecodeV1<IntroductionShareOptinRequestV1> {
  if (!isRecordV1(value)) return { ok: false, reasonCode: 'invalid_type', field: '$' };
  for (const key of Object.keys(value)) {
    if (!['schemaVersion', 'bps', 'category'].includes(key)) return { ok: false, reasonCode: 'unknown_field', field: key };
  }
  if (value.schemaVersion === undefined) return { ok: false, reasonCode: 'missing_field', field: 'schemaVersion' };
  if (typeof value.schemaVersion !== 'number') return { ok: false, reasonCode: 'invalid_type', field: 'schemaVersion' };
  if (value.schemaVersion !== 1) return { ok: false, reasonCode: 'unsupported_schema_version', field: 'schemaVersion' };
  for (const key of ['bps', 'category']) if (value[key] === undefined) return { ok: false, reasonCode: 'missing_field', field: key };
  if (typeof value.bps !== 'number') return { ok: false, reasonCode: 'invalid_type', field: 'bps' };
  if (!Number.isInteger(value.bps) || value.bps < 1) return { ok: false, reasonCode: 'invalid_value', field: 'bps' };
  if (value.bps > INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1) return { ok: false, reasonCode: 'share_over_cap', field: 'bps' };
  if (typeof value.category !== 'string') return { ok: false, reasonCode: 'invalid_type', field: 'category' };
  if ((INTRODUCTION_LICENSED_CATEGORIES_V1 as readonly string[]).includes(value.category)) {
    return { ok: false, reasonCode: 'licensed_industry', field: 'category' };
  }
  if (!(INTRODUCTION_SHARE_CATEGORIES_V1 as readonly string[]).includes(value.category)) return { ok: false, reasonCode: 'invalid_value', field: 'category' };
  return { ok: true, value: { schemaVersion: 1, bps: value.bps, category: value.category as IntroductionShareCategoryV1 } };
}

/** 一方的「要」。撤回后 `want` 为 false、`withdrawn` 为 true。 */
export interface IntroductionShareOptinSideV1 {
  want: boolean;
  withdrawn: boolean;
  bps: number | null;
}

/** 给 A、B 看的状态；只有这两位主人能读。不放对方的类别和身份。 */
export interface IntroductionShareOptinStatusV1 {
  schemaVersion: 1;
  introductionId: string;
  yourParty: IntroductionShareOptinPartyV1;
  yours: IntroductionShareOptinSideV1;
  theirs: IntroductionShareOptinSideV1;
  /** 双方都在、都没撤回、比例相同。 */
  agreed: boolean;
  agreedBps: number | null;
  capBps: number;
}

function decodeSideV1(value: unknown): IntroductionShareOptinSideV1 | null {
  if (!isRecordV1(value) || Object.keys(value).some((key) => !['want', 'withdrawn', 'bps'].includes(key))) return null;
  if (typeof value.want !== 'boolean' || typeof value.withdrawn !== 'boolean') return null;
  if (value.bps !== null && (typeof value.bps !== 'number' || !Number.isInteger(value.bps) || value.bps < 1 || value.bps > INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1)) return null;
  if (value.want && (value.withdrawn || value.bps === null)) return null;
  return { want: value.want, withdrawn: value.withdrawn, bps: value.bps as number | null };
}

export function decodeIntroductionShareOptinStatusV1(value: unknown): IntroductionShareOptinStatusV1 | null {
  if (!isRecordV1(value)) return null;
  const keys = ['schemaVersion', 'introductionId', 'yourParty', 'yours', 'theirs', 'agreed', 'agreedBps', 'capBps'];
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => value[key] === undefined)) return null;
  if (value.schemaVersion !== 1) return null;
  if (typeof value.introductionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.introductionId)) return null;
  if (value.yourParty !== 'a' && value.yourParty !== 'b') return null;
  const yours = decodeSideV1(value.yours);
  const theirs = decodeSideV1(value.theirs);
  if (!yours || !theirs || typeof value.agreed !== 'boolean') return null;
  if (typeof value.capBps !== 'number' || !Number.isInteger(value.capBps) || value.capBps < 1 || value.capBps > INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1) return null;
  if (value.agreed) {
    if (typeof value.agreedBps !== 'number' || value.agreedBps !== yours.bps || value.agreedBps !== theirs.bps || value.agreedBps > value.capBps) return null;
  } else if (value.agreedBps !== null) return null;
  return value as unknown as IntroductionShareOptinStatusV1;
}

/**
 * 付分成时用的比例：A、B 各有一条没撤回的「要」、比例相同、在上限内才有值；其余一律 0（不付）。
 * 这是唯一算比例的地方，付钱路径和状态页都用它。
 */
export function introductionShareAgreedBpsV1(
  rows: ReadonlyArray<{ party: string; bps: number; withdrawnAt?: Date | string | null }>,
  capBps: number = INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1,
): number {
  const live = (party: IntroductionShareOptinPartyV1) => rows.filter((row) => row.party === party && (row.withdrawnAt === null || row.withdrawnAt === undefined));
  const a = live('a');
  const b = live('b');
  if (a.length !== 1 || b.length !== 1) return 0;
  const bps = a[0].bps;
  if (!Number.isInteger(bps) || bps !== b[0].bps || bps < 1) return 0;
  const cap = Math.min(capBps, INTRODUCTION_SHARE_OPTIN_MAX_BPS_V1);
  return bps <= cap ? bps : 0;
}

const MINOR_V1 = /^(0|[1-9][0-9]{0,23})$/;

function isRecordV1(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解码一条关联订单；多余字段、错误类型一律拒收，返回 null。 */
export function decodeIntroductionLinkedOrderV1(value: unknown): IntroductionLinkedOrderV1 | null {
  if (!isRecordV1(value)) return null;
  const keys = ['linkId', 'shareState', 'baseMinor', 'shareMinor', 'currency', 'environment', 'createdAt', 'updatedAt'];
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => value[key] === undefined)) return null;
  if (typeof value.linkId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.linkId)) return null;
  if (!(INTRODUCTION_LINKED_ORDER_STATES_V1 as readonly unknown[]).includes(value.shareState)) return null;
  if (typeof value.baseMinor !== 'string' || !MINOR_V1.test(value.baseMinor)) return null;
  if (typeof value.shareMinor !== 'string' || !MINOR_V1.test(value.shareMinor)) return null;
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) return null;
  if (value.environment !== 'test' && value.environment !== 'live') return null;
  for (const key of ['createdAt', 'updatedAt']) {
    if (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key] as string))) return null;
  }
  return value as unknown as IntroductionLinkedOrderV1;
}

export function decodeIntroductionLinkedOrdersResponseV1(value: unknown): IntroductionLinkedOrdersResponseV1 | null {
  if (!isRecordV1(value) || Object.keys(value).some((key) => key !== 'items') || !Array.isArray(value.items)) return null;
  const items: IntroductionLinkedOrderV1[] = [];
  for (const item of value.items) {
    const decoded = decodeIntroductionLinkedOrderV1(item);
    if (!decoded) return null;
    items.push(decoded);
  }
  return { items };
}

// ── P3-2 项目级订单（报价、定金、尾款） ────────────────────────────────────────────────

/**
 * P3-2：主人（在 L9 名单内）给一位买方发一张报价：总价、定金比例、范围说明。买方凭一次性令牌加自己的邮箱接受，接受时定金作为一笔
 * 记账订单（`project_deposit`）托管起来；订单的交付、验收、放款、退款、争议、引荐分成都走原来的订单流程。尾款走银行转账，平台
 * 看不到、不经手，只记双方各说了什么（`ProjectFinalStateV1`）。只在测试模式。默认关。
 */
export const PROJECT_ORDERS_FLAG_V1 = 'PROJECT_ORDERS_V1_ENABLED';

export const PROJECT_ORDER_LIMITS_V1 = {
  titleMax: 80,
  scopeMax: 2000,
  /** 总价（最小单位，两位小数）：1 万以内不收，上限 100 万。 */
  totalMinMinor: 10_000,
  totalMaxMinor: 100_000_000,
  /** 定金占总价 10% 到 50%（基点）。 */
  depositBpsMin: 1000,
  depositBpsMax: 5000,
  /** 定金这一笔订单本身的上下限，和订单目录的单价上下限一致（1.00 到 10,000.00）。 */
  depositMinMinor: 100,
  depositMaxMinor: 1_000_000,
  quoteDays: 14,
  openPerSellerMax: 20,
  tokenMin: 32,
  tokenMax: 64,
} as const;

export const PROJECT_ORDER_STATUSES_V1 = ['quoted', 'deposit_held', 'declined', 'expired', 'withdrawn'] as const;
export type ProjectOrderStatusV1 = (typeof PROJECT_ORDER_STATUSES_V1)[number];

/** 尾款：平台不经手、看不到。`seller_reported` = 卖方说收到了；买方回 `buyer_confirmed` 或 `buyer_disputed`。 */
export const PROJECT_FINAL_STATES_V1 = ['none', 'seller_reported', 'buyer_confirmed', 'buyer_disputed'] as const;
export type ProjectFinalStateV1 = (typeof PROJECT_FINAL_STATES_V1)[number];

export const PROJECT_CURRENCIES_V1 = ['USD', 'SGD'] as const;

/**
 * 定金和尾款的拆法：定金 = 总价 × 比例（向下取整），尾款 = 总价 − 定金。定金不在上下限内、比例越界、总价越界，返回 null。
 * 付钱路径和视图都用它，只有这一处算。
 */
export function projectDepositSplitV1(totalMinor: string, depositBps: number): { depositMinor: string; finalMinor: string } | null {
  const limits = PROJECT_ORDER_LIMITS_V1;
  if (typeof totalMinor !== 'string' || !/^[1-9][0-9]{0,15}$/.test(totalMinor)) return null;
  if (!Number.isInteger(depositBps) || depositBps < limits.depositBpsMin || depositBps > limits.depositBpsMax) return null;
  const total = BigInt(totalMinor);
  if (total < BigInt(limits.totalMinMinor) || total > BigInt(limits.totalMaxMinor)) return null;
  const deposit = (total * BigInt(depositBps)) / BigInt(10_000);
  if (deposit < BigInt(limits.depositMinMinor) || deposit > BigInt(limits.depositMaxMinor)) return null;
  return { depositMinor: deposit.toString(), finalMinor: (total - deposit).toString() };
}

export const PROJECT_REASONS_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  'deposit_out_of_range',
] as const;
export type ProjectReasonV1 = (typeof PROJECT_REASONS_V1)[number];
export type ProjectDecodeV1<T> = { ok: true; value: T } | { ok: false; reasonCode: ProjectReasonV1; field: string };

export interface ProjectQuoteCreateRequestV1 {
  schemaVersion: 1;
  /** 卖方 Agent 的外部编号（`agentUniqueId`），必须是自己的。 */
  sellerAgentId: string;
  /** 买方邮箱。只存哈希；报价令牌由卖方自己转给买方。 */
  buyerEmail: string;
  title: string;
  scope: string;
  total: { amountMinor: string; currency: 'USD' | 'SGD'; decimals: 2 };
  depositBps: number;
}

const CONTROL_V1 = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function textV1(value: unknown, max: number, multiline: boolean): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length === 0 || [...text].length > max) return null;
  if (multiline ? CONTROL_V1.test(text) : /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

export function decodeProjectQuoteCreateRequestV1(value: unknown): ProjectDecodeV1<ProjectQuoteCreateRequestV1> {
  const fail = (reasonCode: ProjectReasonV1, field: string): ProjectDecodeV1<never> => ({ ok: false, reasonCode, field });
  if (!isRecordV1(value)) return fail('invalid_type', '$');
  const allowed = ['schemaVersion', 'sellerAgentId', 'buyerEmail', 'title', 'scope', 'total', 'depositBps'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== 1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of allowed.slice(1)) if (value[key] === undefined) return fail('missing_field', key);
  if (typeof value.sellerAgentId !== 'string') return fail('invalid_type', 'sellerAgentId');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value.sellerAgentId)) return fail('invalid_value', 'sellerAgentId');
  if (typeof value.buyerEmail !== 'string') return fail('invalid_type', 'buyerEmail');
  const email = normalizeOrderVisitorEmailV1(value.buyerEmail);
  if (!email) return fail('invalid_value', 'buyerEmail');
  if (typeof value.title !== 'string') return fail('invalid_type', 'title');
  const title = textV1(value.title, PROJECT_ORDER_LIMITS_V1.titleMax, false);
  if (!title) return fail('invalid_value', 'title');
  if (typeof value.scope !== 'string') return fail('invalid_type', 'scope');
  const scope = textV1(value.scope, PROJECT_ORDER_LIMITS_V1.scopeMax, true);
  if (!scope) return fail('invalid_value', 'scope');
  const total = value.total;
  if (!isRecordV1(total)) return fail('invalid_type', 'total');
  for (const key of Object.keys(total)) if (!['amountMinor', 'currency', 'decimals'].includes(key)) return fail('unknown_field', `total.${key}`);
  for (const key of ['amountMinor', 'currency', 'decimals']) if (total[key] === undefined) return fail('missing_field', `total.${key}`);
  if (typeof total.amountMinor !== 'string') return fail('invalid_type', 'total.amountMinor');
  if (typeof total.currency !== 'string') return fail('invalid_type', 'total.currency');
  if (!(PROJECT_CURRENCIES_V1 as readonly string[]).includes(total.currency)) return fail('invalid_value', 'total.currency');
  if (total.decimals !== 2) return fail('invalid_value', 'total.decimals');
  if (typeof value.depositBps !== 'number') return fail('invalid_type', 'depositBps');
  if (!Number.isInteger(value.depositBps)) return fail('invalid_value', 'depositBps');
  if (!projectDepositSplitV1(total.amountMinor, value.depositBps)) {
    const outsideBps = value.depositBps < PROJECT_ORDER_LIMITS_V1.depositBpsMin || value.depositBps > PROJECT_ORDER_LIMITS_V1.depositBpsMax;
    return fail(outsideBps ? 'deposit_out_of_range' : 'invalid_value', outsideBps ? 'depositBps' : 'total.amountMinor');
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      sellerAgentId: value.sellerAgentId,
      buyerEmail: email,
      title,
      scope,
      total: { amountMinor: total.amountMinor, currency: total.currency as 'USD' | 'SGD', decimals: 2 },
      depositBps: value.depositBps,
    },
  };
}

/** 买方凭令牌打开或接受报价：请求体只有令牌。 */
export interface ProjectTokenRequestV1 {
  schemaVersion: 1;
  token: string;
}

export function decodeProjectTokenRequestV1(value: unknown): ProjectDecodeV1<ProjectTokenRequestV1> {
  const fail = (reasonCode: ProjectReasonV1, field: string): ProjectDecodeV1<never> => ({ ok: false, reasonCode, field });
  if (!isRecordV1(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (!['schemaVersion', 'token'].includes(key)) return fail('unknown_field', key);
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== 1) return fail('unsupported_schema_version', 'schemaVersion');
  if (value.token === undefined) return fail('missing_field', 'token');
  if (typeof value.token !== 'string') return fail('invalid_type', 'token');
  const { tokenMin, tokenMax } = PROJECT_ORDER_LIMITS_V1;
  if (value.token.length < tokenMin || value.token.length > tokenMax || !/^[A-Za-z0-9_-]+$/.test(value.token)) return fail('invalid_value', 'token');
  return { ok: true, value: { schemaVersion: 1, token: value.token } };
}

/** 买方对尾款的回答。 */
export const PROJECT_FINAL_ANSWERS_V1 = ['confirm', 'dispute'] as const;
export interface ProjectFinalAnswerRequestV1 {
  schemaVersion: 1;
  answer: (typeof PROJECT_FINAL_ANSWERS_V1)[number];
}

export function decodeProjectFinalAnswerRequestV1(value: unknown): ProjectDecodeV1<ProjectFinalAnswerRequestV1> {
  const fail = (reasonCode: ProjectReasonV1, field: string): ProjectDecodeV1<never> => ({ ok: false, reasonCode, field });
  if (!isRecordV1(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (!['schemaVersion', 'answer'].includes(key)) return fail('unknown_field', key);
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== 1) return fail('unsupported_schema_version', 'schemaVersion');
  if (value.answer === undefined) return fail('missing_field', 'answer');
  if (typeof value.answer !== 'string') return fail('invalid_type', 'answer');
  if (!(PROJECT_FINAL_ANSWERS_V1 as readonly string[]).includes(value.answer)) return fail('invalid_value', 'answer');
  return { ok: true, value: { schemaVersion: 1, answer: value.answer as ProjectFinalAnswerRequestV1['answer'] } };
}

interface ProjectMoneyV1 {
  amountMinor: string;
  currency: 'USD' | 'SGD';
  decimals: 2;
}

/** 卖方和买方看到的报价。买方的邮箱、令牌哈希都不出现。`environment` 永远是 `test`。 */
export interface ProjectOrderViewV1 {
  schemaVersion: 1;
  projectRef: string;
  role: 'seller' | 'buyer';
  status: ProjectOrderStatusV1;
  title: string;
  scope: string;
  total: ProjectMoneyV1;
  deposit: ProjectMoneyV1;
  /** 尾款：平台不经手。 */
  final: ProjectMoneyV1;
  depositBps: number;
  finalState: ProjectFinalStateV1;
  finalHandledOffPlatform: true;
  /** 定金这笔订单的号和现在的状态；接受之前为 null。订单号只给报价的双方。 */
  depositOrderId: string | null;
  depositOrderStatus: string | null;
  sellerAgentId: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  environment: 'test';
}

/** 创建报价的响应：视图，加上只显示这一次的令牌。 */
export interface ProjectQuoteCreatedV1 extends ProjectOrderViewV1 {
  quoteToken: string;
}

// ── P3-3 定金版预约（免注册访客加定金） ────────────────────────────────────────────────

/**
 * P3-3：一个已确认的免注册访客预约（E 线 P2-4 的访客入口，经 `GuestBookingPortV1` 读），主人可以为它要一笔定金。定金的金额由主人
 * 定（不在上下限之外），访客用预约时留的邮箱加一次性令牌接受，不用注册；接受时定金作为一笔记账订单（`booking_deposit`）托管。
 * 要不要退、退多少，永远由主人在订单上决定；分身不替主人答应退款。只在测试模式。默认关。
 */
export const BOOKING_DEPOSIT_FLAG_V1 = 'BOOKING_DEPOSIT_V1_ENABLED';

export const BOOKING_DEPOSIT_LIMITS_V1 = {
  /** 1.00 到 1,000.00（最小单位，两位小数）。 */
  minMinor: 100,
  maxMinor: 100_000,
  /** 要定金之后，访客最多这么久来接受。 */
  expiryDays: 7,
  openPerSellerMax: 50,
} as const;

export const BOOKING_DEPOSIT_STATUSES_V1 = ['requested', 'held', 'withdrawn', 'expired'] as const;
export type BookingDepositStatusV1 = (typeof BOOKING_DEPOSIT_STATUSES_V1)[number];

export interface BookingDepositRequestV1 {
  schemaVersion: 1;
  /** E 线预约的不透明编号。 */
  bookingRef: string;
  amount: { amountMinor: string; currency: 'USD' | 'SGD'; decimals: 2 };
}

export function decodeBookingDepositRequestV1(value: unknown): ProjectDecodeV1<BookingDepositRequestV1> {
  const fail = (reasonCode: ProjectReasonV1, field: string): ProjectDecodeV1<never> => ({ ok: false, reasonCode, field });
  if (!isRecordV1(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (!['schemaVersion', 'bookingRef', 'amount'].includes(key)) return fail('unknown_field', key);
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== 1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of ['bookingRef', 'amount']) if (value[key] === undefined) return fail('missing_field', key);
  if (typeof value.bookingRef !== 'string') return fail('invalid_type', 'bookingRef');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/.test(value.bookingRef)) return fail('invalid_value', 'bookingRef');
  const amount = value.amount;
  if (!isRecordV1(amount)) return fail('invalid_type', 'amount');
  for (const key of Object.keys(amount)) if (!['amountMinor', 'currency', 'decimals'].includes(key)) return fail('unknown_field', `amount.${key}`);
  for (const key of ['amountMinor', 'currency', 'decimals']) if (amount[key] === undefined) return fail('missing_field', `amount.${key}`);
  if (typeof amount.amountMinor !== 'string') return fail('invalid_type', 'amount.amountMinor');
  if (typeof amount.currency !== 'string') return fail('invalid_type', 'amount.currency');
  if (!(PROJECT_CURRENCIES_V1 as readonly string[]).includes(amount.currency)) return fail('invalid_value', 'amount.currency');
  if (amount.decimals !== 2) return fail('invalid_value', 'amount.decimals');
  if (!/^[1-9][0-9]{0,9}$/.test(amount.amountMinor)) return fail('invalid_value', 'amount.amountMinor');
  const minor = Number(amount.amountMinor);
  if (minor < BOOKING_DEPOSIT_LIMITS_V1.minMinor || minor > BOOKING_DEPOSIT_LIMITS_V1.maxMinor) return fail('deposit_out_of_range', 'amount.amountMinor');
  return {
    ok: true,
    value: { schemaVersion: 1, bookingRef: value.bookingRef, amount: { amountMinor: amount.amountMinor, currency: amount.currency as 'USD' | 'SGD', decimals: 2 } },
  };
}

/** 访客和主人看到的定金。访客的邮箱、令牌哈希都不出现。 */
export interface BookingDepositViewV1 {
  schemaVersion: 1;
  depositRef: string;
  role: 'seller' | 'buyer';
  bookingRef: string;
  status: BookingDepositStatusV1;
  amount: { amountMinor: string; currency: 'USD' | 'SGD'; decimals: 2 };
  depositOrderId: string | null;
  depositOrderStatus: string | null;
  startsAt: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  environment: 'test';
}

export interface BookingDepositCreatedV1 extends BookingDepositViewV1 {
  depositToken: string;
}

// ── P3-8 物品订单（条件项，只写到测试模式） ────────────────────────────────────────────────

/**
 * P3-8：二手物品的订单种类 `item_purchase`，和设备资产线 S24（物品托管测试模式）用同一个种类，不另造。买家付款进托管（测试模式，记账，
 * 不经过任何支付通道）→ 面交 → 卖家在订单上点交付、买家点「收到了」（验收期 48 小时，到期自动验收）→ 放款（也是记账）。平台费 0（D3）。
 * 二手不分成：这种订单成交后不付引荐分成（`orderKindPaysReferralShareV1`）。同一个物品同时只有一笔进行中的订单。
 * 种类要放宽订单表的 CHECK（迁移 2254，**不是纯加法，上生产要 owner 逐次批**）。
 * 默认关；只有设备资产线的服务经 `ITEM_ORDERS_PORT_V1` 调用，没有公开路由。真钱的放款国家只写了配置项（`ORDER_ITEM_PAYOUT_COUNTRY`），不开。
 */
export const ITEM_ORDERS_FLAG_V1 = 'ITEM_ORDERS_V1_ENABLED';
export const ITEM_ORDER_KIND_V1 = 'item_purchase' as const;
/** 以后真钱放款时 `ORDER_ITEM_PAYOUT_COUNTRY` 该写的值（新加坡）。现在不设，也没有任何代码读它来放款。 */
export const ITEM_ORDER_PAYOUT_COUNTRY_V1 = 'SG' as const;
/** 面交验收期（秒）：和 `ORDER_DEFAULT_WINDOWS_SECONDS.acceptance.item_purchase` 同一个数（D2）。 */
export const ITEM_ORDER_ACCEPTANCE_SECONDS_V1 = 48 * 60 * 60;

export const ITEM_ORDER_REASONS_V1 = [
  'disabled',
  'orders_disabled',
  'test_mode_only',
  'invalid_input',
  'self_purchase',
  'seller_not_found',
  'already_held',
  // L9.2 第 10 批（真钱路）：预订剩余的时间不够走完付款和交接。旧的记账路径不会产生它。
  'quote_expiring_soon',
  // L9.2 第 10 批（真钱路，设计 12.3 第 9 步）：卖方还不能真钱收款（收款账户、条款、名单等建单闸没过；细节只给卖方）。网页显示 `escrow_seller_not_ready`。
  'seller_not_ready',
  // L9.2 第 10 批（U-04）：总开关开着时，持牌行业卖方的物品订单（`L9_REGULATED_USER_IDS`）。总开关关着时照旧答 `seller_not_found`；网页对买方仍按「卖方不存在」显示。
  'order_licensed_industry',
] as const;
export type ItemOrderReasonV1 = (typeof ITEM_ORDER_REASONS_V1)[number];

// ── 保留期（P3-2、P3-3 的免登录入口，接口规则「90 天删除」） ─────────────────────────────────

/**
 * 报价或定金请求结束 90 天后清掉指向买方的东西：没被接受的整行删除；接受过的，等定金订单结束（放款、退款、取消）且 90 天没变化，
 * 把邮箱摘要和令牌摘要换成占位、去掉接受者的键（订单本身是钱的记录，不动）。见 `L9OrdersRetentionService`。
 */
export const L9_ORDER_RETENTION_DAYS_V1 = 90;

// ── 视图解码（网页每个响应都过这里；多一个字段就当失败） ─────────────────────────────────────

const PROJECT_VIEW_KEYS_V1 = [
  'schemaVersion',
  'projectRef',
  'role',
  'status',
  'title',
  'scope',
  'total',
  'deposit',
  'final',
  'depositBps',
  'finalState',
  'finalHandledOffPlatform',
  'depositOrderId',
  'depositOrderStatus',
  'sellerAgentId',
  'createdAt',
  'expiresAt',
  'acceptedAt',
  'environment',
] as const;

const BOOKING_DEPOSIT_VIEW_KEYS_V1 = [
  'schemaVersion',
  'depositRef',
  'role',
  'bookingRef',
  'status',
  'amount',
  'depositOrderId',
  'depositOrderStatus',
  'startsAt',
  'createdAt',
  'expiresAt',
  'acceptedAt',
  'environment',
] as const;

const ONE_TIME_TOKEN_V1 = /^[A-Za-z0-9_-]{32,64}$/;
const ORDER_ID_V1 = /^ord_[0-9a-f]{32}$/;

function exactKeysV1(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => value[key] !== undefined);
}

function isoV1(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function moneyV1(value: unknown): value is ProjectMoneyV1 {
  return (
    isRecordV1(value) &&
    exactKeysV1(value, ['amountMinor', 'currency', 'decimals']) &&
    typeof value.amountMinor === 'string' &&
    /^(0|[1-9][0-9]{0,15})$/.test(value.amountMinor) &&
    (PROJECT_CURRENCIES_V1 as readonly unknown[]).includes(value.currency) &&
    value.decimals === 2
  );
}

function orderLinkV1(id: unknown, status: unknown): boolean {
  if (id === null) return status === null;
  return typeof id === 'string' && ORDER_ID_V1.test(id) && (status === null || (ORDER_STATUSES as readonly unknown[]).includes(status));
}

/** 一张报价的视图。金额要和 `projectDepositSplitV1` 算出来的一致，币种三处相同，`environment` 只能是 `test`。 */
export function decodeProjectOrderViewV1(value: unknown, extraKeys: readonly string[] = []): ProjectOrderViewV1 | null {
  if (!isRecordV1(value) || !exactKeysV1(value, [...PROJECT_VIEW_KEYS_V1, ...extraKeys])) return null;
  if (value.schemaVersion !== 1 || value.environment !== 'test' || value.finalHandledOffPlatform !== true) return null;
  if (typeof value.projectRef !== 'string' || !/^prj_[0-9a-f]{32}$/.test(value.projectRef)) return null;
  if (value.role !== 'seller' && value.role !== 'buyer') return null;
  if (!(PROJECT_ORDER_STATUSES_V1 as readonly unknown[]).includes(value.status)) return null;
  if (!(PROJECT_FINAL_STATES_V1 as readonly unknown[]).includes(value.finalState)) return null;
  if (typeof value.title !== 'string' || typeof value.scope !== 'string') return null;
  if (!moneyV1(value.total) || !moneyV1(value.deposit) || !moneyV1(value.final)) return null;
  if (value.total.currency !== value.deposit.currency || value.total.currency !== value.final.currency) return null;
  if (typeof value.depositBps !== 'number') return null;
  const split = projectDepositSplitV1(value.total.amountMinor, value.depositBps);
  if (!split || split.depositMinor !== value.deposit.amountMinor || split.finalMinor !== value.final.amountMinor) return null;
  if (!orderLinkV1(value.depositOrderId, value.depositOrderStatus)) return null;
  if (typeof value.sellerAgentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value.sellerAgentId)) return null;
  if (!isoV1(value.createdAt) || !isoV1(value.expiresAt) || !(value.acceptedAt === null || isoV1(value.acceptedAt))) return null;
  // Accepted means a deposit order; not accepted means none.
  if ((value.status === 'deposit_held') !== (value.depositOrderId !== null)) return null;
  return value as unknown as ProjectOrderViewV1;
}

/** 刚发出的报价：视图加只出现这一次的令牌（只给卖方）。 */
export function decodeProjectQuoteCreatedV1(value: unknown): ProjectQuoteCreatedV1 | null {
  const view = decodeProjectOrderViewV1(value, ['quoteToken']);
  if (!view || view.role !== 'seller' || view.status !== 'quoted') return null;
  const token = (value as Record<string, unknown>).quoteToken;
  return typeof token === 'string' && ONE_TIME_TOKEN_V1.test(token) ? (value as ProjectQuoteCreatedV1) : null;
}

export function decodeProjectOrderListV1(value: unknown): { items: ProjectOrderViewV1[] } | null {
  if (!isRecordV1(value) || !exactKeysV1(value, ['items']) || !Array.isArray(value.items)) return null;
  const items: ProjectOrderViewV1[] = [];
  for (const item of value.items) {
    const view = decodeProjectOrderViewV1(item);
    if (!view || view.role !== 'seller') return null;
    items.push(view);
  }
  return { items };
}

/** 一笔预约定金的视图。 */
export function decodeBookingDepositViewV1(value: unknown, extraKeys: readonly string[] = []): BookingDepositViewV1 | null {
  if (!isRecordV1(value) || !exactKeysV1(value, [...BOOKING_DEPOSIT_VIEW_KEYS_V1, ...extraKeys])) return null;
  if (value.schemaVersion !== 1 || value.environment !== 'test') return null;
  if (typeof value.depositRef !== 'string' || !/^bkd_[0-9a-f]{32}$/.test(value.depositRef)) return null;
  if (value.role !== 'seller' && value.role !== 'buyer') return null;
  if (typeof value.bookingRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/.test(value.bookingRef)) return null;
  if (!(BOOKING_DEPOSIT_STATUSES_V1 as readonly unknown[]).includes(value.status)) return null;
  if (!moneyV1(value.amount)) return null;
  const minor = Number(value.amount.amountMinor);
  if (minor < BOOKING_DEPOSIT_LIMITS_V1.minMinor || minor > BOOKING_DEPOSIT_LIMITS_V1.maxMinor) return null;
  if (!orderLinkV1(value.depositOrderId, value.depositOrderStatus)) return null;
  if ((value.status === 'held') !== (value.depositOrderId !== null)) return null;
  if (!isoV1(value.startsAt) || !isoV1(value.createdAt) || !isoV1(value.expiresAt) || !(value.acceptedAt === null || isoV1(value.acceptedAt))) return null;
  return value as unknown as BookingDepositViewV1;
}

export function decodeBookingDepositCreatedV1(value: unknown): BookingDepositCreatedV1 | null {
  const view = decodeBookingDepositViewV1(value, ['depositToken']);
  if (!view || view.role !== 'seller' || view.status !== 'requested') return null;
  const token = (value as Record<string, unknown>).depositToken;
  return typeof token === 'string' && ONE_TIME_TOKEN_V1.test(token) ? (value as BookingDepositCreatedV1) : null;
}

export function decodeBookingDepositListV1(value: unknown): { items: BookingDepositViewV1[] } | null {
  if (!isRecordV1(value) || !exactKeysV1(value, ['items']) || !Array.isArray(value.items)) return null;
  const items: BookingDepositViewV1[] = [];
  for (const item of value.items) {
    const view = decodeBookingDepositViewV1(item);
    if (!view || view.role !== 'seller') return null;
    items.push(view);
  }
  return { items };
}

// ── 买方 / 访客页面的网址（令牌只放在 # 后面，不进路径和查询串，不进服务器日志） ───────────────────

/**
 * 不放在 `/orders/` 下面：那里是 `/orders/[orderId]`（买方订单页），新页面一占位，开关关着时 `/orders/quote` 的行为就和今天不一样了。
 * 这两个路径今天都是 404，开关关着仍是 404。
 */
export const L9_ORDER_PAGE_PATHS_V1 = {
  /** 买方凭令牌看报价、接受、回答尾款。 */
  quote: '/project-quote',
  /** 访客凭令牌看定金请求、接受。 */
  deposit: '/booking-deposit',
} as const;

export function l9OrderTokenUrlV1(base: string, path: string, token: string): string {
  return `${base.replace(/\/+$/, '')}${path}#t=${token}`;
}

/** 从 `location.hash` 取令牌；格式不对返回 null。 */
export function l9OrderTokenFromHashV1(hash: string | null | undefined): string | null {
  const match = /^#t=([A-Za-z0-9_-]+)$/.exec(hash ?? '');
  return match && ONE_TIME_TOKEN_V1.test(match[1]) ? match[1] : null;
}

// ── L9.2 第 10 批：真钱路的合同（S0）。所有开关默认关；V1 视图和解码器原样保留，旧网页收到 V2 视图解码失败（失败关闭）。 ──────────

/**
 * 真钱路的开关和变量名（设计 11.1）。读它们的函数在后端 `order-live-config.ts`：布尔开关只认精确的 `'1'`，名单读不出来就是空，
 * 数值只能往收紧的方向调。
 *
 * 前提（C20，owner 批准 O6）：访客买方的通知邮箱是新收集的一类个人数据（设计 12.5）。隐私页写明并经 owner 批准之前，
 * `masterFlag` 不许和 `project_deposit` / `booking_deposit` 一起打开。
 */
export const L9_LIVE_ENV_V1 = {
  masterFlag: 'L9_LIVE_MONEY_V1_ENABLED',
  kinds: 'L9_LIVE_MONEY_KINDS',
  sellerIds: 'ORDER_LIVE_SELLER_IDS',
  rehearsalFlag: 'L9_RAIL_REHEARSAL_V1_ENABLED',
  payoutsPaused: 'ORDER_LIVE_PAYOUTS_PAUSED',
  minOrderMinor: 'L9_LIVE_MIN_ORDER_MINOR',
  maxOrderMinor: 'L9_LIVE_MAX_ORDER_MINOR',
  dailySellerMinor: 'L9_LIVE_DAILY_SELLER_MINOR',
  dailyBuyerMinor: 'L9_LIVE_DAILY_BUYER_MINOR',
  dailyPlatformMinor: 'L9_LIVE_DAILY_PLATFORM_MINOR',
  balanceMarginMinor: 'L9_LIVE_BALANCE_MARGIN_MINOR',
  bookingMaxAheadDays: 'L9_LIVE_BOOKING_MAX_AHEAD_DAYS',
  bookingDeliveryAfterServiceSeconds: 'L9_LIVE_BOOKING_DELIVERY_AFTER_SERVICE_SECONDS',
  checkoutsPerBuyerHour: 'L9_LIVE_CHECKOUTS_PER_BUYER_HOUR',
} as const;

/** 通道单的 Checkout 会话时长：31 分钟，比 Stripe 的 30 分钟下限多 60 秒余量（设计 7.2，R4-L03）。非通道单仍用基线的 30 分钟。 */
export const L9_LIVE_CHECKOUT_TTL_SECONDS = 1860;
/** 通道单的付款期限：固定常量，取会话时长的值（同一个数），**不读** `ORDER_WINDOW_PAYMENT_SECONDS`（G15，R2-L02、R4-L03）。 */
export const L9_LIVE_PAYMENT_WINDOW_SECONDS = L9_LIVE_CHECKOUT_TTL_SECONDS;
/** 真钱预约定金「服务发生之后」的交付窗口上限：7 天；变量 `L9_LIVE_BOOKING_DELIVERY_AFTER_SERVICE_SECONDS` 只能往小调（设计 12.2）。 */
export const BOOKING_DELIVERY_AFTER_SERVICE_SECONDS_V1 = 604_800;

/** 区间：含境外卡的最少 / 最多（设计 7.5，R3-L08）。两端同币种，低 ≤ 高。 */
export interface L9MoneyRangeV2 {
  estimatedLow: ProjectMoneyV1;
  estimatedHigh: ProjectMoneyV1;
}

/** 卖方在报价页、要定金页看到的金额拆分：平台费、预计通道费区间、预计到账区间（最少到账按境外卡算，最多按本地卡算）。 */
export interface L9SellerFeesV2 {
  platformFee: ProjectMoneyV1;
  processingFee: L9MoneyRangeV2;
  sellerNet: L9MoneyRangeV2;
}

/** 买方看到的费用披露：费率和通道费由卖方承担。**不叫 `amounts`**：`decodeOrderBuyerView` 对任何带 `amounts` 的买方视图返回 null。 */
export interface L9FeeDisclosureV2 {
  platformFeeBps: number;
  processingFeeBearer: 'seller';
}

/** 设计 7.5 的卡费估算（千分比加固定最小单位）：本地卡 3.4% + 0.50，境外卡 3.9% + 0.50。按分向上取整，预计所得只会说少、不会说多。 */
export const L9_CARD_FEE_ESTIMATE_V2 = {
  local: { perMille: 34, fixedMinor: 50 },
  foreign: { perMille: 39, fixedMinor: 50 },
} as const;

function cardFeeEstimateV2(total: ProjectMoneyV1, card: keyof typeof L9_CARD_FEE_ESTIMATE_V2): ProjectMoneyV1 {
  const rate = L9_CARD_FEE_ESTIMATE_V2[card];
  const fee = (BigInt(total.amountMinor) * BigInt(rate.perMille) + BigInt(999)) / BigInt(1000) + BigInt(rate.fixedMinor);
  return { amountMinor: fee.toString(), currency: total.currency, decimals: total.decimals };
}

/**
 * 卖方视图的金额拆分（设计 7.5，R3-L08）：平台费用 `orderPlatformFeeV1`（向下取整），所得用唯一的净额公式
 * `orderSellerNetProceedsV1`；最少到账按境外卡、最多按本地卡。放款时仍按 Stripe 实收的通道费扣。
 */
export function l9SellerFeesV2(total: ProjectMoneyV1, platformFeeBps: number): L9SellerFeesV2 {
  const fee = orderPlatformFeeV1(total, platformFeeBps);
  const platformFee: ProjectMoneyV1 = { amountMinor: fee.amountMinor, currency: total.currency, decimals: total.decimals };
  const local = cardFeeEstimateV2(total, 'local');
  const foreign = cardFeeEstimateV2(total, 'foreign');
  const net = (processingFee: ProjectMoneyV1): ProjectMoneyV1 => ({
    amountMinor: orderSellerNetProceedsV1(total, platformFee, processingFee).amountMinor,
    currency: total.currency,
    decimals: total.decimals,
  });
  return {
    platformFee,
    processingFee: { estimatedLow: local, estimatedHigh: foreign },
    sellerNet: { estimatedLow: net(foreign), estimatedHigh: net(local) },
  };
}

/** 买方视图的费用披露：只有费率和「通道费由卖方承担」。 */
export function l9FeeDisclosureV2(platformFeeBps: number): L9FeeDisclosureV2 {
  return { platformFeeBps, processingFeeBearer: 'seller' };
}

/** 接受之后等买方付款的订单（买方接着调订单的 `pay` 动作）。 */
export interface L9PaymentV2 {
  state: 'awaiting_payment';
  orderId: string;
  deadline: string;
}

/** 报价的 V2 视图。卖方角色带 `fees`（不带 `feeDisclosure`），买方角色带 `feeDisclosure`（不带 `fees`，也没有任何卖方所得）。 */
export interface ProjectOrderViewV2 extends Omit<ProjectOrderViewV1, 'schemaVersion' | 'environment'> {
  schemaVersion: 2;
  environment: 'test' | 'live';
  payment: L9PaymentV2 | null;
  fees?: L9SellerFeesV2;
  feeDisclosure?: L9FeeDisclosureV2;
}

export interface ProjectQuoteCreatedV2 extends ProjectOrderViewV2 {
  quoteToken: string;
}

/** 预约定金的 V2 视图，规则同报价的 V2 视图。 */
export interface BookingDepositViewV2 extends Omit<BookingDepositViewV1, 'schemaVersion' | 'environment'> {
  schemaVersion: 2;
  environment: 'test' | 'live';
  payment: L9PaymentV2 | null;
  fees?: L9SellerFeesV2;
  feeDisclosure?: L9FeeDisclosureV2;
}

function moneyRangeV2(value: unknown): L9MoneyRangeV2 | null {
  if (!isRecordV1(value) || !exactKeysV1(value, ['estimatedLow', 'estimatedHigh'])) return null;
  const low = value.estimatedLow;
  const high = value.estimatedHigh;
  if (!moneyV1(low) || !moneyV1(high) || low.currency !== high.currency) return null;
  if (BigInt(low.amountMinor) > BigInt(high.amountMinor)) return null;
  return value as unknown as L9MoneyRangeV2;
}

function sellerFeesV2(value: unknown): L9SellerFeesV2 | null {
  if (!isRecordV1(value) || !exactKeysV1(value, ['platformFee', 'processingFee', 'sellerNet'])) return null;
  const fee = value.platformFee;
  const processing = moneyRangeV2(value.processingFee);
  const net = moneyRangeV2(value.sellerNet);
  if (!moneyV1(fee) || !processing || !net) return null;
  if (fee.currency !== processing.estimatedLow.currency || fee.currency !== net.estimatedLow.currency) return null;
  return value as unknown as L9SellerFeesV2;
}

function feeDisclosureV2(value: unknown): L9FeeDisclosureV2 | null {
  if (!isRecordV1(value) || !exactKeysV1(value, ['platformFeeBps', 'processingFeeBearer'])) return null;
  if (value.processingFeeBearer !== 'seller') return null;
  const bps = value.platformFeeBps;
  if (typeof bps !== 'number' || !Number.isInteger(bps) || bps < 0 || bps > L9_LIVE_LIMITS_V1.maxFeeBps) return null;
  return value as unknown as L9FeeDisclosureV2;
}

/** The parts both V2 views share: the payment block (or null), then the role's own block (`fees` or `feeDisclosure`). */
function viewExtrasV2(value: Record<string, unknown>): boolean {
  const payment = value.payment;
  if (payment !== null) {
    if (!isRecordV1(payment) || !exactKeysV1(payment, ['state', 'orderId', 'deadline'])) return false;
    if (payment.state !== 'awaiting_payment' || typeof payment.orderId !== 'string' || !ORDER_ID_V1.test(payment.orderId) || !isoV1(payment.deadline)) return false;
  }
  return value.role === 'seller' ? sellerFeesV2(value.fees) !== null : feeDisclosureV2(value.feeDisclosure) !== null;
}

/**
 * 报价的 V2 视图，严格解码：多一个字段、少一个字段、角色不对的费用块都整条拒绝。金额要和 `projectDepositSplitV1` 算出来的一致。
 * 接受之后订单在等付款时报价行还是 `quoted`，所以 V2 不要求「已接受 ⇔ 有订单」，只要求 `deposit_held` 必须有订单号。
 */
export function decodeProjectOrderViewV2(value: unknown, extraKeys: readonly string[] = []): ProjectOrderViewV2 | null {
  if (!isRecordV1(value) || (value.role !== 'seller' && value.role !== 'buyer')) return null;
  const roleBlock = value.role === 'seller' ? 'fees' : 'feeDisclosure';
  if (!exactKeysV1(value, [...PROJECT_VIEW_KEYS_V1, 'payment', roleBlock, ...extraKeys])) return null;
  if (value.schemaVersion !== 2 || (value.environment !== 'test' && value.environment !== 'live') || value.finalHandledOffPlatform !== true) return null;
  if (typeof value.projectRef !== 'string' || !/^prj_[0-9a-f]{32}$/.test(value.projectRef)) return null;
  if (!(PROJECT_ORDER_STATUSES_V1 as readonly unknown[]).includes(value.status)) return null;
  if (!(PROJECT_FINAL_STATES_V1 as readonly unknown[]).includes(value.finalState)) return null;
  if (typeof value.title !== 'string' || typeof value.scope !== 'string') return null;
  if (!moneyV1(value.total) || !moneyV1(value.deposit) || !moneyV1(value.final)) return null;
  if (value.total.currency !== value.deposit.currency || value.total.currency !== value.final.currency) return null;
  if (typeof value.depositBps !== 'number') return null;
  const split = projectDepositSplitV1(value.total.amountMinor, value.depositBps);
  if (!split || split.depositMinor !== value.deposit.amountMinor || split.finalMinor !== value.final.amountMinor) return null;
  if (!orderLinkV1(value.depositOrderId, value.depositOrderStatus)) return null;
  if (typeof value.sellerAgentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value.sellerAgentId)) return null;
  if (!isoV1(value.createdAt) || !isoV1(value.expiresAt) || !(value.acceptedAt === null || isoV1(value.acceptedAt))) return null;
  if (value.status === 'deposit_held' && value.depositOrderId === null) return null;
  if (!viewExtrasV2(value)) return null;
  return value as unknown as ProjectOrderViewV2;
}

/** 刚发出的报价（V2）：视图加只出现这一次的令牌，只给卖方，只对还开着的报价。 */
export function decodeProjectQuoteCreatedV2(value: unknown): ProjectQuoteCreatedV2 | null {
  const view = decodeProjectOrderViewV2(value, ['quoteToken']);
  if (!view || view.role !== 'seller' || view.status !== 'quoted') return null;
  const token = (value as Record<string, unknown>).quoteToken;
  return typeof token === 'string' && ONE_TIME_TOKEN_V1.test(token) ? (value as ProjectQuoteCreatedV2) : null;
}

/** 预约定金的 V2 视图，严格解码，规则同报价。金额在定金上下限之内，`held` 必须有订单号。 */
export function decodeBookingDepositViewV2(value: unknown, extraKeys: readonly string[] = []): BookingDepositViewV2 | null {
  if (!isRecordV1(value) || (value.role !== 'seller' && value.role !== 'buyer')) return null;
  const roleBlock = value.role === 'seller' ? 'fees' : 'feeDisclosure';
  if (!exactKeysV1(value, [...BOOKING_DEPOSIT_VIEW_KEYS_V1, 'payment', roleBlock, ...extraKeys])) return null;
  if (value.schemaVersion !== 2 || (value.environment !== 'test' && value.environment !== 'live')) return null;
  if (typeof value.depositRef !== 'string' || !/^bkd_[0-9a-f]{32}$/.test(value.depositRef)) return null;
  if (typeof value.bookingRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/.test(value.bookingRef)) return null;
  if (!(BOOKING_DEPOSIT_STATUSES_V1 as readonly unknown[]).includes(value.status)) return null;
  if (!moneyV1(value.amount)) return null;
  const minor = Number(value.amount.amountMinor);
  if (minor < BOOKING_DEPOSIT_LIMITS_V1.minMinor || minor > BOOKING_DEPOSIT_LIMITS_V1.maxMinor) return null;
  if (!orderLinkV1(value.depositOrderId, value.depositOrderStatus)) return null;
  if (value.status === 'held' && value.depositOrderId === null) return null;
  if (!isoV1(value.startsAt) || !isoV1(value.createdAt) || !isoV1(value.expiresAt) || !(value.acceptedAt === null || isoV1(value.acceptedAt))) return null;
  if (!viewExtrasV2(value)) return null;
  return value as unknown as BookingDepositViewV2;
}

/**
 * 接受请求（V2）：令牌，加访客买方勾选「用这个邮箱接收本单提醒」时的 `notifyEmail`（设计 12.5）。邮箱规范化；格式不对、类型不对、
 * 多出别的字段都拒绝。V1 的接受请求（`decodeProjectTokenRequestV1`）不认 `notifyEmail`，记账模式下出现它按未知字段处理，行为不变。
 */
export interface L9AcceptRequestV2 {
  schemaVersion: 1;
  token: string;
  notifyEmail?: string;
}

export function decodeL9AcceptRequestV2(value: unknown): ProjectDecodeV1<L9AcceptRequestV2> {
  const fail = (reasonCode: ProjectReasonV1, field: string): ProjectDecodeV1<never> => ({ ok: false, reasonCode, field });
  if (!isRecordV1(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (!['schemaVersion', 'token', 'notifyEmail'].includes(key)) return fail('unknown_field', key);
  const base = decodeProjectTokenRequestV1({ schemaVersion: value.schemaVersion, token: value.token });
  if (base.ok === false) return base;
  if (value.notifyEmail === undefined) return { ok: true, value: { schemaVersion: 1, token: base.value.token } };
  if (typeof value.notifyEmail !== 'string') return fail('invalid_type', 'notifyEmail');
  const email = normalizeOrderVisitorEmailV1(value.notifyEmail);
  if (!email) return fail('invalid_value', 'notifyEmail');
  return { ok: true, value: { schemaVersion: 1, token: base.value.token, notifyEmail: email } };
}
