/**
 * loginOptions — which sign-in methods the phone shows, and in what order (E84 A, I-049;
 * `briefs/login-simplify-v1.md`).
 *
 * Three main buttons, the same as the Web: Google, Apple, email code. Email code is third until the
 * production code store moves to Redis and mail sending works again (E84 precondition). Everything
 * else is under "更多方式": email + password (existing accounts), wallet, X, Discord, Telegram and a
 * self-hosted OpenClaw instance. "先逛逛" (guest) stays. Pure, so the order is pinned by a test.
 */
export type LoginMethodId = 'google' | 'apple' | 'email_code' | 'email_password' | 'wallet' | 'x' | 'discord' | 'telegram' | 'openclaw';

export interface LoginMethod {
  id: LoginMethodId;
  label: { zh: string; en: string };
  /** A one- or two-character mark drawn in a circle next to the label. */
  mark: string;
  /** Literal, so the Maestro selector check can find it. */
  testId: string;
}

export const LOGIN_PRIMARY_METHODS: readonly LoginMethod[] = [
  { id: 'google', label: { zh: '用 Google 继续', en: 'Continue with Google' }, mark: 'G', testId: 'login-google' },
  { id: 'apple', label: { zh: '用 Apple 继续', en: 'Continue with Apple' }, mark: 'A', testId: 'login-apple' },
  { id: 'email_code', label: { zh: '用邮箱验证码继续', en: 'Continue with an email code' }, mark: '@', testId: 'login-email-code' },
];

export const LOGIN_MORE_METHODS: readonly LoginMethod[] = [
  { id: 'email_password', label: { zh: '邮箱和密码', en: 'Email and password' }, mark: '✉', testId: 'login-email-password' },
  { id: 'wallet', label: { zh: '连接钱包', en: 'Connect a wallet' }, mark: 'W', testId: 'login-wallet' },
  { id: 'x', label: { zh: 'X', en: 'X' }, mark: 'X', testId: 'login-x' },
  { id: 'discord', label: { zh: 'Discord', en: 'Discord' }, mark: 'D', testId: 'login-discord' },
  { id: 'telegram', label: { zh: 'Telegram', en: 'Telegram' }, mark: 'T', testId: 'login-telegram' },
  { id: 'openclaw', label: { zh: '连接私有龙虾实例', en: 'Self-hosted OpenClaw instance' }, mark: 'O', testId: 'login-openclaw' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{4,8}$/;

export function isLoginEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isLoginCode(value: string): boolean {
  return CODE.test(value.trim());
}

export const EMAIL_CODE_RESEND_SECONDS = 60;
