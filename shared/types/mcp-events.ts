/**
 * MCP Events v1（L8 第 2 批 C4，coord 10-19）。
 *
 * 出站：Pass 撤销、删号申请、预约变化，推给主人登记过的外部 MCP 客户端（订阅）。一条事件只含 id 和状态，
 * 不含任何正文、姓名、联系方式；只推给事件所属主人自己的订阅。推送用 HTTPS POST，带签名；出网经过 SSRF 守卫；
 * 主人开着锁定（A4）时不推（读不出锁定状态按锁定算）。
 *
 * 入站：外部 MCP 事件触发主人**已有**的一个自动化跑一次（`agent-automation`）。放行要同时满足：
 * - 白名单：主人建一条规则，写明哪个外部来源（护照核实过的 Agent，`agent:<id>`）的哪几种事件可以触发哪个自动化；
 * - 签名：规则自己的签名密钥（只在建规则时给主人看一次），时间戳在 5 分钟内，同一个事件 id 只认一次；
 * - Pass（A5）：这个来源在主人的 Agent 上持有有效的 Pass（类别 `collab_ask`、目的 `collaboration_request`），每次触发用一次，
 *   写一条 `pass_use` 回执；撤销 Pass 马上让它失效。
 * 事件的内容**不会**交给模型：外部来的字不可信，入站事件只决定「跑不跑」这件事，不能改自动化的指令、工具或预算。
 * 自动化自己的每天运行次数上限、工具白名单、预算照旧管着；每条规则每小时最多 20 次。
 *
 * 签名：`X-Agentrix-Signature: t=<unix 秒>,v1=<hex>`，`v1 = HMAC-SHA256(key, "<t>.<原始请求体>")`。key 由服务端从自己的密钥
 * 按订阅 / 规则编号派生，不落库；创建时回给主人一次，丢了就删掉重建。
 *
 * 开关：`MCP_EVENTS_V1_ENABLED`，只认精确的 `'1'`，默认关。关着时所有路由 404，发布端口什么都不读。
 */

export const MCP_EVENTS_FLAG_V1 = 'MCP_EVENTS_V1_ENABLED';

export const MCP_EVENTS_ROUTES_V1 = {
  listSubscriptions: 'GET /api/mcp-events/subscriptions',
  createSubscription: 'POST /api/mcp-events/subscriptions',
  deleteSubscription: 'DELETE /api/mcp-events/subscriptions/:subRef',
  listRules: 'GET /api/mcp-events/inbound-rules',
  createRule: 'POST /api/mcp-events/inbound-rules',
  deleteRule: 'DELETE /api/mcp-events/inbound-rules/:ruleRef',
  inbound: 'POST /api/mcp-events/inbound/:ruleRef',
} as const;

export const MCP_EVENT_TYPES_V1 = ['pass.revoked', 'account.deletion_requested', 'booking.changed'] as const;
export type McpEventTypeV1 = (typeof MCP_EVENT_TYPES_V1)[number];

export const MCP_EVENTS_LIMITS_V1 = {
  subscriptionsPerOwner: 5,
  rulesPerOwner: 10,
  endpointUrlMax: 500,
  inboundBodyMaxBytes: 16 * 1024,
  inboundPerRulePerHour: 20,
  signatureToleranceSeconds: 300,
  /** 连续这么多次推不出去，订阅自动停用。 */
  disableAfterFailures: 10,
  inboundEventTypesMax: 10,
} as const;

export const MCP_EVENT_REF_PATTERNS_V1 = {
  subscription: /^mes_[0-9a-f]{32}$/,
  rule: /^mer_[0-9a-f]{32}$/,
  event: /^mev_[0-9a-f]{32}$/,
} as const;

export const MCP_EVENTS_ERROR_CODES_V1 = {
  notFound: 'MCP_EVENTS_NOT_FOUND',
  signInRequired: 'MCP_EVENTS_SIGN_IN_REQUIRED',
  invalid: 'MCP_EVENTS_INVALID',
  limitReached: 'MCP_EVENTS_LIMIT_REACHED',
  /** 入站一律用这一个码，不区分「没有这条规则」「签名不对」「Pass 不放行」。 */
  rejected: 'MCP_EVENT_REJECTED',
  rateLimited: 'MCP_EVENT_RATE_LIMITED',
} as const;

/** 事件的 data 只放 id 和状态。 */
export type McpEventDataV1 = Record<string, string | number | boolean>;

/** 出站信封。 */
export interface McpEventEnvelopeV1 {
  schemaVersion: 1;
  id: string;
  type: McpEventTypeV1;
  occurredAt: string;
  data: McpEventDataV1;
}

/** 来源服务交给发布端口的东西（没有 id，发布端口补）。 */
export interface McpEventDraftV1 {
  type: McpEventTypeV1;
  occurredAt: string;
  data: McpEventDataV1;
}

/** 签名头 `X-Agentrix-Signature` 的名字；签名和验签在后端（`modules/mcp-events/mcp-event-signature.ts`），合同这里不引 Node 内置模块。 */
export const MCP_EVENT_SIGNATURE_HEADER_V1 = 'X-Agentrix-Signature';

// ── 订阅和规则的视图、解码 ──────────────────────────────────────────────────────────────

export interface McpEventSubscriptionInputV1 {
  endpointUrl: string;
  eventTypes: McpEventTypeV1[];
}

export interface McpEventSubscriptionViewV1 {
  subRef: string;
  endpointUrl: string;
  eventTypes: McpEventTypeV1[];
  status: 'active' | 'disabled';
  failureCount: number;
  lastDeliveryAt: string | null;
  lastStatusCode: number | null;
  createdAt: string;
}

/** 建订阅的响应：签名密钥只在这里出现一次。 */
export interface McpEventSubscriptionCreatedV1 extends McpEventSubscriptionViewV1 {
  signingKey: string;
}

export const MCP_INBOUND_EVENT_TYPE_PATTERN_V1 = /^[a-z][a-z0-9_.:-]{1,63}$/;
export const MCP_INBOUND_EVENT_ID_PATTERN_V1 = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** Same shape as an A5 `external_agent` audience ref (`agent:<passport id>`). */
export const MCP_INBOUND_SOURCE_PATTERN_V1 = /^agent:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface McpInboundRuleInputV1 {
  /** 外部来源的 Pass 受众：`agent:<护照号>`，护照要先核实过。 */
  sourceAgentRef: string;
  eventTypes: string[];
  /** 主人已有的一个自动化。 */
  automationRef: string;
}

export interface McpInboundRuleViewV1 {
  ruleRef: string;
  sourceAgentRef: string;
  eventTypes: string[];
  automationRef: string;
  status: 'active';
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface McpInboundRuleCreatedV1 extends McpInboundRuleViewV1 {
  signingKey: string;
  /** 外部来源往这里 POST。 */
  inboundPath: string;
}

export type McpEventsDecodeResultV1<T> = { ok: true; value: T } | { ok: false; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeMcpEventSubscriptionInputV1(value: unknown): McpEventsDecodeResultV1<McpEventSubscriptionInputV1> {
  if (!isRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (key !== 'endpointUrl' && key !== 'eventTypes') return { ok: false, field: key };
  const url = value.endpointUrl;
  if (typeof url !== 'string' || url.length === 0 || url.length > MCP_EVENTS_LIMITS_V1.endpointUrlMax || !/^https:\/\/[^\s]+$/.test(url)) {
    return { ok: false, field: 'endpointUrl' };
  }
  const types = value.eventTypes;
  if (
    !Array.isArray(types) ||
    types.length === 0 ||
    types.length > MCP_EVENT_TYPES_V1.length ||
    !types.every((t) => (MCP_EVENT_TYPES_V1 as readonly unknown[]).includes(t)) ||
    new Set(types).size !== types.length
  ) {
    return { ok: false, field: 'eventTypes' };
  }
  return { ok: true, value: { endpointUrl: url, eventTypes: [...(types as McpEventTypeV1[])] } };
}

export function decodeMcpInboundRuleInputV1(value: unknown): McpEventsDecodeResultV1<McpInboundRuleInputV1> {
  if (!isRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (!['sourceAgentRef', 'eventTypes', 'automationRef'].includes(key)) return { ok: false, field: key };
  if (typeof value.sourceAgentRef !== 'string' || !MCP_INBOUND_SOURCE_PATTERN_V1.test(value.sourceAgentRef)) return { ok: false, field: 'sourceAgentRef' };
  const types = value.eventTypes;
  if (
    !Array.isArray(types) ||
    types.length === 0 ||
    types.length > MCP_EVENTS_LIMITS_V1.inboundEventTypesMax ||
    !types.every((t) => typeof t === 'string' && MCP_INBOUND_EVENT_TYPE_PATTERN_V1.test(t)) ||
    new Set(types).size !== types.length
  ) {
    return { ok: false, field: 'eventTypes' };
  }
  if (typeof value.automationRef !== 'string' || !/^aut_[0-9a-f]{32}$/.test(value.automationRef)) return { ok: false, field: 'automationRef' };
  return { ok: true, value: { sourceAgentRef: value.sourceAgentRef, eventTypes: [...(types as string[])], automationRef: value.automationRef } };
}

export interface McpInboundEventV1 {
  id: string;
  type: string;
  occurredAt: string;
}

/** 入站事件的信封：只认这三个字段，别的字段（包括任何「指令」）一律不读，也不往下传。 */
export function decodeMcpInboundEventV1(value: unknown): McpEventsDecodeResultV1<McpInboundEventV1> {
  if (!isRecord(value)) return { ok: false, field: '$' };
  if (typeof value.id !== 'string' || !MCP_INBOUND_EVENT_ID_PATTERN_V1.test(value.id)) return { ok: false, field: 'id' };
  if (typeof value.type !== 'string' || !MCP_INBOUND_EVENT_TYPE_PATTERN_V1.test(value.type)) return { ok: false, field: 'type' };
  const at = value.occurredAt;
  if (typeof at !== 'string' || at.length > 40 || !Number.isFinite(Date.parse(at))) return { ok: false, field: 'occurredAt' };
  return { ok: true, value: { id: value.id, type: value.type, occurredAt: new Date(at).toISOString() } };
}

/** 出站事件的 data：最多 8 个键，值是短字符串、数字或布尔，不放长文本。 */
export function isMcpEventDataV1(value: unknown): value is McpEventDataV1 {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 8 &&
    entries.every(
      ([key, v]) =>
        /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key) &&
        (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 200)),
    )
  );
}
