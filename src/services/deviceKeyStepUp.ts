/**
 * deviceKeyStepUp — D16 as changed by the owner on 10-07: a loosening action is confirmed on the phone with face /
 * fingerprint + this phone's device key, instead of sending the owner to the web. The server side is the `device_key`
 * step-up method (`shared/types/auth-step-up.ts`, AUTH_STEP_UP_DEVICE_KEY_V0_ENABLED): the server hands out a one-time
 * challenge, the phone key (unlocked only by biometrics, `phoneDeviceKeyNative`) signs authStepUpDeviceKeyMessageV1, and
 * the server answers with a fresh sign-in token, which is what the loosening routes check ("signed in within 10 minutes").
 *
 * Pure over an injected transport, signer and token sink, so it runs under jest; `deviceKeyStepUpSession.ts` binds it to
 * the app. Nothing is retried silently: a cancelled prompt, a phone that is not registered or a refused signature ends the
 * attempt with a reason the screen can show.
 */
import {
  AUTH_STEP_UP_SCHEMA_VERSION,
  authStepUpDeviceKeyMessageV1,
  decodeAuthStepUpFinishResponseV1,
  decodeAuthStepUpStartResponseV1,
  isRecentSignInRequiredErrorV1,
} from '../../shared/types/auth-step-up';
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';

export interface DeviceKeyStepUpDeps {
  transport: HttpTransportV1;
  /** Absolute API base ending in `/api`. */
  baseUrl: string;
  token: string;
  /** This phone's registered device id (the enrollment's), or null when it never registered a key. */
  deviceId: string | null;
  /** Signs with the phone key after the biometric prompt; P1363 base64url. Throws `user_cancelled` when the owner cancels. */
  sign: (message: string) => Promise<string>;
}

export type DeviceKeyStepUpResult =
  | { kind: 'done'; accessToken: string; authIssuedAt: number }
  | { kind: 'unavailable'; reason: 'not_registered' | 'method_off' | 'this_phone_not_listed' }
  | { kind: 'cancelled' }
  | { kind: 'refused' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'failed'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function headers(token: string): Record<string, string> {
  return { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' };
}

function dataOf(body: unknown): unknown {
  return isRecord(body) && 'data' in body && isRecord(body.data) ? body.data : body;
}

export async function stepUpWithDeviceKey(deps: DeviceKeyStepUpDeps): Promise<DeviceKeyStepUpResult> {
  if (!deps.deviceId) return { kind: 'unavailable', reason: 'not_registered' };
  let start: HttpResponseV1;
  try {
    start = await deps.transport.request({
      method: 'POST',
      path: `${deps.baseUrl}/auth/step-up/start`,
      headers: headers(deps.token),
      body: { schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION, method: 'device_key' },
    });
  } catch {
    return { kind: 'failed', reason: 'network' };
  }
  if (start.status === 409) return { kind: 'unavailable', reason: 'method_off' };
  if (start.status === 429) {
    const retry = isRecord(start.body) && typeof start.body.retryAfterSeconds === 'number' ? start.body.retryAfterSeconds : 60;
    return { kind: 'rate_limited', retryAfterSeconds: retry };
  }
  if (start.status < 200 || start.status >= 300) return { kind: 'failed', reason: `start_http_${start.status}` };
  const challenge = decodeAuthStepUpStartResponseV1(dataOf(start.body));
  if (!challenge || challenge.method !== 'device_key') return { kind: 'failed', reason: 'start_malformed' };
  // The server lists the devices whose key it will accept; a phone not on it does not prompt the owner at all.
  if (!challenge.deviceIds.includes(deps.deviceId)) return { kind: 'unavailable', reason: 'this_phone_not_listed' };

  let signature: string;
  try {
    signature = await deps.sign(authStepUpDeviceKeyMessageV1({ stepUpRef: challenge.stepUpRef, challenge: challenge.challenge, deviceId: deps.deviceId }));
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return code === 'user_cancelled' ? { kind: 'cancelled' } : { kind: 'failed', reason: 'sign_failed' };
  }

  let finish: HttpResponseV1;
  try {
    finish = await deps.transport.request({
      method: 'POST',
      path: `${deps.baseUrl}/auth/step-up/finish`,
      headers: headers(deps.token),
      body: { schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION, stepUpRef: challenge.stepUpRef, method: 'device_key', deviceId: deps.deviceId, signature },
    });
  } catch {
    return { kind: 'failed', reason: 'network' };
  }
  if (finish.status === 401) return { kind: 'refused' };
  if (finish.status < 200 || finish.status >= 300) return { kind: 'failed', reason: `finish_http_${finish.status}` };
  const done = decodeAuthStepUpFinishResponseV1(dataOf(finish.body));
  return done ? { kind: 'done', accessToken: done.accessToken, authIssuedAt: done.authIssuedAt } : { kind: 'failed', reason: 'finish_malformed' };
}

/** The server offers the device-key method to this account (switch on, at least one phone with an active key). */
export function deviceKeyStepUpListed(methods: { methods: Array<{ method: string; available: boolean }> } | null): boolean {
  return !!methods?.methods.some((m) => m.method === 'device_key' && m.available);
}

export type StepUpRetryOutcome =
  | { kind: 'response'; response: HttpResponseV1; steppedUp: boolean }
  | { kind: 'step_up_failed'; result: Exclude<DeviceKeyStepUpResult, { kind: 'done' }> };

/**
 * Sends `call(token)`; when the server answers 403 recent_sign_in_required, steps up with the device key, hands the new
 * token to `onToken` (the app stores it) and sends the same call once more with it. Any other answer comes back as is.
 */
export async function withDeviceKeyStepUp(
  call: (token: string) => Promise<HttpResponseV1>,
  deps: DeviceKeyStepUpDeps & { onToken: (accessToken: string) => Promise<void> | void },
): Promise<StepUpRetryOutcome> {
  const first = await call(deps.token);
  if (!isRecentSignInRequiredErrorV1(first.status, first.body)) return { kind: 'response', response: first, steppedUp: false };
  const result = await stepUpWithDeviceKey(deps);
  if (result.kind !== 'done') return { kind: 'step_up_failed', result };
  await deps.onToken(result.accessToken);
  return { kind: 'response', response: await call(result.accessToken), steppedUp: true };
}
