/**
 * L8 1a A1: ending sessions on purpose ("sign out of all devices", an operator freezing an account).
 *
 * Every user session token (JWT) may carry `tv`, the user's token version at the time it was signed. The server keeps
 * one counter per user in `user_token_versions` (migration 2032; no row means 0). "Sign out of all devices" and an
 * operator freeze add 1; a token whose `tv` is below the counter stops working. A token with no `tv` counts as 0, so
 * nobody is signed out by turning the switch on. Switches (all off unless exactly '1'):
 *
 * - AUTH_TOKEN_VERSION_V1_ENABLED: tokens carry `tv`, `tv` is enforced, POST /auth/logout-all exists.
 * - AUTH_USER_STATUS_ENFORCE_V1_ENABLED: an account whose status is suspended / frozen / closed / banned cannot sign
 *   in and is refused everywhere a credential is checked (JWT, sockets, /claude/chat, MCP, API keys).
 * The two are independent of each other.
 *
 * Sessions are JWTs. API keys are not sessions: "sign out of all devices" does not revoke them (the response says how
 * many are still active so the client can say so), and a freeze does refuse them.
 */

/** The token claim that carries the version. */
export const SESSION_TOKEN_VERSION_CLAIM_V1 = 'tv';

export const SESSION_REVOCATION_REASONS_V1 = ['logout_all', 'admin_freeze', 'password_change', 'security'] as const;
export type SessionRevocationReasonV1 = (typeof SESSION_REVOCATION_REASONS_V1)[number];

/** `users.status` values that are refused when AUTH_USER_STATUS_ENFORCE_V1_ENABLED is on. */
export const SESSION_INACTIVE_USER_STATUSES_V1 = ['suspended', 'frozen', 'closed', 'banned'] as const;

export const SESSION_ERROR_CODES_V1 = {
  /** 401: the token was signed before the user ended their sessions. */
  tokenRevoked: 'token_revoked',
  /** 401 / 403: the account is not active. */
  userInactive: 'user_inactive',
  /** 503: the counter could not be written (nothing was changed or pretended). */
  revocationUnavailable: 'session_revocation_unavailable',
  /** 403: POST /auth/logout-all must carry an Authorization header, not only the cookie. */
  logoutAllRequiresBearer: 'logout_all_requires_bearer',
} as const;

/** `reasonCode` on a 503 from an operator freeze: the status is set, the connected sessions were not cut yet; retry. */
export const SESSION_STATUS_APPLIED_NOT_CUT_V1 = 'status_applied_sessions_not_cut';

/** Error codes after which a client should drop its saved session. */
export const SESSION_ENDED_CODES_V1: readonly string[] = [SESSION_ERROR_CODES_V1.tokenRevoked, SESSION_ERROR_CODES_V1.userInactive];

export function isSessionEndedCodeV1(code: unknown): boolean {
  return typeof code === 'string' && SESSION_ENDED_CODES_V1.includes(code);
}

/**
 * The existing support address: the web contact, help, privacy and terms pages and TWIN_SUPPORT_EMAIL already use it.
 * No new address.
 */
export const ACCOUNT_SUPPORT_EMAIL_V1 = 'support@agentrix.top';

/**
 * What a sign-in screen shows when the server refuses a frozen account (code `user_inactive`): one sentence in the UI
 * language plus a way to reach us. The server's own message stays mixed-language for older app builds (D8).
 */
export const SESSION_USER_INACTIVE_SIGN_IN_TEXT_V1: Readonly<{ zh: string; en: string }> = Object.freeze({
  zh: `这个账号已停用，暂时不能登录。如有疑问，请联系我们：${ACCOUNT_SUPPORT_EMAIL_V1}`,
  en: `This account is suspended, so you can't sign in right now. If you have questions, contact us at ${ACCOUNT_SUPPORT_EMAIL_V1}.`,
});

/**
 * The mixed-language `message` the server puts on a `user_inactive` refusal (session-revocation.service.ts and
 * jwt.strategy.ts; D8: it stays as it is for older app builds). A browser redirect after Google / Apple / Discord / X
 * sign-in carries only this text in `error`, not the code, so the callback pages recognise the account being frozen by it
 * (L8-13 item 10) and show `SESSION_USER_INACTIVE_SIGN_IN_TEXT_V1` instead.
 */
export const SESSION_USER_INACTIVE_SERVER_MESSAGE_V1 = '账号当前不可用 / This account is not active.';

/** True when `text` is (or contains) the server's `user_inactive` message. Anything that is not a string is false. */
export function isUserInactiveMessageV1(text: unknown): boolean {
  return typeof text === 'string' && text.includes(SESSION_USER_INACTIVE_SERVER_MESSAGE_V1);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * True when `error` is the server's "account not active" refusal: a plain object or an Error whose `code` is
 * `user_inactive`, or one carrying a plain-object `body` with that code. Anything else is false; never throws.
 */
export function isUserInactiveErrorV1(error: unknown): boolean {
  try {
    if (!(error instanceof Error) && !isPlainRecord(error)) return false;
    const record = error as unknown as Record<string, unknown>;
    if (record.code === SESSION_ERROR_CODES_V1.userInactive) return true;
    return isPlainRecord(record.body) && record.body.code === SESSION_ERROR_CODES_V1.userInactive;
  } catch {
    return false;
  }
}

export interface LogoutAllRequestV1 {
  /** Default true: this device gets a new token and stays signed in. */
  keepCurrent?: boolean;
}

export interface LogoutAllResponseV1 {
  ok: true;
  tokenVersion: number;
  /** Only when this device stays signed in. It keeps the original sign-in time (`auth_time`). */
  access_token?: string;
  /** API keys that are still active (not touched by this call); null when it could not be counted. */
  activeApiKeys: number | null;
}
