/**
 * L9 P1-3c 工具 `introduction_propose`：A 的分身在 A 自己的对话里提议把某位客户需求转给名单里的某位同行。
 *
 * 硬规则：
 * - 起步每一条都问 A：工具只生成一条「待批准的提议草稿」，A 在网页上点「发出」才真的创建引荐；没有「常规规则」自动提议。
 * - 只能指向 A 自己名单里已同意、没有撤回的同行（`peerId`）；别人的、没同意的、撤回了的，一律同一个「不可用」答复，工具探不出区别。
 * - 需求卡用 P1-1 契约的类型（类别、区域、时间窗枚举，一句话 ≤140 字，不许有姓名、学校、号码、链接）。
 * - 价格、折扣、合同、退款、医疗、法律、投资一律转本人，工具拒绝；提议里没有分成，`shareBps` 恒为 0（B8）。
 * - 客户的联系方式不在这里，由客户自己在 P1-1 的同意页输入。
 *
 * 开关：`PEER_LIST_V1_ENABLED` 和 `TWIN_REFERRAL_OFFER_V1_ENABLED` 都要开着（只认 `'1'`）；主人侧入口再受 P1-0 名单约束。
 * 解码函数拒收未知字段，失败时给原因码和字段名，不抛异常。
 */
import { decodeIntroductionNeedCardV1, type IntroductionCfDecodeResultV1, type IntroductionNeedCardV1 } from './introduction';
import { TWIN_PEER_SCHEMA_VERSION_V1 } from './twin-peer';

export const TWIN_PEER_PROPOSE_TOOL_NAME_V1 = 'introduction_propose';
export const TWIN_PEER_PROPOSAL_STATUSES_V1 = ['pending', 'approved', 'dismissed', 'expired'] as const;
export type TwinPeerProposalStatusV1 = (typeof TWIN_PEER_PROPOSAL_STATUSES_V1)[number];

export const TWIN_PEER_PROPOSAL_LIMITS_V1 = {
  /** 每位主人同时待批准的草稿上限。 */
  pendingPerOwnerMax: 10,
  /** 每位主人每天新草稿上限（和 P1-1 的每个 A 每天 ≤20 个提议一致）。 */
  perOwnerPerDayMax: 20,
  /** 草稿过期时间：A 一天没点就作废。 */
  expiryHours: 24,
} as const;

/** 工具的入参（平铺）。 */
export interface TwinPeerProposeInputV1 {
  peerId: string;
  needCard: IntroductionNeedCardV1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function decodeTwinPeerProposeInputV1(value: unknown): IntroductionCfDecodeResultV1<TwinPeerProposeInputV1> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, reasonCode: 'invalid_type', field: '$' };
  const rec = value as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!['peerId', 'category', 'region', 'window', 'note'].includes(key)) return { ok: false, reasonCode: 'unknown_field', field: key };
  for (const key of ['peerId', 'category', 'region', 'window', 'note']) if (rec[key] === undefined) return { ok: false, reasonCode: 'missing_field', field: key };
  if (typeof rec.peerId !== 'string') return { ok: false, reasonCode: 'invalid_type', field: 'peerId' };
  if (!UUID.test(rec.peerId)) return { ok: false, reasonCode: 'invalid_value', field: 'peerId' };
  const card = decodeIntroductionNeedCardV1({ category: rec.category, region: rec.region, window: rec.window, note: rec.note }, 'needCard');
  if (card.ok === false) return card;
  return { ok: true, value: { peerId: rec.peerId, needCard: card.value } };
}

/** 给 A 看的一条待批准草稿。不含 B 的联系方式，不含任何客户的个人信息（需求卡本身不许有）。 */
export interface TwinPeerProposalViewV1 {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
  id: string;
  peerDisplayName: string;
  needCard: IntroductionNeedCardV1;
  status: TwinPeerProposalStatusV1;
  createdAt: string;
  expiresAt: string;
}

/** 校验服务端发来的草稿视图（网页用）。 */
export function decodeTwinPeerProposalViewV1(value: unknown): IntroductionCfDecodeResultV1<TwinPeerProposalViewV1> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, reasonCode: 'invalid_type', field: '$' };
  const rec = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'id', 'peerDisplayName', 'needCard', 'status', 'createdAt', 'expiresAt'];
  for (const key of Object.keys(rec)) if (!keys.includes(key)) return { ok: false, reasonCode: 'unknown_field', field: key };
  for (const key of keys) if (rec[key] === undefined) return { ok: false, reasonCode: 'missing_field', field: key };
  if (rec.schemaVersion !== TWIN_PEER_SCHEMA_VERSION_V1) return { ok: false, reasonCode: 'unsupported_schema_version', field: 'schemaVersion' };
  if (typeof rec.id !== 'string' || !UUID.test(rec.id)) return { ok: false, reasonCode: 'invalid_value', field: 'id' };
  if (typeof rec.peerDisplayName !== 'string' || rec.peerDisplayName.length === 0 || rec.peerDisplayName.length > 100) return { ok: false, reasonCode: 'invalid_value', field: 'peerDisplayName' };
  const card = decodeIntroductionNeedCardV1(rec.needCard, 'needCard');
  if (card.ok === false) return card;
  if (typeof rec.status !== 'string' || !(TWIN_PEER_PROPOSAL_STATUSES_V1 as readonly string[]).includes(rec.status)) return { ok: false, reasonCode: 'invalid_value', field: 'status' };
  for (const key of ['createdAt', 'expiresAt']) if (typeof rec[key] !== 'string' || !Number.isFinite(Date.parse(rec[key] as string))) return { ok: false, reasonCode: 'invalid_value', field: key };
  return {
    ok: true,
    value: {
      schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1,
      id: rec.id,
      peerDisplayName: rec.peerDisplayName,
      needCard: card.value,
      status: rec.status as TwinPeerProposalStatusV1,
      createdAt: rec.createdAt as string,
      expiresAt: rec.expiresAt as string,
    },
  };
}
