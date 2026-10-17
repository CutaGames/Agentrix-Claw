import type { HttpTransportV1 } from '../../../shared/client/transport';
import { AgentMailboxError, agentMailboxEnabled, createMobileAgentMailboxClient } from '../agentMailbox';

const AGENT = '11111111-2222-4333-8444-555555555555';
const ADDRESS = 'agx-0123456789abcdef@agentmail.to';
const DRAFT = {
  draftRef: `amd_${'a'.repeat(32)}`,
  agentAccountId: AGENT,
  from: ADDRESS,
  to: 'ann@client.example',
  subject: 'Re: Quote',
  text: 'Hi',
  createdAt: '2026-10-07T06:00:00.000Z',
  expiresAt: '2026-10-07T06:30:00.000Z',
};
const MESSAGE = { messageRef: '<m1@mail.example>', from: 'Ann <ann@client.example>', subject: 'Quote', preview: 'Can you', receivedAt: null as string | null };

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
  createMobileAgentMailboxClient({ transport, baseUrl: 'https://api.example.test/api/', token: () => token });

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AgentMailboxError ? error.failure : `other:${String(error)}`;
  }
  return 'resolved';
}

describe('phone Agent mailbox client', () => {
  it('the switch is on only for the exact value 1', () => {
    expect(agentMailboxEnabled('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', 1]) expect(agentMailboxEnabled(v)).toBe(false);
  });

  it('uses the contract routes with the owner token and decodes every answer', async () => {
    const { requests, transport } = transportReturning(
      { status: 200, body: { agentAccountId: AGENT, address: ADDRESS } },
      { status: 200, body: { agentAccountId: AGENT, address: ADDRESS } },
      { status: 200, body: [MESSAGE] },
      { status: 200, body: [DRAFT] },
      { status: 200, body: { sent: true, messageRef: '<s1@agentmail.to>' } },
      { status: 200, body: { discarded: true } },
    );
    const c = client(transport);
    await expect(c.status(AGENT)).resolves.toEqual({ agentAccountId: AGENT, address: ADDRESS });
    await expect(c.open(AGENT)).resolves.toEqual({ agentAccountId: AGENT, address: ADDRESS });
    await expect(c.messages(AGENT)).resolves.toEqual([MESSAGE]);
    await expect(c.drafts(AGENT)).resolves.toEqual([DRAFT]);
    await expect(c.send(DRAFT.draftRef)).resolves.toEqual({ sent: true, messageRef: '<s1@agentmail.to>' });
    await expect(c.discard(DRAFT.draftRef)).resolves.toBeUndefined();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET https://api.example.test/api/agent-mailbox?agentAccountId=${AGENT}`,
      'POST https://api.example.test/api/agent-mailbox',
      `GET https://api.example.test/api/agent-mailbox/messages?agentAccountId=${AGENT}`,
      `GET https://api.example.test/api/agent-mailbox/drafts?agentAccountId=${AGENT}`,
      `POST https://api.example.test/api/agent-mailbox/drafts/${DRAFT.draftRef}/send`,
      `DELETE https://api.example.test/api/agent-mailbox/drafts/${DRAFT.draftRef}`,
    ]);
    expect(requests[1].body).toEqual({ agentAccountId: AGENT });
    expect(requests[0].headers).toMatchObject({ Authorization: 'Bearer t0k', 'X-Agentrix-Surface': 'mobile' });
  });

  it('negative: malformed ids never reach a path, and no token sends nothing', async () => {
    const { requests, transport } = transportReturning();
    expect(await failure(client(transport).status('../admin'))).toBe('not_found');
    expect(await failure(client(transport).send('amd_../../x'))).toBe('not_found');
    expect(await failure(client(transport).discard('nope'))).toBe('not_found');
    expect(await failure(client(transport, null).status(AGENT))).toBe('no_session');
    expect(requests).toHaveLength(0);
  });

  it('maps statuses and refuses what it cannot read', async () => {
    const { transport } = transportReturning(
      { status: 401, body: {} },
      { status: 404, body: { code: 'AGENT_MAILBOX_NOT_FOUND' } },
      { status: 503, body: {} },
      new Error('offline'),
      { status: 200, body: [{ ...MESSAGE, receivedAt: 'yesterday' }] },
      { status: 200, body: { sent: 'yes' } },
    );
    const c = client(transport);
    expect(await failure(c.status(AGENT))).toBe('not_allowed');
    expect(await failure(c.status(AGENT))).toBe('not_found');
    expect(await failure(c.status(AGENT))).toBe('unavailable');
    expect(await failure(c.status(AGENT))).toBe('unavailable');
    expect(await failure(c.messages(AGENT))).toBe('unreadable');
    expect(await failure(c.send(DRAFT.draftRef))).toBe('unreadable');
  });
});
