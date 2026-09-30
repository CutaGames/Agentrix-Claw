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
 * - 响应可以缓存 60 秒（`Cache-Control: public, max-age=60`）。读失败时，客户端退回只显示 `password`，
 *   不要猜。
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
}

export interface AuthProvidersResponseV1 {
  schemaVersion: typeof AUTH_PROVIDERS_SCHEMA_VERSION;
  /** 每个 `AUTH_PROVIDER_IDS` 恰好一项，顺序同 `AUTH_PROVIDER_IDS`。 */
  providers: AuthProviderStatusV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 客户端用：解码响应。认不出的项丢掉；缺的方式按不可用处理。整体认不出时返回 null（退回只显示 `password`）。
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
    });
  }
  return {
    schemaVersion: AUTH_PROVIDERS_SCHEMA_VERSION,
    providers: AUTH_PROVIDER_IDS.map(
      (id) => byId.get(id) ?? { id, available: false, reason: 'not_configured', browserRedirect: false, nativeSdk: false },
    ),
  };
}

/** 界面用：分成主入口和"更多方式"，只含可用的。 */
export function splitAuthProvidersV1(response: AuthProvidersResponseV1 | null): { primary: AuthProviderIdV1[]; more: AuthProviderIdV1[] } {
  if (!response) return { primary: [], more: ['password'] };
  const available = new Set(response.providers.filter((p) => p.available).map((p) => p.id));
  return {
    primary: AUTH_PROVIDER_PRIMARY_V1.filter((id) => available.has(id)),
    more: AUTH_PROVIDER_IDS.filter((id) => available.has(id) && !AUTH_PROVIDER_PRIMARY_V1.includes(id)),
  };
}
