/**
 * 连接主人自己的应用 v0（Composio connect，10-05）。
 *
 * - 主人通过 Composio 连接自己的 Gmail、Google 日历、Notion、GitHub，能看到连接状态，也能断开。别的应用一律不收。
 * - 令牌留在 Composio；我们只记每个主人的连接编号和状态（表 `composio_connections`，迁移 2022）。Composio 的账号编号
 *   和发给 Composio 的用户编号都不出现在网页能读到的数据里。
 * - 发给 Composio 的 user_id 是每个主人固定、不透明的编号，从来不是邮箱或名字。
 * - 授权页是 Composio 托管的（同意页显示 "Composio"，额度共用）。Gmail 属于 Google 受限权限，正式上线要过 Google 审核
 *   和 CASA，所以 v0 只给开发和内测用户。
 * - 后端开关 `COMPOSIO_CONNECT_V0_ENABLED`（还要 `PROVIDER_ADAPTERS_V0_ENABLED`）默认关，关着时路由一律 404；
 *   网页开关 `NEXT_PUBLIC_COMPOSIO_CONNECT_ENABLED` 默认关，关着时什么都不显示。
 */

export const COMPOSIO_CONNECT_SCHEMA_VERSION_V0 = 0;

/** 能连接的应用（代码里的白名单）。 */
export const COMPOSIO_CONNECT_TOOLKITS_V0 = ['gmail', 'googlecalendar', 'notion', 'github'] as const;
export type ComposioToolkitV0 = (typeof COMPOSIO_CONNECT_TOOLKITS_V0)[number];

/**
 * - `pending`：已发起，等主人在 Composio 授权完回来。
 * - `active`：已连接（回调时向 Composio 核对过归属和状态）。
 * - `needs_reconnect`：刷新时 Composio 说已不可用，要重新连接。
 * - `failed`：这次没连上（取消、超时、归属不符等）。
 * - `revoked`：主人断开了。
 */
export const COMPOSIO_CONNECTION_STATUSES_V0 = ['pending', 'active', 'needs_reconnect', 'failed', 'revoked'] as const;
export type ComposioConnectionStatusV0 = (typeof COMPOSIO_CONNECTION_STATUSES_V0)[number];

export const COMPOSIO_CONNECT_ROUTES_V0 = {
  list: 'GET /api/composio-connect/connections',
  connect: 'POST /api/composio-connect/connections',
  refresh: 'POST /api/composio-connect/connections/:connectionRef/refresh',
  disconnect: 'DELETE /api/composio-connect/connections/:connectionRef',
  callback: 'GET /api/composio-connect/callback',
} as const;

export const COMPOSIO_CONNECT_REF_PATTERN_V0 = /^cxn_[0-9a-f]{32}$/;
/** 发起到回调之间的有效期（秒）。 */
export const COMPOSIO_CONNECT_STATE_TTL_SECONDS_V0 = 600;
/** 一个主人同时最多几个没完成的连接。 */
export const COMPOSIO_CONNECT_MAX_PENDING_V0 = 3;
/** 列表最多返回几条。 */
export const COMPOSIO_CONNECT_LIST_LIMIT_V0 = 20;

export const COMPOSIO_CONNECT_ERROR_CODES_V0 = {
  /** 404：开关关着，或者不是自己的连接。 */
  notFound: 'COMPOSIO_CONNECT_NOT_FOUND',
  /** 403：要主人本人登录（不认游客、不认客户端令牌）。 */
  signInRequired: 'COMPOSIO_CONNECT_SIGN_IN_REQUIRED',
  /** 400：请求体不对，带 `errors`。 */
  invalid: 'COMPOSIO_CONNECT_INVALID',
  /** 400：不在白名单里的应用。 */
  toolkitNotAllowed: 'COMPOSIO_CONNECT_TOOLKIT_NOT_ALLOWED',
  /** 503：服务端没配好，带 `reasonCode`（见 `COMPOSIO_CONNECT_NOT_CONFIGURED_REASONS_V0`）。 */
  notConfigured: 'COMPOSIO_CONNECT_NOT_CONFIGURED',
  /** 409：这个应用已经连着了。 */
  alreadyConnected: 'COMPOSIO_CONNECT_ALREADY_CONNECTED',
  /** 429：没完成的连接太多。 */
  busy: 'COMPOSIO_CONNECT_BUSY',
  /** 502：Composio 那边失败，带 `reasonCode`（只是原因代码，从不带 Composio 的原文）。 */
  provider: 'COMPOSIO_CONNECT_PROVIDER_FAILED',
} as const;

export const COMPOSIO_CONNECT_NOT_CONFIGURED_REASONS_V0 = ['api_key_missing', 'auth_config_missing', 'auth_config_invalid', 'callback_url_invalid'] as const;
export type ComposioConnectNotConfiguredReasonV0 = (typeof COMPOSIO_CONNECT_NOT_CONFIGURED_REASONS_V0)[number];

/** 回调结束后浏览器回到固定页面，只带这里的一个结果代码（不回显任何查询参数）。 */
export const COMPOSIO_CONNECT_CALLBACK_RESULTS_V0 = [
  'connected',
  'cancelled',
  'expired',
  'replayed',
  'invalid',
  'sign_in_required',
  'owner_mismatch',
  'account_mismatch',
  'not_active',
  'provider_failed',
  'already_connected',
] as const;
export type ComposioConnectCallbackResultV0 = (typeof COMPOSIO_CONNECT_CALLBACK_RESULTS_V0)[number];

export const COMPOSIO_CONNECT_RETURN_PATH_V0 = '/console/settings/privacy';
export const COMPOSIO_CONNECT_RETURN_PARAM_V0 = 'composioConnect';

/** 只跳去 Composio 自己的授权页（完全相同的主机名，不认后缀匹配）。 */
export const COMPOSIO_REDIRECT_HOSTS_V0 = ['connect.composio.dev', 'backend.composio.dev'] as const;
const REDIRECT_URL_MAX = 2048;

export interface ComposioConnectionViewV0 {
  /** 我们自己的连接编号（`cxn_…`），不是 Composio 的账号编号。 */
  connectionRef: string;
  toolkit: ComposioToolkitV0;
  status: ComposioConnectionStatusV0;
  createdAt: string;
  connectedAt: string | null;
  /** 最近一次向 Composio 核对状态的时间。 */
  statusCheckedAt: string | null;
}

export interface ComposioConnectionListV0 {
  schemaVersion: 0;
  /** 服务端是否配好了（key、各应用的授权配置、回调地址）。 */
  configured: boolean;
  /** 现在能发起连接的应用。 */
  available: ComposioToolkitV0[];
  items: ComposioConnectionViewV0[];
}

export interface ComposioConnectRequestV0 {
  toolkit: ComposioToolkitV0;
}

export interface ComposioConnectInitiateResultV0 {
  schemaVersion: 0;
  connectionRef: string;
  toolkit: ComposioToolkitV0;
  /** Composio 的授权页，网页直接跳过去。 */
  redirectUrl: string;
  /** 这次发起在什么时候之前要完成。 */
  expiresAt: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const TOOLKIT_MAX = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(value));
}

function isIsoOrNull(value: unknown): value is string | null {
  return value === null || isIso(value);
}

export function isComposioToolkitV0(value: unknown): value is ComposioToolkitV0 {
  return typeof value === 'string' && (COMPOSIO_CONNECT_TOOLKITS_V0 as readonly string[]).includes(value);
}

export function isComposioConnectionStatusV0(value: unknown): value is ComposioConnectionStatusV0 {
  return typeof value === 'string' && (COMPOSIO_CONNECTION_STATUSES_V0 as readonly string[]).includes(value);
}

/** 后端和网页都用：只认 https、主机名完全在名单里、没有用户名密码、没有自定义端口的地址。 */
export function isComposioRedirectUrlTrustedV0(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > REDIRECT_URL_MAX) return false;
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    (COMPOSIO_REDIRECT_HOSTS_V0 as readonly string[]).includes(url.hostname) &&
    url.username === '' &&
    url.password === '' &&
    url.port === ''
  );
}

/** 服务端用：发起连接的请求体。这里只查形状，白名单由服务端单独回答 `toolkitNotAllowed`。 */
export function validateComposioConnectRequestV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (key !== 'toolkit') errors.push(`${key}: unexpected field`);
  const toolkit = value.toolkit;
  if (typeof toolkit !== 'string' || toolkit.length === 0 || toolkit.length > TOOLKIT_MAX) errors.push(`toolkit: 1..${TOOLKIT_MAX} characters`);
  return { valid: errors.length === 0, errors };
}

export function decodeComposioConnectionViewV0(value: unknown): ComposioConnectionViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.connectionRef !== 'string' || !COMPOSIO_CONNECT_REF_PATTERN_V0.test(value.connectionRef)) return null;
  if (!isComposioToolkitV0(value.toolkit) || !isComposioConnectionStatusV0(value.status)) return null;
  if (!isIso(value.createdAt) || !isIsoOrNull(value.connectedAt) || !isIsoOrNull(value.statusCheckedAt)) return null;
  return {
    connectionRef: value.connectionRef,
    toolkit: value.toolkit,
    status: value.status,
    createdAt: value.createdAt,
    connectedAt: value.connectedAt as string | null,
    statusCheckedAt: value.statusCheckedAt as string | null,
  };
}

/** 有一条不对、或者 `available` 里有不认识或重复的应用，整个列表就当读不懂。 */
export function decodeComposioConnectionListV0(value: unknown): ComposioConnectionListV0 | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== COMPOSIO_CONNECT_SCHEMA_VERSION_V0 || typeof value.configured !== 'boolean') return null;
  if (!Array.isArray(value.available) || !Array.isArray(value.items) || value.items.length > COMPOSIO_CONNECT_LIST_LIMIT_V0) return null;
  const available: ComposioToolkitV0[] = [];
  for (const toolkit of value.available) {
    if (!isComposioToolkitV0(toolkit) || available.includes(toolkit)) return null;
    available.push(toolkit);
  }
  const items: ComposioConnectionViewV0[] = [];
  for (const item of value.items) {
    const decoded = decodeComposioConnectionViewV0(item);
    if (!decoded) return null;
    items.push(decoded);
  }
  return { schemaVersion: 0, configured: value.configured, available, items };
}

/** 跳转地址不是 Composio 自己的授权页，就当读不懂（网页不会跳）。 */
export function decodeComposioConnectInitiateResultV0(value: unknown): ComposioConnectInitiateResultV0 | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== COMPOSIO_CONNECT_SCHEMA_VERSION_V0) return null;
  if (typeof value.connectionRef !== 'string' || !COMPOSIO_CONNECT_REF_PATTERN_V0.test(value.connectionRef)) return null;
  if (!isComposioToolkitV0(value.toolkit) || !isComposioRedirectUrlTrustedV0(value.redirectUrl) || !isIso(value.expiresAt)) return null;
  return { schemaVersion: 0, connectionRef: value.connectionRef, toolkit: value.toolkit, redirectUrl: value.redirectUrl, expiresAt: value.expiresAt };
}

/** 回到固定页面时读结果代码：只认名单里一模一样的代码，其他一律 null。 */
export function decodeComposioConnectCallbackResultV0(value: unknown): ComposioConnectCallbackResultV0 | null {
  return typeof value === 'string' && (COMPOSIO_CONNECT_CALLBACK_RESULTS_V0 as readonly string[]).includes(value) ? (value as ComposioConnectCallbackResultV0) : null;
}
