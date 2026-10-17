/**
 * E84 B on the phone (stepUp.ts; contract shared/types/auth-step-up.ts): e-mail code only, a wrong code
 * is not "signed out", 429 waits, and only a decoded finish answer counts.
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { decodeAuthStepUpFinishRequestV1, decodeAuthStepUpStartRequestV1 } from '../../../shared/types/auth-step-up';
import {
  STEP_UP_FAILURE_COPY,
  StepUpError,
  createMobileStepUpClient,
  needsStepUp,
  planStepUp,
  stepUpFallsBackToWeb,
} from '../stepUp';

const BASE = 'https://api.agentrix.top/api';
const REF = `stu_${'a'.repeat(32)}`;

function server(responses: Record<string, Partial<HttpResponseV1> | Error>) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    request: jest.fn(async (req: HttpRequestV1) => {
      calls.push(req);
      const key = `${req.method} ${req.path.replace(BASE, '')}`;
      const r = responses[key];
      if (r instanceof Error) throw r;
      if (!r) return { status: 404, headers: {}, body: {} };
      return { status: 200, headers: {}, body: undefined, ...r };
    }),
  };
  return { transport, calls };
}

const client = (transport: HttpTransportV1, token: string | null = 'jwt') => createMobileStepUpClient({ transport, baseUrl: `${BASE}/`, token: () => token });

const methods = (email: Record<string, unknown>, passkey: Record<string, unknown> = { method: 'passkey', available: false, reason: 'no_passkey' }) => ({
  schemaVersion: 1,
  methods: [{ method: 'email_code', ...email }, passkey],
});

describe('when to ask', () => {
  it('only 403 STEP_UP_REQUIRED + recent_sign_in_required, also wrapped in data', () => {
    const body = { success: false, code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' };
    expect(needsStepUp(403, body)).toBe(true);
    expect(needsStepUp(403, { data: body })).toBe(true);
    expect(needsStepUp(401, body)).toBe(false);
    expect(needsStepUp(403, { ...body, reasonCode: 'admin_step_up' })).toBe(false);
    expect(needsStepUp(403, null)).toBe(false);
  });

  it('e-mail code when the account can; otherwise the web or signing in again', () => {
    expect(planStepUp({ schemaVersion: 1, methods: [{ method: 'email_code', available: true }] })).toEqual({ kind: 'email_code' });
    expect(planStepUp({ schemaVersion: 1, methods: [{ method: 'email_code', available: false, reason: 'no_email' }] })).toEqual({ kind: 'web_only', reason: 'no_email' });
    expect(planStepUp({ schemaVersion: 1, methods: [{ method: 'passkey', available: true }] })).toEqual({ kind: 'web_only', reason: 'passkey_only' });
    expect(planStepUp(null)).toEqual({ kind: 'web_only', reason: 'unknown' });
  });
});

describe('the client', () => {
  it('methods → start → finish, with the exact bodies the server decoder accepts', async () => {
    const { transport, calls } = server({
      'GET /auth/step-up/methods': { body: methods({ available: true }) },
      'POST /auth/step-up/start': {
        body: { schemaVersion: 1, stepUpRef: REF, method: 'email_code', expiresAt: '2026-10-01T12:10:00Z', maskedEmail: 'z***@example.com', resendAfterSeconds: 60 },
      },
      'POST /auth/step-up/finish': { body: { schemaVersion: 1, accessToken: 'new-jwt', tokenType: 'Bearer', authIssuedAt: 1_790_000_000, recentSignInValidSeconds: 600 } },
    });
    const c = client(transport);
    expect(planStepUp(await c.methods())).toEqual({ kind: 'email_code' });
    expect(await c.startEmailCode()).toEqual({ stepUpRef: REF, maskedEmail: 'z***@example.com', resendAfterSeconds: 60, expiresAt: '2026-10-01T12:10:00Z' });
    expect(await c.finishEmailCode(REF, ' 123 456 ')).toMatchObject({ accessToken: 'new-jwt', authIssuedAt: 1_790_000_000 });
    expect(decodeAuthStepUpStartRequestV1(calls[1].body).ok).toBe(true);
    expect(decodeAuthStepUpFinishRequestV1(calls[2].body)).toEqual({ ok: true, value: { schemaVersion: 1, stepUpRef: REF, method: 'email_code', code: '123456' } });
    for (const call of calls) expect(call.headers?.Authorization).toBe('Bearer jwt');
  });

  it('a malformed code is refused before sending (no try used up)', async () => {
    const { transport, calls } = server({});
    await expect(client(transport).finishEmailCode(REF, '12345')).rejects.toMatchObject({ failure: 'invalid' });
    await expect(client(transport).finishEmailCode(REF, 'abcdef')).rejects.toMatchObject({ failure: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('error codes map like the web client; 429 always waits, from the body or Retry-After', async () => {
    const cases: Array<[Partial<HttpResponseV1>, string, number | null]> = [
      [{ status: 401, body: { success: false, code: 'step_up_invalid' } }, 'invalid', null],
      [{ status: 409, body: { success: false, code: 'step_up_method_unavailable' } }, 'method_unavailable', null],
      [{ status: 503, body: { success: false, code: 'step_up_email_unavailable' } }, 'email_unavailable', null],
      [{ status: 403, body: { success: false, code: 'step_up_not_allowed' } }, 'not_allowed', null],
      [{ status: 429, body: { success: false, code: 'step_up_rate_limited', retryAfterSeconds: 42 } }, 'rate_limited', 42],
      [{ status: 429, headers: { 'retry-after': '17' }, body: { success: false, code: 'THROTTLED' } }, 'rate_limited', 17],
      [{ status: 500, body: {} }, 'unavailable', null],
    ];
    for (const [response, failure, retry] of cases) {
      const { transport } = server({ 'POST /auth/step-up/finish': response });
      await expect(client(transport).finishEmailCode(REF, '123456')).rejects.toMatchObject({ failure, retryAfterSeconds: retry });
    }
    const offline = server({ 'GET /auth/step-up/methods': new Error('offline') });
    await expect(client(offline.transport).methods()).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('only a decoded answer counts: a finish without a token, or a start for another method, fails', async () => {
    const { transport } = server({
      'POST /auth/step-up/start': { body: { schemaVersion: 1, stepUpRef: REF, method: 'passkey', expiresAt: '2026-10-01T12:10:00Z', challenge: 'abc', rpId: 'agentrix.top', allowCredentialIds: [], timeoutMs: 60000 } },
      'POST /auth/step-up/finish': { body: { schemaVersion: 1, accessToken: '', tokenType: 'Bearer', authIssuedAt: 1, recentSignInValidSeconds: 600 } },
    });
    await expect(client(transport).startEmailCode()).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(client(transport).finishEmailCode(REF, '123456')).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('without a session there is nothing to confirm', async () => {
    const { transport, calls } = server({});
    await expect(client(transport, null).methods()).rejects.toMatchObject({ failure: 'not_allowed' });
    expect(calls).toHaveLength(0);
  });

  it('every failure has words; which ones fall back to the web', () => {
    for (const text of Object.values(STEP_UP_FAILURE_COPY)) {
      expect(text.zh.length).toBeGreaterThan(0);
      expect(text.en.length).toBeGreaterThan(0);
    }
    expect(stepUpFallsBackToWeb('email_unavailable')).toBe(true);
    expect(stepUpFallsBackToWeb('not_allowed')).toBe(true);
    expect(stepUpFallsBackToWeb('invalid')).toBe(false);
    expect(new StepUpError('invalid')).toBeInstanceOf(Error);
  });
});
