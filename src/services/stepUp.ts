/**
 * E84 B on the phone: confirm on the spot with an e-mail code instead of signing in again
 * (contract `shared/types/auth-step-up.ts`; REQ-backend-073 / 075 answers: the phone does `email_code` only).
 * The first caller will be the in-chat approval card (D2, REQ-backend-094: payments above the step-up
 * threshold need a recent sign-in).
 *
 * - `GET /api/auth/step-up/methods` first. No usable e-mail code (no e-mail on the account, mail is down,
 *   passkey only): the caller offers 到网页上确认 and 重新登录 instead (`web_only`).
 * - `start` sends the code; `finish` returns a fresh token for the same user (`iat` now). Only a decoded
 *   `finish` answer counts as confirmed; the caller then replaces the session token (stepUpSession.ts).
 * - Same failure names as the web client (`frontend/lib/auth/step-up.ts`); 429 waits `retryAfterSeconds`
 *   (body or `Retry-After`), whatever the code.
 * - A wrong code is a 401 `step_up_invalid`: this client never treats it as "signed out".
 * No React Native import: the transport and the token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  AUTH_STEP_UP_EMAIL_CODE_PATTERN,
  AUTH_STEP_UP_ERROR_CODES,
  AUTH_STEP_UP_SCHEMA_VERSION,
  decodeAuthStepUpFinishResponseV1,
  decodeAuthStepUpMethodsResponseV1,
  decodeAuthStepUpStartResponseV1,
  isRecentSignInRequiredErrorV1,
  type AuthStepUpFinishResponseV1,
  type AuthStepUpMethodsResponseV1,
  type AuthStepUpMethodUnavailableReasonV1,
} from '../../shared/types/auth-step-up';

export type StepUpFailureV1 = 'invalid' | 'method_unavailable' | 'email_unavailable' | 'rate_limited' | 'not_allowed' | 'unavailable';

export class StepUpError extends Error {
  readonly failure: StepUpFailureV1;
  readonly retryAfterSeconds: number | null;
  constructor(failure: StepUpFailureV1, retryAfterSeconds: number | null = null) {
    super(failure);
    this.name = 'StepUpError';
    this.failure = failure;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A business answer that asks for a recent sign-in (only 403 `STEP_UP_REQUIRED` + `recent_sign_in_required`). */
export function needsStepUp(status: number, body: unknown): boolean {
  const raw = body as Record<string, unknown> | null;
  const inner = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  return isRecentSignInRequiredErrorV1(status, raw) || isRecentSignInRequiredErrorV1(status, inner);
}

export type StepUpPlanV1 =
  | { kind: 'email_code' }
  /** No e-mail code on the phone: offer 到网页上确认 and 重新登录. */
  | { kind: 'web_only'; reason: AuthStepUpMethodUnavailableReasonV1 | 'passkey_only' | 'unknown' };

export function planStepUp(methods: AuthStepUpMethodsResponseV1 | null): StepUpPlanV1 {
  const email = methods?.methods.find((m) => m.method === 'email_code');
  if (email?.available) return { kind: 'email_code' };
  if (email && 'reason' in email) return { kind: 'web_only', reason: email.reason };
  if (methods?.methods.some((m) => m.method === 'passkey' && m.available)) return { kind: 'web_only', reason: 'passkey_only' };
  return { kind: 'web_only', reason: 'unknown' };
}

function failureOf(code: string | null): StepUpFailureV1 {
  switch (code) {
    case AUTH_STEP_UP_ERROR_CODES.invalid:
      return 'invalid';
    case AUTH_STEP_UP_ERROR_CODES.methodUnavailable:
      return 'method_unavailable';
    case AUTH_STEP_UP_ERROR_CODES.emailUnavailable:
      return 'email_unavailable';
    case AUTH_STEP_UP_ERROR_CODES.rateLimited:
      return 'rate_limited';
    case AUTH_STEP_UP_ERROR_CODES.notAllowed:
      return 'not_allowed';
    default:
      return 'unavailable';
  }
}

function payloadOf(response: HttpResponseV1): unknown {
  const body = response.body as Record<string, unknown> | undefined;
  return body && typeof body === 'object' && body.data && typeof body.data === 'object' && !('schemaVersion' in body) ? body.data : body;
}

export interface MobileStepUpClientV1 {
  methods(): Promise<AuthStepUpMethodsResponseV1>;
  startEmailCode(): Promise<{ stepUpRef: string; maskedEmail: string; resendAfterSeconds: number; expiresAt: string }>;
  finishEmailCode(stepUpRef: string, code: string): Promise<AuthStepUpFinishResponseV1>;
}

export function createMobileStepUpClient(deps: { transport: HttpTransportV1; baseUrl: string; token: () => string | null | undefined }): MobileStepUpClientV1 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new StepUpError('not_allowed');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new StepUpError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const parsed = parseApiErrorBodyV1(payloadOf(response));
      const header = Number(response.headers?.['retry-after'] ?? response.headers?.['Retry-After']);
      const retryAfter = parsed.retryAfterSeconds ?? (Number.isInteger(header) && header > 0 ? header : null);
      throw new StepUpError(response.status === 429 ? 'rate_limited' : failureOf(parsed.code), retryAfter);
    }
    return payloadOf(response);
  };
  return {
    async methods() {
      const decoded = decodeAuthStepUpMethodsResponseV1(await call('GET', '/auth/step-up/methods'));
      if (!decoded) throw new StepUpError('unavailable');
      return decoded;
    },
    async startEmailCode() {
      const decoded = decodeAuthStepUpStartResponseV1(
        await call('POST', '/auth/step-up/start', { schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION, method: 'email_code' }),
      );
      if (!decoded || decoded.method !== 'email_code') throw new StepUpError('unavailable');
      return { stepUpRef: decoded.stepUpRef, maskedEmail: decoded.maskedEmail, resendAfterSeconds: decoded.resendAfterSeconds, expiresAt: decoded.expiresAt };
    },
    async finishEmailCode(stepUpRef, code) {
      const digits = code.replace(/\s+/g, '');
      // Checked before sending: a malformed code never uses up one of the five tries.
      if (!AUTH_STEP_UP_EMAIL_CODE_PATTERN.test(digits)) throw new StepUpError('invalid');
      const decoded = decodeAuthStepUpFinishResponseV1(
        await call('POST', '/auth/step-up/finish', { schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION, stepUpRef, method: 'email_code', code: digits }),
      );
      if (!decoded) throw new StepUpError('unavailable');
      return decoded;
    },
  };
}

export const STEP_UP_COPY = {
  title: { zh: '确认是你本人', en: 'Confirm it is you' },
  sent: (maskedEmail: string) => ({ zh: `验证码已发到 ${maskedEmail}，10 分钟内有效。`, en: `A code was sent to ${maskedEmail}. It works for 10 minutes.` }),
  codePlaceholder: { zh: '6 位验证码', en: '6-digit code' },
  confirm: { zh: '确认', en: 'Confirm' },
  resend: { zh: '重新发送', en: 'Send again' },
  resendIn: (seconds: number) => ({ zh: `${seconds} 秒后可以重新发送`, en: `Send again in ${seconds}s` }),
  cancel: { zh: '取消', en: 'Cancel' },
  onWeb: { zh: '到网页上确认', en: 'Confirm on the web' },
  signInAgain: { zh: '重新登录', en: 'Sign in again' },
  webOnly: {
    zh: '这个账户现在不能在手机上用邮箱验证码确认。可以到网页上确认，或者重新登录。',
    en: 'This account cannot confirm with an e-mail code on the phone right now. Confirm on the web, or sign in again.',
  },
} as const;

export const STEP_UP_FAILURE_COPY: Readonly<Record<StepUpFailureV1, { zh: string; en: string }>> = {
  invalid: { zh: '验证码不对或已过期，请重新输入。', en: 'The code is wrong or expired. Try again.' },
  method_unavailable: { zh: '这个账户没有可用的邮箱。', en: 'This account has no usable e-mail.' },
  email_unavailable: { zh: '现在发不了验证码。', en: 'Codes cannot be sent right now.' },
  rate_limited: { zh: '尝试太多次，请稍后再试。', en: 'Too many tries. Try again later.' },
  not_allowed: { zh: '这次登录不能在这里确认，请重新登录。', en: 'This session cannot be confirmed here. Sign in again.' },
  unavailable: { zh: '暂时连不上，请稍后再试。', en: 'Not reachable right now. Try again later.' },
};

/** After these failures the sheet switches to 到网页上确认 / 重新登录. */
export function stepUpFallsBackToWeb(failure: StepUpFailureV1): boolean {
  return failure === 'method_unavailable' || failure === 'email_unavailable' || failure === 'not_allowed';
}
