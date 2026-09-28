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
 * v0：先给 DT、web、mobile 对齐形状；实现排在 TC-02.0 的唯一写入方切换之后。
 */
import type { AuthorityGrantPreviewRequestV1, AuthorityGrantV1 } from './authority-grant';
import type { ActorRefV1, AuthorityRootRefV1 } from './agent-attribution';
import type { Money } from './trust-loop-primitives';

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
  /** 可谈的话题白名单；空数组 = 公开 Facet 里的全部话题。 */
  topics: string[];
  dataClasses: RepresentationDataClassV1[];
  /** 代收款的上限（付费问答、定金）。没有 = 不能代收款，`paid_answer` / `deposit` 也就不生效。 */
  collectionCeiling?: { perOrder: Money; perDay?: Money };
  validFrom: string;
  /** 没有 = 直到撤销。 */
  validUntil?: string;
  /** 转本人：主人确认过的联系方式引用（不放联系方式原文）。 */
  handoffContactRefs: string[];
}

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

/** 把条款放进一条 Grant 预览请求。`audience` 用 Grant 自己的 audience 字段，其余放 constraints。 */
export function representationMandateGrantRequestV1(input: {
  agentAccountId: string;
  subjectRef: ActorRefV1;
  authorityRootRef: AuthorityRootRefV1;
  terms: RepresentationMandateTermsV1;
}): AuthorityGrantPreviewRequestV1 {
  const { terms } = input;
  return {
    schemaVersion: 1,
    subjectRef: input.subjectRef,
    accountableAgentId: input.agentAccountId,
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

// ---------------------------------------------------------------------------
// 副作用前的检查（后端端口）

export interface RepresentationMandateCheckRequestV1 {
  agentAccountId: string;
  action: RepresentationActionV1;
  mode: RepresentationModeV1;
  audience: RepresentationAudienceV1;
  channel: RepresentationChannelV1;
  dataClass: RepresentationDataClassV1;
  /** 回答 / 预约时的话题；由服务端分类得出，不取访客自报。 */
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
  const curUntil = current.validUntil ? Date.parse(current.validUntil) : Infinity;
  const nextUntil = next.validUntil ? Date.parse(next.validUntil) : Infinity;
  if (nextUntil > curUntil) widened.push('validUntil');
  if (Date.parse(next.validFrom) < Date.parse(current.validFrom)) widened.push('validFrom');
  const curCeiling = current.collectionCeiling?.perOrder;
  const nextCeiling = next.collectionCeiling?.perOrder;
  if (nextCeiling && (!curCeiling || nextCeiling.currency !== curCeiling.currency || BigInt(nextCeiling.amountMinor) > BigInt(curCeiling.amountMinor))) {
    widened.push('collectionCeiling');
  }
  return { tier: widened.length > 0 ? 'loosen' : 'tighten', widened };
}
