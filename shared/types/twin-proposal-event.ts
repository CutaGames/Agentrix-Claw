/**
 * L9 P1-3c：工具 `introduction_propose` 在对话里的结果和流事件。两条对话路径（`/openclaw/proxy/:id/stream` 与登录后的
 * `/claude/chat`，后者交给同一个运行时）发同名同义的事件：先是普通的 `tool_result`，再是一条 `meta` 事件，
 * `kind = 'introduction_proposal'`，只带草稿号和过期时间，供界面画一张「去批准」的卡。
 *
 * 事件里没有 B 的联系方式、没有客户的任何信息、没有需求卡原文、没有价格；什么都还没发出，要主人在同行名单页点「发出」。
 * 解码函数拒收未知字段，失败返回 null，不抛异常。
 */
export const TWIN_PEER_PROPOSAL_RESULT_KIND_V1 = 'introduction_proposal' as const;
export const TWIN_PEER_PROPOSAL_META_KIND_V1 = 'introduction_proposal' as const;

/** 工具交给模型的结果（`ToolResult.data`）。 */
export interface TwinPeerProposalToolResultV1 {
  kind: typeof TWIN_PEER_PROPOSAL_RESULT_KIND_V1;
  status: 'approval_required';
  proposalId: string;
  expiresAt: string;
}

/** 普通 `tool_result` 之后的那条 `meta` 事件。 */
export interface TwinPeerProposalMetaEventV1 {
  type: 'meta';
  kind: typeof TWIN_PEER_PROPOSAL_META_KIND_V1;
  introductionProposal: { proposalId: string; expiresAt: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

export function twinPeerProposalToolResultV1(proposalId: string, expiresAt: string): TwinPeerProposalToolResultV1 {
  return { kind: TWIN_PEER_PROPOSAL_RESULT_KIND_V1, status: 'approval_required', proposalId, expiresAt };
}

export function isTwinPeerProposalToolResultV1(value: unknown): value is TwinPeerProposalToolResultV1 {
  return (
    isRecord(value) &&
    exactKeys(value, ['kind', 'status', 'proposalId', 'expiresAt']) &&
    value.kind === TWIN_PEER_PROPOSAL_RESULT_KIND_V1 &&
    value.status === 'approval_required' &&
    typeof value.proposalId === 'string' &&
    UUID.test(value.proposalId) &&
    typeof value.expiresAt === 'string' &&
    ISO.test(value.expiresAt)
  );
}

export function twinPeerProposalMetaEventV1(result: TwinPeerProposalToolResultV1): TwinPeerProposalMetaEventV1 {
  return { type: 'meta', kind: TWIN_PEER_PROPOSAL_META_KIND_V1, introductionProposal: { proposalId: result.proposalId, expiresAt: result.expiresAt } };
}

/** 客户端用：认得出就返回事件，认不出（多字段、少字段、类型不对）返回 null。 */
export function decodeTwinPeerProposalMetaEventV1(value: unknown): TwinPeerProposalMetaEventV1 | null {
  if (!isRecord(value) || !exactKeys(value, ['type', 'kind', 'introductionProposal'])) return null;
  if (value.type !== 'meta' || value.kind !== TWIN_PEER_PROPOSAL_META_KIND_V1) return null;
  const inner = value.introductionProposal;
  if (!isRecord(inner) || !exactKeys(inner, ['proposalId', 'expiresAt'])) return null;
  if (typeof inner.proposalId !== 'string' || !UUID.test(inner.proposalId)) return null;
  if (typeof inner.expiresAt !== 'string' || !ISO.test(inner.expiresAt)) return null;
  return { type: 'meta', kind: TWIN_PEER_PROPOSAL_META_KIND_V1, introductionProposal: { proposalId: inner.proposalId, expiresAt: inner.expiresAt } };
}
