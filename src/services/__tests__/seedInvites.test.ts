import type { HttpRequestV1, HttpResponseV1 } from '../../../shared/client/transport';
import {
  SeedInvitesError,
  createMobileSeedInvitesClient,
  seedInviteShareLink,
  seedInvitesEnabled,
} from '../seedInvites';

const member = { member: true, root: false, quota: 3, codes: [{ code: 'ABCDEFGHJK', status: 'open', redeemedAt: null }] };

function client(response: HttpResponseV1 | Error, token: string | null = 't') {
  const requests: HttpRequestV1[] = [];
  const transport = {
    request: jest.fn(async (req: HttpRequestV1) => {
      requests.push(req);
      if (response instanceof Error) throw response;
      return response;
    }),
  };
  return { requests, api: createMobileSeedInvitesClient({ transport, baseUrl: 'https://api.agentrix.top/api/', token: () => token }) };
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof SeedInvitesError ? error.failure : 'other';
  }
}

describe('mobile seed invites (L6-11)', () => {
  it('is on only when the flag is exactly 1', () => {
    expect(seedInvitesEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', 1]) expect(seedInvitesEnabled(value)).toBe(false);
  });

  it('reads the caller\'s view with the bearer token and the mobile surface header', async () => {
    const { api, requests } = client({ status: 200, headers: {}, body: member });
    await expect(api.mine()).resolves.toEqual(member);
    expect(requests[0]).toMatchObject({
      method: 'GET',
      path: 'https://api.agentrix.top/api/seed-invites',
      headers: { Authorization: 'Bearer t', 'X-Agentrix-Surface': 'mobile' },
    });
  });

  it('maps a closed server, unreadable bodies, no session and network trouble', async () => {
    expect(await failureOf(client({ status: 404, headers: {}, body: { success: false, code: 'NotFoundException', message: 'x' } }).api.mine())).toBe('closed');
    expect(await failureOf(client({ status: 200, headers: {}, body: { member: false, root: true, quota: 0, codes: [] } }).api.mine())).toBe('unreadable');
    expect(await failureOf(client({ status: 200, headers: {}, body: member }, null).api.mine())).toBe('no_session');
    expect(await failureOf(client(new Error('offline')).api.mine())).toBe('unavailable');
  });

  it('redeems a normalized code, never sends a malformed one, and maps refusals', async () => {
    const ok = client({ status: 200, headers: {}, body: { member: true } });
    await expect(ok.api.redeem(' abcde-fghjk ')).resolves.toBeUndefined();
    expect(ok.requests[0]).toMatchObject({ method: 'POST', path: 'https://api.agentrix.top/api/seed-invites/redeem', body: { code: 'ABCDEFGHJK' } });
    const none = client({ status: 200, headers: {}, body: { member: true } });
    expect(await failureOf(none.api.redeem('<script>'))).toBe('invalid_code');
    expect(none.requests).toHaveLength(0);
    expect(await failureOf(client({ status: 404, headers: {}, body: { success: false, code: 'SEED_INVITE_NOT_FOUND', message: 'x' } }).api.redeem('ZZZZZZZZZZ'))).toBe('not_found');
    expect(await failureOf(client({ status: 409, headers: {}, body: { success: false, code: 'SEED_INVITE_ALREADY_MEMBER', message: 'x' } }).api.redeem('ZZZZZZZZZZ'))).toBe('already_member');
  });

  it('shares the profile link that pre-fills the code on the web', () => {
    expect(seedInviteShareLink('ABCDEFGHJK')).toBe('https://agentrix.top/console/settings/profile?invite=ABCDEFGHJK');
  });
});
