/**
 * 桌面 D4"共用记忆"：context gateway v1.1 草案（REQ-desktop-034）。**只是合同，没有实现。**
 *
 * 场景：桌面程序以 `--agentrix-mcp` 模式跑一个本机 stdio MCP 服务，由 Cursor / Claude Code / Kiro 拉起。
 * 它只做两件事：
 * - `agentrix_recall(query, purpose)`：通过 context gateway 读主人允许的内容，每一条都带来源；
 * - `agentrix_propose_memory(text, source)`：提议写回，只存成不可信的候选，要主人在手机或网页上确认才算数。
 *
 * v1.1 对 v1 的三处改动（都是加法，v1 的调用方不受影响）：
 * 1. 新类别 `agent_memory`：默认不披露，只有主人给某个客户端打开时才给。
 * 2. 条目级来源 `provenance`：`projections/:id/data` 里每一条都带；顶层带 `disclosureReceiptId`。
 * 3. 一种单独的短期凭据，audience 是 `context_gateway`：主人登录 + 设备钥匙签名换取，只能用在 gateway 的读和候选路由上。
 *
 * 实现时 `agent_memory` 会追加进 `context-projection.ts` 的 `CONTEXT_DATA_CATEGORIES_V1`；在那之前，这里的类型单独定义。
 */
import {
  CONTEXT_DEFAULT_DENY_CATEGORIES_V1,
  CONTEXT_SOURCE_DOMAINS_V1,
  type ContextDataCategoryV1,
  type ContextPurposeV1,
  type ContextSourceDomainV1,
} from './context-projection';

// ── 1. 类别和用途 ────────────────────────────────────────────────────────────────────

export const CONTEXT_MEMORY_CATEGORY_V1_1 = 'agent_memory' as const;
export type ContextDataCategoryV1_1 = ContextDataCategoryV1 | typeof CONTEXT_MEMORY_CATEGORY_V1_1;
/** 默认不披露、要主人对这个客户端单独打开的类别。 */
export const CONTEXT_OWNER_OPT_IN_CATEGORIES_V1_1: readonly ContextDataCategoryV1_1[] = [CONTEXT_MEMORY_CATEGORY_V1_1];
/** D4 只用这两种用途；`schedule_assistance`、`support_diagnostics` 不给 D4。 */
export const DESKTOP_MEMORY_PURPOSES_V1: readonly ContextPurposeV1[] = ['answer_user_question', 'task_execution_planning'];
/** 主人什么都不改时，D4 能读的类别。 */
export const DESKTOP_MEMORY_DEFAULT_CATEGORIES_V1: readonly ContextDataCategoryV1_1[] = ['agent_profile', 'agent_preferences'];
/** D4 永远不碰、也不给开关的类别（就是 v1 的默认拒绝类别）。 */
export const DESKTOP_MEMORY_NEVER_CATEGORIES_V1: readonly ContextDataCategoryV1_1[] = CONTEXT_DEFAULT_DENY_CATEGORIES_V1;
/** D4 可以申请的全部类别：默认的两个，加上主人可以打开的 `agent_memory`。 */
export const DESKTOP_MEMORY_ALLOWED_CATEGORIES_V1: readonly ContextDataCategoryV1_1[] = [
  ...DESKTOP_MEMORY_DEFAULT_CATEGORIES_V1,
  ...CONTEXT_OWNER_OPT_IN_CATEGORIES_V1_1,
];
/** 本机 MCP 服务替哪个客户端读。由桌面程序断言（服务端无法核验），主人按客户端分别打开 `agent_memory`。 */
export const DESKTOP_MEMORY_CLIENT_IDS_V1 = ['cursor', 'claude_code', 'kiro'] as const;
export type DesktopMemoryClientIdV1 = (typeof DESKTOP_MEMORY_CLIENT_IDS_V1)[number];

// ── 2. D4 凭据（audience `context_gateway`） ──────────────────────────────────────────
/*
 * 做法照 E32 的开发者运行时凭据（`device-runtime-binding.ts`），但是另一种凭据，两边互相不认：
 * - 签发：主人登录凭据（`type: 'user'`，带 `authIssuedAt`）+ 设备钥匙 K 对签发消息的签名。
 *   主人在"我的 AI 们"里给某个客户端打开 / 关掉 `agent_memory`，就是用新的 `categories` 重新签发一张。
 *   **类别记在凭据上**：MCP 进程只有这张凭据，改不了类别；刷新不能加类别。
 * - 挂在同一份设备绑定（E32 第 3 步的 `shell_session_binding`）上：解绑设备，两种凭据都失效。
 * - 急停只吊销开发者运行时凭据，**不**吊销这张；本机急停时 MCP 进程自己拒绝一切调用（desktop 做）。
 *   主人要停掉记忆读取，用本节的 revoke。
 * - token 用单独派生的密钥签；`jwt` 策略拒收它的 audience，开发者运行时的守卫也拒收，反之亦然。
 * - gateway 只在这几条路由上认它：`POST projections`、`GET projections/:id`、`GET projections/:id/data`、
 *   `GET projections/:id/receipts`、`POST projections/:id/revoke`、`POST ingest-candidates`。
 *   `act-requests`、`relay/read` 拒收。
 * - 每次请求都重查：凭据没吊销、没过期；账号、设备、绑定、钥匙都还有效；Agent 仍然是这个主人的。
 * - 服务端用它派生 `ContextRuntimeBindingV1`：`runtimeId` 和 `runtimeSessionRef` 都是 `credentialRef`，
 *   `audience` 是 `context_gateway`，`allowedScopes` 只有 `context.read`，Agent 取自设备绑定；都不从请求里拿。
 * - 请求的 `categories` 必须是凭据上类别的子集，否则整次拒绝，`reasonCode: category_denied`。
 * - 同一台设备、同一个客户端同时只有一张有效的：重新签发会吊销旧的。
 * - 要一张新表存凭据（签发、刷新链、吊销、类别），迁移号实现时再申请。
 */
export const CONTEXT_GATEWAY_CREDENTIAL_SCHEMA_VERSION = 1 as const;
export const CONTEXT_GATEWAY_CREDENTIAL_AUDIENCE = 'context_gateway' as const;
export const CONTEXT_GATEWAY_CREDENTIAL_ISSUE_DOMAIN_V1 = 'agentrix.context-gateway.credential.issue.v1' as const;
export const CONTEXT_GATEWAY_CREDENTIAL_REFRESH_DOMAIN_V1 = 'agentrix.context-gateway.credential.refresh.v1' as const;
/** `cgc_` + 32 位小写十六进制；也是 token 的 `jti`。 */
export const CONTEXT_GATEWAY_CREDENTIAL_REF_PATTERN = /^cgc_[0-9a-f]{32}$/;
export const CONTEXT_GATEWAY_CREDENTIAL_TTL_SECONDS = 30 * 60;
export const CONTEXT_GATEWAY_CREDENTIAL_REFRESH_AFTER_SECONDS = 20 * 60;
export const CONTEXT_GATEWAY_CREDENTIAL_REFRESH_GRACE_SECONDS = 10 * 60;
export const CONTEXT_GATEWAY_CREDENTIAL_ROUTES = {
  issue: '/api/v1/devices/:deviceId/context-credentials',
  refresh: '/api/v1/devices/:deviceId/context-credentials/refresh',
  revoke: '/api/v1/devices/:deviceId/context-credentials/revoke',
} as const;
export const CONTEXT_GATEWAY_CREDENTIAL_ERROR_CODES = {
  /** 400：请求体不合格式。 */
  invalid: 'CONTEXT_GATEWAY_CREDENTIAL_INVALID',
  /** 400：`categories` 里有 D4 不能申请的类别（默认拒绝的三类，或不认识的）。 */
  categoryNotAllowed: 'CONTEXT_GATEWAY_CREDENTIAL_CATEGORY_NOT_ALLOWED',
  /** 403：签发要主人本人的登录凭据。 */
  signInRequired: 'CONTEXT_GATEWAY_CREDENTIAL_SIGN_IN_REQUIRED',
  /** 403：K 的签名不对。 */
  signatureInvalid: 'CONTEXT_GATEWAY_CREDENTIAL_SIGNATURE_INVALID',
  /** 403：`signedAt` 和服务端时间差超过 5 分钟。 */
  signatureStale: 'CONTEXT_GATEWAY_CREDENTIAL_SIGNATURE_STALE',
  /** 409：绑定不是这台设备 / 这把钥匙的，已失效，或快到期了。 */
  bindingUnavailable: 'CONTEXT_GATEWAY_CREDENTIAL_BINDING_UNAVAILABLE',
  /** 409：`requestId` 用过了，但参数不同。 */
  replay: 'CONTEXT_GATEWAY_CREDENTIAL_REPLAY',
  /** 401：旧凭据已吊销 / 已被刷新 / 过期超过 10 分钟 / 验不过。要主人重新签发。 */
  refreshRejected: 'CONTEXT_GATEWAY_CREDENTIAL_REFRESH_REJECTED',
  /** 401：每次请求的重查没通过。先刷新一次。 */
  rejected: 'CONTEXT_GATEWAY_CREDENTIAL_REJECTED',
} as const;
export interface ContextGatewayBindingRefV1 {
  type: 'shell_session_binding';
  id: string;
  version: number;
}
export interface ContextGatewayCredentialIssueCommandV1 {
  schemaVersion: typeof CONTEXT_GATEWAY_CREDENTIAL_SCHEMA_VERSION;
  /** 幂等键，也在签名里。 */
  requestId: string;
  clientId: DesktopMemoryClientIdV1;
  /** `DESKTOP_MEMORY_ALLOWED_CATEGORIES_V1` 的非空子集，不重复。 */
  categories: ContextDataCategoryV1_1[];
  /** 绑定的 `keyRef`，签名用的钥匙。 */
  signerRef: string;
  bindingRef: ContextGatewayBindingRefV1;
  signedAt: string;
  /** K 对 `contextGatewayCredentialIssueMessageV1` 的 ECDSA-SHA256 签名，P1363，base64url（86 字符）。 */
  signature: string;
}
export interface ContextGatewayCredentialRefreshCommandV1 {
  schemaVersion: typeof CONTEXT_GATEWAY_CREDENTIAL_SCHEMA_VERSION;
  requestId: string;
  bindingRef: ContextGatewayBindingRefV1;
  signedAt: string;
  signature: string;
}
export interface ContextGatewayCredentialV1 {
  schemaVersion: typeof CONTEXT_GATEWAY_CREDENTIAL_SCHEMA_VERSION;
  credentialRef: string;
  /** 只放钥匙串，不写日志，不写进规则文件。 */
  token: string;
  tokenType: 'Bearer';
  audience: typeof CONTEXT_GATEWAY_CREDENTIAL_AUDIENCE;
  deviceId: string;
  clientId: DesktopMemoryClientIdV1;
  categories: ContextDataCategoryV1_1[];
  bindingRef: ContextGatewayBindingRefV1;
  issuedAt: string;
  expiresAt: string;
  refreshAfter: string;
}
export interface ContextGatewayCredentialRevokeCommandV1 {
  schemaVersion: typeof CONTEXT_GATEWAY_CREDENTIAL_SCHEMA_VERSION;
  /** 主人登录凭据：省略 = 这台设备的全部，或指定一张；D4 凭据：只能吊销自己，省略即自己。 */
  credentialRef?: string;
  /** 主人登录凭据：只吊销这个客户端的。 */
  clientId?: DesktopMemoryClientIdV1;
}
/** 排好序、去重后的类别，逗号连接；签名里用这个。 */
export function contextGatewayCredentialCategoriesLineV1(categories: readonly string[]): string {
  return [...new Set(categories)].sort().join(',');
}
/** 九行，`\n` 分隔，没有结尾换行。 */
export function contextGatewayCredentialIssueMessageV1(input: {
  deviceId: string;
  requestId: string;
  clientId: string;
  categories: readonly string[];
  signerRef: string;
  bindingRef: { id: string; version: number };
  signedAt: string;
}): string {
  return [
    CONTEXT_GATEWAY_CREDENTIAL_ISSUE_DOMAIN_V1,
    input.deviceId,
    input.requestId,
    input.clientId,
    contextGatewayCredentialCategoriesLineV1(input.categories),
    input.signerRef,
    input.bindingRef.id,
    String(input.bindingRef.version),
    input.signedAt,
  ].join('\n');
}
/** 七行，`\n` 分隔，没有结尾换行。`credentialRef` 是旧凭据的。刷新不能改客户端和类别。 */
export function contextGatewayCredentialRefreshMessageV1(input: {
  deviceId: string;
  credentialRef: string;
  requestId: string;
  bindingRef: { id: string; version: number };
  signedAt: string;
}): string {
  return [
    CONTEXT_GATEWAY_CREDENTIAL_REFRESH_DOMAIN_V1,
    input.deviceId,
    input.credentialRef,
    input.requestId,
    input.bindingRef.id,
    String(input.bindingRef.version),
    input.signedAt,
  ].join('\n');
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Same shape as `device-runtime-binding.ts` (requestId, signerRef). */
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isBindingRef(value: unknown): value is ContextGatewayBindingRefV1 {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === 'type' || key === 'id' || key === 'version') &&
    value.type === 'shell_session_binding' &&
    typeof value.id === 'string' &&
    UUID.test(value.id) &&
    Number.isInteger(value.version) &&
    (value.version as number) >= 1
  );
}
/** 签发时要的类别是不是都能申请：非空、不重复、全在 `DESKTOP_MEMORY_ALLOWED_CATEGORIES_V1` 里。 */
export function isDesktopMemoryCategorySetV1(value: unknown): value is ContextDataCategoryV1_1[] {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) return false;
  return value.every((item) => typeof item === 'string' && (DESKTOP_MEMORY_ALLOWED_CATEGORIES_V1 as readonly string[]).includes(item));
}
const ISSUE_KEYS = new Set(['schemaVersion', 'requestId', 'clientId', 'categories', 'signerRef', 'bindingRef', 'signedAt', 'signature']);
/**
 * 签发请求体的校验。`categoryNotAllowed` 为 true 时服务端回 `CATEGORY_NOT_ALLOWED`（400），其余错误回 `INVALID`。
 */
export function validateContextGatewayCredentialIssueCommandV1(value: unknown): { valid: boolean; errors: string[]; categoryNotAllowed: boolean } {
  if (!isRecord(value)) return { valid: false, errors: ['command: expected object'], categoryNotAllowed: false };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!ISSUE_KEYS.has(key)) errors.push(`${key}: unknown field`);
  if (value.schemaVersion !== CONTEXT_GATEWAY_CREDENTIAL_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (typeof value.requestId !== 'string' || !OPAQUE.test(value.requestId)) errors.push('requestId: invalid');
  if (typeof value.clientId !== 'string' || !(DESKTOP_MEMORY_CLIENT_IDS_V1 as readonly string[]).includes(value.clientId)) errors.push('clientId: unknown client');
  const categoryNotAllowed = !isDesktopMemoryCategorySetV1(value.categories);
  if (categoryNotAllowed) errors.push('categories: non-empty, distinct, only agent_profile / agent_preferences / agent_memory');
  if (typeof value.signerRef !== 'string' || !OPAQUE.test(value.signerRef)) errors.push('signerRef: invalid');
  if (!isBindingRef(value.bindingRef)) errors.push('bindingRef: invalid');
  if (typeof value.signedAt !== 'string' || !Number.isFinite(Date.parse(value.signedAt))) errors.push('signedAt: invalid timestamp');
  if (typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value.signature)) errors.push('signature: 64-byte P1363 signature in base64url required');
  return { valid: errors.length === 0, errors, categoryNotAllowed };
}
/** 请求的类别是不是凭据类别的子集（gateway 每次都查，不是子集就 `category_denied`）。 */
export function contextCategoriesWithinCredentialV1(requested: readonly string[], credential: readonly string[]): boolean {
  const allowed = new Set(credential);
  return requested.length > 0 && requested.every((category) => allowed.has(category));
}

// ── 3. 条目级来源 ────────────────────────────────────────────────────────────────────
/*
 * `GET projections/:id/data` 现在返回 `{ projectionId, payload: { schemaVersion: 1, records } }`，records 只有
 * 按规则挑出来的字段，来源只进了整份快照的 `sourceDigest`。v1.1：
 * - 每条 record 多一个 `provenance`（投影器从读到它的那个 `ContextMinimumDisclosureSourceV1` 填，不从 record 本身取）；
 * - payload 顶层多 `disclosureReceiptId`（和 `ContextProjectionV1.disclosureReceiptId` 相同），MCP 客户端拿它当"这次读取的回执"。
 * `provenance` 进 payload，所以也进 `payloadDigest`。
 * 这个形状（`{ category, fields, provenance }`）只用于 audience 是 `context_gateway` 的投影；v1 的其他 audience
 * 照旧是扁平的 records，不受影响。
 *
 * `agent_memory` 的来源读者读 `agent_w1r_memory_facts` 里这只 Agent、`status = active` 的行：
 * - `text` = `factText`；`sourceRef` = `memory_fact:<id>`；`sourceVersion` = `w1rVersion`；`observedAt` = `updatedAt`；
 * - `sourceKind`：`classification = imported` 记为 `imported_chat`（带入的聊天，现在只有这一种）；
 *   `owner_written`（主人手写）、`soul_core`（Soul Core 自己沉淀的）先占位，有了写入路径再用。
 * - 撤回（`revoked`）的行不读；撤回以后已经发出的投影照 v1 的规则变 `stale`。
 */
export const CONTEXT_MEMORY_SOURCE_KINDS_V1_1 = ['imported_chat', 'owner_written', 'soul_core'] as const;
export type ContextMemorySourceKindV1_1 = (typeof CONTEXT_MEMORY_SOURCE_KINDS_V1_1)[number];
/** 非记忆类别的来源类型：取自哪个域。 */
export const CONTEXT_RECORD_SOURCE_KINDS_V1_1 = [...CONTEXT_MEMORY_SOURCE_KINDS_V1_1, 'agent_profile', 'agent_settings'] as const;
export type ContextRecordSourceKindV1_1 = (typeof CONTEXT_RECORD_SOURCE_KINDS_V1_1)[number];
export interface ContextRecordProvenanceV1_1 {
  sourceDomain: ContextSourceDomainV1;
  sourceKind: ContextRecordSourceKindV1_1;
  sourceRef: string;
  sourceVersion: string;
  observedAt: string;
}
export interface ContextProjectionRecordV1_1 {
  category: ContextDataCategoryV1_1;
  /** 按类别规则挑出来的字段；`agent_memory` 只有 `text`。 */
  fields: Record<string, unknown>;
  provenance: ContextRecordProvenanceV1_1;
}
export interface ContextProjectionDataV1_1 {
  projectionId: string;
  disclosureReceiptId: string;
  records: ContextProjectionRecordV1_1[];
}
/** `agent_memory` 一条最多多少字（和 `AGENT_MEMORY_FACT_MAX_CHARS` 一致）。 */
export const CONTEXT_MEMORY_TEXT_MAX_CHARS = 8000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const SOURCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
function decodeProvenance(value: unknown): ContextRecordProvenanceV1_1 | null {
  if (!isRecord(value)) return null;
  const { sourceDomain, sourceKind, sourceRef, sourceVersion, observedAt } = value;
  if (typeof sourceDomain !== 'string' || !(CONTEXT_SOURCE_DOMAINS_V1 as readonly string[]).includes(sourceDomain)) return null;
  if (typeof sourceKind !== 'string' || !(CONTEXT_RECORD_SOURCE_KINDS_V1_1 as readonly string[]).includes(sourceKind)) return null;
  if (typeof sourceRef !== 'string' || !SOURCE_REF.test(sourceRef)) return null;
  if (typeof sourceVersion !== 'string' || sourceVersion.length === 0 || sourceVersion.length > 64) return null;
  if (typeof observedAt !== 'string' || !ISO.test(observedAt) || !Number.isFinite(Date.parse(observedAt))) return null;
  return {
    sourceDomain: sourceDomain as ContextSourceDomainV1,
    sourceKind: sourceKind as ContextRecordSourceKindV1_1,
    sourceRef,
    sourceVersion,
    observedAt,
  };
}
/**
 * MCP 服务用：解码 data。顶层不对（没有 `projectionId` / `disclosureReceiptId`，records 不是数组）返回 null；
 * 单条没有合格的 `provenance`、类别不是 D4 能申请的三类之一、`agent_memory` 的 `text` 不是 1–8000 字的字符串或
 * 来源类型不是记忆的，这一条丢掉（MCP 客户端不显示没有来源的记忆）。`dropped` 是丢掉的条数。
 */
export function decodeContextProjectionDataV1_1(value: unknown): { data: ContextProjectionDataV1_1; dropped: number } | null {
  if (!isRecord(value)) return null;
  const { projectionId, disclosureReceiptId, records } = value;
  if (typeof projectionId !== 'string' || projectionId.length === 0 || projectionId.length > 200) return null;
  if (typeof disclosureReceiptId !== 'string' || disclosureReceiptId.length === 0 || disclosureReceiptId.length > 200) return null;
  if (!Array.isArray(records)) return null;
  // D4 only ever shows the categories it may ask for; anything else (a default-deny category included) is dropped.
  const known = new Set<string>(DESKTOP_MEMORY_ALLOWED_CATEGORIES_V1 as readonly string[]);
  const out: ContextProjectionRecordV1_1[] = [];
  let dropped = 0;
  for (const record of records) {
    const provenance = isRecord(record) ? decodeProvenance(record.provenance) : null;
    const category = isRecord(record) ? record.category : undefined;
    const fields = isRecord(record) && isRecord(record.fields) ? record.fields : null;
    const memoryText = fields?.text;
    const ok =
      provenance !== null &&
      typeof category === 'string' &&
      known.has(category) &&
      fields !== null &&
      (category !== CONTEXT_MEMORY_CATEGORY_V1_1 ||
        (typeof memoryText === 'string' && memoryText.length > 0 && memoryText.length <= CONTEXT_MEMORY_TEXT_MAX_CHARS &&
          (CONTEXT_MEMORY_SOURCE_KINDS_V1_1 as readonly string[]).includes(provenance.sourceKind)));
    if (!ok) {
      dropped += 1;
      continue;
    }
    out.push({ category: category as ContextDataCategoryV1_1, fields: { ...(fields as Record<string, unknown>) }, provenance: provenance as ContextRecordProvenanceV1_1 });
  }
  return { data: { projectionId, disclosureReceiptId, records: out }, dropped };
}

// ── 4. 提议写回（`agentrix_propose_memory`） ─────────────────────────────────────────
/*
 * 走现有的 `POST ingest-candidates`（`classification: untrusted_candidate`、`canonical: false`、`invocable: false`）。
 * v1 的候选只有 `sourceRef` / `sourceDigest`，没有正文。v1.1 加一个可选的 `proposedText`：
 * - 1–2000 字，服务端当不可信内容存（和候选同一条记录，加密存放方式实现时定），不进任何模型上下文，不进正本；
 * - 主人在手机或网页上看到这段话、确认以后，才由记忆的写入路径（`append_fact_memory`）写成正式记忆，
 *   这时 `sourceKind` 是 `owner_written`（主人确认过的），不是 `imported_chat`；
 * - `sourceKind` = `desktop_mcp:<clientId>`，`proposedCanonicalDomain` = `memory`。
 * - 每张凭据每小时最多 `CONTEXT_MEMORY_PROPOSALS_PER_HOUR` 条。
 */
export const CONTEXT_MEMORY_PROPOSAL_TEXT_MAX_CHARS = 2000;
export const CONTEXT_MEMORY_PROPOSALS_PER_HOUR = 20;
export function desktopMemoryProposalSourceKindV1(clientId: DesktopMemoryClientIdV1): string {
  return `desktop_mcp:${clientId}`;
}
/** 提议正文：去掉首尾空白以后 1–2000 字；不合格返回 null（本机直接拒绝，不发请求）。 */
export function normalizeDesktopMemoryProposalTextV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= CONTEXT_MEMORY_PROPOSAL_TEXT_MAX_CHARS ? text : null;
}
