import type { HttpTransportV1 } from '../../../shared/client/transport';
import { ComposioConnectError, composioConnectMobileEnabled, createMobileComposioConnectClient } from '../composioConnect';

const REF = `cxn_${'b'.repeat(32)}`;
const VIEW = { connectionRef: REF, toolkit: 'gmail', status: 'pending', createdAt: '2026-10-07T06:00:00.000Z', connectedAt: null, statusCheckedAt: null };
const LIST = { schemaVersion: 0, configured: true, available: ['gmail', 'googlecalendar'], items: [VIEW] };
const STARTED = { schemaVersion: 0, connectionRef: REF, toolkit: 'gmail', redirectUrl: 'https://connect.composio.dev/link/abc', expiresAt: '2026-10-07T06:10:00.000Z' };

function transportReturning(...answers: Array<{ status: number; body: unknown } | Error>) {
  const requests: Array<{ method: string; path: string; body?: unknown; headers?: Record<string, string> }> = [];
  const transport = {
    request: jest.fn(async (req: { method: string; path: string; body?: unknown; headers?: Record<string, string> }) => {
      requests.push(req);
      const next = answers.shift() ?? { status: 500, body: null };
      if (next instanceof Error) throw next;
      return { status: next.status, headers: {}, body: next.body };
    }),
  } as unknown as HttpTransportV1;
  return { requests, transport };
}

const client = (transport: HttpTransportV1, token: string | null = 't0k') =>
  createMobileComposioConnectClient({ transport, baseUrl: 'https://api.example.test/api', token: () => token });

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ComposioConnectError ? error.failure : `other:${String(error)}`;
  }
  return 'resolved';
}

describe('phone connected apps client (A9)', () => {
  it('the switch is on only for the exact value 1', () => {
    expect(composioConnectMobileEnabled('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true']) expect(composioConnectMobileEnabled(v)).toBe(false);
  });

  it('lists, connects, re-checks and disconnects over the contract routes with the owner token', async () => {
    const { requests, transport } = transportReturning(
      { status: 200, body: LIST },
      { status: 200, body: STARTED },
      { status: 200, body: { ...VIEW, status: 'active', connectedAt: '2026-10-07T06:01:00.000Z' } },
      { status: 200, body: { ...VIEW, status: 'revoked' } },
    );
    const c = client(transport);
    await expect(c.list()).resolves.toMatchObject({ configured: true, items: [{ connectionRef: REF }] });
    await expect(c.connect('gmail')).resolves.toMatchObject({ redirectUrl: 'https://connect.composio.dev/link/abc' });
    await expect(c.refresh(REF)).resolves.toMatchObject({ status: 'active' });
    await expect(c.disconnect(REF)).resolves.toMatchObject({ status: 'revoked' });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET https://api.example.test/api/composio-connect/connections',
      'POST https://api.example.test/api/composio-connect/connections',
      `POST https://api.example.test/api/composio-connect/connections/${REF}/refresh`,
      `DELETE https://api.example.test/api/composio-connect/connections/${REF}`,
    ]);
    expect(requests[1].body).toEqual({ toolkit: 'gmail' });
    expect(requests[0].headers).toMatchObject({ Authorization: 'Bearer t0k', 'X-Agentrix-Surface': 'mobile' });
  });

  it('negative: a sign-in page that is not Composio\'s own is never handed to the browser', async () => {
    const { transport } = transportReturning(
      { status: 200, body: { ...STARTED, redirectUrl: 'https://connect.composio.dev.evil.example/link' } },
      { status: 200, body: { ...STARTED, redirectUrl: 'http://connect.composio.dev/link' } },
      { status: 200, body: { ...STARTED, toolkit: 'github' } },
    );
    const c = client(transport);
    expect(await failure(c.connect('gmail'))).toBe('unreadable');
    expect(await failure(c.connect('gmail'))).toBe('unreadable');
    expect(await failure(c.connect('gmail'))).toBe('unreadable');
  });

  it('negative: malformed refs and unknown apps never reach a request; no token sends nothing', async () => {
    const { requests, transport } = transportReturning();
    expect(await failure(client(transport).refresh('../x'))).toBe('not_found');
    expect(await failure(client(transport).disconnect('cxn_short'))).toBe('not_found');
    expect(await failure(client(transport).connect('slack' as never))).toBe('not_found');
    expect(await failure(client(transport, null).list())).toBe('no_session');
    expect(requests).toHaveLength(0);
  });

  it('maps the server answers to what the owner is told', async () => {
    const { transport } = transportReturning(
      { status: 409, body: { code: 'COMPOSIO_CONNECT_ALREADY_CONNECTED' } },
      { status: 429, body: {} },
      { status: 503, body: { code: 'COMPOSIO_CONNECT_NOT_CONFIGURED' } },
      { status: 503, body: {} },
      { status: 403, body: {} },
      new Error('offline'),
    );
    const c = client(transport);
    expect(await failure(c.connect('gmail'))).toBe('already_connected');
    expect(await failure(c.connect('gmail'))).toBe('busy');
    expect(await failure(c.connect('gmail'))).toBe('not_configured');
    expect(await failure(c.list())).toBe('unavailable');
    expect(await failure(c.list())).toBe('not_allowed');
    expect(await failure(c.list())).toBe('unavailable');
  });
});
