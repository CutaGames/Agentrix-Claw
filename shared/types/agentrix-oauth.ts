/**
 * 草案 v0（L8 第 3 批第 0 步，coord 10-20）：线 N 实现时可加字段，不可改语义。
 *
 * E1「用 Yowo 登录」+ 远程 MCP：Agentrix 当授权服务器（OAuth 2.1 授权码 + PKCE，OIDC id_token，设备授权），
 * 第三方应用经它读主人的 Pass 范围内的数据。这份合同只定形状：scope 词表、token claims、错误码、元数据、同意页和
 * 「已连接的应用」要用的视图。授权服务器本身（`modules/agentrix-oauth/`）和远程 MCP（`/api/context-mcp`）在线 3A 里写。
 *
 * - scope 词表 = Pass 的「类别 × 目的」（`agent-pass.ts`）。线上写成 `<category>:<purpose>`，空格分隔；另有三个 OIDC
 *   身份 scope：`openid`、`profile`、`offline_access`。Pass 的受众另加一种 `oauth_client:<客户端摘要>`，由线 3A 在
 *   `agent-pass.ts` 里只加不改。
 * - access token 是 ES256 JWS（头 `typ: at+jwt`），只带 `pass_id`，不带数据；每次调用都要经 `AgentPassAuthorizerPortV1`
 *   用 `mode:'use'` 查一次，所以撤销 Pass 以后下一次调用就失败。签名一律走 `PlatformJwsSignerPortV1`，不自己造钥。
 * - 客户端有两种：①客户端元数据文档（CIMD）：`client_id` 是 https URL，文档必须和这个 URL 完全一致；②已登记的合作方
 *   （`partner_apps`）。不做动态注册。
 * - 授权请求只收 `response_type=code` 和 `code_challenge_method=S256`；`plain` 和没有 PKCE 都拒绝；`resource`（RFC 8707）
 *   必填，access token 的 `aud` 就是它。
 *
 * 开关：`AGENTRIX_OAUTH_V1_ENABLED`（授权服务器）、`CONTEXT_MCP_REMOTE_V1_ENABLED`（远程 MCP，要求前者和
 * `AGENT_PASS_V1_ENABLED` 都开着，否则当作关着）。都只认精确的 `'1'`，默认关。
 *
 * 解码函数拒收未知字段和错误类型，失败时给出 `reasonCode` 和出错的字段名，不抛异常。例外有两处，都是协议规定的：
 * 授权请求的参数（RFC 6749 3.1：不认识的参数一律忽略）和第三方的客户端元数据文档（只取白名单字段，其余丢掉）。
 * URL 用正则检查，不用 `URL` 类：这份文件三端共用，React Native 没有完整的 `URL`。
 */
import {
  AGENT_PASS_CATEGORIES_V1,
  AGENT_PASS_LIMITS_V1,
  AGENT_PASS_PURPOSES_V1,
  agentPassPreviewV1,
  type AgentPassCategoryV1,
  type AgentPassPurposeV1,
  type AgentPassScopeV1,
} from './agent-pass';
import { sha256Hex } from '../soul-core-l1/v1_1/canonical';

export const AGENTRIX_OAUTH_SCHEMA_VERSION_V1 = 1 as const;

export const AGENTRIX_OAUTH_FLAG_V1 = 'AGENTRIX_OAUTH_V1_ENABLED';
export const CONTEXT_MCP_REMOTE_FLAG_V1 = 'CONTEXT_MCP_REMOTE_V1_ENABLED';

export const AGENTRIX_OAUTH_RESPONSE_TYPES_V1 = ['code'] as const;
export const AGENTRIX_OAUTH_CODE_CHALLENGE_METHODS_V1 = ['S256'] as const;
export const AGENTRIX_OAUTH_GRANT_TYPES_V1 = ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'] as const;
export type AgentrixOauthGrantTypeV1 = (typeof AGENTRIX_OAUTH_GRANT_TYPES_V1)[number];
/** 公开客户端（CIMD）不带密钥；已登记的合作方可以用 Basic。 */
export const AGENTRIX_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS_V1 = ['none', 'client_secret_basic'] as const;

export const AGENTRIX_OAUTH_CLIENT_KINDS_V1 = ['metadata_document', 'partner_app'] as const;
export type AgentrixOauthClientKindV1 = (typeof AGENTRIX_OAUTH_CLIENT_KINDS_V1)[number];

/** OIDC 身份 scope。`offline_access` = 允许发 refresh token。 */
export const AGENTRIX_OAUTH_IDENTITY_SCOPES_V1 = ['openid', 'profile', 'offline_access'] as const;
export type AgentrixOauthIdentityScopeV1 = (typeof AGENTRIX_OAUTH_IDENTITY_SCOPES_V1)[number];

/** 头 `typ`：access token 用 `at+jwt`（RFC 9068），id_token 用默认的 `JWT`。普通 JWT 守卫要拒收前者。 */
export const AGENTRIX_OAUTH_TOKEN_TYP_V1 = { accessToken: 'at+jwt', idToken: 'JWT' } as const;

export const AGENTRIX_OAUTH_LIMITS_V1 = {
  /** 客户端元数据文档上限（字节），拉取时按它截断。 */
  clientMetadataDocumentMaxBytes: 5 * 1024,
  redirectUrisMax: 10,
  urlMax: 2048,
  scopesMax: AGENT_PASS_LIMITS_V1.scopesMax,
  stateMax: 512,
  nonceMax: 256,
  clientNameMax: 100,
  /** 授权码、设备码、一次性连接码的有效期（秒）。 */
  authorizationCodeTtlSecondsMax: 600,
  /** 设备码 5 分钟（评审 M1：设备流是公共客户端最容易被冒名的路径，窗口缩短）。 */
  deviceCodeTtlSeconds: 300,
  connectionCodeTtlSeconds: 600,
  accessTokenTtlSecondsMax: 3600,
  idTokenTtlSecondsMax: 3600,
} as const;

/** 线上的错误码（授权端点、令牌端点、受保护资源的 `WWW-Authenticate`）。 */
export const AGENTRIX_OAUTH_ERROR_CODES_V1 = [
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'unsupported_response_type',
  'invalid_scope',
  'invalid_target',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
  'authorization_pending',
  'slow_down',
  'expired_token',
  'invalid_token',
  'insufficient_scope',
] as const;
export type AgentrixOauthErrorCodeV1 = (typeof AGENTRIX_OAUTH_ERROR_CODES_V1)[number];

/** 解码失败的原因。通用的五个加上和 OAuth 错误码同名的几个；`agentrixOauthWireErrorV1` 把它们映射成线上的错误码。 */
export const AGENTRIX_OAUTH_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  'invalid_scope',
  'invalid_target',
  'unsupported_response_type',
  /** CIMD：文档里的 `client_id` 和拉取它的 URL 不完全一致。 */
  'client_id_mismatch',
  /** 同意页：放行的范围比申请的宽。 */
  'grant_wider_than_request',
  /** 没有注册实现：默认拒绝。 */
  'port_unavailable',
  /** `AGENTRIX_OAUTH_V1_ENABLED` 没开。 */
  'feature_disabled',
] as const;
export type AgentrixOauthReasonCodeV1 = (typeof AGENTRIX_OAUTH_REASON_CODES_V1)[number];

export type AgentrixOauthDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: AgentrixOauthReasonCodeV1; field: string };

export function agentrixOauthWireErrorV1(reasonCode: AgentrixOauthReasonCodeV1): AgentrixOauthErrorCodeV1 {
  switch (reasonCode) {
    case 'invalid_scope':
    case 'invalid_target':
    case 'unsupported_response_type':
      return reasonCode;
    case 'client_id_mismatch':
      return 'invalid_client';
    case 'grant_wider_than_request':
      return 'access_denied';
    case 'port_unavailable':
    case 'feature_disabled':
      return 'temporarily_unavailable';
    default:
      return 'invalid_request';
  }
}

// ── 小工具（文件内部） ─────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: AgentrixOauthReasonCodeV1; field: string };

// 路径里不收空白、`#`、引号、尖括号、反斜杠、`^`、反引号和花括号，所以放进 `WWW-Authenticate` 的引号里不用转义。
const HTTPS_URL = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?(?:\/[^\s#"<>\\^`{|}]*)?$/;
const LOOPBACK_HTTP_URL = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?(?:\/[^\s#"<>\\^`{|}]*)?$/;
const DOT_SEGMENT = /(?:^|\/)\.\.?(?:\/|$)/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const PARTNER_CLIENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const PAIRWISE_SUB = /^[A-Za-z0-9_-]{22,64}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PASS_ID = /^pass_[0-9a-f]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(reasonCode: AgentrixOauthReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

/** https URL，没有账号密码（主机部分不收 `@`）、没有片段、没有 `.` / `..` 段，不超过长度上限。 */
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > AGENTRIX_OAUTH_LIMITS_V1.urlMax || !HTTPS_URL.test(value)) return false;
  const path = value.replace(/^https:\/\/[^/]*/, '');
  return !DOT_SEGMENT.test(path.split('?')[0]);
}

/** 重定向地址：https，或者回环地址上的 http（本机客户端）。 */
function isRedirectUri(value: unknown): value is string {
  if (isHttpsUrl(value)) return true;
  return typeof value === 'string' && value.length <= AGENTRIX_OAUTH_LIMITS_V1.urlMax && LOOPBACK_HTTP_URL.test(value) && !DOT_SEGMENT.test(value.replace(/^http:\/\/[^/]*/, '').split('?')[0]);
}

/** CIMD 的 `client_id`：https URL，而且要有路径（不能只是 `/`），不带查询串。 */
function isMetadataDocumentClientId(value: unknown): boolean {
  if (!isHttpsUrl(value) || value.includes('?')) return false;
  return value.replace(/^https:\/\/[^/]*/, '').length > 1;
}

/** 空字符串当作没传（RFC 6749 3.1）。 */
function present(value: unknown): unknown {
  return value === '' ? undefined : value;
}

// ── scope ────────────────────────────────────────────────────────────────────────────

export interface AgentrixOauthScopeV1 {
  identity: AgentrixOauthIdentityScopeV1[];
  /** Pass 的「类别 × 目的」，逐对列出，不重复。 */
  pass: AgentPassScopeV1[];
}

/** `<category>:<purpose>`。 */
export function encodeAgentrixOauthPassScopeV1(scope: AgentPassScopeV1): string {
  return `${scope.category}:${scope.purpose}`;
}

/** 空格分隔的 scope 串。至少一项；不认识的、重复的、多空格的都拒绝（`invalid_scope`）。 */
export function decodeAgentrixOauthScopeV1(value: unknown, field = 'scope'): AgentrixOauthDecodeResultV1<AgentrixOauthScopeV1> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  if (value.length === 0 || value.length > 4096) return fail('invalid_scope', field);
  const identity: AgentrixOauthIdentityScopeV1[] = [];
  const pass: AgentPassScopeV1[] = [];
  const seen = new Set<string>();
  for (const token of value.split(' ')) {
    if (token.length === 0 || seen.has(token)) return fail('invalid_scope', field);
    seen.add(token);
    if (isOneOf(AGENTRIX_OAUTH_IDENTITY_SCOPES_V1, token)) {
      identity.push(token);
      continue;
    }
    const [category, purpose, ...rest] = token.split(':');
    if (rest.length > 0 || !isOneOf(AGENT_PASS_CATEGORIES_V1, category) || !isOneOf(AGENT_PASS_PURPOSES_V1, purpose)) return fail('invalid_scope', field);
    pass.push({ category: category as AgentPassCategoryV1, purpose: purpose as AgentPassPurposeV1 });
  }
  if (pass.length > AGENTRIX_OAUTH_LIMITS_V1.scopesMax) return fail('invalid_scope', field);
  return { ok: true, value: { identity, pass } };
}

export function encodeAgentrixOauthScopeV1(scope: AgentrixOauthScopeV1): string {
  return [...scope.identity, ...scope.pass.map(encodeAgentrixOauthPassScopeV1)].join(' ');
}

/** 同意页只许改窄：放行的每一对都必须在申请里。放宽（多出一对）返回 false。 */
export function agentrixOauthGrantWithinRequestV1(requested: readonly AgentPassScopeV1[], granted: readonly AgentPassScopeV1[]): boolean {
  return granted.every((g) => requested.some((r) => r.category === g.category && r.purpose === g.purpose));
}

// ── 客户端 ───────────────────────────────────────────────────────────────────────────

/** `client_id` 是 https URL 就是 CIMD，否则按已登记的合作方处理。 */
export function agentrixOauthClientKindV1(clientId: string): AgentrixOauthClientKindV1 {
  return clientId.startsWith('https://') ? 'metadata_document' : 'partner_app';
}

function isClientId(value: unknown): value is string {
  return typeof value === 'string' && (isMetadataDocumentClientId(value) || (!value.includes(':') && PARTNER_CLIENT_ID.test(value)));
}

/** 客户端元数据文档里我们认的字段（其余丢掉）。 */
export interface AgentrixOauthClientMetadataV1 {
  clientId: string;
  clientName: string | null;
  clientUri: string | null;
  logoUri: string | null;
  redirectUris: string[];
  grantTypes: AgentrixOauthGrantTypeV1[];
  tokenEndpointAuthMethod: 'none';
}

/**
 * 解码拉回来的 CIMD 文档。`documentUrl` 是拉取用的 URL：文档里的 `client_id` 必须和它完全一致，
 * `redirect_uris` 1–10 个，只收 https 和回环 http。认证方式只认 `none`：有 `token_endpoint_auth_methods_supported` 时
 * 要求它含 `none`（单数字段只是偏好）；没有时 `token_endpoint_auth_method` 必须是 `none`。
 * `grant_types` 里不认识的类型丢掉，剩下的必须含 `authorization_code`，否则拒收。
 * 文档大小由拉取方按 `clientMetadataDocumentMaxBytes` 截断，这里只管内容。不认识的字段丢掉，不报错。
 */
export function decodeAgentrixOauthClientMetadataV1(value: unknown, documentUrl: string): AgentrixOauthDecodeResultV1<AgentrixOauthClientMetadataV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  if (!isMetadataDocumentClientId(documentUrl)) return fail('invalid_value', 'documentUrl');
  if (value.client_id === undefined) return fail('missing_field', 'client_id');
  if (typeof value.client_id !== 'string') return fail('invalid_type', 'client_id');
  if (value.client_id !== documentUrl) return fail('client_id_mismatch', 'client_id');
  if (value.redirect_uris === undefined) return fail('missing_field', 'redirect_uris');
  if (!Array.isArray(value.redirect_uris)) return fail('invalid_type', 'redirect_uris');
  const uris: unknown[] = value.redirect_uris;
  if (uris.length === 0 || uris.length > AGENTRIX_OAUTH_LIMITS_V1.redirectUrisMax) return fail('invalid_value', 'redirect_uris');
  for (const uri of uris) {
    if (typeof uri !== 'string') return fail('invalid_type', 'redirect_uris');
    if (!isRedirectUri(uri)) return fail('invalid_value', 'redirect_uris');
  }
  if (new Set(uris).size !== uris.length) return fail('invalid_value', 'redirect_uris');

  let clientName: string | null = null;
  if (value.client_name !== undefined) {
    if (typeof value.client_name !== 'string') return fail('invalid_type', 'client_name');
    const name = value.client_name.trim();
    if (name.length === 0 || name.length > AGENTRIX_OAUTH_LIMITS_V1.clientNameMax || CONTROL.test(name)) return fail('invalid_value', 'client_name');
    clientName = name;
  }
  const links: Record<'client_uri' | 'logo_uri', string | null> = { client_uri: null, logo_uri: null };
  for (const key of ['client_uri', 'logo_uri'] as const) {
    const link = value[key];
    if (link === undefined) continue;
    if (typeof link !== 'string') return fail('invalid_type', key);
    if (!isHttpsUrl(link)) return fail('invalid_value', key);
    links[key] = link;
  }
  let grantTypes: AgentrixOauthGrantTypeV1[] = ['authorization_code'];
  if (value.grant_types !== undefined) {
    if (!Array.isArray(value.grant_types)) return fail('invalid_type', 'grant_types');
    const list: unknown[] = value.grant_types;
    if (list.length === 0 || new Set(list).size !== list.length) return fail('invalid_value', 'grant_types');
    for (const grant of list) {
      if (typeof grant !== 'string') return fail('invalid_type', 'grant_types');
    }
    // 不认识的授权类型（例如 Claude 写的 jwt-bearer）丢掉、不报错，我们一律不支持它们；剩下的里必须有 `authorization_code`。
    const known = (list as string[]).filter((grant): grant is AgentrixOauthGrantTypeV1 => isOneOf(AGENTRIX_OAUTH_GRANT_TYPES_V1, grant));
    if (!known.includes('authorization_code')) return fail('invalid_value', 'grant_types');
    grantTypes = known;
  }
  if (value.response_types !== undefined) {
    if (!Array.isArray(value.response_types)) return fail('invalid_type', 'response_types');
    const types: unknown[] = value.response_types;
    if (types.length !== 1 || types[0] !== 'code') return fail('invalid_value', 'response_types');
  }
  // 认证方式：文档写了 `token_endpoint_auth_methods_supported` 就以它为准（含 `none` 才收，我们只支持 `none`），
  // 这时单数字段只是偏好，不再一票否决（ChatGPT 的文档单数写 `private_key_jwt`、复数写 `["none","private_key_jwt"]`）。
  // 没有复数字段时，单数字段必须是 `none`，和以前一样。
  if (value.token_endpoint_auth_method !== undefined && typeof value.token_endpoint_auth_method !== 'string') return fail('invalid_type', 'token_endpoint_auth_method');
  if (value.token_endpoint_auth_methods_supported !== undefined) {
    if (!Array.isArray(value.token_endpoint_auth_methods_supported)) return fail('invalid_type', 'token_endpoint_auth_methods_supported');
    const methods: unknown[] = value.token_endpoint_auth_methods_supported;
    if (methods.some((method) => typeof method !== 'string')) return fail('invalid_type', 'token_endpoint_auth_methods_supported');
    if (!methods.includes('none')) return fail('invalid_value', 'token_endpoint_auth_methods_supported');
  } else if (value.token_endpoint_auth_method !== undefined && value.token_endpoint_auth_method !== 'none') {
    return fail('invalid_value', 'token_endpoint_auth_method');
  }
  return {
    ok: true,
    value: {
      clientId: documentUrl,
      clientName,
      clientUri: links.client_uri,
      logoUri: links.logo_uri,
      redirectUris: [...(uris as string[])],
      grantTypes: [...grantTypes],
      tokenEndpointAuthMethod: 'none',
    },
  };
}

// ── 授权请求 ─────────────────────────────────────────────────────────────────────────

export interface AgentrixOauthAuthorizeRequestV1 {
  responseType: 'code';
  clientId: string;
  redirectUri: string;
  scope: AgentrixOauthScopeV1;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  /** RFC 8707：access token 的 `aud` 就是它。 */
  resource: string;
  nonce: string | null;
}

/**
 * 授权端点的查询参数。PKCE 必填而且只认 `S256`（没有、`plain` 都拒绝），`resource` 必填。
 * 不认识的参数忽略（RFC 6749 3.1），空字符串当作没传。属主不在请求里：授权端点要求登录，属主从登录态取。
 */
export function decodeAgentrixOauthAuthorizeRequestV1(value: unknown): AgentrixOauthDecodeResultV1<AgentrixOauthAuthorizeRequestV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const raw = (key: string) => present(value[key]);
  const need = (key: string): Failure | null => (raw(key) === undefined ? fail('missing_field', key) : null);
  for (const key of ['client_id', 'redirect_uri', 'response_type', 'scope', 'code_challenge', 'code_challenge_method', 'resource']) {
    const missing = need(key);
    if (missing) return missing;
  }
  const clientId = raw('client_id');
  if (typeof clientId !== 'string') return fail('invalid_type', 'client_id');
  if (!isClientId(clientId)) return fail('invalid_value', 'client_id');
  const redirectUri = raw('redirect_uri');
  if (typeof redirectUri !== 'string') return fail('invalid_type', 'redirect_uri');
  if (!isRedirectUri(redirectUri)) return fail('invalid_value', 'redirect_uri');
  const responseType = raw('response_type');
  if (typeof responseType !== 'string') return fail('invalid_type', 'response_type');
  if (!isOneOf(AGENTRIX_OAUTH_RESPONSE_TYPES_V1, responseType)) return fail('unsupported_response_type', 'response_type');
  const challenge = raw('code_challenge');
  if (typeof challenge !== 'string') return fail('invalid_type', 'code_challenge');
  if (!PKCE_CHALLENGE.test(challenge)) return fail('invalid_value', 'code_challenge');
  const method = raw('code_challenge_method');
  if (typeof method !== 'string') return fail('invalid_type', 'code_challenge_method');
  if (!isOneOf(AGENTRIX_OAUTH_CODE_CHALLENGE_METHODS_V1, method)) return fail('invalid_value', 'code_challenge_method');
  const resource = raw('resource');
  if (typeof resource !== 'string') return fail('invalid_type', 'resource');
  if (!isHttpsUrl(resource)) return fail('invalid_target', 'resource');
  const scope = decodeAgentrixOauthScopeV1(raw('scope'));
  if (scope.ok === false) return scope;

  let state: string | null = null;
  const stateRaw = raw('state');
  if (stateRaw !== undefined) {
    if (typeof stateRaw !== 'string') return fail('invalid_type', 'state');
    if (stateRaw.length > AGENTRIX_OAUTH_LIMITS_V1.stateMax || CONTROL.test(stateRaw)) return fail('invalid_value', 'state');
    state = stateRaw;
  }
  let nonce: string | null = null;
  const nonceRaw = raw('nonce');
  if (nonceRaw !== undefined) {
    if (typeof nonceRaw !== 'string') return fail('invalid_type', 'nonce');
    if (nonceRaw.length > AGENTRIX_OAUTH_LIMITS_V1.nonceMax || CONTROL.test(nonceRaw)) return fail('invalid_value', 'nonce');
    nonce = nonceRaw;
  }
  return {
    ok: true,
    value: {
      responseType,
      clientId,
      redirectUri,
      scope: scope.value,
      state,
      codeChallenge: challenge,
      codeChallengeMethod: method,
      resource,
      nonce,
    },
  };
}

// ── token claims ─────────────────────────────────────────────────────────────────────

/** access token（头 `typ: at+jwt`）。只带 `pass_id`，不带任何主人的数据。 */
export interface AgentrixOauthAccessTokenClaimsV1 {
  iss: string;
  /** 每个客户端一个化名（pairwise），不是账户 id。 */
  sub: string;
  /** 具体的资源地址（授权请求里的 `resource`）。别的资源不收。 */
  aud: string;
  client_id: string;
  scope: string;
  pass_id: string;
  jti: string;
  iat: number;
  exp: number;
}

function checkTimes(value: Record<string, unknown>, ttlMax: number): Failure | null {
  for (const key of ['iat', 'exp']) {
    if (value[key] === undefined) return fail('missing_field', key);
    if (typeof value[key] !== 'number') return fail('invalid_type', key);
    if (!Number.isInteger(value[key]) || (value[key] as number) < 1) return fail('invalid_value', key);
  }
  const ttl = (value.exp as number) - (value.iat as number);
  if (ttl < 1 || ttl > ttlMax) return fail('invalid_value', 'exp');
  return null;
}

function checkKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

export function decodeAgentrixOauthAccessTokenClaimsV1(value: unknown): AgentrixOauthDecodeResultV1<AgentrixOauthAccessTokenClaimsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['iss', 'sub', 'aud', 'client_id', 'scope', 'pass_id', 'jti', 'iat', 'exp'];
  const bad = checkKeys(value, keys, keys);
  if (bad) return bad;
  for (const key of ['iss', 'sub', 'aud', 'client_id', 'scope', 'pass_id', 'jti']) if (typeof value[key] !== 'string') return fail('invalid_type', key);
  if (!isHttpsUrl(value.iss)) return fail('invalid_value', 'iss');
  if (!PAIRWISE_SUB.test(value.sub as string)) return fail('invalid_value', 'sub');
  if (!isHttpsUrl(value.aud)) return fail('invalid_value', 'aud');
  if (!isClientId(value.client_id)) return fail('invalid_value', 'client_id');
  const scope = decodeAgentrixOauthScopeV1(value.scope);
  if (scope.ok === false) return scope;
  if (!PASS_ID.test(value.pass_id as string)) return fail('invalid_value', 'pass_id');
  if (!OPAQUE_ID.test(value.jti as string)) return fail('invalid_value', 'jti');
  const times = checkTimes(value, AGENTRIX_OAUTH_LIMITS_V1.accessTokenTtlSecondsMax);
  if (times) return times;
  return { ok: true, value: Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as AgentrixOauthAccessTokenClaimsV1 };
}

/** OIDC id_token。`aud` 是客户端；`at_hash` 见 `agentrixOauthAtHashV1`。 */
export interface AgentrixOauthIdTokenClaimsV1 {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  auth_time?: number;
  nonce?: string;
  at_hash?: string;
  /** 只有 `profile` scope 才给，而且是可选的显示名。 */
  name?: string;
}

export function decodeAgentrixOauthIdTokenClaimsV1(value: unknown): AgentrixOauthDecodeResultV1<AgentrixOauthIdTokenClaimsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkKeys(value, ['iss', 'sub', 'aud', 'iat', 'exp', 'auth_time', 'nonce', 'at_hash', 'name'], ['iss', 'sub', 'aud', 'iat', 'exp']);
  if (bad) return bad;
  for (const key of ['iss', 'sub', 'aud']) if (typeof value[key] !== 'string') return fail('invalid_type', key);
  if (!isHttpsUrl(value.iss)) return fail('invalid_value', 'iss');
  if (!PAIRWISE_SUB.test(value.sub as string)) return fail('invalid_value', 'sub');
  if (!isClientId(value.aud)) return fail('invalid_value', 'aud');
  const times = checkTimes(value, AGENTRIX_OAUTH_LIMITS_V1.idTokenTtlSecondsMax);
  if (times) return times;
  if (value.auth_time !== undefined) {
    if (typeof value.auth_time !== 'number') return fail('invalid_type', 'auth_time');
    if (!Number.isInteger(value.auth_time) || value.auth_time < 1 || value.auth_time > (value.iat as number)) return fail('invalid_value', 'auth_time');
  }
  if (value.nonce !== undefined) {
    if (typeof value.nonce !== 'string') return fail('invalid_type', 'nonce');
    if (value.nonce.length === 0 || value.nonce.length > AGENTRIX_OAUTH_LIMITS_V1.nonceMax || CONTROL.test(value.nonce)) return fail('invalid_value', 'nonce');
  }
  if (value.at_hash !== undefined) {
    if (typeof value.at_hash !== 'string') return fail('invalid_type', 'at_hash');
    if (!/^[A-Za-z0-9_-]{22}$/.test(value.at_hash)) return fail('invalid_value', 'at_hash');
  }
  if (value.name !== undefined) {
    if (typeof value.name !== 'string') return fail('invalid_type', 'name');
    const name = value.name.trim();
    if (name.length === 0 || name.length > AGENTRIX_OAUTH_LIMITS_V1.clientNameMax || CONTROL.test(name)) return fail('invalid_value', 'name');
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) out[key] = value[key];
  return { ok: true, value: out as unknown as AgentrixOauthIdTokenClaimsV1 };
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * OIDC Core 3.1.3.6：access token 的 ASCII 字节做 SHA-256，取左边一半（16 字节），再 base64url（22 个字符）。
 * ES256 用的就是 SHA-256。access token 本身是 base64url 加点，全是 ASCII。
 */
export function agentrixOauthAtHashV1(accessToken: string): string {
  const hex = sha256Hex(accessToken).slice(0, 32);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const n = (bytes[i] << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += BASE64URL_ALPHABET[(n >> 18) & 63] + BASE64URL_ALPHABET[(n >> 12) & 63];
    if (b1 !== undefined) out += BASE64URL_ALPHABET[(n >> 6) & 63];
    if (b2 !== undefined) out += BASE64URL_ALPHABET[n & 63];
  }
  return out;
}

// ── 元数据 ───────────────────────────────────────────────────────────────────────────

/** `/.well-known/oauth-authorization-server` 和 `/.well-known/openid-configuration` 的内容。 */
export interface AgentrixAuthorizationServerMetadataV1 {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  device_authorization_endpoint: string;
  userinfo_endpoint: string;
  response_types_supported: typeof AGENTRIX_OAUTH_RESPONSE_TYPES_V1;
  grant_types_supported: typeof AGENTRIX_OAUTH_GRANT_TYPES_V1;
  code_challenge_methods_supported: typeof AGENTRIX_OAUTH_CODE_CHALLENGE_METHODS_V1;
  token_endpoint_auth_methods_supported: typeof AGENTRIX_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS_V1;
  scopes_supported: string[];
  subject_types_supported: ['pairwise'];
  id_token_signing_alg_values_supported: ['ES256'];
  /** RFC 9207：授权响应带 `iss`。 */
  authorization_response_iss_parameter_supported: true;
  /** MCP 2025-11-25：支持客户端元数据文档。 */
  client_id_metadata_document_supported: true;
}

/** 全部 scope：身份三项加每一对「类别:目的」。 */
export function agentrixOauthScopesSupportedV1(): string[] {
  const pairs: string[] = [];
  for (const category of AGENT_PASS_CATEGORIES_V1) for (const purpose of AGENT_PASS_PURPOSES_V1) pairs.push(`${category}:${purpose}`);
  return [...AGENTRIX_OAUTH_IDENTITY_SCOPES_V1, ...pairs];
}

export interface AgentrixAuthorizationServerEndpointsV1 {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  deviceAuthorizationEndpoint: string;
  userinfoEndpoint: string;
}

/** 固定的那些能力写死在这里（只收 S256、只有授权码 / refresh / 设备码、ES256、pairwise），端点地址由调用方给，必须是 https。 */
export function buildAgentrixAuthorizationServerMetadataV1(
  endpoints: AgentrixAuthorizationServerEndpointsV1,
): AgentrixOauthDecodeResultV1<AgentrixAuthorizationServerMetadataV1> {
  if (!isRecord(endpoints)) return fail('invalid_type', '$');
  const urls: Array<[keyof AgentrixAuthorizationServerEndpointsV1, string]> = [
    ['issuer', 'issuer'],
    ['authorizationEndpoint', 'authorization_endpoint'],
    ['tokenEndpoint', 'token_endpoint'],
    ['jwksUri', 'jwks_uri'],
    ['deviceAuthorizationEndpoint', 'device_authorization_endpoint'],
    ['userinfoEndpoint', 'userinfo_endpoint'],
  ];
  for (const [key, wire] of urls) {
    const url = endpoints[key];
    if (typeof url !== 'string') return fail('invalid_type', wire);
    if (!isHttpsUrl(url) || url.includes('?')) return fail('invalid_value', wire);
  }
  return {
    ok: true,
    value: {
      issuer: endpoints.issuer,
      authorization_endpoint: endpoints.authorizationEndpoint,
      token_endpoint: endpoints.tokenEndpoint,
      jwks_uri: endpoints.jwksUri,
      device_authorization_endpoint: endpoints.deviceAuthorizationEndpoint,
      userinfo_endpoint: endpoints.userinfoEndpoint,
      response_types_supported: AGENTRIX_OAUTH_RESPONSE_TYPES_V1,
      grant_types_supported: AGENTRIX_OAUTH_GRANT_TYPES_V1,
      code_challenge_methods_supported: AGENTRIX_OAUTH_CODE_CHALLENGE_METHODS_V1,
      token_endpoint_auth_methods_supported: AGENTRIX_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS_V1,
      scopes_supported: agentrixOauthScopesSupportedV1(),
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: ['ES256'],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
    },
  };
}

/** RFC 9728 受保护资源元数据：`/.well-known/oauth-protected-resource`。 */
export interface AgentrixProtectedResourceMetadataV1 {
  resource: string;
  authorization_servers: [string];
  scopes_supported: string[];
  bearer_methods_supported: ['header'];
}

export function buildAgentrixProtectedResourceMetadataV1(input: { resource: string; issuer: string }): AgentrixOauthDecodeResultV1<AgentrixProtectedResourceMetadataV1> {
  if (!isRecord(input)) return fail('invalid_type', '$');
  if (typeof input.resource !== 'string') return fail('invalid_type', 'resource');
  if (!isHttpsUrl(input.resource)) return fail('invalid_target', 'resource');
  if (typeof input.issuer !== 'string') return fail('invalid_type', 'issuer');
  if (!isHttpsUrl(input.issuer) || input.issuer.includes('?')) return fail('invalid_value', 'issuer');
  return {
    ok: true,
    value: {
      resource: input.resource,
      authorization_servers: [input.issuer],
      scopes_supported: agentrixOauthScopesSupportedV1(),
      bearer_methods_supported: ['header'],
    },
  };
}

/**
 * 401 的 `WWW-Authenticate`：`Bearer resource_metadata="…", scope="…"`，出错时再加 `error="…"`。
 * 值里不会有引号和反斜杠（URL 检查已经把它们挡在外面），所以不需要转义。
 */
export function agentrixOauthWwwAuthenticateV1(input: { resourceMetadataUrl: string; scope?: string; error?: AgentrixOauthErrorCodeV1 }): string | null {
  if (!isRecord(input) || !isHttpsUrl(input.resourceMetadataUrl)) return null;
  const parts = [`resource_metadata="${input.resourceMetadataUrl}"`];
  if (input.scope !== undefined) {
    const scope = decodeAgentrixOauthScopeV1(input.scope);
    if (scope.ok === false) return null;
    parts.push(`scope="${input.scope}"`);
  }
  if (input.error !== undefined) {
    if (!isOneOf(AGENTRIX_OAUTH_ERROR_CODES_V1, input.error)) return null;
    parts.push(`error="${input.error}"`);
  }
  return `Bearer ${parts.join(', ')}`;
}

// ── 同意页和「已连接的应用」 ─────────────────────────────────────────────────────────────

export const AGENTRIX_OAUTH_CONSENT_DECISIONS_V1 = ['approve', 'deny'] as const;
export type AgentrixOauthConsentDecisionKindV1 = (typeof AGENTRIX_OAUTH_CONSENT_DECISIONS_V1)[number];

/**
 * 主人在同意页点的结果。同意页就是 Pass 预览：`grantedScopes` 是主人留下的那些对，可以比申请的窄，不能更宽
 * （服务端用 `agentrixOauthGrantWithinRequestV1` 对着申请再查一次）。`deny` 时必须是空数组。
 */
export interface AgentrixOauthConsentDecisionV1 {
  schemaVersion: typeof AGENTRIX_OAUTH_SCHEMA_VERSION_V1;
  /** 授权请求落库后的同意请求号（服务端发，不是 OAuth 的 `state`）。 */
  consentRequestId: string;
  decision: AgentrixOauthConsentDecisionKindV1;
  grantedScopes: AgentPassScopeV1[];
}

function decodePassScopes(value: unknown, path: string): AgentrixOauthDecodeResultV1<AgentPassScopeV1[]> {
  if (!Array.isArray(value)) return fail('invalid_type', path);
  const list: unknown[] = value;
  if (list.length > AGENTRIX_OAUTH_LIMITS_V1.scopesMax) return fail('invalid_value', path);
  const out: AgentPassScopeV1[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i += 1) {
    const scope = list[i];
    const at = `${path}[${i}]`;
    if (!isRecord(scope)) return fail('invalid_type', at);
    for (const key of Object.keys(scope)) if (key !== 'category' && key !== 'purpose') return fail('unknown_field', `${at}.${key}`);
    for (const key of ['category', 'purpose']) if (scope[key] === undefined) return fail('missing_field', `${at}.${key}`);
    if (typeof scope.category !== 'string') return fail('invalid_type', `${at}.category`);
    if (!isOneOf(AGENT_PASS_CATEGORIES_V1, scope.category)) return fail('invalid_value', `${at}.category`);
    if (typeof scope.purpose !== 'string') return fail('invalid_type', `${at}.purpose`);
    if (!isOneOf(AGENT_PASS_PURPOSES_V1, scope.purpose)) return fail('invalid_value', `${at}.purpose`);
    const key = `${scope.category}|${scope.purpose}`;
    if (seen.has(key)) return fail('invalid_value', at);
    seen.add(key);
    out.push({ category: scope.category, purpose: scope.purpose });
  }
  return { ok: true, value: out };
}

export function decodeAgentrixOauthConsentDecisionV1(value: unknown): AgentrixOauthDecodeResultV1<AgentrixOauthConsentDecisionV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== AGENTRIX_OAUTH_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  const bad = checkKeys(value, ['schemaVersion', 'consentRequestId', 'decision', 'grantedScopes'], ['consentRequestId', 'decision', 'grantedScopes']);
  if (bad) return bad;
  if (typeof value.consentRequestId !== 'string') return fail('invalid_type', 'consentRequestId');
  if (!UUID.test(value.consentRequestId)) return fail('invalid_value', 'consentRequestId');
  if (typeof value.decision !== 'string') return fail('invalid_type', 'decision');
  if (!isOneOf(AGENTRIX_OAUTH_CONSENT_DECISIONS_V1, value.decision)) return fail('invalid_value', 'decision');
  const scopes = decodePassScopes(value.grantedScopes, 'grantedScopes');
  if (scopes.ok === false) return scopes;
  if (value.decision === 'approve' && scopes.value.length === 0) return fail('invalid_value', 'grantedScopes');
  if (value.decision === 'deny' && scopes.value.length > 0) return fail('invalid_value', 'grantedScopes');
  return {
    ok: true,
    value: { schemaVersion: AGENTRIX_OAUTH_SCHEMA_VERSION_V1, consentRequestId: value.consentRequestId, decision: value.decision, grantedScopes: scopes.value },
  };
}

/** 「已连接的应用」列表的一行（网页、手机、电脑共用）。撤销就是撤销这张 Pass。 */
export interface AgentrixOauthConnectedAppV1 {
  schemaVersion: typeof AGENTRIX_OAUTH_SCHEMA_VERSION_V1;
  clientId: string;
  clientKind: AgentrixOauthClientKindV1;
  clientName: string | null;
  passId: string;
  scopes: AgentPassScopeV1[];
  connectedAt: string;
  lastUsedAt: string | null;
}

export function decodeAgentrixOauthConnectedAppV1(value: unknown): AgentrixOauthDecodeResultV1<AgentrixOauthConnectedAppV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== AGENTRIX_OAUTH_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  const bad = checkKeys(
    value,
    ['schemaVersion', 'clientId', 'clientKind', 'clientName', 'passId', 'scopes', 'connectedAt', 'lastUsedAt'],
    ['clientId', 'clientKind', 'clientName', 'passId', 'scopes', 'connectedAt', 'lastUsedAt'],
  );
  if (bad) return bad;
  if (typeof value.clientId !== 'string') return fail('invalid_type', 'clientId');
  if (!isClientId(value.clientId)) return fail('invalid_value', 'clientId');
  if (typeof value.clientKind !== 'string') return fail('invalid_type', 'clientKind');
  if (!isOneOf(AGENTRIX_OAUTH_CLIENT_KINDS_V1, value.clientKind) || value.clientKind !== agentrixOauthClientKindV1(value.clientId)) return fail('invalid_value', 'clientKind');
  let clientName: string | null = null;
  if (value.clientName !== null) {
    if (typeof value.clientName !== 'string') return fail('invalid_type', 'clientName');
    if (value.clientName.length === 0 || value.clientName.length > AGENTRIX_OAUTH_LIMITS_V1.clientNameMax || CONTROL.test(value.clientName)) return fail('invalid_value', 'clientName');
    clientName = value.clientName;
  }
  if (typeof value.passId !== 'string') return fail('invalid_type', 'passId');
  if (!PASS_ID.test(value.passId)) return fail('invalid_value', 'passId');
  const scopes = decodePassScopes(value.scopes, 'scopes');
  if (scopes.ok === false) return scopes;
  if (scopes.value.length === 0) return fail('invalid_value', 'scopes');
  if (typeof value.connectedAt !== 'string') return fail('invalid_type', 'connectedAt');
  if (!isIso(value.connectedAt)) return fail('invalid_value', 'connectedAt');
  let lastUsedAt: string | null = null;
  if (value.lastUsedAt !== null) {
    if (typeof value.lastUsedAt !== 'string') return fail('invalid_type', 'lastUsedAt');
    if (!isIso(value.lastUsedAt)) return fail('invalid_value', 'lastUsedAt');
    lastUsedAt = value.lastUsedAt;
  }
  return {
    ok: true,
    value: {
      schemaVersion: AGENTRIX_OAUTH_SCHEMA_VERSION_V1,
      clientId: value.clientId,
      clientKind: value.clientKind,
      clientName,
      passId: value.passId,
      scopes: scopes.value,
      connectedAt: value.connectedAt,
      lastUsedAt,
    },
  };
}

// ── 同意页看到的和得到的（3A 线加，只加不改） ──────────────────────────────────────────────────────

/**
 * 设备登录是从哪里发起的（评审 M1 加）。只到粗粒度：`network` 是网络段，IPv4 截到 /24（`203.0.113.0/24`），IPv6 截到 /48
 * （`2001:db8:abcd::/48`），从不是完整地址；`agent` 是浏览器或程序的大类（`Chrome on macOS`、`curl`），从固定词表里取，
 * 不是原始的 User-Agent。读不出来的那一项是 null。
 */
export interface AgentrixOauthDeviceOriginV1 {
  network: string | null;
  agent: string | null;
}

/** 同意页要显示的：哪个应用、它要什么、主人名下可选的 Agent。不含应用的 logo 地址：页面不加载第三方的图片。 */
export interface AgentrixOauthConsentViewV1 {
  consentRequestId: string;
  flow: 'authorization_code' | 'device_code';
  /**
   * `verified`（评审 M1 加）：true = 在平台登记过的合作方（`partner_apps`，用自己的密钥证明身份），名字是它登记的那个；
   * false = 客户端元数据文档，名字是应用自己报的。客户端元数据文档永远是 false。
   */
  client: { clientId: string; clientKind: AgentrixOauthClientKindV1; clientName: string | null; logoUri: string | null; redirectHost: string | null; verified: boolean };
  /** 设备流程才有（评审 M1 加）：这次登录从哪里发起。授权码流程是 null。 */
  origin: AgentrixOauthDeviceOriginV1 | null;
  requestedIdentity: AgentrixOauthIdentityScopeV1[];
  requestedScopes: AgentPassScopeV1[];
  agents: Array<{ id: string; name: string }>;
  expiresAt: string;
}

const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?$/;
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
/** 只收网络段：IPv4 的 /24（最后一段是 0）或 IPv6 的 /48（前三组加 `::`）。完整地址解不出来。 */
const ORIGIN_NETWORK = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}0\/24$|^[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){2}::\/48$/;
/** 服务端固定词表里的大类：字母开头，只有字母、数字、空格和 `.+-`。 */
const ORIGIN_AGENT = /^[A-Za-z][A-Za-z0-9.+ -]{0,63}$/;

export function decodeAgentrixOauthConsentViewV1(value: unknown): AgentrixOauthDecodeResultV1<AgentrixOauthConsentViewV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['consentRequestId', 'flow', 'client', 'origin', 'requestedIdentity', 'requestedScopes', 'agents', 'expiresAt'];
  const bad = checkKeys(value, keys, keys);
  if (bad) return bad;
  if (typeof value.consentRequestId !== 'string') return fail('invalid_type', 'consentRequestId');
  if (!UUID.test(value.consentRequestId)) return fail('invalid_value', 'consentRequestId');
  if (value.flow !== 'authorization_code' && value.flow !== 'device_code') return fail('invalid_value', 'flow');
  const client = value.client;
  if (!isRecord(client)) return fail('invalid_type', 'client');
  const clientKeys = ['clientId', 'clientKind', 'clientName', 'logoUri', 'redirectHost', 'verified'];
  const clientBad = checkKeys(client, clientKeys, clientKeys);
  if (clientBad) return { ok: false, reasonCode: clientBad.reasonCode, field: `client.${clientBad.field}` };
  if (typeof client.clientId !== 'string') return fail('invalid_type', 'client.clientId');
  if (!isClientId(client.clientId)) return fail('invalid_value', 'client.clientId');
  if (client.clientKind !== agentrixOauthClientKindV1(client.clientId)) return fail('invalid_value', 'client.clientKind');
  const verified = client.verified;
  if (typeof verified !== 'boolean') return fail('invalid_type', 'client.verified');
  // A name an app gives itself is never shown as verified.
  if (verified && client.clientKind !== 'partner_app') return fail('invalid_value', 'client.verified');
  let origin: AgentrixOauthDeviceOriginV1 | null = null;
  const rawOrigin = value.origin;
  if (rawOrigin !== null) {
    if (value.flow !== 'device_code') return fail('invalid_value', 'origin');
    if (!isRecord(rawOrigin)) return fail('invalid_type', 'origin');
    const originBad = checkKeys(rawOrigin, ['network', 'agent'], ['network', 'agent']);
    if (originBad) return { ok: false, reasonCode: originBad.reasonCode, field: `origin.${originBad.field}` };
    const network = rawOrigin.network;
    const agent = rawOrigin.agent;
    if (network !== null && (typeof network !== 'string' || !ORIGIN_NETWORK.test(network))) return fail('invalid_value', 'origin.network');
    if (agent !== null && (typeof agent !== 'string' || !ORIGIN_AGENT.test(agent))) return fail('invalid_value', 'origin.agent');
    origin = { network: network as string | null, agent: agent as string | null };
  }
  let clientName: string | null = null;
  if (client.clientName !== null) {
    if (typeof client.clientName !== 'string' || client.clientName.length === 0 || client.clientName.length > AGENTRIX_OAUTH_LIMITS_V1.clientNameMax || CONTROL.test(client.clientName)) return fail('invalid_value', 'client.clientName');
    clientName = client.clientName;
  }
  let logoUri: string | null = null;
  if (client.logoUri !== null) {
    if (!isHttpsUrl(client.logoUri)) return fail('invalid_value', 'client.logoUri');
    logoUri = client.logoUri;
  }
  let redirectHost: string | null = null;
  if (client.redirectHost !== null) {
    if (typeof client.redirectHost !== 'string' || client.redirectHost.length > 255 || !HOST.test(client.redirectHost)) return fail('invalid_value', 'client.redirectHost');
    redirectHost = client.redirectHost;
  }
  if (!Array.isArray(value.requestedIdentity)) return fail('invalid_type', 'requestedIdentity');
  const identity: AgentrixOauthIdentityScopeV1[] = [];
  for (const item of value.requestedIdentity as unknown[]) {
    if (!isOneOf(AGENTRIX_OAUTH_IDENTITY_SCOPES_V1, item) || identity.includes(item)) return fail('invalid_value', 'requestedIdentity');
    identity.push(item);
  }
  const scopes = decodePassScopes(value.requestedScopes, 'requestedScopes');
  if (scopes.ok === false) return scopes;
  if (scopes.value.length === 0) return fail('invalid_value', 'requestedScopes');
  if (!Array.isArray(value.agents)) return fail('invalid_type', 'agents');
  if (value.agents.length > 50) return fail('invalid_value', 'agents');
  const agents: Array<{ id: string; name: string }> = [];
  for (const agent of value.agents as unknown[]) {
    if (!isRecord(agent)) return fail('invalid_type', 'agents');
    const agentBad = checkKeys(agent, ['id', 'name'], ['id', 'name']);
    if (agentBad) return { ok: false, reasonCode: agentBad.reasonCode, field: `agents.${agentBad.field}` };
    if (typeof agent.id !== 'string' || !AGENT_ID.test(agent.id)) return fail('invalid_value', 'agents.id');
    if (typeof agent.name !== 'string' || agent.name.length > AGENTRIX_OAUTH_LIMITS_V1.clientNameMax || CONTROL.test(agent.name)) return fail('invalid_value', 'agents.name');
    agents.push({ id: agent.id, name: agent.name });
  }
  if (typeof value.expiresAt !== 'string') return fail('invalid_type', 'expiresAt');
  if (!isIso(value.expiresAt)) return fail('invalid_value', 'expiresAt');
  return {
    ok: true,
    value: {
      consentRequestId: value.consentRequestId,
      flow: value.flow,
      client: { clientId: client.clientId, clientKind: client.clientKind as AgentrixOauthClientKindV1, clientName, logoUri, redirectHost, verified },
      origin,
      requestedIdentity: identity,
      requestedScopes: scopes.value,
      agents,
      expiresAt: value.expiresAt,
    },
  };
}

/** 主人点完以后服务端的回答：授权码流程带一个要跳转的地址（只会是 https 或回环 http），设备流程什么都没有。 */
export type AgentrixOauthConsentOutcomeV1 =
  | { decision: 'approve' | 'deny'; flow: 'authorization_code'; redirectTo: string }
  | { decision: 'approve' | 'deny'; flow: 'device_code' };

export function decodeAgentrixOauthConsentOutcomeV1(value: unknown): AgentrixOauthDecodeResultV1<AgentrixOauthConsentOutcomeV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  if (!isOneOf(AGENTRIX_OAUTH_CONSENT_DECISIONS_V1, value.decision)) return fail('invalid_value', 'decision');
  if (value.flow === 'device_code') {
    const bad = checkKeys(value, ['decision', 'flow'], ['decision', 'flow']);
    return bad ?? { ok: true, value: { decision: value.decision, flow: 'device_code' } };
  }
  if (value.flow !== 'authorization_code') return fail('invalid_value', 'flow');
  const bad = checkKeys(value, ['decision', 'flow', 'redirectTo'], ['decision', 'flow', 'redirectTo']);
  if (bad) return bad;
  if (typeof value.redirectTo !== 'string') return fail('invalid_type', 'redirectTo');
  if (!isRedirectUri(value.redirectTo)) return fail('invalid_value', 'redirectTo');
  return { ok: true, value: { decision: value.decision, flow: 'authorization_code', redirectTo: value.redirectTo } };
}

/** 应用的名字给人看：它自己报的名字，没有就用 `client_id` 的主机名。永远是纯文本。 */
export function agentrixOauthClientLabelV1(clientId: string, clientName: string | null): string {
  if (clientName) return clientName;
  const match = /^https:\/\/([^/?#]+)/.exec(clientId);
  return match ? match[1] : clientId;
}

/** 「最近用过」那一句，三端的登录应用列表共用：日期时间格式跟界面语言走（中文 `zh-CN`、英文 `en-US`），不跟系统或浏览器的语言走。 */
export function agentrixOauthLastUsedTextV1(lastUsedAt: string | null, language: 'zh' | 'en'): string {
  if (!lastUsedAt) return language === 'zh' ? '还没用过' : 'Not used yet';
  const when = new Date(lastUsedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
  return language === 'zh' ? `最近用过 ${when}` : `Last used ${when}`;
}

/** 一串「类别 × 目的」讲成人话，一对一行，三端的同意页和列表共用：借 Pass 预览的措辞，不另写一套。 */
export function agentrixOauthScopeLinesV1(scopes: readonly AgentPassScopeV1[]): Array<{ zh: string; en: string }> {
  return agentPassPreviewV1({
    schemaVersion: 1,
    id: `pass_${'0'.repeat(32)}`,
    agentId: 'preview',
    status: 'active',
    version: 1,
    usedCount: 0,
    issuedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    revokedAt: null,
    audience: { kind: 'oauth_client', ref: `oauth_client:${'0'.repeat(64)}` },
    scopes: scopes.map((scope) => ({ category: scope.category, purpose: scope.purpose })),
    duration: 'ongoing',
    expiresAt: null,
    useLimit: null,
  } as never).can;
}
