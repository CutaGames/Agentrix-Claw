/**
 * 代表授权（Representation Mandate；合同 v0 草案，CONTRACTS.md；DT Task 9 / DT-08，DT-R17、DT-R20、DT-R27）。
 *
 * 主人授权分身"代表我、在什么范围里、对谁、做什么"。这份合同只定形状和判断规则，不新建第二个授权真相：
 * - 存储：Mandate 就是一条 Authority Grant（`shared/types/authority-grant.ts`，表 `authority_grants`，迁移 1880，
 *   生产已执行）。能力统一用 `twin.represent.*` 命名空间，其余条款放在 `scope.constraints.representation`。
 * - 写入：只有 Authority 的唯一写入方（`AuthorityGrantCommandService`，TC-02.0）能建、换代、吊销；分身模块、
 *   Prompt、访客、客户端开关都不产生授权。
 * - 读：分身在任何副作用之前调用 `RepresentationMandatePortV1.check`（后端端口，不是 HTTP）；未知、过期、
 *   吊销、条款不覆盖一律拒绝。
 * - 变更：扩大范围要重新同意（新的 accepted snapshot，旧 Grant 标 `superseded`）；缩小范围立即生效并留回执
 *   （`classifyMandateChangeV1`，和 `visibility-actions.ts` 的收紧 / 放宽一致）。
 *
 * - step-up：建立和扩大复用可见性合同（`visibility-actions.ts`，对象 `representation_mandate`）：预览给
 *   `previewDigest`，提交要摘要和最近登录，错误码 428 / 403 `STEP_UP_REQUIRED` / 409 一样；收窄和撤销是收紧类，
 *   任何一端直接生效、带 `VisibilityActionReceiptV1`。
 * - 访客只看到粗粒度结果（`representationVisitorOutcomeV1`：能办 / 要找本人），细的拒绝原因只进主人的复核队列，
 *   免得访客从拒绝原因推出主人的设置。
 * - `perDay`：纯函数只查单笔；端口实现必须用服务端当天已代收的合计检查 `perDay`，拿不到合计就返回
 *   `authority_unavailable`，不能只按单笔放行。
 * - v0.2 端口实现（后端，默认关）：`TRUST_CORE_AUTHORITY_V1_ENABLED=1` 且
 *   `TRUST_CORE_REPRESENTATION_MANDATE_V1_ENABLED=1` 才读 Grant，否则一律 `authority_unavailable`。
 *   同一 Agent 同时有两条以上生效的代表授权 Grant，也按 `authority_unavailable` 处理。
 *
 * HTTP（主人，Web；手机和桌面只做收窄和撤销）：
 * - `GET  /api/agent-accounts/:id/twin/mandate` → `{ mandate: RepresentationMandateV1 | null }`
 * - `POST /api/agent-accounts/:id/twin/mandate/preview`（`{ terms }`）→ `RepresentationMandatePreviewV1`
 * - `PUT  /api/agent-accounts/:id/twin/mandate`（`{ terms, previewDigest? }`）→ `{ mandate, receipt }`
 * - `POST /api/agent-accounts/:id/twin/mandate/revoke` → `{ receipt }`
 *
 * v0.1：先给 DT、web、mobile 对齐形状；实现排在 TC-02.0 的唯一写入方切换之后。
 * v0.4（E75 ③）：`handoffContactRefs` 只接受固定引用 `inbox:owner`（`REPRESENTATION_HANDOFF_CONTACT_REFS_V1`），
 *   写入时其他值一律拒绝。已有的 Grant 读取不受影响。
 */
import type { AuthorityGrantPreviewRequestV1, AuthorityGrantV1 } from './authority-grant';
import type { ActorRefV1, AuthorityRootRefV1 } from './agent-attribution';
import type { Money } from './trust-loop-primitives';
import type { VisibilityActionReceiptV1, VisibilityChangeV1, VisibilityPreviewV1 } from './visibility-actions';

export const REPRESENTATION_MANDATE_SCHEMA_VERSION = 'agentrix.representation-mandate.v0' as const;
export const REPRESENTATION_CAPABILITY_PREFIX = 'twin.represent.' as const;

/** 分身可以代表主人做的事。每一项对应一个 Grant capability：`twin.represent.<action>`。 */
export const REPRESENTATION_ACTIONS = [
  'answer', // 按公开 Facet 回答（已确认 / 推断 / 不代答）
  'appointment', // 预约
  'lead', // 留资
  'paid_answer', // 付费问答（T7，订单合同）
  'deposit', // 咨询定金（T7）
  'handoff', // 转本人
] as const;
export type RepresentationActionV1 = (typeof REPRESENTATION_ACTIONS)[number];

export const REPRESENTATION_MODES = ['text', 'voice', 'avatar'] as const;
export type RepresentationModeV1 = (typeof REPRESENTATION_MODES)[number];

export const REPRESENTATION_AUDIENCES = ['public', 'partner', 'agent'] as const;
export type RepresentationAudienceV1 = (typeof REPRESENTATION_AUDIENCES)[number];

export const REPRESENTATION_CHANNELS = ['web', 'wechat_h5', 'a2a'] as const;
export type RepresentationChannelV1 = (typeof REPRESENTATION_CHANNELS)[number];

/** v0 只允许公开 Facet；私密 / 工作 Facet 永远不能进代表授权。 */
export const REPRESENTATION_DATA_CLASSES = ['public_facet'] as const;
export type RepresentationDataClassV1 = (typeof REPRESENTATION_DATA_CLASSES)[number];

export interface RepresentationMandateTermsV1 {
  actions: RepresentationActionV1[];
  modes: RepresentationModeV1[];
  audiences: RepresentationAudienceV1[];
  channels: RepresentationChannelV1[];
  /** 可谈的话题白名单：公开 Facet 话题表里的 id（不是自由文本）；空数组 = 全部话题。 */
  topics: string[];
  dataClasses: RepresentationDataClassV1[];
  /** 代收款的上限（付费问答、定金）。没有 = 不能代收款，`paid_answer` / `deposit` 也就不生效。 */
  collectionCeiling?: { perOrder: Money; perDay?: Money };
  validFrom: string;
  /** 没有 = 直到撤销。 */
  validUntil?: string;
  /**
   * 转本人：交给谁（不放联系方式原文）。v0.4 起只接受 `REPRESENTATION_HANDOFF_CONTACT_REFS_V1` 里的固定引用：
   * `inbox:owner` = 主人在 Agentrix 里的事项收件箱，一定存在、不用核验（E75 ③）。外部联系方式（邮箱、手机）
   * 等有了"主人确认过的联系方式"接口再加进这个列表。
   */
  handoffContactRefs: string[];
}

/** v0.4（E75 ③）：主人的事项收件箱。访客要找本人时，线索落到"事项 → 待我处理"。 */
export const REPRESENTATION_HANDOFF_OWNER_INBOX_REF_V1 = 'inbox:owner' as const;
/** v0.4：`handoffContactRefs` 能写的全部取值。服务端只接受这些。 */
export const REPRESENTATION_HANDOFF_CONTACT_REFS_V1 = [REPRESENTATION_HANDOFF_OWNER_INBOX_REF_V1] as const;
export type RepresentationHandoffContactRefV1 = (typeof REPRESENTATION_HANDOFF_CONTACT_REFS_V1)[number];

export interface RepresentationMandateV1 {
  schemaVersion: typeof REPRESENTATION_MANDATE_SCHEMA_VERSION;
  agentAccountId: string;
  grantRef: string;
  grantVersion: number;
  status: AuthorityGrantV1['status'];
  revocationEpoch: number;
  terms: RepresentationMandateTermsV1;
}

// ---------------------------------------------------------------------------
// Grant 映射

export function representationCapabilityV1(action: RepresentationActionV1): string {
  return `${REPRESENTATION_CAPABILITY_PREFIX}${action}`;
}

/**
 * 把条款放进一条 Grant 预览请求。`audience` 用 Grant 自己的 audience 字段，其余放 constraints。
 * `accountableAgentId` 是 Agent 的外部编号（`agentUniqueId`），不是账户 UUID；`subjectRef` 是
 * `{ kind: 'agent', agentId: accountableAgentId }`，`authorityRootRef` 是它当前的 Soul Core（v0.2 更正）。
 */
export function representationMandateGrantRequestV1(input: {
  accountableAgentId: string;
  subjectRef: ActorRefV1;
  authorityRootRef: AuthorityRootRefV1;
  terms: RepresentationMandateTermsV1;
}): AuthorityGrantPreviewRequestV1 {
  const { terms } = input;
  return {
    schemaVersion: 1,
    subjectRef: input.subjectRef,
    accountableAgentId: input.accountableAgentId,
    authorityRootRef: input.authorityRootRef,
    scope: {
      capabilities: terms.actions.map(representationCapabilityV1),
      constraints: {
        representation: {
          v: REPRESENTATION_MANDATE_SCHEMA_VERSION,
          modes: [...terms.modes],
          channels: [...terms.channels],
          topics: [...terms.topics],
          dataClasses: [...terms.dataClasses],
          handoffContactRefs: [...terms.handoffContactRefs],
          ...(terms.collectionCeiling ? { collectionCeiling: terms.collectionCeiling } : {}),
        },
      },
    },
    validFrom: terms.validFrom,
    ...(terms.validUntil ? { validUntil: terms.validUntil } : {}),
    audience: [...terms.audiences],
    requiredMechanisms: ['software'],
    // 扩大代表范围是放宽类操作：和 visibility-actions 一样要最近登录 + 预览摘要。
    stepUpPolicy: { required: true, methods: ['human_approval'], reasonCodes: ['representation_scope'] },
  };
}

/**
 * 反过来：从一条已接受的 Grant 读出代表授权（v0.2，端口实现用）。任何一处对不上都返回 null，
 * 由调用方按"授权不可用"处理（fail closed），不会猜条款。
 */
export function representationMandateFromGrantV1(grant: {
  agentAccountId: string;
  grantRef: string;
  grantVersion: number;
  status: AuthorityGrantV1['status'];
  revocationEpoch: number;
  policy: {
    scope: { capabilities: string[]; constraints?: Record<string, unknown> };
    audience: string[];
    validFrom: string;
    validUntil?: string;
  };
}): RepresentationMandateV1 | null {
  const { policy } = grant;
  const representation = policy.scope?.constraints?.representation as Record<string, unknown> | undefined;
  if (!representation || typeof representation !== 'object' || representation.v !== REPRESENTATION_MANDATE_SCHEMA_VERSION) return null;
  const capabilities = Array.isArray(policy.scope.capabilities) ? policy.scope.capabilities : [];
  const actions: RepresentationActionV1[] = [];
  for (const capability of capabilities) {
    if (!capability.startsWith(REPRESENTATION_CAPABILITY_PREFIX)) return null; // 代表授权的 Grant 不混别的能力
    const action = capability.slice(REPRESENTATION_CAPABILITY_PREFIX.length);
    if (!(REPRESENTATION_ACTIONS as readonly string[]).includes(action)) return null;
    actions.push(action as RepresentationActionV1);
  }
  const listOf = <T extends string>(value: unknown, allowed: readonly T[]): T[] | null =>
    Array.isArray(value) && value.every((item) => typeof item === 'string' && (allowed as readonly string[]).includes(item)) ? (value as T[]) : null;
  const strings = (value: unknown): string[] | null =>
    Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0) ? (value as string[]) : null;
  const modes = listOf(representation.modes, REPRESENTATION_MODES);
  const channels = listOf(representation.channels, REPRESENTATION_CHANNELS);
  const dataClasses = listOf(representation.dataClasses, REPRESENTATION_DATA_CLASSES);
  const audiences = listOf(policy.audience, REPRESENTATION_AUDIENCES);
  const topics = strings(representation.topics);
  const handoffContactRefs = strings(representation.handoffContactRefs);
  if (!actions.length || !modes || !channels || !dataClasses || !audiences || !topics || !handoffContactRefs) return null;
  const isMoney = (value: unknown): value is Money => {
    const m = value as Money | undefined;
    return !!m && typeof m === 'object' && typeof m.amountMinor === 'string' && /^(0|[1-9][0-9]*)$/.test(m.amountMinor)
      && typeof m.currency === 'string' && m.currency.length > 0 && Number.isInteger(m.decimals) && m.decimals >= 0;
  };
  let collectionCeiling: RepresentationMandateTermsV1['collectionCeiling'];
  if (representation.collectionCeiling !== undefined) {
    const ceiling = representation.collectionCeiling as { perOrder?: unknown; perDay?: unknown };
    if (!ceiling || typeof ceiling !== 'object' || !isMoney(ceiling.perOrder)) return null;
    if (ceiling.perDay !== undefined && !isMoney(ceiling.perDay)) return null;
    collectionCeiling = { perOrder: ceiling.perOrder, ...(ceiling.perDay !== undefined ? { perDay: ceiling.perDay as Money } : {}) };
  }
  if (!Number.isFinite(Date.parse(policy.validFrom)) || (policy.validUntil !== undefined && !Number.isFinite(Date.parse(policy.validUntil)))) return null;
  return {
    schemaVersion: REPRESENTATION_MANDATE_SCHEMA_VERSION,
    agentAccountId: grant.agentAccountId,
    grantRef: grant.grantRef,
    grantVersion: grant.grantVersion,
    status: grant.status,
    revocationEpoch: grant.revocationEpoch,
    terms: {
      actions,
      modes,
      audiences,
      channels,
      topics,
      dataClasses,
      ...(collectionCeiling ? { collectionCeiling } : {}),
      validFrom: policy.validFrom,
      ...(policy.validUntil !== undefined ? { validUntil: policy.validUntil } : {}),
      handoffContactRefs,
    },
  };
}

// ---------------------------------------------------------------------------
// 副作用前的检查（后端端口）

export interface RepresentationMandateCheckRequestV1 {
  agentAccountId: string;
  action: RepresentationActionV1;
  mode: RepresentationModeV1;
  audience: RepresentationAudienceV1;
  channel: RepresentationChannelV1;
  dataClass: RepresentationDataClassV1;
  /** 回答 / 预约时的话题 id；由服务端分类得出，不取访客自报。 */
  topic?: string;
  /** 代收款时的金额（服务端定价，不取客户端）。 */
  amount?: Money;
  /** 检查时刻（ISO）。 */
  at: string;
}

export const REPRESENTATION_DENIAL_REASONS = [
  'mandate_missing',
  'mandate_not_active',
  'mandate_expired',
  'action_not_granted',
  'mode_not_granted',
  'audience_not_granted',
  'channel_not_granted',
  'data_class_not_granted',
  'topic_not_granted',
  'collection_not_granted',
  'collection_over_ceiling',
  'currency_mismatch',
  'authority_unavailable',
] as const;
export type RepresentationDenialReasonV1 = (typeof REPRESENTATION_DENIAL_REASONS)[number];

export type RepresentationMandateCheckResultV1 =
  | { allowed: true; grantRef: string; grantVersion: number; revocationEpoch: number }
  | { allowed: false; reasonCode: RepresentationDenialReasonV1 };

/** 后端端口（Authority 模块实现，分身模块注入）。实现不可用时必须返回 `authority_unavailable`，不能放行。 */
export interface RepresentationMandatePortV1 {
  check(request: RepresentationMandateCheckRequestV1): Promise<RepresentationMandateCheckResultV1>;
}

/** 纯函数版的判断，端口实现和测试都用它；`mandate` 为 null 表示没有有效授权。 */
export function evaluateRepresentationMandateV1(
  mandate: RepresentationMandateV1 | null,
  request: RepresentationMandateCheckRequestV1,
): RepresentationMandateCheckResultV1 {
  if (!mandate) return { allowed: false, reasonCode: 'mandate_missing' };
  if (mandate.status !== 'active') return { allowed: false, reasonCode: 'mandate_not_active' };
  const at = Date.parse(request.at);
  const from = Date.parse(mandate.terms.validFrom);
  if (!Number.isFinite(at) || !Number.isFinite(from) || at < from) return { allowed: false, reasonCode: 'mandate_not_active' };
  if (mandate.terms.validUntil) {
    const until = Date.parse(mandate.terms.validUntil);
    if (!Number.isFinite(until) || at >= until) return { allowed: false, reasonCode: 'mandate_expired' };
  }
  const t = mandate.terms;
  if (!t.actions.includes(request.action)) return { allowed: false, reasonCode: 'action_not_granted' };
  if (!t.modes.includes(request.mode)) return { allowed: false, reasonCode: 'mode_not_granted' };
  if (!t.audiences.includes(request.audience)) return { allowed: false, reasonCode: 'audience_not_granted' };
  if (!t.channels.includes(request.channel)) return { allowed: false, reasonCode: 'channel_not_granted' };
  if (!t.dataClasses.includes(request.dataClass)) return { allowed: false, reasonCode: 'data_class_not_granted' };
  if (t.topics.length > 0 && (!request.topic || !t.topics.includes(request.topic))) {
    return { allowed: false, reasonCode: 'topic_not_granted' };
  }
  if (request.action === 'paid_answer' || request.action === 'deposit') {
    const ceiling = t.collectionCeiling?.perOrder;
    if (!ceiling || !request.amount) return { allowed: false, reasonCode: 'collection_not_granted' };
    if (ceiling.currency !== request.amount.currency || ceiling.decimals !== request.amount.decimals) {
      return { allowed: false, reasonCode: 'currency_mismatch' };
    }
    if (BigInt(request.amount.amountMinor) > BigInt(ceiling.amountMinor)) {
      return { allowed: false, reasonCode: 'collection_over_ceiling' };
    }
  }
  return { allowed: true, grantRef: mandate.grantRef, grantVersion: mandate.grantVersion, revocationEpoch: mandate.revocationEpoch };
}

/** 访客看到的结果：只有能办和要找本人两种，不透出拒绝原因。 */
export function representationVisitorOutcomeV1(result: RepresentationMandateCheckResultV1): 'ok' | 'ask_human' {
  return result.allowed ? 'ok' : 'ask_human';
}

export interface RepresentationMandatePreviewV1 {
  tier: MandateChangeTierV1;
  widened: string[];
  visibility: VisibilityPreviewV1;
}

export interface RepresentationMandateWriteResultV1 {
  mandate: RepresentationMandateV1 | null;
  receipt: VisibilityActionReceiptV1;
}

// ---------------------------------------------------------------------------
// 变更分级：扩大要重新同意，缩小立即生效

export type MandateChangeTierV1 = 'tighten' | 'loosen';

function widens<T>(current: readonly T[], next: readonly T[]): boolean {
  return next.some((item) => !current.includes(item));
}

export function classifyMandateChangeV1(
  current: RepresentationMandateTermsV1,
  next: RepresentationMandateTermsV1,
): { tier: MandateChangeTierV1; widened: string[] } {
  const widened: string[] = [];
  if (widens(current.actions, next.actions)) widened.push('actions');
  if (widens(current.modes, next.modes)) widened.push('modes');
  if (widens(current.audiences, next.audiences)) widened.push('audiences');
  if (widens(current.channels, next.channels)) widened.push('channels');
  if (widens(current.dataClasses, next.dataClasses)) widened.push('dataClasses');
  if (widens(current.handoffContactRefs, next.handoffContactRefs)) widened.push('handoffContactRefs');
  // 话题：空数组表示"全部"，所以从有限列表变成空数组，或者多出话题，都是扩大。
  if ((current.topics.length > 0 && next.topics.length === 0) || (next.topics.length > 0 && current.topics.length > 0 && widens(current.topics, next.topics))) {
    widened.push('topics');
  }
  // 日期解析失败一律按扩大处理（fail closed）。
  const curUntil = current.validUntil ? Date.parse(current.validUntil) : Infinity;
  const nextUntil = next.validUntil ? Date.parse(next.validUntil) : Infinity;
  if (Number.isNaN(curUntil) || Number.isNaN(nextUntil) || nextUntil > curUntil) widened.push('validUntil');
  const curFrom = Date.parse(current.validFrom);
  const nextFrom = Date.parse(next.validFrom);
  if (Number.isNaN(curFrom) || Number.isNaN(nextFrom) || nextFrom < curFrom) widened.push('validFrom');
  if (moneyWidens(current.collectionCeiling?.perOrder, next.collectionCeiling?.perOrder, Boolean(next.collectionCeiling))) {
    widened.push('collectionCeiling.perOrder');
  }
  // perDay：去掉（变成不限）、调高、币种或精度变化都是扩大；没有代收款时不涉及。
  if (next.collectionCeiling && moneyWidens(current.collectionCeiling?.perDay, next.collectionCeiling.perDay, true, true)) {
    widened.push('collectionCeiling.perDay');
  }
  return { tier: widened.length > 0 ? 'loosen' : 'tighten', widened };
}

/**
 * `present`：新条款里有没有这一项上限。`absentMeansUnlimited`：上限缺省表示"不限"（perDay），
 * 否则缺省表示"不能代收"（perOrder）。
 */
function moneyWidens(current: Money | undefined, next: Money | undefined, present: boolean, absentMeansUnlimited = false): boolean {
  if (absentMeansUnlimited) {
    if (!next) return current !== undefined; // 从有上限变成不限
    if (!current) return false; // 从不限变成有上限，是收紧
  } else {
    if (!present || !next) return false; // 不能代收，只会更窄
    if (!current) return true; // 从不能代收变成能代收
  }
  if (next.currency !== current.currency || next.decimals !== current.decimals) return true;
  return BigInt(next.amountMinor) > BigInt(current.amountMinor);
}

// ---------------------------------------------------------------------------
// 主人路由（v0.3，DT Task 9.3–9.4；后端实现默认关，开关同上）

export const REPRESENTATION_MANDATE_ROUTES = {
  get: '/api/agent-accounts/:id/twin/mandate',
  preview: '/api/agent-accounts/:id/twin/mandate/preview',
  put: '/api/agent-accounts/:id/twin/mandate',
  revoke: '/api/agent-accounts/:id/twin/mandate/revoke',
} as const;

/**
 * 错误码（`api-error.ts` 的 `code`）：400 条款格式不对；503 开关没开或 Authority 读不出唯一一条授权；
 * 409 授权在预览之后被别处改了（重新预览）。可见性确认沿用 428 / 403 `STEP_UP_REQUIRED` / 409。
 */
export const REPRESENTATION_MANDATE_ERROR_CODES = {
  invalid: 'REPRESENTATION_MANDATE_INVALID',
  unavailable: 'REPRESENTATION_MANDATE_UNAVAILABLE',
  conflict: 'REPRESENTATION_MANDATE_CONFLICT',
} as const;

/** 新条款的 `validFrom` 最多可以早于服务端时间这么久（续用现有授权的 `validFrom` 不受限）。 */
export const REPRESENTATION_MANDATE_MAX_BACKDATE_SECONDS = 60 * 60;

const TOPIC_ID = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const TERMS_KEYS = new Set(['actions', 'modes', 'audiences', 'channels', 'topics', 'dataClasses', 'collectionCeiling', 'validFrom', 'validUntil', 'handoffContactRefs']);

function checkList(value: unknown, allowed: readonly string[] | RegExp, path: string, errors: string[], nonEmpty: boolean, max = 64): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`);
    return;
  }
  if (nonEmpty && value.length === 0) errors.push(`${path}: at least one`);
  if (value.length > max) errors.push(`${path}: at most ${max}`);
  const seen = new Set<string>();
  for (const item of value) {
    const ok = typeof item === 'string' && (allowed instanceof RegExp ? allowed.test(item) : allowed.includes(item));
    if (!ok) {
      errors.push(`${path}: unknown value`);
      return;
    }
    if (seen.has(item)) {
      errors.push(`${path}: duplicate ${item}`);
      return;
    }
    seen.add(item);
  }
}

function checkMoney(value: unknown, path: string, errors: string[]): void {
  const m = value as Money | undefined;
  if (
    !m ||
    typeof m !== 'object' ||
    Object.keys(m).some((key) => key !== 'amountMinor' && key !== 'currency' && key !== 'decimals') ||
    typeof m.amountMinor !== 'string' ||
    !/^[1-9][0-9]{0,17}$/.test(m.amountMinor) ||
    typeof m.currency !== 'string' ||
    !/^[A-Z]{3,5}$/.test(m.currency) ||
    !Number.isInteger(m.decimals) ||
    m.decimals < 0 ||
    m.decimals > 18
  ) {
    errors.push(`${path}: { amountMinor: positive integer string, currency, decimals }`);
  }
}

/** 主人提交的条款，严格校验（未知字段、重复值、空的必填列表都拒绝）。 */
export function validateRepresentationMandateTermsV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['terms: expected object'] };
  const t = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(t)) if (!TERMS_KEYS.has(key)) errors.push(`${key}: unexpected field`);
  checkList(t.actions, REPRESENTATION_ACTIONS, 'actions', errors, true);
  checkList(t.modes, REPRESENTATION_MODES, 'modes', errors, true);
  checkList(t.audiences, REPRESENTATION_AUDIENCES, 'audiences', errors, true);
  checkList(t.channels, REPRESENTATION_CHANNELS, 'channels', errors, true);
  checkList(t.dataClasses, REPRESENTATION_DATA_CLASSES, 'dataClasses', errors, true);
  checkList(t.topics, TOPIC_ID, 'topics', errors, false);
  // v0.4: only the fixed refs; nothing can mint or verify any other contact ref yet.
  checkList(t.handoffContactRefs, REPRESENTATION_HANDOFF_CONTACT_REFS_V1, 'handoffContactRefs', errors, false, 8);
  const actions = Array.isArray(t.actions) ? (t.actions as string[]) : [];
  const collects = actions.includes('paid_answer') || actions.includes('deposit');
  if (t.collectionCeiling !== undefined) {
    const c = t.collectionCeiling as Record<string, unknown> | null;
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some((key) => key !== 'perOrder' && key !== 'perDay')) {
      errors.push('collectionCeiling: { perOrder, perDay? }');
    } else {
      checkMoney(c.perOrder, 'collectionCeiling.perOrder', errors);
      if (c.perDay !== undefined) {
        checkMoney(c.perDay, 'collectionCeiling.perDay', errors);
        const perOrder = c.perOrder as Money;
        const perDay = c.perDay as Money;
        if (perOrder?.currency !== perDay?.currency || perOrder?.decimals !== perDay?.decimals) {
          errors.push('collectionCeiling.perDay: same currency and decimals as perOrder');
        }
      }
    }
    if (!collects) errors.push('collectionCeiling: only with paid_answer or deposit');
  } else if (collects) {
    errors.push('collectionCeiling: required for paid_answer or deposit');
  }
  if (actions.includes('handoff') && Array.isArray(t.handoffContactRefs) && t.handoffContactRefs.length === 0) {
    errors.push('handoffContactRefs: required for handoff');
  }
  const from = typeof t.validFrom === 'string' ? Date.parse(t.validFrom) : NaN;
  if (!Number.isFinite(from)) errors.push('validFrom: invalid timestamp');
  if (t.validUntil !== undefined) {
    const until = typeof t.validUntil === 'string' ? Date.parse(t.validUntil) : NaN;
    if (!Number.isFinite(until)) errors.push('validUntil: invalid timestamp');
    else if (Number.isFinite(from) && until <= from) errors.push('validUntil: must be after validFrom');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 预览和提交用同一个函数构造可见性改动，摘要才对得上。`current` 是提交时生效的那一条授权；
 * 它在预览之后变了（换代或吊销），摘要就对不上，要重新预览。`next` 为 null 表示撤销。
 */
export function representationMandateChangeV1(
  agentAccountId: string,
  current: Pick<RepresentationMandateV1, 'grantRef' | 'grantVersion' | 'terms'> | null,
  next: RepresentationMandateTermsV1 | null,
): { change: VisibilityChangeV1; widened: string[] } {
  let operations: VisibilityChangeV1['operations'];
  let widened: string[];
  if (!next) {
    operations = ['mandate_revoke'];
    widened = [];
  } else if (!current) {
    operations = ['mandate_grant'];
    widened = ['actions', 'modes', 'audiences', 'channels', 'dataClasses'];
    if (next.topics.length === 0) widened.push('topics');
    if (next.collectionCeiling) widened.push('collectionCeiling.perOrder');
    if (next.handoffContactRefs.length) widened.push('handoffContactRefs');
  } else {
    const classified = classifyMandateChangeV1(current.terms, next);
    operations = [classified.tier === 'loosen' ? 'mandate_widen' : 'mandate_narrow'];
    widened = classified.widened;
  }
  type Json = VisibilityChangeV1['change'][string];
  return {
    change: {
      objectKind: 'representation_mandate',
      objectRef: agentAccountId,
      operations,
      change: {
        basedOn: current ? `${current.grantRef}@${current.grantVersion}` : null,
        terms: next ? (JSON.parse(JSON.stringify(next)) as Json) : null,
      },
    },
    widened,
  };
}
