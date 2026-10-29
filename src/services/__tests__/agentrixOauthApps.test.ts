/**
 * L8 3A E1 on the phone (services/agentrixOauthApps.ts, components/SignInAppsCard.tsx): the list of apps signed in to with
 * Agentrix, and disconnect. Same route and decoder as web and desktop; allowing an app is web only.
 */
import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1 } from '../../../shared/client/transport';
import type { AgentrixOauthConnectedAppV1 } from '../../../shared/types/agentrix-oauth';
import { AgentrixOauthAppsError, agentrixOauthEnabled, createMobileAgentrixOauthAppsClient } from '../agentrixOauthApps';

const PASS = `pass_${'b'.repeat(32)}`;
const app: AgentrixOauthConnectedAppV1 = {
  schemaVersion: 1,
  clientId: 'https://app.example/client.json',
  clientKind: 'metadata_document',
  clientName: 'Example App',
  passId: PASS,
  scopes: [{ category: 'agent_profile', purpose: 'answer_user_question' }],
  connectedAt: '2026-10-20T10:00:00.000Z',
  lastUsedAt: null,
};

function client(status: number, body: unknown, token: string | null = 't') {
  const calls: HttpRequestV1[] = [];
  const transport = {
    request: jest.fn(async (req: HttpRequestV1): Promise<HttpResponseV1> => {
      calls.push(req);
      return { status, headers: {}, body };
    }),
  };
  return { calls, transport, api: createMobileAgentrixOauthAppsClient({ transport, baseUrl: 'https://api.example.test/api/', token: () => token }) };
}

const failureOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AgentrixOauthAppsError ? error.failure : 'other';
  }
};

describe('mobile apps signed in with Agentrix (L8 3A E1)', () => {
  it('is on only for exactly 1, and the passport screen mounts the card behind that switch', () => {
    expect(agentrixOauthEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', ' 1', 1]) expect(agentrixOauthEnabled(value)).toBe(false);
    const screen = fs.readFileSync(path.resolve(__dirname, '../../screens/four-zone/TwinPassportScreen.tsx'), 'utf8');
    expect(screen).toContain('{AGENTRIX_OAUTH_ENABLED ? <SignInAppsCard /> : null}');
  });

  it('lists with the bearer token through the shared decoder', async () => {
    const c = client(200, { items: [app] });
    await expect(c.api.list()).resolves.toEqual([app]);
    expect(c.calls[0]).toMatchObject({ method: 'GET', path: 'https://api.example.test/api/oauth/connected-apps', headers: { Authorization: 'Bearer t', 'X-Agentrix-Surface': 'mobile' } });
  });

  it('404 is closed, an extra field or a non-list is unreadable, a network error is unavailable, no session sends nothing', async () => {
    expect(await failureOf(client(404, null).api.list())).toBe('closed');
    expect(await failureOf(client(200, { items: [{ ...app, extra: 1 }] }).api.list())).toBe('unreadable');
    expect(await failureOf(client(200, { items: 'no' }).api.list())).toBe('unreadable');
    expect(await failureOf(client(500, null).api.list())).toBe('unavailable');
    const signedOut = client(200, { items: [] }, null);
    expect(await failureOf(signedOut.api.list())).toBe('no_session');
    expect(signedOut.transport.request).not.toHaveBeenCalled();
  });

  it('revoke posts to the Pass’s own address, refuses a bad id without a request, and needs revoked:true', async () => {
    const c = client(200, { revoked: true });
    await expect(c.api.revoke(PASS)).resolves.toBeUndefined();
    expect(c.calls[0]).toMatchObject({ method: 'POST', path: `https://api.example.test/api/oauth/connected-apps/${PASS}/revoke` });
    expect(await failureOf(c.api.revoke('../../x'))).toBe('invalid');
    expect(c.transport.request).toHaveBeenCalledTimes(1);
    expect(await failureOf(client(200, { revoked: false }).api.revoke(PASS))).toBe('unreadable');
    expect(await failureOf(client(409, null).api.revoke(PASS))).toBe('invalid');
  });
});
