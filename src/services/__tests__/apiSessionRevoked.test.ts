/**
 * L8 1a A1: when the server says this sign-in was ended on purpose (`token_revoked`: signed out of all devices;
 * `user_inactive`: account frozen) the app signs this device out. Anything else, including an ordinary 401, only throws
 * the server's message as before. An app with no handler registered (an older build, a screen under test) is unaffected.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { apiFetch, setApiConfig, setSessionRevokedHandler } from '../api';

function respond(status: number, body: unknown, raw?: string) {
  const text = raw ?? JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) } as unknown as Response;
}

describe('apiFetch · session ended on purpose', () => {
  const realFetch = global.fetch;
  const handler = jest.fn();

  beforeEach(() => {
    handler.mockReset();
    setApiConfig({ baseUrl: 'https://api.example/api', token: 'tok' });
    setSessionRevokedHandler(handler as unknown as () => void);
  });
  afterEach(() => {
    global.fetch = realFetch;
    setSessionRevokedHandler(null);
  });

  it.each(['token_revoked', 'user_inactive'])('401 %s calls the handler once and still throws the server\'s message', async (code) => {
    global.fetch = jest.fn(async () => respond(401, { code, message: 'Your sign-in was ended.' })) as unknown as typeof fetch;
    await expect(apiFetch('/anything')).rejects.toThrow('Your sign-in was ended.');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('an ordinary 401, a 403, a 500, an HTML error page and a 200 never call it', async () => {
    const answers = [
      respond(401, { message: 'Unauthorized' }),
      respond(401, { code: 'something_else', message: 'no' }),
      respond(403, { code: 'token_revoked', message: 'wrong status' }),
      respond(500, { code: 'user_inactive', message: 'wrong status' }),
      respond(502, null, '<html>Bad Gateway</html>'),
    ];
    for (const answer of answers) {
      global.fetch = jest.fn(async () => answer) as unknown as typeof fetch;
      await expect(apiFetch('/anything')).rejects.toThrow();
    }
    global.fetch = jest.fn(async () => respond(200, { ok: true })) as unknown as typeof fetch;
    await expect(apiFetch('/anything')).resolves.toEqual({ ok: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a 403 user_inactive (frozen sign-in) rejects with code and status, message unchanged, and does not call the handler', async () => {
    global.fetch = jest.fn(async () => respond(403, { code: 'user_inactive', message: '账号当前不可用 / This account is not active.' })) as unknown as typeof fetch;
    const error = (await apiFetch('/auth/login').then(() => null, (e) => e)) as Error & { status?: number; code?: string };
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('账号当前不可用 / This account is not active.');
    expect(error.status).toBe(403);
    expect(error.code).toBe('user_inactive');
    expect(handler).not.toHaveBeenCalled();
  });

  it('an HTML 502 carries the status only', async () => {
    global.fetch = jest.fn(async () => respond(502, null, '<html>Bad Gateway</html>')) as unknown as typeof fetch;
    const error = (await apiFetch('/anything').then(() => null, (e) => e)) as Error & { status?: number; code?: string };
    expect(error.status).toBe(502);
    expect(error).not.toHaveProperty('code');
  });

  it('with no handler registered, the same 401 only throws (as before)', async () => {
    setSessionRevokedHandler(null);
    global.fetch = jest.fn(async () => respond(401, { code: 'token_revoked', message: 'ended' })) as unknown as typeof fetch;
    await expect(apiFetch('/anything')).rejects.toThrow('ended');
  });

  it('a handler that throws does not change the error the caller gets', async () => {
    setSessionRevokedHandler(() => {
      throw new Error('handler bug');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => respond(401, { code: 'user_inactive', message: 'frozen' })) as unknown as typeof fetch;
    await expect(apiFetch('/anything')).rejects.toThrow('frozen');
    warn.mockRestore();
  });
});
