import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { TWIN_FIND_REFUSAL_CODES_V0, TWIN_FIND_SCHEMA_VERSION_V0, type TwinFindRequestV0 } from '../../../shared/types/twin-find';
import { TWIN_FIND_FAILURE_COPY, TWIN_FIND_REFUSAL_COPY, TwinFindError, createMobileTwinFindClient, isTwinFindMobileEnabled } from '../twinFind';

const BASE = 'https://api.example/api';
const ID = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const BRIDGE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const CODE = 'AbCdEfGhIjKlMnOpQrSt_-';
const T0 = '2026-11-17T08:00:00.000Z';
const T3 = '2026-11-20T08:00:00.000Z';
const HEAD = { schemaVersion: TWIN_FIND_SCHEMA_VERSION_V0, status: 'open', topic: 'home', question: '谁认识靠谱的装修师傅？', endsAt: T3 };
const ASKER = {
  ...HEAD,
  id: ID,
  role: 'asker',
  closedReason: null,
  createdAt: T0,
  closedAt: null,
  people: [
    { ref: 'b:1', label: '老张', state: 'offered', offer: { displayName: '李师傅', line: '做了十年旧房翻新', note: '我家就是他装的', verified: true }, connectedAt: null },
    { ref: 'b:2', label: '阿 May', state: 'waiting', offer: null, connectedAt: null },
  ],
};
const BRIDGE = {
  ...HEAD,
  id: ID,
  role: 'bridge',
  askerName: '小周',
  createdAt: T0,
  myState: 'asked',
  picked: null,
  picksLeft: 3,
  canPick: true,
  canDecline: true,
  canWithdraw: false,
  canRelink: false,
  suggestions: [{ ref: 'rel:9', label: '李师傅' }],
  connectedAt: null,
};
const PICKED = { ...BRIDGE, myState: 'picked', picked: { route: 'link', label: '李师傅', note: null }, picksLeft: 2, canPick: false, canDecline: false, canWithdraw: true, canRelink: true, suggestions: [] };
const INTRO = {
  ...HEAD,
  bridgeId: BRIDGE_ID,
  role: 'candidate',
  askerName: '小周',
  bridgeName: '老张',
  note: '我家就是他装的',
  myState: 'asked',
  myDisplayName: null,
  myLine: null,
  canConsent: true,
  canRevoke: false,
  connectedAt: null,
};
const AGREED = { ...INTRO, myState: 'agreed', myDisplayName: '李师傅', myLine: null, canConsent: false, canRevoke: true };
const REQUEST: TwinFindRequestV0 = { topic: 'home', question: HEAD.question, friendRefs: ['rel:1', 'rel:2'] };
const CJK = /[\u3400-\u9fff]/;

type Scripted = { status: number; body?: unknown } | Error;

function scripted(...responses: Scripted[]) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    async request(req) {
      calls.push(req);
      const next = responses.shift();
      if (next === undefined) throw new Error('no scripted response left');
      if (next instanceof Error) throw next;
      return { status: next.status, headers: {}, body: next.body };
    },
  };
  const client = createMobileTwinFindClient({ transport, baseUrl: `${BASE}/`, webOrigin: 'https://web.example/', token: () => 'tok' });
  return { calls, client };
}

const sent = (calls: HttpRequestV1[]) => calls.map((call) => [call.method, call.path.slice(BASE.length), call.body]);

async function failureOf(promise: Promise<unknown>): Promise<TwinFindError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TwinFindError) return error;
    throw error;
  }
  throw new Error('expected a TwinFindError');
}

describe('finding someone through friends on the phone', () => {
  it('is on only when the build sets EXPO_PUBLIC_TWIN_FIND=1', () => {
    expect(isTwinFindMobileEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', ' 1']) expect(isTwinFindMobileEnabled(value)).toBe(false);
  });

  it('sends signed-in mobile requests and reads the friends to ask', async () => {
    const friends = [{ friendRef: 'rel:1', label: '老张', tier: 'family' }];
    const { calls, client } = scripted({ status: 200, body: { friends } });
    await expect(client.friends()).resolves.toEqual(friends);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].path).toBe(`${BASE}/twin-find/friends`);
    expect(calls[0].headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
    expect(calls[0].body).toBeUndefined();
  });

  it('sends nothing without a session', async () => {
    const calls: HttpRequestV1[] = [];
    const transport: HttpTransportV1 = {
      async request(req) {
        calls.push(req);
        return { status: 200, headers: {}, body: {} };
      },
    };
    const client = createMobileTwinFindClient({ transport, baseUrl: BASE, webOrigin: 'https://web.example', token: () => null });
    expect((await failureOf(client.list())).failure).toBe('no_session');
    expect((await failureOf(client.start(REQUEST))).failure).toBe('no_session');
    expect(calls).toHaveLength(0);
  });

  it('starts a question with exactly the three fields, and reads a refusal as an answer', async () => {
    const routes = [
      { ref: 'rel:1', route: 'app' },
      { ref: 'rel:2', route: 'pair_weekly_limit' },
    ];
    const { calls, client } = scripted({ status: 201, body: { started: true, findId: ID, routes } }, { status: 201, body: { data: { started: false, code: 'asker_daily_limit' } } });
    await expect(client.start({ ...REQUEST, extra: 'x' } as TwinFindRequestV0)).resolves.toEqual({ started: true, findId: ID, routes });
    await expect(client.start(REQUEST)).resolves.toEqual({ started: false, code: 'asker_daily_limit' });
    expect(sent(calls)).toEqual([
      ['POST', '/twin-find', REQUEST],
      ['POST', '/twin-find', REQUEST],
    ]);
  });

  it('lists questions, older pages with before', async () => {
    const item = { id: ID, bridgeId: null, role: 'asker', status: 'open', topic: 'home', question: HEAD.question, createdAt: T0, endsAt: T3, needsMe: true, offers: 1, connected: 0 };
    const mine = { ...item, bridgeId: BRIDGE_ID, role: 'candidate', offers: null, connected: null };
    const { calls, client } = scripted({ status: 200, body: { items: [item, mine] } }, { status: 200, body: { items: [] } });
    await expect(client.list()).resolves.toEqual([item, mine]);
    await expect(client.list(T0)).resolves.toEqual([]);
    expect(sent(calls)).toEqual([
      ['GET', '/twin-find', undefined],
      ['GET', `/twin-find?before=${encodeURIComponent(T0)}`, undefined],
    ]);
  });

  it("reads the asker's view and posts each of the asker's actions to its own path", async () => {
    const connected = { ...ASKER, people: [{ ...ASKER.people[0], state: 'connected', connectedAt: T0 }, ASKER.people[1]] };
    const passed = { ...ASKER, people: [{ ref: 'b:1', label: '老张', state: 'passed', offer: null, connectedAt: null }, ASKER.people[1]] };
    const closed = { ...ASKER, status: 'closed', closedReason: 'asker_closed', closedAt: T0, people: [] };
    const { calls, client } = scripted({ status: 200, body: ASKER }, { status: 200, body: connected }, { status: 200, body: passed }, { status: 200, body: { data: closed } });
    await expect(client.get(ID)).resolves.toEqual(ASKER);
    await expect(client.accept(ID, 'b:1')).resolves.toEqual(connected);
    await expect(client.pass(ID, 'b:1')).resolves.toEqual(passed);
    await expect(client.close(ID)).resolves.toEqual(closed);
    expect(sent(calls)).toEqual([
      ['GET', `/twin-find/${ID}`, undefined],
      ['POST', `/twin-find/${ID}/accept`, { ref: 'b:1' }],
      ['POST', `/twin-find/${ID}/pass`, { ref: 'b:1' }],
      ['POST', `/twin-find/${ID}/close`, {}],
    ]);
  });

  it("posts the friend's actions and turns link codes into web links", async () => {
    const inApp = { ...PICKED, picked: { route: 'app', label: '李师傅', note: '我家就是他装的' }, canRelink: false };
    const declined = { ...BRIDGE, myState: 'declined', canDecline: false };
    const withdrawn = { ...BRIDGE, myState: 'withdrawn', picksLeft: 2, canDecline: false };
    const { calls, client } = scripted(
      { status: 200, body: BRIDGE },
      { status: 200, body: { view: inApp, link: null } },
      { status: 200, body: { view: PICKED, link: { code: CODE } } },
      { status: 200, body: { code: CODE } },
      { status: 200, body: withdrawn },
      { status: 200, body: declined },
    );
    await expect(client.get(ID)).resolves.toEqual(BRIDGE);
    await expect(client.pick(ID, { person: { kind: 'friend', ref: 'rel:9' }, note: '我家就是他装的' })).resolves.toEqual({ view: inApp, url: null });
    await expect(client.pick(ID, { person: { kind: 'guest', label: '李师傅' } })).resolves.toEqual({ view: PICKED, url: `https://web.example/find#${CODE}` });
    await expect(client.relink(ID)).resolves.toEqual({ url: `https://web.example/find#${CODE}` });
    await expect(client.withdraw(ID)).resolves.toEqual(withdrawn);
    await expect(client.decline(ID)).resolves.toEqual(declined);
    expect(sent(calls)).toEqual([
      ['GET', `/twin-find/${ID}`, undefined],
      ['POST', `/twin-find/${ID}/pick`, { person: { kind: 'friend', ref: 'rel:9' }, note: '我家就是他装的' }],
      ['POST', `/twin-find/${ID}/pick`, { person: { kind: 'guest', label: '李师傅' } }],
      ['POST', `/twin-find/${ID}/relink`, {}],
      ['POST', `/twin-find/${ID}/withdraw`, {}],
      ['POST', `/twin-find/${ID}/decline`, {}],
    ]);
  });

  it('lets the person introduced read, agree, say no and take it back', async () => {
    const { calls, client } = scripted(
      { status: 200, body: INTRO },
      { status: 200, body: { view: AGREED } },
      { status: 200, body: { view: { ...AGREED, myLine: '做了十年旧房翻新' } } },
      { status: 200, body: { view: null } },
      { status: 200, body: { data: { view: null } } },
    );
    await expect(client.intro(BRIDGE_ID)).resolves.toEqual(INTRO);
    await expect(client.consent(BRIDGE_ID, { decision: 'agree', displayName: '李师傅', line: null })).resolves.toEqual(AGREED);
    await expect(client.consent(BRIDGE_ID, { decision: 'agree', displayName: '李师傅', line: '做了十年旧房翻新' })).resolves.toEqual({ ...AGREED, myLine: '做了十年旧房翻新' });
    await expect(client.consent(BRIDGE_ID, { decision: 'decline' })).resolves.toBeNull();
    await expect(client.revoke(BRIDGE_ID)).resolves.toBeUndefined();
    expect(sent(calls)).toEqual([
      ['GET', `/twin-find/intro/${BRIDGE_ID}`, undefined],
      ['POST', `/twin-find/intro/${BRIDGE_ID}/consent`, { decision: 'agree', displayName: '李师傅' }],
      ['POST', `/twin-find/intro/${BRIDGE_ID}/consent`, { decision: 'agree', displayName: '李师傅', line: '做了十年旧房翻新' }],
      ['POST', `/twin-find/intro/${BRIDGE_ID}/consent`, { decision: 'decline' }],
      ['POST', `/twin-find/intro/${BRIDGE_ID}/revoke`, {}],
    ]);
  });

  it('does not send malformed ids and rejects answers about another question or the wrong side', async () => {
    const none = scripted();
    for (const bad of ['', 'abc', `${ID}/close`, '../friends']) {
      expect((await failureOf(none.client.get(bad))).failure).toBe('not_found');
      expect((await failureOf(none.client.pick(bad, { person: { kind: 'guest', label: '李师傅' } }))).failure).toBe('not_found');
      expect((await failureOf(none.client.intro(bad))).failure).toBe('not_found');
      expect((await failureOf(none.client.revoke(bad))).failure).toBe('not_found');
    }
    expect(none.calls).toHaveLength(0);

    const { client } = scripted(
      { status: 200, body: { ...ASKER, id: OTHER_ID } },
      { status: 200, body: BRIDGE },
      { status: 200, body: ASKER },
      { status: 200, body: { view: { ...PICKED, id: OTHER_ID }, link: null } },
      { status: 200, body: { ...INTRO, bridgeId: OTHER_ID } },
      { status: 200, body: { ...INTRO, bridgeId: null } },
      { status: 200, body: { view: { ...AGREED, bridgeId: OTHER_ID } } },
    );
    expect((await failureOf(client.get(ID))).failure).toBe('unreadable');
    expect((await failureOf(client.close(ID))).failure).toBe('unreadable');
    expect((await failureOf(client.decline(ID))).failure).toBe('unreadable');
    expect((await failureOf(client.pick(ID, { person: { kind: 'guest', label: '李师傅' } }))).failure).toBe('unreadable');
    expect((await failureOf(client.intro(BRIDGE_ID))).failure).toBe('unreadable');
    expect((await failureOf(client.intro(BRIDGE_ID))).failure).toBe('unreadable');
    expect((await failureOf(client.consent(BRIDGE_ID, { decision: 'agree', displayName: '李师傅', line: null }))).failure).toBe('unreadable');
  });

  it('does not accept a view that shows the person before they agreed, or a link that is not a link', async () => {
    const early = { ...ASKER, people: [{ ...ASKER.people[0], state: 'waiting' }] };
    const { client } = scripted({ status: 200, body: early }, { status: 200, body: { view: PICKED, link: { code: 'short' } } }, { status: 200, body: { code: `${CODE}x` } }, { status: 200, body: {} });
    expect((await failureOf(client.get(ID))).failure).toBe('unreadable');
    expect((await failureOf(client.pick(ID, { person: { kind: 'guest', label: '李师傅' } }))).failure).toBe('unreadable');
    expect((await failureOf(client.relink(ID))).failure).toBe('unreadable');
    expect((await failureOf(client.revoke(BRIDGE_ID))).failure).toBe('unreadable');
  });

  it('maps statuses to failures and keeps the rule a bad form broke', async () => {
    const { client } = scripted(
      { status: 400, body: { code: 'invalid_request', reasonCode: 'text_violation', field: 'pick.note' } },
      { status: 400, body: { code: 'invalid_request', reasonCode: 'made_up', field: 'pick.note' } },
      { status: 401 },
      { status: 403, body: { code: 'sign_in_required' } },
      { status: 404 },
      { status: 409, body: { code: 'closed' } },
      { status: 409, body: { code: 'pick_limit' } },
      { status: 409, body: { code: 'already_picked' } },
      { status: 409 },
      { status: 410 },
      { status: 429, body: { code: 'rate_limited' } },
      { status: 500 },
      new Error('offline'),
    );
    const invalid = await failureOf(client.pick(ID, { person: { kind: 'guest', label: '李师傅' }, note: 'x' }));
    expect([invalid.failure, invalid.reasonCode, invalid.field]).toEqual(['invalid', 'text_violation', 'pick.note']);
    const unknown = await failureOf(client.get(ID));
    expect([unknown.failure, unknown.reasonCode, unknown.field]).toEqual(['invalid', null, null]);
    const rest: string[] = [];
    for (let i = 0; i < 11; i += 1) rest.push((await failureOf(client.get(ID))).failure);
    expect(rest).toEqual(['not_allowed', 'not_allowed', 'not_found', 'closed', 'pick_limit', 'changed', 'changed', 'changed', 'too_many', 'unavailable', 'unavailable']);
  });

  it('has Chinese and English words for every failure and refusal', () => {
    for (const copy of [...Object.values(TWIN_FIND_FAILURE_COPY), ...Object.values(TWIN_FIND_REFUSAL_COPY)]) {
      expect(copy.en.trim().length).toBeGreaterThan(0);
      expect(CJK.test(copy.en)).toBe(false);
      expect(CJK.test(copy.zh)).toBe(true);
    }
    expect(Object.keys(TWIN_FIND_REFUSAL_COPY).sort()).toEqual([...TWIN_FIND_REFUSAL_CODES_V0].sort());
  });
});
