/**
 * loginOptions — which sign-in methods the phone shows, and in what order (E84 A, E86; I-049, I-051, I-052;
 * `briefs/login-simplify-v1.md`).
 *
 * The server says which methods it can serve right now (`GET /api/auth/providers`, contract
 * `shared/types/auth-providers.ts`); the split into main buttons and "更多方式" comes from the contract's own
 * `splitAuthProvidersV1`, so the phone, the Web and the desktop cannot drift. A method the server cannot serve
 * is not shown. What the phone adds:
 * - Apple: on iOS it needs `nativeSdk` or `browserRedirect`; on Android only `browserRedirect` (no native SDK).
 * - "连接私有龙虾实例" (a self-hosted OpenClaw) does not depend on this server's configuration: always under
 *   "更多方式", last.
 * - "先逛逛" (guest) is always shown by the screen.
 * Pure, so the layout is pinned by a test.
 */
import {
  AUTH_PROVIDER_PRIMARY_V1,
  splitAuthProvidersV1,
  type AuthProviderIdV1,
  type AuthProvidersResponseV1,
} from '../../shared/types/auth-providers';

export type LoginMethodId = 'google' | 'apple' | 'email_code' | 'email_password' | 'wallet' | 'x' | 'discord' | 'telegram' | 'openclaw';

export interface LoginMethod {
  id: LoginMethodId;
  label: { zh: string; en: string };
  /** A one- or two-character mark drawn in a circle next to the label. */
  mark: string;
  /** Literal, so the Maestro selector check can find it. */
  testId: string;
}

export const LOGIN_METHODS: Readonly<Record<LoginMethodId, LoginMethod>> = {
  email_code: { id: 'email_code', label: { zh: '用邮箱验证码继续', en: 'Continue with an email code' }, mark: '@', testId: 'login-email-code' },
  google: { id: 'google', label: { zh: '用 Google 继续', en: 'Continue with Google' }, mark: 'G', testId: 'login-google' },
  apple: { id: 'apple', label: { zh: '用 Apple 继续', en: 'Continue with Apple' }, mark: 'A', testId: 'login-apple' },
  email_password: { id: 'email_password', label: { zh: '邮箱和密码', en: 'Email and password' }, mark: '✉', testId: 'login-email-password' },
  wallet: { id: 'wallet', label: { zh: '连接钱包', en: 'Connect a wallet' }, mark: 'W', testId: 'login-wallet' },
  x: { id: 'x', label: { zh: 'X', en: 'X' }, mark: 'X', testId: 'login-x' },
  discord: { id: 'discord', label: { zh: 'Discord', en: 'Discord' }, mark: 'D', testId: 'login-discord' },
  telegram: { id: 'telegram', label: { zh: 'Telegram', en: 'Telegram' }, mark: 'T', testId: 'login-telegram' },
  openclaw: { id: 'openclaw', label: { zh: '连接私有龙虾实例', en: 'Self-hosted OpenClaw instance' }, mark: 'O', testId: 'login-openclaw' },
};

/** Contract id → the phone's method. */
const FROM_CONTRACT: Readonly<Record<AuthProviderIdV1, LoginMethodId>> = {
  email_code: 'email_code',
  google: 'google',
  apple: 'apple',
  discord: 'discord',
  x: 'x',
  telegram: 'telegram',
  wallet: 'wallet',
  password: 'email_password',
};

/** Display order inside "更多方式" (the contract decides which, the phone decides the order). */
const MORE_ORDER: readonly LoginMethodId[] = ['email_password', 'wallet', 'x', 'discord', 'telegram'];

export interface LoginLayout {
  primary: LoginMethod[];
  more: LoginMethod[];
}

export function loginLayout(providers: AuthProvidersResponseV1 | null, platform: string): LoginLayout {
  const split = splitAuthProvidersV1(providers);
  const apple = providers?.providers.find((item) => item.id === 'apple');
  const appleUsable = !!apple && apple.available && (apple.browserRedirect || (platform === 'ios' && apple.nativeSdk));
  const usable = (id: AuthProviderIdV1) => id !== 'apple' || appleUsable;
  const primaryIds = split.primary.filter(usable).map((id) => FROM_CONTRACT[id]);
  const moreSet = new Set(split.more.filter(usable).map((id) => FROM_CONTRACT[id]));
  return {
    primary: primaryIds.map((id) => LOGIN_METHODS[id]),
    more: [...MORE_ORDER.filter((id) => moreSet.has(id)), 'openclaw' as const].map((id) => LOGIN_METHODS[id]),
  };
}

/** The main-button order the contract uses, re-exported for the screen's comment and the tests. */
export const LOGIN_PRIMARY_ORDER = AUTH_PROVIDER_PRIMARY_V1;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{4,8}$/;

export function isLoginEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isLoginCode(value: string): boolean {
  return CODE.test(value.trim());
}

export const EMAIL_CODE_RESEND_SECONDS = 60;
