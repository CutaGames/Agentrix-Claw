/**
 * Connector Beta 跨端合同 V1 —— Connector / OAuth / Context Gateway Owner 冻结。
 *
 * Spec: `.kiro/specs/soul-core-connectors-context-gateway/`（CB-R1）
 * 上游语义: `docs/agentrix-soul-core-connectors-contracts-2026-08-08.zh-CN.md`
 *
 * 三条不可破坏的合同纪律：
 *   1. 本文件 **不得** 出现 access token、refresh token、client secret、code verifier、
 *      state 原文或任何可解密材料。credential 只以 `credentialRef` 表示。
 *   2. 所有资源同时绑定 owner + tenant + environment + audience + provider；
 *      请求体中的 owner/tenant 只是断言，服务端必须以认证上下文校验。
 *   3. 未知 `schemaVersion` fail closed，不降级解析。
 *
 * 状态诚实性（INV-02/03/04/05）：install ≠ 授权有效；local uninstall ≠ provider revoke；
 * token 删除 ≠ source 数据已删；provider revoke accepted ≠ propagation complete。
 * 因此 revoke 结果是 per-target 状态，**没有** 单一布尔 `ok`。
 */

export const CONNECTOR_CONNECTION_SCHEMA_VERSION = 1 as const;

/** 域分隔前缀，避免 digest 被跨域复用。 */
export const CONNECTOR_CONNECTION_DOMAIN = 'agentrix.connector.connection.v1' as const;

// ────────────────────────────── 环境 / 受众 ──────────────────────────────

/** 与 `canonical-tenant-authority.ts` 的环境枚举一致，不建第二套口径。 */
export const CONNECTOR_ENVIRONMENTS_V1 = ['local', 'test', 'staging', 'production'] as const;
export type ConnectorEnvironmentV1 = (typeof CONNECTOR_ENVIRONMENTS_V1)[number];

/** Connector Beta surface 的固定 audience。state 与 connection 只对该 audience 有效。 */
export const CONNECTOR_BETA_AUDIENCE_V1 = 'agentrix.connector.beta.v1' as const;

// ────────────────────────────── Provider ──────────────────────────────

/** Beta 范围内的 provider —— 只有一个。扩展需重走威胁模型 + ToS review + 新 Gate。 */
export const CONNECTOR_BETA_PROVIDERS_V1 = ['google'] as const;
export type ConnectorBetaProviderV1 = (typeof CONNECTOR_BETA_PROVIDERS_V1)[number];

/** Beta 范围内的 connector 实例类型 —— 只有一个，read-only 日历。 */
export const CONNECTOR_BETA_CONNECTOR_IDS_V1 = ['google-calendar'] as const;
export type ConnectorBetaConnectorIdV1 = (typeof CONNECTOR_BETA_CONNECTOR_IDS_V1)[number];

// ────────────────────────────── Scope ──────────────────────────────

/** read/capture/project/action 分离、默认 deny。Beta 只开 `read`。 */
export const CONNECTOR_SCOPE_MODES_V1 = ['read', 'capture', 'project', 'action'] as const;
export type ConnectorScopeModeV1 = (typeof CONNECTOR_SCOPE_MODES_V1)[number];

/** 数据类别，供 scope preview 与后续 Context Gateway category policy 使用。 */
export const CONNECTOR_DATA_CATEGORIES_V1 = [
  'calendar_event_metadata',
  'calendar_event_title',
] as const;
export type ConnectorDataCategoryV1 = (typeof CONNECTOR_DATA_CATEGORIES_V1)[number];

/**
 * ConnectorScopeV1 —— 一个 connection 的权限事实。
 *
 * `requested` 与 `granted` 必须分开：provider 可能只授予子集，合并会让 UI 显示
 * 用户从未同意过的权限（CB-R10.4）。
 */
export interface ConnectorScopeV1 {
  schemaVersion: typeof CONNECTOR_CONNECTION_SCHEMA_VERSION;
  /** 开启的能力方向。Beta 恒为 `['read']`。 */
  modes: ConnectorScopeModeV1[];
  /** 是否只读。Beta 恒为 true；write-back 必须走 Authority（INV-10）。 */
  readOnly: true;
  /** 我们请求的 provider scope 集合。 */
  requested: string[];
  /** provider 实际授予的 scope 集合，可能是 `requested` 的子集。 */
  granted: string[];
  dataCategories: ConnectorDataCategoryV1[];
  /** consent 生效时的 policy 版本。增加类别/scope 必须重新 consent。 */
  consentPolicyVersion: string;
  consentedAt: string;
}

// ────────────────────────────── Health ──────────────────────────────

/**
 * Health 状态是 **观测结果**，不是承诺。
 *
 * `unknown` 与 `unavailable` 必须与 `healthy` 严格区分：provider outage 不得被渲染成
 * 「已连接且正常」，也不得被渲染成「已撤销」（CB-R9.4）。
 */
export const CONNECTOR_HEALTH_STATES_V1 = [
  /** 有有效 access token，且未临期。 */
  'healthy',
  /** access token 临期但有可用 refresh token。 */
  'expiring',
  /** provider 明确拒绝（invalid_grant）或 scope 漂移，需用户重新授权。 */
  'reauthorization_required',
  /** provider outage / 超时 / 无法判定。保持 unknown，进入 reconciliation。 */
  'unknown',
  /** 本地前置条件不满足（flag 关闭、tenant authority unavailable、密钥缺失）。 */
  'unavailable',
  /** 撤销流程已开始但未确认传播完成。 */
  'revoke_pending',
  /** credential revoke 已 applied。 */
  'revoked',
] as const;
export type ConnectorHealthStateV1 = (typeof CONNECTOR_HEALTH_STATES_V1)[number];

/** Health 判定原因，封闭集合，不插值来源数据。 */
export const CONNECTOR_HEALTH_REASONS_V1 = [
  'token_valid',
  'token_expiring',
  'refresh_rejected',
  'scope_drift',
  'provider_unavailable',
  'beta_disabled',
  'tenant_authorization_unavailable',
  'revoke_in_progress',
  'credential_revoked',
  'never_verified',
] as const;
export type ConnectorHealthReasonV1 = (typeof CONNECTOR_HEALTH_REASONS_V1)[number];

/**
 * ConnectorHealthV1
 *
 * `checkedAt` 是 **判定时刻**，`sourceFetchedAt` 是 **数据取得时刻**。两者不得合并，
 * 也不得用 Web 请求时间冒充（CB-R11.2 / Wave 8B MSF-01 第 4 条）。
 */
export interface ConnectorHealthV1 {
  schemaVersion: typeof CONNECTOR_CONNECTION_SCHEMA_VERSION;
  state: ConnectorHealthStateV1;
  reason: ConnectorHealthReasonV1;
  /** health 判定时刻。null = 从未验证过（不是「正常」）。 */
  checkedAt: string | null;
  /** 最近一次真实从 provider 取得数据的时刻。 */
  sourceFetchedAt: string | null;
  /** access token 过期时刻，仅 metadata，不含 token 本身。 */
  accessTokenExpiresAt: string | null;
  /** 是否存在可用 refresh token。布尔值，不暴露 token。 */
  hasRefreshCredential: boolean;
}

// ────────────────────────────── Connection ──────────────────────────────

/**
 * Connection 生命周期状态。
 *
 * `active` 只表示「本地持有未撤销的 credential」，**不** 表示 provider 侧一定仍然有效
 * （INV-02）。provider 侧有效性由 `health` 表达。
 */
export const CONNECTOR_CONNECTION_STATUSES_V1 = [
  'active',
  'reauthorization_required',
  'revoke_pending',
  'revoked',
  /** 本地已停用，但未声称 provider 凭据失效（INV-03）。 */
  'locally_uninstalled',
] as const;
export type ConnectorConnectionStatusV1 =
  (typeof CONNECTOR_CONNECTION_STATUSES_V1)[number];

/**
 * Agent 绑定（D1 / W4 方案 b）。
 *
 * **Beta V1 是 agent-scoped 的，这是产品约束，不是临时 workaround。**
 * 每个 connection 必须绑定一个真实 Agent。理由不是实现方便，而是 canonical tenant
 * authority 的授权事实就以 (agentId, agentAccountId, ownerUserId, environment) 为单位；
 * 让 connection 与授权事实同粒度，tenant 才是被 **验证** 的而不是被断言的。
 *
 * user-scoped Connector 留作后续独立 Gate，**不** 通过扩展 canonical tenant authority 实现。
 */
export interface ConnectorAgentBindingV1 {
  /** 公开 Agent 标识，对应 `agent_accounts.agent_unique_id`。 */
  agentId: string;
  /** Canonical `agent_accounts.id`。 */
  agentAccountId: string;
}

/**
 * 禁止作为 Agent 标识的占位值（D1.2）。
 *
 * 第一版曾用 `google:<stateId>` 之类的派生值填补缺失标识。任何这类回退都会让「已绑定
 * Agent」变成一句无法核验的话，因此在合同层就把它们列为非法。
 */
export const CONNECTOR_FORBIDDEN_AGENT_REFS_V1 = [
  '00000000-0000-0000-0000-000000000000',
  'undefined',
  'null',
  'placeholder',
  'unknown',
  'none',
  'n/a',
  'test',
  'agent',
] as const;

/**
 * 判定一个 Agent 标识是否可用。
 *
 * 拒绝空值、占位值、以 `placeholder`/`fixture`/`stub`/`state`/`google:` 起头的派生值。
 * 宁可误拒也不接受一个无法核验的标识。
 */
export function isUsableConnectorAgentRefV1(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  const lowered = trimmed.toLowerCase();
  if ((CONNECTOR_FORBIDDEN_AGENT_REFS_V1 as readonly string[]).includes(lowered)) {
    return false;
  }
  return !/^(placeholder|fixture|stub|state|google:|connector:)/.test(lowered);
}

/** Canonical `agent_accounts.id` 必须是非零 UUID，不能用公开 agentId 顶替。 */
export function isUsableConnectorAgentAccountIdV1(value: unknown): value is string {
  if (typeof value !== 'string' || !isUsableConnectorAgentRefV1(value)) return false;
  const trimmed = value.trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    ) && trimmed.toLowerCase() !== '00000000-0000-0000-0000-000000000000'
  );
}

/**
 * ConnectorConnectionV1 —— 对外暴露的 connection 事实（masked）。
 *
 * `credentialRef` 是不可解密的本地引用；调用方拿到它也无法取得 token。
 */
export interface ConnectorConnectionV1 extends ConnectorAgentBindingV1 {
  schemaVersion: typeof CONNECTOR_CONNECTION_SCHEMA_VERSION;
  connectionId: string;
  ownerRef: string;
  tenantRef: string;
  environment: ConnectorEnvironmentV1;
  audience: typeof CONNECTOR_BETA_AUDIENCE_V1;
  provider: ConnectorBetaProviderV1;
  connectorId: ConnectorBetaConnectorIdV1;
  /** provider 侧账号的稳定引用（如 `sub`），非 email。 */
  providerAccountRef: string;
  /** 供 UI 辨识的 masked 片段，例如 `a***@e***.com`。可为 null。 */
  providerAccountHint: string | null;
  connectionStatus: ConnectorConnectionStatusV1;
  scope: ConnectorScopeV1;
  health: ConnectorHealthV1;
  /** 不可解密的 credential 引用。合同中 **不** 出现任何 token 材料。 */
  credentialRef: string;
  /** 单调递增；source revoke 后递增，使下游 projection/cache 失效。 */
  revocationEpoch: number;
  /**
   * Separate write consent (G-09). Absent or `present: false` means the
   * connection is still read-only. Never flips `scope.readOnly`.
   */
  writeConsent?: {
    present: boolean;
    granted: string[];
    consentedAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────────── Revoke ──────────────────────────────

/**
 * 五个 **独立** 撤销 target（CB-R12.1）。
 *
 * 把它们塌缩成一个动作是当前实现最严重的诚信缺陷：旧 `revoke()` 在 provider 撤销失败后
 * 仍删除本地记录并返回 `{ ok: true }`。本合同用 per-target 状态使该表达不可能出现。
 */
export const CONNECTOR_REVOKE_TARGETS_V1 = [
  /** 停止本地使用。不声称 provider 凭据失效。 */
  'local_uninstall',
  /** 调用 provider revoke 端点使凭据失效。 */
  'credential_revoke',
  /** 断开来源侧持续访问关系（read-only Beta 通常 not_applicable）。 */
  'source_disconnect',
  /** 清理本地保留数据（staging/readout cache）。不等于来源侧删除（INV-04）。 */
  'retention_cleanup',
  /** 通知下游消费者（projection/cache/session）失效。 */
  'downstream_propagation',
] as const;
export type ConnectorRevokeTargetV1 = (typeof CONNECTOR_REVOKE_TARGETS_V1)[number];

/**
 * Per-target 状态。
 *
 * `pending` / `unknown` / `failed` **不得** 被 UI 渲染为完成（CB-R13）。
 * `not_applicable` 表示该 target 在当前 provider/能力下不存在，也不是成功。
 */
export const CONNECTOR_REVOKE_STATUSES_V1 = [
  'pending',
  'applied',
  'failed',
  'unknown',
  'not_applicable',
] as const;
export type ConnectorRevokeStatusV1 = (typeof CONNECTOR_REVOKE_STATUSES_V1)[number];

/** target 结果的细化原因，封闭集合。 */
export const CONNECTOR_REVOKE_DETAIL_CODES_V1 = [
  'local_state_disabled',
  'provider_accepted',
  'provider_token_already_invalid',
  'provider_rejected',
  'provider_unavailable',
  'provider_no_revoke_endpoint',
  'blocked_by_credential_revoke',
  'no_downstream_consumer',
  'awaiting_retry',
  'retention_policy_executed',
] as const;
export type ConnectorRevokeDetailCodeV1 =
  (typeof CONNECTOR_REVOKE_DETAIL_CODES_V1)[number];

/** 发起撤销的原因，封闭集合。 */
export const CONNECTOR_REVOKE_REASONS_V1 = [
  'user_requested',
  'security_incident',
  'policy_expiry',
  'scope_drift',
  'operator_requested',
] as const;
export type ConnectorRevokeReasonV1 = (typeof CONNECTOR_REVOKE_REASONS_V1)[number];

export interface ConnectorRevokeTargetResultV1 {
  target: ConnectorRevokeTargetV1;
  status: ConnectorRevokeStatusV1;
  detailCode: ConnectorRevokeDetailCodeV1;
  /** 该 target 状态的观测时刻。 */
  checkedAt: string;
}

/** append-only 传播历史的一条记录。 */
export interface ConnectorRevokePropagationEntryV1 {
  epoch: number;
  target: ConnectorRevokeTargetV1;
  status: ConnectorRevokeStatusV1;
  detailCode: ConnectorRevokeDetailCodeV1;
  recordedAt: string;
}

/**
 * ConnectorRevokeReceiptV1 —— durable、append-only 的撤销收据。
 *
 * 没有 `ok` 字段，这是有意的：调用方必须逐 target 判断。
 * 不含 token / secret / code verifier / source 正文（CB-R14.3）。
 */
export interface ConnectorRevokeReceiptV1 extends ConnectorAgentBindingV1 {
  schemaVersion: typeof CONNECTOR_CONNECTION_SCHEMA_VERSION;
  receiptId: string;
  revocationId: string;
  connectionId: string;
  ownerRef: string;
  tenantRef: string;
  environment: ConnectorEnvironmentV1;
  /** 发起者的 masked 引用。 */
  actorRef: string;
  reasonCode: ConnectorRevokeReasonV1;
  /** 单调递增；每次状态推进 +1。 */
  epoch: number;
  requestedAt: string;
  /** 当前每个 target 的最新状态。 */
  targets: ConnectorRevokeTargetResultV1[];
  /** append-only 历史，不改写既有条目。 */
  propagationLog: ConnectorRevokePropagationEntryV1[];
  retentionPolicyRef: string;
  /** 规范化内容的 sha256，用于完整性校验。 */
  receiptDigest: string;
}

// ────────────────────────────── Error ──────────────────────────────

/** 错误类别，沿用 contracts §10.2。 */
export const CONNECTOR_ERROR_CATEGORIES_V1 = [
  'auth',
  'policy',
  'validation',
  'conflict',
  'source',
  'rate',
  'internal',
] as const;
export type ConnectorErrorCategoryV1 = (typeof CONNECTOR_ERROR_CATEGORIES_V1)[number];

/**
 * Connector Beta 的封闭错误码集合（design §7）。
 *
 * 关键取舍：`STATE_NOT_FOUND` / `STATE_EXPIRED` / `STATE_ALREADY_CONSUMED` 对外都映射到
 * 同一个 HTTP 状态与同一句 message，避免把 state 生命周期变成可枚举的探测面；
 * 具体 code 只进服务端审计。
 */
export const CONNECTOR_ERROR_CODES_V1 = [
  'CONNECTOR_BETA_DISABLED',
  'PROVIDER_NOT_IN_BETA',
  'PROVIDER_CREDENTIALS_UNAVAILABLE',
  'TENANT_AUTHORIZATION_UNAVAILABLE',
  'TENANT_AUTHORIZATION_DENIED',
  // D1：缺 Agent 标识或标识不可用（占位/派生值）。
  'AGENT_BINDING_REQUIRED',
  // D1：Agent pair 不一致、Agent 不属于 caller、或授权事实冲突。
  'AGENT_BINDING_INVALID',
  // D3：无法取得 provider 侧稳定 subject，connection 不得进入 terminal active。
  'PROVIDER_SUBJECT_UNAVAILABLE',
  // D3：redirect URI 不在 allowlist 内。
  'REDIRECT_URI_NOT_ALLOWLISTED',
  'STATE_NOT_FOUND',
  'STATE_EXPIRED',
  'STATE_ALREADY_CONSUMED',
  'REDIRECT_URI_MISMATCH',
  'ENVIRONMENT_MISMATCH',
  'AUDIENCE_MISMATCH',
  'OBJECT_NOT_ACCESSIBLE',
  'AUTHORIZATION_DENIED',
  'TOKEN_EXCHANGE_FAILED',
  'TOKEN_PERSIST_UNKNOWN',
  'SCOPE_INSUFFICIENT',
  'REAUTHORIZATION_REQUIRED',
  'SECRET_STORE_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
] as const;
export type ConnectorErrorCodeV1 = (typeof CONNECTOR_ERROR_CODES_V1)[number];

export interface ConnectorErrorV1 {
  schemaVersion: typeof CONNECTOR_CONNECTION_SCHEMA_VERSION;
  code: ConnectorErrorCodeV1;
  category: ConnectorErrorCategoryV1;
  /** 固定文案，不插值任何来源数据或对象存在性信息。 */
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  correlationId: string;
}

// ────────────────────────────── Readout ──────────────────────────────

/** readout 数据来源。`unavailable` 不得被渲染成「今天没有日程」（CB-R11.3）。 */
export const CONNECTOR_READOUT_SOURCES_V1 = ['provider', 'cache', 'unavailable'] as const;
export type ConnectorReadoutSourceV1 = (typeof CONNECTOR_READOUT_SOURCES_V1)[number];

/**
 * ConnectorReadoutV1 —— read-only source readout。
 *
 * `count` 可为 null：`source='unavailable'` 时必须是 null，**不是 0**。
 * `fetchedAt` 是数据实际取得时刻，不是响应序列化时刻。
 */
export interface ConnectorReadoutV1 {
  schemaVersion: typeof CONNECTOR_CONNECTION_SCHEMA_VERSION;
  connectionId: string;
  kind: 'calendar';
  source: ConnectorReadoutSourceV1;
  fetchedAt: string | null;
  count: number | null;
  /** 是否写入了 canonical state。Beta 恒为 false（INV-09）。 */
  canonicalWritesPerformed: false;
}

// ────────────────────────────── Digest / Validation ──────────────────────────────

/**
 * 规范化 receipt 内容为 digest 输入。
 *
 * 只纳入决定语义的字段，且顺序固定，使同一语义在不同进程/时区产出相同 digest。
 * `propagationLog` 不纳入：它是历史，会随时间增长；digest 描述的是当前 target 事实。
 */
export function canonicalizeConnectorRevokeReceiptV1(
  receipt: Omit<ConnectorRevokeReceiptV1, 'receiptDigest'>,
): string {
  const targets = [...receipt.targets]
    .sort((a, b) => a.target.localeCompare(b.target))
    .map((t) => `${t.target}=${t.status}:${t.detailCode}`)
    .join(',');
  return [
    CONNECTOR_CONNECTION_DOMAIN,
    `v${receipt.schemaVersion}`,
    receipt.receiptId,
    receipt.revocationId,
    receipt.connectionId,
    receipt.ownerRef,
    receipt.tenantRef,
    // Agent 绑定纳入 digest：收据必须能证明它撤销的是哪个 Agent 的 connection。
    receipt.agentId,
    receipt.agentAccountId,
    receipt.environment,
    receipt.reasonCode,
    `epoch=${receipt.epoch}`,
    receipt.requestedAt,
    receipt.retentionPolicyRef,
    targets,
  ].join('|');
}

export interface ConnectorValidationResultV1 {
  valid: boolean;
  errors: string[];
}

/**
 * 未知 schemaVersion fail closed（CB-R1.4）。
 *
 * 这里刻意不做「大版本兼容读取」：合同变更涉及授权语义，静默降级解析会让旧客户端把
 * 新语义误读成旧语义。
 */
export function isSupportedConnectorSchemaVersion(value: unknown): boolean {
  return value === CONNECTOR_CONNECTION_SCHEMA_VERSION;
}

/**
 * 禁止出现在合同实例中的字段名（防止实现方顺手把 secret 塞进 DTO）。
 *
 * 名单只收 **无歧义** 的 secret 字段名。刻意 **不** 收裸 `state` 与裸 `code`：
 * `ConnectorHealthV1.state` 与 `ConnectorErrorV1.code` 是本合同的合法字段，
 * 把它们列为禁用会让守卫在自己的 canonical 形状上误报，从而被迫加例外、最终失效。
 * OAuth 的 state / authorization code 用带前缀的名字覆盖。
 */
export const CONNECTOR_FORBIDDEN_CONTRACT_FIELDS_V1 = [
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'idToken',
  'id_token',
  'clientSecret',
  'client_secret',
  'codeVerifier',
  'code_verifier',
  'codeChallenge',
  'authorizationCode',
  'authorization_code',
  'oauthState',
  'stateToken',
  'stateTokenHash',
  'accessTokenEnc',
  'refreshTokenEnc',
  'codeVerifierEnc',
  'credentials',
  'apiKey',
  'api_key',
] as const;

/**
 * 断言一个待返回的合同对象没有携带 secret 字段（CB-R1.2）。
 * 这是运行时护栏，不替代 code review：类型系统挡不住 `as any` 与动态拼装。
 */
export function assertNoSecretFieldsV1(value: unknown): ConnectorValidationResultV1 {
  const errors: string[] = [];
  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if ((CONNECTOR_FORBIDDEN_CONTRACT_FIELDS_V1 as readonly string[]).includes(key)) {
        errors.push(`forbidden secret-bearing field at ${path}.${key}`);
      }
      walk(child, `${path}.${key}`, depth + 1);
    }
  };
  walk(value, '$', 0);
  return { valid: errors.length === 0, errors };
}

/** 校验 connection 的 object binding 是否完整（CB-R2.1）。 */
export function validateConnectorConnectionV1(
  value: ConnectorConnectionV1,
): ConnectorValidationResultV1 {
  const errors: string[] = [];
  if (!isSupportedConnectorSchemaVersion(value?.schemaVersion)) {
    errors.push('unsupported schemaVersion');
    return { valid: false, errors };
  }
  const required: Array<keyof ConnectorConnectionV1> = [
    'connectionId',
    'ownerRef',
    'tenantRef',
    'environment',
    'audience',
    'provider',
    'connectorId',
    'providerAccountRef',
    'connectionStatus',
    'credentialRef',
    // Agent 绑定是 Beta V1 的强制字段（D1）。
    'agentId',
    'agentAccountId',
  ];
  for (const field of required) {
    const v = value[field];
    if (typeof v !== 'string' || v.trim().length === 0) {
      errors.push(`missing binding field: ${String(field)}`);
    }
  }
  // 占位/派生 Agent 标识一律非法，即使非空。
  if (!isUsableConnectorAgentRefV1(value?.agentId)) {
    errors.push('agentId is not a usable agent reference');
  }
  if (!isUsableConnectorAgentRefV1(value?.agentAccountId)) {
    errors.push('agentAccountId is not a usable agent reference');
  }
  // provider 侧 subject 也不得是我们自己派生的占位值（D3）。
  if (
    typeof value?.providerAccountRef === 'string' &&
    /^(google:|placeholder|state)/i.test(value.providerAccountRef.trim())
  ) {
    errors.push('providerAccountRef must be a provider-issued stable subject');
  }
  if (!(CONNECTOR_ENVIRONMENTS_V1 as readonly string[]).includes(value?.environment)) {
    errors.push('unknown environment');
  }
  if (value?.audience !== CONNECTOR_BETA_AUDIENCE_V1) {
    errors.push('audience mismatch');
  }
  if (!(CONNECTOR_BETA_PROVIDERS_V1 as readonly string[]).includes(value?.provider)) {
    errors.push('provider not in beta');
  }
  if (value?.scope?.readOnly !== true) {
    errors.push('beta connection must be read-only');
  }
  if (!Number.isInteger(value?.revocationEpoch) || value.revocationEpoch < 0) {
    errors.push('revocationEpoch must be a non-negative integer');
  }
  const secretCheck = assertNoSecretFieldsV1(value);
  if (!secretCheck.valid) errors.push(...secretCheck.errors);
  return { valid: errors.length === 0, errors };
}

/**
 * 判定 receipt 是否可被 UI 表述为「已撤销」（CB-R13.6）。
 *
 * 唯一允许的条件：`credential_revoke = applied`，且所有 applicable target 都不再 pending/
 * unknown/failed。任何其他组合一律不是「已撤销」。
 */
export function isConnectorRevocationCompleteV1(receipt: ConnectorRevokeReceiptV1): boolean {
  if (!isSupportedConnectorSchemaVersion(receipt?.schemaVersion)) return false;
  const credential = receipt.targets.find((t) => t.target === 'credential_revoke');
  if (!credential || credential.status !== 'applied') return false;
  return receipt.targets.every(
    (t) => t.status === 'applied' || t.status === 'not_applicable',
  );
}
