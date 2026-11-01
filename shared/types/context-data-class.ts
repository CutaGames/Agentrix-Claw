/**
 * 草案 v0（L8 1b 第 0 步，coord 10-18）：线 N 实现时可加字段，不可改语义。
 *
 * A3「发模型前分流 + 使用账本」：对话上下文的每一层、每一条带一个数据级别；发给哪类处理方之前，在组装阶段就把不该给它的
 * 条目滤掉（不是事后剥离）；每轮用了哪些条目、交给了谁，记一条不含正文的回执，按主人串成哈希链。
 *
 * 级别词表沿用 `trust-loop-primitives.ts` 的 `DATA_CLASSES`：public < owner < private < restricted。
 * 规则（草案）：
 * - 号池（account_pool）只拿 public / owner。
 * - 平台官方模型（platform_model）默认也拿 private，主人可以选「不给」（`privateToPlatform: false`）。
 * - restricted 只给 BYO（byo_provider）或本机模型（local_model）。
 * - `brainMode = private` 时，处理方只能是 BYO 或本机；主人没有 BYO 又没有本机模型时，回 409 `PRIVATE_NO_CANDIDATE`。
 * - 远端自建 OpenClaw 实例（remote_instance）的上下文不经过我们组装，这里只留个名字，规则取最保守的 public / owner。
 *
 * 端口 `ContextUseLedgerPortV1`（见 `backend/src/common/ports/l8-1b.ports.ts`）：A3 实现；A5 的使用回执（kind `pass_use`）和
 * A6 的网关读取（kind `gateway_read`）也经它写。没有实现时一律拒绝（`port_unavailable`）。
 *
 * 回执不存正文：只有条目 id、级别、模型、处理方和前后摘要。`CONTEXT_USE_RECEIPT_FIELDS_V1` 是字段白名单，账本的测试拿它断言。
 * 摘要怎么算（规范化、哈希）由 A3 实现时定，这里只定格式 `sha256:<64 位小写十六进制>`。
 *
 * 开关：`CONTEXT_DATA_CLASS_ROUTING_V1_ENABLED`（分流）、`CONTEXT_USE_LEDGER_V1_ENABLED`（回执），只认精确的 `'1'`，默认关。
 * 解码函数都拒收未知字段和错误类型，失败时给出 `reasonCode` 和出错的字段名，不抛异常。
 */
import { DATA_CLASSES, DATA_CLASS_RANK, type DataClass } from './trust-loop-primitives';
import { BRAIN_MODES, type BrainMode } from './llm-routing-plan';

export const CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1 = 1 as const;

export const CONTEXT_DATA_CLASSES_V1 = DATA_CLASSES;
export type ContextDataClassV1 = DataClass;

/** `AgentContextService.buildContext` 现有的八层。 */
export const CONTEXT_LAYERS_V1 = [
  'system',
  'agent_profile',
  'approved_context',
  'calendar_window',
  'user_memory',
  'skill_prompts',
  'plan_mode',
  'reply_rules',
] as const;
export type ContextLayerV1 = (typeof CONTEXT_LAYERS_V1)[number];

/** 条目自己没带级别时，这一层的默认级别：W1R 条目用自己的 `sensitivity`，agent_memory 读 `metadata.dataClass`。 */
export const CONTEXT_LAYER_DEFAULT_CLASS_V1: Readonly<Record<ContextLayerV1, ContextDataClassV1>> = {
  system: 'public',
  agent_profile: 'owner',
  approved_context: 'private',
  calendar_window: 'private',
  user_memory: 'owner',
  skill_prompts: 'public',
  plan_mode: 'public',
  reply_rules: 'public',
};

export const CONTEXT_PROCESSORS_V1 = [
  'account_pool',
  'platform_model',
  'byo_provider',
  'vendor_subscription',
  'local_model',
  'remote_instance',
] as const;
export type ContextProcessorV1 = (typeof CONTEXT_PROCESSORS_V1)[number];

/** 和 `chat-routing.ts` 的 `credentialSource` 同一组值。 */
export const CONTEXT_CREDENTIAL_SOURCES_V1 = [
  'platform',
  'user_provider',
  'vendor_subscription',
  'remote_instance',
  'local_artifact',
] as const;
export type ContextCredentialSourceV1 = (typeof CONTEXT_CREDENTIAL_SOURCES_V1)[number];

/** 每种处理方对应的凭据来源。回执里两者对不上就是坏的。 */
export const CONTEXT_PROCESSOR_CREDENTIAL_SOURCE_V1: Readonly<Record<ContextProcessorV1, ContextCredentialSourceV1>> = {
  account_pool: 'platform',
  platform_model: 'platform',
  byo_provider: 'user_provider',
  vendor_subscription: 'vendor_subscription',
  local_model: 'local_artifact',
  remote_instance: 'remote_instance',
};

/** `brainMode = private` 时允许的处理方。 */
export const CONTEXT_PRIVATE_BRAIN_PROCESSORS_V1: readonly ContextProcessorV1[] = ['byo_provider', 'local_model'];

/** 沿用已有的错误码（`routing-plan`）；A3 在对话运行时单独执行这条规则，不改影子计划。 */
export const CONTEXT_PRIVATE_NO_CANDIDATE_CODE_V1 = 'PRIVATE_NO_CANDIDATE' as const;

/** 主人能调的两个旋钮。存储复用 `llm_model_preferences.brain_profile`，不新建表。 */
export interface ContextRoutingSettingsV1 {
  schemaVersion: typeof CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1;
  /** 默认 true：平台官方模型可以拿 private 级别的条目。false 时 private 也不给。 */
  privateToPlatform: boolean;
  brainMode: BrainMode;
}

export const CONTEXT_ROUTING_SETTINGS_DEFAULT_V1: ContextRoutingSettingsV1 = {
  schemaVersion: CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1,
  privateToPlatform: true,
  brainMode: 'auto',
};

const BASE_ALLOWED: Readonly<Record<ContextProcessorV1, readonly ContextDataClassV1[]>> = {
  account_pool: ['public', 'owner'],
  platform_model: ['public', 'owner'],
  byo_provider: ['public', 'owner', 'private', 'restricted'],
  vendor_subscription: ['public', 'owner', 'private'],
  local_model: ['public', 'owner', 'private', 'restricted'],
  remote_instance: ['public', 'owner'],
};

/** 这个处理方能拿到哪些级别（组装上下文时的 `allowedDataClasses`）。 */
export function allowedDataClassesV1(processor: ContextProcessorV1, settings: Pick<ContextRoutingSettingsV1, 'privateToPlatform'>): ContextDataClassV1[] {
  const base = BASE_ALLOWED[processor];
  if (!base) return [];
  const out = [...base];
  if (processor === 'platform_model' && settings.privateToPlatform === true) out.push('private');
  return out;
}

/** 条目 `dataClass` 能不能交给 `processor`。未知的处理方或级别一律不行。 */
export function isDataClassAllowedV1(
  processor: unknown,
  dataClass: unknown,
  settings: Pick<ContextRoutingSettingsV1, 'privateToPlatform'>,
): boolean {
  if (typeof processor !== 'string' || typeof dataClass !== 'string') return false;
  if (!(CONTEXT_PROCESSORS_V1 as readonly string[]).includes(processor)) return false;
  if (!(DATA_CLASSES as readonly string[]).includes(dataClass)) return false;
  return allowedDataClassesV1(processor as ContextProcessorV1, settings).includes(dataClass as ContextDataClassV1);
}

/** 两个级别里更敏感的那个。组装条目时用。 */
export function moreSensitiveDataClassV1(a: ContextDataClassV1, b: ContextDataClassV1): ContextDataClassV1 {
  return DATA_CLASS_RANK[a] >= DATA_CLASS_RANK[b] ? a : b;
}

/** `brainMode = private` 时，这个处理方行不行。其他模式都行。 */
export function isProcessorAllowedForBrainModeV1(processor: unknown, brainMode: unknown): boolean {
  if (typeof processor !== 'string' || !(CONTEXT_PROCESSORS_V1 as readonly string[]).includes(processor)) return false;
  if (brainMode !== 'private') return true;
  return CONTEXT_PRIVATE_BRAIN_PROCESSORS_V1.includes(processor as ContextProcessorV1);
}

// ── 使用回执 ──────────────────────────────────────────────────────────────────────────

/** chat_turn：对话一轮；pass_use：A5 的 Pass 被用了一次；gateway_read：A6 的网关读取。 */
export const CONTEXT_USE_RECEIPT_KINDS_V1 = ['chat_turn', 'pass_use', 'gateway_read'] as const;
export type ContextUseReceiptKindV1 = (typeof CONTEXT_USE_RECEIPT_KINDS_V1)[number];

export const CONTEXT_USE_LIMITS_V1 = {
  /** 一条回执最多列多少个条目引用。 */
  itemsMax: 200,
  withheldMax: 100_000,
} as const;

export const CONTEXT_USE_DIGEST_PATTERN_V1 = /^sha256:[0-9a-f]{64}$/;

/** 只有 id，没有正文。 */
export interface ContextUseItemRefV1 {
  layer: ContextLayerV1;
  id: string;
  dataClass: ContextDataClassV1;
}

/** 写一条回执。属主不在里面，是端口的第一个参数。 */
export interface ContextUseReceiptInputV1 {
  schemaVersion: typeof CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1;
  kind: ContextUseReceiptKindV1;
  agentId: string;
  /** 轮次：对话轮次 id、Pass 使用 id 或网关读取 id。 */
  turnRef: string;
  items: ContextUseItemRefV1[];
  /** 按级别规则被隐去、没有交给处理方的条数。 */
  withheldCount: number;
  processor: ContextProcessorV1;
  credentialSource: ContextCredentialSourceV1;
  providerId?: string;
  modelId?: string;
  /** 只有 kind 为 pass_use 时有，而且必填。 */
  passId?: string;
  occurredAt: string;
}

/** 账本里存的那一条：输入加上属主、序号和哈希链。 */
export interface ContextUseReceiptV1 extends ContextUseReceiptInputV1 {
  receiptId: string;
  ownerId: string;
  /** 这个主人的链上第几条，从 1 起。 */
  sequence: number;
  /** 链上前一条的摘要；第一条为 null。 */
  previousDigest: string | null;
  digest: string;
}

/**
 * The receipt as the owner's screens show it (S50 F4, following L7.4.3b: a platform model is shown under the platform's own
 * name, never under the upstream model's). When the platform paid for the model (`account_pool`, `platform_model`) the upstream
 * provider and model ids are left out; the processor already names it ("Shared pool" / "Platform model"). The owner's own
 * key, subscription, device or instance keep theirs: those are the owner's own choice. The chain export is not changed by this,
 * because a digest covers these two fields.
 */
export function contextReceiptForDisplayV1<T extends { processor: ContextProcessorV1; providerId?: string; modelId?: string }>(receipt: T): T {
  if (receipt.processor !== 'account_pool' && receipt.processor !== 'platform_model') return receipt;
  if (receipt.providerId === undefined && receipt.modelId === undefined) return receipt;
  const { providerId: _providerId, modelId: _modelId, ...rest } = receipt;
  return rest as T;
}
export const CONTEXT_USE_RECEIPT_INPUT_FIELDS_V1 = [
  'schemaVersion',
  'kind',
  'agentId',
  'turnRef',
  'items',
  'withheldCount',
  'processor',
  'credentialSource',
  'providerId',
  'modelId',
  'passId',
  'occurredAt',
] as const;

/** 回执的字段白名单：账本的行和导出都不许多出这些以外的字段（尤其不许有正文）。 */
export const CONTEXT_USE_RECEIPT_FIELDS_V1 = [
  ...CONTEXT_USE_RECEIPT_INPUT_FIELDS_V1,
  'receiptId',
  'ownerId',
  'sequence',
  'previousDigest',
  'digest',
] as const;

/** `ContextUseLedgerPortV1.append` 的结果。 */
export type ContextUseLedgerOutcomeV1 =
  | { recorded: true; receiptId: string; digest: string }
  | { recorded: false; reasonCode: ContextDataClassReasonCodeV1 };

// ── 「已隐去 N 条」的流事件 ──────────────────────────────────────────────────────────────

export const CONTEXT_WITHHELD_META_KIND_V1 = 'context_withheld' as const;

/** 对话流里的 `meta`：本轮有 N 条因为级别规则没交给这个处理方。三端显示「已隐去 N 条」。 */
export interface ContextWithheldMetaV1 {
  schemaVersion: typeof CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1;
  type: 'meta';
  kind: typeof CONTEXT_WITHHELD_META_KIND_V1;
  count: number;
}

export const CONTEXT_DATA_CLASS_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  /** `passId` 的有无和 `kind` 对不上，或者 `processor` 和 `credentialSource` 对不上。 */
  'kind_mismatch',
  /** 没有注册实现：默认拒绝。 */
  'port_unavailable',
  /** `CONTEXT_USE_LEDGER_V1_ENABLED` 没开。 */
  'feature_disabled',
  /** 这个主人的链头被别的写入抢先推进了，重试。 */
  'chain_conflict',
] as const;
export type ContextDataClassReasonCodeV1 = (typeof CONTEXT_DATA_CLASS_REASON_CODES_V1)[number];

export type ContextDataClassDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: ContextDataClassReasonCodeV1; field: string };

// ── 解码 ────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
/** 和 `chat-routing.ts` 的标识符同形。 */
const MODEL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,191}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

type Failure = { ok: false; reasonCode: ContextDataClassReasonCodeV1; field: string };

function fail(reasonCode: ContextDataClassReasonCodeV1, field: string): Failure {
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

function checkEnvelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

function decodeItems(value: unknown): ContextDataClassDecodeResultV1<ContextUseItemRefV1[]> {
  if (!Array.isArray(value)) return fail('invalid_type', 'items');
  if (value.length > CONTEXT_USE_LIMITS_V1.itemsMax) return fail('invalid_value', 'items');
  const out: ContextUseItemRefV1[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item: unknown = value[i];
    const path = `items[${i}]`;
    if (!isRecord(item)) return fail('invalid_type', path);
    for (const key of Object.keys(item)) if (!['layer', 'id', 'dataClass'].includes(key)) return fail('unknown_field', `${path}.${key}`);
    for (const key of ['layer', 'id', 'dataClass']) if (item[key] === undefined) return fail('missing_field', `${path}.${key}`);
    if (typeof item.layer !== 'string') return fail('invalid_type', `${path}.layer`);
    if (!isOneOf(CONTEXT_LAYERS_V1, item.layer)) return fail('invalid_value', `${path}.layer`);
    if (typeof item.id !== 'string') return fail('invalid_type', `${path}.id`);
    if (!OPAQUE_ID.test(item.id)) return fail('invalid_value', `${path}.id`);
    if (typeof item.dataClass !== 'string') return fail('invalid_type', `${path}.dataClass`);
    if (!isOneOf(CONTEXT_DATA_CLASSES_V1, item.dataClass)) return fail('invalid_value', `${path}.dataClass`);
    out.push({ layer: item.layer, id: item.id, dataClass: item.dataClass });
  }
  return { ok: true, value: out };
}

/** 输入和已入账的回执共用的那部分。`value` 已经过 `checkEnvelope`。 */
function decodeReceiptBody(value: Record<string, unknown>): ContextDataClassDecodeResultV1<ContextUseReceiptInputV1> {
  if (typeof value.kind !== 'string') return fail('invalid_type', 'kind');
  if (!isOneOf(CONTEXT_USE_RECEIPT_KINDS_V1, value.kind)) return fail('invalid_value', 'kind');
  if (typeof value.agentId !== 'string') return fail('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return fail('invalid_value', 'agentId');
  if (typeof value.turnRef !== 'string') return fail('invalid_type', 'turnRef');
  if (!OPAQUE_ID.test(value.turnRef)) return fail('invalid_value', 'turnRef');
  const items = decodeItems(value.items);
  if (items.ok === false) return items;
  if (typeof value.withheldCount !== 'number') return fail('invalid_type', 'withheldCount');
  if (!Number.isInteger(value.withheldCount) || value.withheldCount < 0 || value.withheldCount > CONTEXT_USE_LIMITS_V1.withheldMax) {
    return fail('invalid_value', 'withheldCount');
  }
  if (typeof value.processor !== 'string') return fail('invalid_type', 'processor');
  if (!isOneOf(CONTEXT_PROCESSORS_V1, value.processor)) return fail('invalid_value', 'processor');
  if (typeof value.credentialSource !== 'string') return fail('invalid_type', 'credentialSource');
  if (!isOneOf(CONTEXT_CREDENTIAL_SOURCES_V1, value.credentialSource)) return fail('invalid_value', 'credentialSource');
  if (CONTEXT_PROCESSOR_CREDENTIAL_SOURCE_V1[value.processor] !== value.credentialSource) return fail('kind_mismatch', 'credentialSource');
  let providerId: string | undefined;
  if (value.providerId !== undefined) {
    if (typeof value.providerId !== 'string') return fail('invalid_type', 'providerId');
    if (!MODEL_IDENTIFIER.test(value.providerId)) return fail('invalid_value', 'providerId');
    providerId = value.providerId;
  }
  let modelId: string | undefined;
  if (value.modelId !== undefined) {
    if (typeof value.modelId !== 'string') return fail('invalid_type', 'modelId');
    if (!MODEL_IDENTIFIER.test(value.modelId)) return fail('invalid_value', 'modelId');
    modelId = value.modelId;
  }
  let passId: string | undefined;
  if (value.passId !== undefined) {
    if (typeof value.passId !== 'string') return fail('invalid_type', 'passId');
    if (!OPAQUE_ID.test(value.passId)) return fail('invalid_value', 'passId');
    passId = value.passId;
  }
  if (value.kind === 'pass_use' && passId === undefined) return fail('kind_mismatch', 'passId');
  if (value.kind !== 'pass_use' && passId !== undefined) return fail('kind_mismatch', 'passId');
  if (typeof value.occurredAt !== 'string') return fail('invalid_type', 'occurredAt');
  if (!isIso(value.occurredAt)) return fail('invalid_value', 'occurredAt');

  const out: ContextUseReceiptInputV1 = {
    schemaVersion: CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1,
    kind: value.kind,
    agentId: value.agentId,
    turnRef: value.turnRef,
    items: items.value,
    withheldCount: value.withheldCount,
    processor: value.processor,
    credentialSource: value.credentialSource,
    occurredAt: value.occurredAt,
  };
  if (providerId !== undefined) out.providerId = providerId;
  if (modelId !== undefined) out.modelId = modelId;
  if (passId !== undefined) out.passId = passId;
  return { ok: true, value: out };
}

const INPUT_REQUIRED = ['kind', 'agentId', 'turnRef', 'items', 'withheldCount', 'processor', 'credentialSource', 'occurredAt'];
const CHAIN_ONLY_FIELDS = ['receiptId', 'ownerId', 'sequence', 'previousDigest', 'digest'];

/** 账本收到一条回执时用。正文类字段（`text`、`content` 等）都是未知字段，直接拒收。 */
export function decodeContextUseReceiptInputV1(value: unknown): ContextDataClassDecodeResultV1<ContextUseReceiptInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, CONTEXT_USE_RECEIPT_INPUT_FIELDS_V1, INPUT_REQUIRED);
  if (bad) return bad;
  return decodeReceiptBody(value);
}

/** 导出或三端读取已入账的回执。 */
export function decodeContextUseReceiptV1(value: unknown): ContextDataClassDecodeResultV1<ContextUseReceiptV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, CONTEXT_USE_RECEIPT_FIELDS_V1, [...INPUT_REQUIRED, ...CHAIN_ONLY_FIELDS]);
  if (bad) return bad;
  const body = decodeReceiptBody(value);
  if (body.ok === false) return body;
  if (typeof value.receiptId !== 'string') return fail('invalid_type', 'receiptId');
  if (!UUID.test(value.receiptId)) return fail('invalid_value', 'receiptId');
  if (typeof value.ownerId !== 'string') return fail('invalid_type', 'ownerId');
  if (!OPAQUE_ID.test(value.ownerId)) return fail('invalid_value', 'ownerId');
  if (typeof value.sequence !== 'number') return fail('invalid_type', 'sequence');
  if (!Number.isInteger(value.sequence) || value.sequence < 1) return fail('invalid_value', 'sequence');
  let previousDigest: string | null = null;
  if (value.previousDigest !== null) {
    if (typeof value.previousDigest !== 'string') return fail('invalid_type', 'previousDigest');
    if (!CONTEXT_USE_DIGEST_PATTERN_V1.test(value.previousDigest)) return fail('invalid_value', 'previousDigest');
    previousDigest = value.previousDigest;
  }
  if ((value.sequence === 1) !== (previousDigest === null)) return fail('invalid_value', 'previousDigest');
  if (typeof value.digest !== 'string') return fail('invalid_type', 'digest');
  if (!CONTEXT_USE_DIGEST_PATTERN_V1.test(value.digest)) return fail('invalid_value', 'digest');
  return {
    ok: true,
    value: { ...body.value, receiptId: value.receiptId, ownerId: value.ownerId, sequence: value.sequence, previousDigest, digest: value.digest },
  };
}

export function decodeContextRoutingSettingsV1(value: unknown): ContextDataClassDecodeResultV1<ContextRoutingSettingsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'privateToPlatform', 'brainMode'], ['privateToPlatform', 'brainMode']);
  if (bad) return bad;
  if (typeof value.privateToPlatform !== 'boolean') return fail('invalid_type', 'privateToPlatform');
  if (typeof value.brainMode !== 'string') return fail('invalid_type', 'brainMode');
  if (!isOneOf(BRAIN_MODES, value.brainMode)) return fail('invalid_value', 'brainMode');
  return {
    ok: true,
    value: { schemaVersion: CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1, privateToPlatform: value.privateToPlatform, brainMode: value.brainMode },
  };
}

/** 三端解码对话流里的 `context_withheld` meta。 */
export function decodeContextWithheldMetaV1(value: unknown): ContextDataClassDecodeResultV1<ContextWithheldMetaV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'type', 'kind', 'count'], ['type', 'kind', 'count']);
  if (bad) return bad;
  if (value.type !== 'meta') return fail('invalid_value', 'type');
  if (value.kind !== CONTEXT_WITHHELD_META_KIND_V1) return fail('invalid_value', 'kind');
  if (typeof value.count !== 'number') return fail('invalid_type', 'count');
  if (!Number.isInteger(value.count) || value.count < 1 || value.count > CONTEXT_USE_LIMITS_V1.withheldMax) return fail('invalid_value', 'count');
  return {
    ok: true,
    value: { schemaVersion: CONTEXT_DATA_CLASS_SCHEMA_VERSION_V1, type: 'meta', kind: CONTEXT_WITHHELD_META_KIND_V1, count: value.count },
  };
}
