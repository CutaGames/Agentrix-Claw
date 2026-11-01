/**
 * 登录方式按服务端配置显示（E86，合同 v0 草案；I-055）。
 *
 * `GET /api/auth/providers`：不用登录，返回每种登录方式现在能不能用。三端的登录页和二次确认框据此决定显示
 * 哪几个按钮，不再写死。只回"能不能用"，不回任何配置值（client id、回调地址、密钥都不出现）。
 *
 * - 主入口（E84 A）：`email_code`、`google`、`apple`，按 `AUTH_PROVIDER_PRIMARY_V1` 的顺序；其余放在"更多方式"。
 *   不可用的方式不显示。
 * - `email_code` 只有在发信服务配好了、验证码存在各进程共享的 Redis 里、而且没被运维关掉
 *   （`AUTH_EMAIL_CODE_DISABLED=1`）时才可用。不可用时，二次确认框也不要提供"邮箱验证码"。
 * - `apple` 分两种：`browserRedirect`（网页跳 Apple，需要网页的 Services ID 和签名钥匙）、`nativeSdk`
 *   （iOS 原生登录，需要 bundle id 当 audience）。其他方式只有 `browserRedirect`，`wallet` / `password` 两个都是
 *   false（它们不跳转，也不用原生 SDK）。
 * - `handoff`（每种方式）/ `handoffIssue`（整体）：服务端认不认 E84 C 的 `handoff_client`（REQ-backend-076.re-mobile）。
 *   客户端只在 `handoff === true` 时带 `handoff_client` 发起，否则走旧流程；旧后端没有这两个字段，解码成 false。
 *   只有发起记录存在各进程共享的 Redis 里、而且没被运维关掉（`AUTH_HANDOFF_DISABLED=1`）时才是 true；
 *   Apple 只有网页跳转（`browserRedirect`）能 handoff，原生 SDK 不经过这里。
 *   `handoffIssue` 表示有 `POST /api/auth/handoff/issue`（网页转手机）。
 * - 响应可以缓存 60 秒（`Cache-Control: public, max-age=60`）。
 * - 读失败或认不出时（E86 补充，I-058）：主入口只放 `google`，"更多方式"只放 `password`，用
 *   `splitAuthProvidersV1(null)` 得到，三端不各写一套。邮箱验证码只在服务端说可用时才显示：读不到接口的时候，
 *   正是不知道发信和 Redis 好不好的时候。Google 真没配时点了只会回到登录页报错，不会误登录。
 */
export const AUTH_PROVIDERS_SCHEMA_VERSION = 1 as const;

export const AUTH_PROVIDERS_ROUTE = 'GET /api/auth/providers' as const; // → AuthProvidersResponseV1

export const AUTH_PROVIDER_IDS = ['email_code', 'google', 'apple', 'discord', 'x', 'telegram', 'wallet', 'password'] as const;
export type AuthProviderIdV1 = (typeof AUTH_PROVIDER_IDS)[number];

/** 主入口的顺序（E84 A）。 */
export const AUTH_PROVIDER_PRIMARY_V1: readonly AuthProviderIdV1[] = ['email_code', 'google', 'apple'];

/** 不可用的原因（给界面挑文案，不是配置值）。 */
export const AUTH_PROVIDER_UNAVAILABLE_REASONS = ['not_configured', 'mail_unavailable', 'codes_not_shared', 'disabled'] as const;
export type AuthProviderUnavailableReasonV1 = (typeof AUTH_PROVIDER_UNAVAILABLE_REASONS)[number];

export interface AuthProviderStatusV1 {
  id: AuthProviderIdV1;
  available: boolean;
  /** 不可用时才有。 */
  reason?: AuthProviderUnavailableReasonV1;
  /** 走服务端的 `GET /api/auth/<provider>` 跳转登录（可以带 E84 C 的 `handoff_client`）。 */
  browserRedirect: boolean;
  /** 客户端原生 SDK 拿到服务商 token，再交给 `POST /api/auth/social/token-login` 或 Apple 的 `native-login`。 */
  nativeSdk: boolean;
  /** 跳转登录时可以带 `handoff_client`，回调只给一次性 code（E84 C）。解码结果里一定有；旧后端没有时是 false。 */
  handoff?: boolean;
}

export interface AuthProvidersResponseV1 {
  schemaVersion: typeof AUTH_PROVIDERS_SCHEMA_VERSION;
  /** 每个 `AUTH_PROVIDER_IDS` 恰好一项，顺序同 `AUTH_PROVIDER_IDS`。 */
  providers: AuthProviderStatusV1[];
  /** 有没有 `POST /api/auth/handoff/issue`（网页转手机）。解码结果里一定有；旧后端没有时是 false。 */
  handoffIssue?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 客户端用：解码响应。认不出的项丢掉；缺的方式按不可用处理。整体认不出时返回 null（交给 `splitAuthProvidersV1(null)` 兜底）。
 */
export function decodeAuthProvidersResponseV1(value: unknown): AuthProvidersResponseV1 | null {
  if (!isRecord(value) || value.schemaVersion !== AUTH_PROVIDERS_SCHEMA_VERSION || !Array.isArray(value.providers)) return null;
  const byId = new Map<AuthProviderIdV1, AuthProviderStatusV1>();
  for (const item of value.providers) {
    if (!isRecord(item) || !(AUTH_PROVIDER_IDS as readonly unknown[]).includes(item.id) || typeof item.available !== 'boolean') continue;
    const id = item.id as AuthProviderIdV1;
    if (byId.has(id)) continue;
    const reason = (AUTH_PROVIDER_UNAVAILABLE_REASONS as readonly unknown[]).includes(item.reason)
      ? (item.reason as AuthProviderUnavailableReasonV1)
      : undefined;
    byId.set(id, {
      id,
      available: item.available,
      ...(item.available ? {} : { reason: reason ?? 'not_configured' }),
      browserRedirect: item.available && item.browserRedirect === true,
      nativeSdk: item.available && item.nativeSdk === true,
      handoff: item.available && item.browserRedirect === true && item.handoff === true,
    });
  }
  return {
    schemaVersion: AUTH_PROVIDERS_SCHEMA_VERSION,
    providers: AUTH_PROVIDER_IDS.map(
      (id) => byId.get(id) ?? { id, available: false, reason: 'not_configured', browserRedirect: false, nativeSdk: false, handoff: false },
    ),
    handoffIssue: value.handoffIssue === true,
  };
}

/** 客户端用：这种方式能不能用一次性 code 登录（读不到接口、旧后端、不可用都是 false，走旧流程）。 */
export function authProviderSupportsHandoffV1(response: AuthProvidersResponseV1 | null, id: AuthProviderIdV1): boolean {
  return !!response?.providers.some((p) => p.id === id && p.available && p.browserRedirect && p.handoff === true);
}

/** 读不到或认不出 `/auth/providers` 时显示的方式（I-058）。 */
export const AUTH_PROVIDERS_FALLBACK_V1: { readonly primary: readonly AuthProviderIdV1[]; readonly more: readonly AuthProviderIdV1[] } = {
  primary: ['google'],
  more: ['password'],
};

/** 界面用：分成主入口和"更多方式"，只含可用的；传 `null`（读不到）时给 `AUTH_PROVIDERS_FALLBACK_V1`。 */
export function splitAuthProvidersV1(response: AuthProvidersResponseV1 | null): { primary: AuthProviderIdV1[]; more: AuthProviderIdV1[] } {
  if (!response) return { primary: [...AUTH_PROVIDERS_FALLBACK_V1.primary], more: [...AUTH_PROVIDERS_FALLBACK_V1.more] };
  const available = new Set(response.providers.filter((p) => p.available).map((p) => p.id));
  return {
    primary: AUTH_PROVIDER_PRIMARY_V1.filter((id) => available.has(id)),
    more: AUTH_PROVIDER_IDS.filter((id) => available.has(id) && !AUTH_PROVIDER_PRIMARY_V1.includes(id)),
  };
}
