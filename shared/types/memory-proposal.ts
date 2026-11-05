/**
 * 草案 v0（L8 1b 第 0 步，coord 10-18）：线 N 实现时可加字段，不可改语义。
 *
 * A2「写入先当提议」：对话自动记忆、梦境推断、`save_memory` 工具、本机 MCP 的写入，开关打开时不直接进 `agent_memory`，
 * 先变成一条提议（表 2034 `memory_proposals`），主人接受后才经唯一的写入口 `AgentMemoryWriter` 落库。
 * 本人写的话不走这里，直接写。批准写入不等于授予读取。
 *
 * 这份合同只定形状：
 * - 提交（`MemoryProposalInputV1`）：属主不在里面，由服务端从登录态或凭据取（端口的第一个参数）。
 * - 视图（`MemoryProposalV1`）：返回给主人本人的列表项。
 * - 命令：逐条或整批接受 / 拒绝；按类别设自动接受。
 * - 端口（`MemoryProposalPortV1`，见 `backend/src/common/ports/l8-1b.ports.ts`）：A6 的 `ingest-candidates` 经它把
 *   `proposedText` 送进收件箱；线 1 实现，没实现时一律拒绝（`port_unavailable`）。
 *
 * 开关：后端 `MEMORY_PROPOSALS_V1_ENABLED`，只认精确的 `'1'`；关着时写入路径与现在逐字节一致。
 * 解码函数都拒收未知字段和错误类型，失败时给出 `reasonCode` 和出错的字段名，不抛异常。
 */

export const MEMORY_PROPOSAL_SCHEMA_VERSION_V1 = 1 as const;

export const MEMORY_PROPOSAL_OPERATIONS_V1 = ['add', 'merge', 'supersede', 'expire'] as const;
export type MemoryProposalOperationV1 = (typeof MEMORY_PROPOSAL_OPERATIONS_V1)[number];

export const MEMORY_PROPOSAL_STATUSES_V1 = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type MemoryProposalStatusV1 = (typeof MEMORY_PROPOSAL_STATUSES_V1)[number];

/** 提议从哪来：对话自动记忆、梦境、`save_memory` 工具、本机 MCP（`agentrix_propose_memory`）。 */
export const MEMORY_PROPOSAL_SOURCE_KINDS_V1 = ['chat_auto', 'dream', 'agent_tool', 'desktop_mcp', 'oauth_client'] as const;
export type MemoryProposalSourceKindV1 = (typeof MEMORY_PROPOSAL_SOURCE_KINDS_V1)[number];

/** 按类别自动接受时用的类别。 */
export const MEMORY_PROPOSAL_CATEGORIES_V1 = ['preference', 'fact', 'decision', 'insight', 'other'] as const;
export type MemoryProposalCategoryV1 = (typeof MEMORY_PROPOSAL_CATEGORIES_V1)[number];

export const MEMORY_PROPOSAL_DECISIONS_V1 = ['accept', 'reject'] as const;
export type MemoryProposalDecisionV1 = (typeof MEMORY_PROPOSAL_DECISIONS_V1)[number];

export const MEMORY_PROPOSAL_LIMITS_V1 = {
  /** 和 `CONTEXT_MEMORY_PROPOSAL_TEXT_MAX_CHARS`（context-memory.ts）一致。 */
  textMax: 2000,
  idMax: 200,
  /** 整批接受 / 拒绝一次最多多少条。 */
  batchMax: 50,
} as const;

export const MEMORY_PROPOSAL_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  /** `text` 和 `targetMemoryId` 的有无和 `operation` 对不上。 */
  'operation_mismatch',
  /** 没有注册实现：默认拒绝。 */
  'port_unavailable',
  /** `MEMORY_PROPOSALS_V1_ENABLED` 没开。 */
  'feature_disabled',
  'rate_limited',
  /** 不存在，或者不是这个主人的（两种情况不区分，不给探测）。 */
  'not_found',
] as const;
export type MemoryProposalReasonCodeV1 = (typeof MEMORY_PROPOSAL_REASON_CODES_V1)[number];

export type MemoryProposalDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: MemoryProposalReasonCodeV1; field: string };

export interface MemoryProposalSourceV1 {
  kind: MemoryProposalSourceKindV1;
  /** 出处：对话轮次、梦境 session、工具调用或客户端 id。只放引用，不放正文。 */
  ref: string;
  observedAt: string;
}

/** 提交一条提议。属主不在里面。 */
export interface MemoryProposalInputV1 {
  schemaVersion: typeof MEMORY_PROPOSAL_SCHEMA_VERSION_V1;
  agentId: string;
  operation: MemoryProposalOperationV1;
  category: MemoryProposalCategoryV1;
  /** add / merge / supersede 必填；expire 不许带。去掉首尾空白后 1–2000 字。 */
  text?: string;
  /** merge / supersede / expire 必填；add 不许带。 */
  targetMemoryId?: string;
  source: MemoryProposalSourceV1;
}

/** 返回给主人本人的列表项。 */
export interface MemoryProposalV1 extends Omit<MemoryProposalInputV1, 'schemaVersion'> {
  schemaVersion: typeof MEMORY_PROPOSAL_SCHEMA_VERSION_V1;
  id: string;
  status: MemoryProposalStatusV1;
  createdAt: string;
  expiresAt: string;
  /** pending 时为 null；accepted / rejected 时有值。 */
  decidedAt: string | null;
}

/** 逐条或整批接受 / 拒绝。重复接受是幂等的。 */
export interface MemoryProposalDecisionCommandV1 {
  schemaVersion: typeof MEMORY_PROPOSAL_SCHEMA_VERSION_V1;
  proposalIds: string[];
  decision: MemoryProposalDecisionV1;
}

/**
 * 不属于任何 Agent 的写入（用户级记忆）用这个值当 `agentId`。真实的 Agent id 是 uuid，不会撞。
 * 接受时落库的 `agent_memory.agent_id` 为空。
 */
export const MEMORY_PROPOSAL_OWNER_AGENT_ID_V1 = 'owner' as const;

/** 逐条处理的结果（`POST /memory-proposals/decisions`）。重复接受返回 already_accepted，不会再写一次。 */
export const MEMORY_PROPOSAL_DECISION_RESULTS_V1 = [
  'accepted',
  'rejected',
  'already_accepted',
  'already_rejected',
  /** 已经被另一个决定占了：接受过的不能再拒绝，拒绝过的不能再接受。 */
  'conflict',
  /** 接受时写入失败：提议留在待处理，可以再试。 */
  'failed',
  'expired',
  /** 不存在，或者不是这个主人的（不区分）。 */
  'not_found',
] as const;
export type MemoryProposalDecisionResultKindV1 = (typeof MEMORY_PROPOSAL_DECISION_RESULTS_V1)[number];

export interface MemoryProposalDecisionResultV1 {
  proposalId: string;
  result: MemoryProposalDecisionResultKindV1;
}

/** 表 2034 `memory_auto_accept_rules`：属主 × 类别一行。 */
export interface MemoryAutoAcceptRuleV1 {
  schemaVersion: typeof MEMORY_PROPOSAL_SCHEMA_VERSION_V1;
  category: MemoryProposalCategoryV1;
  enabled: boolean;
}

/** `MemoryProposalPortV1.propose` 的结果。`status` 为 accepted 表示命中了主人设的自动接受规则。 */
export type MemoryProposalOutcomeV1 =
  | { submitted: true; proposalId: string; status: 'pending' | 'accepted' }
  | { submitted: false; reasonCode: MemoryProposalReasonCodeV1 };

// ── 解码 ────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

type Failure = { ok: false; reasonCode: MemoryProposalReasonCodeV1; field: string };

function fail(reasonCode: MemoryProposalReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** 先看版本，再看有没有未知字段、必填字段。 */
function checkEnvelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== MEMORY_PROPOSAL_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

function decodeSource(value: unknown): MemoryProposalDecodeResultV1<MemoryProposalSourceV1> {
  if (!isRecord(value)) return fail('invalid_type', 'source');
  for (const key of Object.keys(value)) if (!['kind', 'ref', 'observedAt'].includes(key)) return fail('unknown_field', `source.${key}`);
  for (const key of ['kind', 'ref', 'observedAt']) if (value[key] === undefined) return fail('missing_field', `source.${key}`);
  if (typeof value.kind !== 'string') return fail('invalid_type', 'source.kind');
  if (!isOneOf(MEMORY_PROPOSAL_SOURCE_KINDS_V1, value.kind)) return fail('invalid_value', 'source.kind');
  if (typeof value.ref !== 'string') return fail('invalid_type', 'source.ref');
  if (!OPAQUE_ID.test(value.ref)) return fail('invalid_value', 'source.ref');
  if (typeof value.observedAt !== 'string') return fail('invalid_type', 'source.observedAt');
  if (!isIso(value.observedAt)) return fail('invalid_value', 'source.observedAt');
  return { ok: true, value: { kind: value.kind, ref: value.ref, observedAt: value.observedAt } };
}

const BODY_KEYS = ['schemaVersion', 'agentId', 'operation', 'category', 'text', 'targetMemoryId', 'source'] as const;
const VIEW_ONLY_KEYS = ['id', 'status', 'createdAt', 'expiresAt', 'decidedAt'] as const;

/** 提交体和视图共用的那部分。`value` 已经过 `checkEnvelope`。 */
function decodeBody(value: Record<string, unknown>): MemoryProposalDecodeResultV1<MemoryProposalInputV1> {
  if (typeof value.agentId !== 'string') return fail('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return fail('invalid_value', 'agentId');
  if (typeof value.operation !== 'string') return fail('invalid_type', 'operation');
  if (!isOneOf(MEMORY_PROPOSAL_OPERATIONS_V1, value.operation)) return fail('invalid_value', 'operation');
  if (typeof value.category !== 'string') return fail('invalid_type', 'category');
  if (!isOneOf(MEMORY_PROPOSAL_CATEGORIES_V1, value.category)) return fail('invalid_value', 'category');
  const operation = value.operation;

  let text: string | undefined;
  if (value.text !== undefined) {
    if (typeof value.text !== 'string') return fail('invalid_type', 'text');
    text = value.text.trim();
    if (text.length === 0 || text.length > MEMORY_PROPOSAL_LIMITS_V1.textMax) return fail('invalid_value', 'text');
  }
  let targetMemoryId: string | undefined;
  if (value.targetMemoryId !== undefined) {
    if (typeof value.targetMemoryId !== 'string') return fail('invalid_type', 'targetMemoryId');
    if (!OPAQUE_ID.test(value.targetMemoryId)) return fail('invalid_value', 'targetMemoryId');
    targetMemoryId = value.targetMemoryId;
  }
  if (operation === 'add') {
    if (text === undefined) return fail('operation_mismatch', 'text');
    if (targetMemoryId !== undefined) return fail('operation_mismatch', 'targetMemoryId');
  } else if (operation === 'expire') {
    if (targetMemoryId === undefined) return fail('operation_mismatch', 'targetMemoryId');
    if (text !== undefined) return fail('operation_mismatch', 'text');
  } else {
    if (text === undefined) return fail('operation_mismatch', 'text');
    if (targetMemoryId === undefined) return fail('operation_mismatch', 'targetMemoryId');
  }

  const source = decodeSource(value.source);
  if (source.ok === false) return source;
  const out: MemoryProposalInputV1 = {
    schemaVersion: MEMORY_PROPOSAL_SCHEMA_VERSION_V1,
    agentId: value.agentId,
    operation,
    category: value.category,
    source: source.value,
  };
  if (text !== undefined) out.text = text;
  if (targetMemoryId !== undefined) out.targetMemoryId = targetMemoryId;
  return { ok: true, value: out };
}

/** 服务端收到一条提交时用。属主不能出现在里面（出现就是未知字段）。 */
export function decodeMemoryProposalInputV1(value: unknown): MemoryProposalDecodeResultV1<MemoryProposalInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, BODY_KEYS, ['agentId', 'operation', 'category', 'source']);
  if (bad) return bad;
  return decodeBody(value);
}

/** 三端解码服务端返回的列表项。 */
export function decodeMemoryProposalV1(value: unknown): MemoryProposalDecodeResultV1<MemoryProposalV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, [...BODY_KEYS, ...VIEW_ONLY_KEYS], ['agentId', 'operation', 'category', 'source', ...VIEW_ONLY_KEYS]);
  if (bad) return bad;
  const body = decodeBody(value);
  if (body.ok === false) return body;
  if (typeof value.id !== 'string') return fail('invalid_type', 'id');
  if (!UUID.test(value.id)) return fail('invalid_value', 'id');
  if (typeof value.status !== 'string') return fail('invalid_type', 'status');
  if (!isOneOf(MEMORY_PROPOSAL_STATUSES_V1, value.status)) return fail('invalid_value', 'status');
  if (typeof value.createdAt !== 'string') return fail('invalid_type', 'createdAt');
  if (!isIso(value.createdAt)) return fail('invalid_value', 'createdAt');
  if (typeof value.expiresAt !== 'string') return fail('invalid_type', 'expiresAt');
  if (!isIso(value.expiresAt)) return fail('invalid_value', 'expiresAt');
  let decidedAt: string | null = null;
  if (value.decidedAt !== null) {
    if (typeof value.decidedAt !== 'string') return fail('invalid_type', 'decidedAt');
    if (!isIso(value.decidedAt)) return fail('invalid_value', 'decidedAt');
    decidedAt = value.decidedAt;
  }
  if (value.status === 'pending' && decidedAt !== null) return fail('invalid_value', 'decidedAt');
  if ((value.status === 'accepted' || value.status === 'rejected') && decidedAt === null) return fail('invalid_value', 'decidedAt');
  return {
    ok: true,
    value: { ...body.value, id: value.id, status: value.status, createdAt: value.createdAt, expiresAt: value.expiresAt, decidedAt },
  };
}

export function decodeMemoryProposalDecisionCommandV1(value: unknown): MemoryProposalDecodeResultV1<MemoryProposalDecisionCommandV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'proposalIds', 'decision'], ['proposalIds', 'decision']);
  if (bad) return bad;
  if (!Array.isArray(value.proposalIds)) return fail('invalid_type', 'proposalIds');
  const ids = value.proposalIds;
  if (ids.length === 0 || ids.length > MEMORY_PROPOSAL_LIMITS_V1.batchMax) return fail('invalid_value', 'proposalIds');
  for (const id of ids) {
    if (typeof id !== 'string') return fail('invalid_type', 'proposalIds');
    if (!UUID.test(id)) return fail('invalid_value', 'proposalIds');
  }
  if (new Set(ids).size !== ids.length) return fail('invalid_value', 'proposalIds');
  if (typeof value.decision !== 'string') return fail('invalid_type', 'decision');
  if (!isOneOf(MEMORY_PROPOSAL_DECISIONS_V1, value.decision)) return fail('invalid_value', 'decision');
  return {
    ok: true,
    value: { schemaVersion: MEMORY_PROPOSAL_SCHEMA_VERSION_V1, proposalIds: [...ids], decision: value.decision },
  };
}

export function decodeMemoryAutoAcceptRuleV1(value: unknown): MemoryProposalDecodeResultV1<MemoryAutoAcceptRuleV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'category', 'enabled'], ['category', 'enabled']);
  if (bad) return bad;
  if (typeof value.category !== 'string') return fail('invalid_type', 'category');
  if (!isOneOf(MEMORY_PROPOSAL_CATEGORIES_V1, value.category)) return fail('invalid_value', 'category');
  if (typeof value.enabled !== 'boolean') return fail('invalid_type', 'enabled');
  return { ok: true, value: { schemaVersion: MEMORY_PROPOSAL_SCHEMA_VERSION_V1, category: value.category, enabled: value.enabled } };
}
