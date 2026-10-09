/**
 * D16 on the phone: the device-key step-up (face / fingerprint + this phone's key) and the "re-publish the twin" flow that
 * uses it. The phone signs only the server's exact message, only when its own device is listed, and a loosening call is
 * retried once with the fresh token and nothing else.
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { authStepUpDeviceKeyMessageV1 } from '../../../shared/types/auth-step-up';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { deviceKeyStepUpListed, stepUpWithDeviceKey, withDeviceKeyStepUp } from '../deviceKeyStepUp';
import { previewTwinRepublish, republishTwin, twinRepublishTopics } from '../twinRepublish';
import type { MobileTwinStatus } from '../twinStatus';

const AGENT = '2e697719-e3db-4c55-9361-2068482c473d';
const PHONE = 'android:3f2a9c';
const REF = `stu_${'a'.repeat(32)}`;
const START = { schemaVersion: 1, stepUpRef: REF, method: 'device_key', expiresAt: '2026-10-07T10:00:00.000Z', challenge: 'Q2hhbGxlbmdl', deviceIds: [PHONE] };
const FINISH = { schemaVersion: 1, accessToken: 'fresh-token', tokenType: 'Bearer', authIssuedAt: 1791370000, recentSignInValidSeconds: 600 };
const STEP_UP_403 = { status: 403, body: { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' } };

function fake(answer: (req: HttpRequestV1, n: number) => { status: number; body?: unknown }) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    request: async (req) => {
      calls.push(req);
      const { status, body } = answer(req, calls.length);
      return { status, headers: {}, body };
    },
  };
  return { transport, calls };
}

const route = (req: HttpRequestV1) => req.path.replace('https://api.example/api', '');
const deps = (transport: HttpTransportV1, over: Partial<{ deviceId: string | null; sign: (m: string) => Promise<string> }> = {}) => ({
  transport,
  baseUrl: 'https://api.example/api',
  token: 'old-token',
  deviceId: over.deviceId === undefined ? PHONE : over.deviceId,
  sign: over.sign ?? (jest.fn(async () => 'S'.repeat(86)) as (m: string) => Promise<string>),
});

describe('device-key step-up', () => {
  it('signs exactly the server message for this phone and returns the fresh token', async () => {
    const sign = jest.fn(async () => 'S'.repeat(86));
    const { transport, calls } = fake((req) => (route(req) === '/auth/step-up/start' ? { status: 200, body: START } : { status: 200, body: FINISH }));
    const result = await stepUpWithDeviceKey(deps(transport, { sign }));
    expect(result).toEqual({ kind: 'done', accessToken: 'fresh-token', authIssuedAt: 1791370000 });
    expect(sign).toHaveBeenCalledWith(authStepUpDeviceKeyMessageV1({ stepUpRef: REF, challenge: 'Q2hhbGxlbmdl', deviceId: PHONE }));
    expect(calls[0].body).toEqual({ schemaVersion: 1, method: 'device_key' });
    expect(calls[1].body).toEqual({ schemaVersion: 1, stepUpRef: REF, method: 'device_key', deviceId: PHONE, signature: 'S'.repeat(86) });
    expect(calls[1].headers?.Authorization).toBe('Bearer old-token');
  });

  it('negative: an unregistered phone sends nothing; a phone the server does not list never prompts', async () => {
    const none = fake(() => ({ status: 200, body: START }));
    expect(await stepUpWithDeviceKey(deps(none.transport, { deviceId: null }))).toEqual({ kind: 'unavailable', reason: 'not_registered' });
    expect(none.calls).toHaveLength(0);
    const sign = jest.fn(async () => 'S'.repeat(86));
    const other = fake(() => ({ status: 200, body: { ...START, deviceIds: ['android:someone-else'] } }));
    expect(await stepUpWithDeviceKey(deps(other.transport, { sign }))).toEqual({ kind: 'unavailable', reason: 'this_phone_not_listed' });
    expect(sign).not.toHaveBeenCalled();
    expect(other.calls).toHaveLength(1);
  });

  it('a cancelled prompt sends no finish; 409 is the method off; 401 on finish is refused; 429 carries the wait', async () => {
    const cancel = fake(() => ({ status: 200, body: START }));
    const cancelled = await stepUpWithDeviceKey(deps(cancel.transport, { sign: async () => Promise.reject(Object.assign(new Error('x'), { code: 'user_cancelled' })) }));
    expect(cancelled).toEqual({ kind: 'cancelled' });
    expect(cancel.calls).toHaveLength(1);
    expect(await stepUpWithDeviceKey(deps(fake(() => ({ status: 409 })).transport))).toEqual({ kind: 'unavailable', reason: 'method_off' });
    expect(await stepUpWithDeviceKey(deps(fake((req) => (route(req).endsWith('start') ? { status: 200, body: START } : { status: 401 })).transport))).toEqual({ kind: 'refused' });
    expect(await stepUpWithDeviceKey(deps(fake(() => ({ status: 429, body: { retryAfterSeconds: 42 } })).transport))).toEqual({ kind: 'rate_limited', retryAfterSeconds: 42 });
  });

  it('negative: a start answer for another method is not trusted', async () => {
    const passkey = fake(() => ({ status: 200, body: { ...START, method: 'passkey' } }));
    expect((await stepUpWithDeviceKey(deps(passkey.transport))).kind).toBe('failed');
  });

  it('the device-key method counts as offered only when the server lists it available', () => {
    expect(deviceKeyStepUpListed({ methods: [{ method: 'email_code', available: true }, { method: 'device_key', available: true }] })).toBe(true);
    expect(deviceKeyStepUpListed({ methods: [{ method: 'device_key', available: false }] })).toBe(false);
    expect(deviceKeyStepUpListed({ methods: [{ method: 'email_code', available: true }] })).toBe(false);
    expect(deviceKeyStepUpListed(null)).toBe(false);
  });

  it('the shared step-up sheet leads with face / fingerprint only in M0 + phone-key builds, keeps the e-mail code, and applies the token like a code', () => {
    const sheet = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components/StepUpSheet.tsx'), 'utf8');
    expect(sheet).toMatch(/export const DEVICE_KEY_STEP_UP_ON_PHONE = MOBILE_M0_ENABLED && PHONE_DEVICE_KEY_ENABLED;/);
    expect(sheet).toMatch(/if \(DEVICE_KEY_STEP_UP_ON_PHONE && deviceKeyStepUpListed\(methods\) && \(await thisPhoneHasDeviceKey\(\)\)\) \{/);
    expect(sheet).toMatch(/emailFallback: plan\.kind === 'email_code'/);
    expect(sheet).toMatch(/if \(result\.kind === 'done'\) \{\s*try \{\s*await applyStepUpToken\(result\.accessToken\);/);
    // Nothing is sent before the owner taps: the device phase does not start a step-up on its own.
    const devicePhase = sheet.slice(sheet.indexOf("phase.kind === 'device' ? ("), sheet.indexOf("phase.kind === 'code' || phase.kind === 'finishing' ? ("));
    expect(devicePhase).toMatch(/onPress=\{\(\) => void confirmWithDevice\(\)\}/);
    expect(devicePhase).toMatch(/onPress=\{\(\) => void send\(\)\}/);
  });

  it('retries a loosening call once with the fresh token, and only after recent_sign_in_required', async () => {
    const onToken = jest.fn(async () => undefined);
    const tokens: string[] = [];
    const { transport } = fake((req) => (route(req).endsWith('start') ? { status: 200, body: START } : { status: 200, body: FINISH }));
    const call = jest.fn(async (token: string) => {
      tokens.push(token);
      return tokens.length === 1 ? { ...STEP_UP_403, headers: {} } : { status: 200, headers: {}, body: { ok: true } };
    });
    const outcome = await withDeviceKeyStepUp(call, { ...deps(transport), onToken });
    expect(outcome).toMatchObject({ kind: 'response', steppedUp: true, response: { status: 200 } });
    expect(tokens).toEqual(['old-token', 'fresh-token']);
    expect(onToken).toHaveBeenCalledWith('fresh-token');

    const plain = jest.fn(async () => ({ status: 409, headers: {}, body: { code: 'VISIBILITY_PREVIEW_MISMATCH' } }));
    const passthrough = await withDeviceKeyStepUp(plain, { ...deps(transport), onToken });
    expect(passthrough).toMatchObject({ kind: 'response', steppedUp: false, response: { status: 409 } });
    expect(plain).toHaveBeenCalledTimes(1);
  });
});

const status = (over: Partial<MobileTwinStatus> = {}): MobileTwinStatus =>
  ({
    visibility: 'private',
    stopEpoch: 0,
    targets: [],
    outstanding: [],
    stoppedAt: null,
    published: false,
    publishedAt: null,
    topics: ['报价', '课程安排'],
    publicAvailable: true,
    publishBlockedBy: [],
    profileState: 'ready',
    shareRoute: null,
    ...over,
  }) as MobileTwinStatus;

describe('re-publishing the twin from the phone', () => {
  it('is offered only for a private twin that was public before, with nothing blocking', () => {
    expect(twinRepublishTopics(status())).toEqual(['报价', '课程安排']);
    expect(twinRepublishTopics(status({ topics: [] }))).toBeNull();
    expect(twinRepublishTopics(status({ visibility: 'public', published: true }))).toBeNull();
    expect(twinRepublishTopics(status({ visibility: 'paused' }))).toBeNull();
    expect(twinRepublishTopics(status({ publishBlockedBy: ['consent'] }))).toBeNull();
    expect(twinRepublishTopics(status({ publicAvailable: false }))).toBeNull();
    expect(twinRepublishTopics(null)).toBeNull();
  });

  it('previews the exact command, then publishes it with the digest, stepping up when the server asks', async () => {
    const seen: Array<{ path: string; token?: string; body: unknown }> = [];
    const { transport } = fake((req) => {
      seen.push({ path: route(req), token: req.headers?.Authorization, body: req.body });
      const p = route(req);
      if (p.endsWith('/public/preview')) return { status: 200, body: { success: true, data: { visibility: { previewDigest: 'vd1-abc', requiresStepUp: true } } } };
      if (p === '/auth/step-up/start') return { status: 200, body: START };
      if (p === '/auth/step-up/finish') return { status: 200, body: FINISH };
      return req.headers?.Authorization === 'Bearer fresh-token'
        ? { status: 200, body: { success: true, data: { status: 'applied', value: { schemaVersion: 1 } } } }
        : STEP_UP_403;
    });
    const preview = await previewTwinRepublish(AGENT, ['报价'], deps(transport));
    expect(preview).toEqual({ topics: ['报价'], previewDigest: 'vd1-abc', requiresStepUp: true });
    if (!('previewDigest' in preview)) return;
    const onToken = jest.fn(async () => undefined);
    expect(await republishTwin(AGENT, preview, { ...deps(transport), onToken })).toEqual({ kind: 'done', steppedUp: true });
    const publishes = seen.filter((s) => s.path === `/v1/agents/${AGENT}/twin/public`);
    expect(publishes.map((s) => s.token)).toEqual(['Bearer old-token', 'Bearer fresh-token']);
    expect(publishes[1].body).toEqual({ schemaVersion: 1, action: 'publish', topics: ['报价'], previewDigest: 'vd1-abc' });
    expect(seen[0].body).toEqual({ schemaVersion: 1, action: 'publish', topics: ['报价'] });
  });

  it('negative: a changed preview, a cancelled prompt or a broken preview never publishes', async () => {
    const preview = { topics: ['报价'], previewDigest: 'vd1-abc', requiresStepUp: true };
    const changed = fake(() => ({ status: 409, body: { code: 'VISIBILITY_PREVIEW_MISMATCH' } }));
    expect(await republishTwin(AGENT, preview, { ...deps(changed.transport), onToken: async () => undefined })).toEqual({ kind: 'changed' });
    const cancel = fake((req) => (route(req) === '/auth/step-up/start' ? { status: 200, body: START } : STEP_UP_403));
    const cancelled = await republishTwin(AGENT, preview, {
      ...deps(cancel.transport, { sign: async () => Promise.reject(Object.assign(new Error('x'), { code: 'user_cancelled' })) }),
      onToken: async () => undefined,
    });
    expect(cancelled).toEqual({ kind: 'step_up_failed', result: { kind: 'cancelled' } });
    expect(cancel.calls.filter((c) => route(c) === `/v1/agents/${AGENT}/twin/public`)).toHaveLength(1);
    const broken = fake(() => ({ status: 200, body: { success: true, data: { visibility: { previewDigest: '' } } } }));
    expect(await previewTwinRepublish(AGENT, ['报价'], deps(broken.transport))).toEqual({ kind: 'failed', reason: 'preview_malformed' });
  });

  it('the screen offers it only in M0 builds with the phone key, and confirms only from the preview', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens/four-zone/TwinStatusScreen.tsx'), 'utf8');
    expect(screen).toMatch(/export const TWIN_REPUBLISH_ON_PHONE = MOBILE_M0_ENABLED && PHONE_DEVICE_KEY_ENABLED;/);
    expect(screen).toMatch(/TWIN_REPUBLISH_ON_PHONE && twinRepublishTopics\(status\) && !republishPreview \?/);
    expect(screen).toMatch(/TWIN_REPUBLISH_ON_PHONE && republishPreview \? \(/);
    expect(screen.indexOf('republish.mutate(republishPreview)')).toBeGreaterThan(screen.indexOf('TWIN_REPUBLISH_ON_PHONE && republishPreview ? ('));
  });
});
