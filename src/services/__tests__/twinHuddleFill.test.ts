import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  TWIN_HUDDLE_FILL_CONFLICT_CODES_V0,
  TWIN_HUDDLE_FILL_INVITE_STATES_V0,
  TWIN_HUDDLE_FILL_MINE_STATES_V0,
  TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0,
  type TwinHuddleFillInviteItemV0,
  type TwinHuddleFillInviteV0,
  type TwinHuddleFillViewV0,
} from '../../../shared/types/twin-huddle-fill';
import { INTRODUCTION_NEED_REGIONS_V1 } from '../../../shared/types/introduction';
import { TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError } from '../twinHuddle';
import {
  TWIN_HUDDLE_FILL_CONFLICT_COPY,
  TWIN_HUDDLE_FILL_INVITE_COPY,
  TWIN_HUDDLE_FILL_MINE_COPY,
  TWIN_HUDDLE_FILL_REGION_COPY,
  TwinHuddleFillError,
  createMobileTwinHuddleFillClient,
  twinHuddleFillConflictOf,
  twinHuddleFillFailureWords,
  twinHuddleFillHeadcountWords,
  twinHuddleFillHintWords,
  twinHuddleFillInviteTitleWords,
  twinHuddleFillLabelProblem,
  twinHuddleFillOrganizerWords,
  twinHuddleFillShareWords,
  twinHuddleFillStartWords,
  twinHuddleFillSummaryWords,
  twinHuddleFillTriesWords,
  twinHuddleFillUntilWords,
} from '../twinHuddleFill';

const BASE = 'https://api.example/api';
const WEB = 'https://agentrix.example/';
const HUDDLE = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const OTHER_HUDDLE = '1c7a4d2f-3e5b-4a6c-9d0e-2f3a4b5c6d7e';
const PERSON = 'eeeeeeee-0000-4000-8000-000000000001';
const OTHER_PERSON = 'eeeeeeee-0000-4000-8000-000000000002';
const REL = 'rel:aaaaaaaa-0000-4000-8000-000000000001';
const CODE = 'abcdefghijklmnopqrstuv';
const CJK = /[\u3400-\u9fff]/;

const VIEW: TwinHuddleFillViewV0 = {
  schemaVersion: TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0,
  huddleId: HUDDLE,
  role: 'initiator',
  fill: { wanted: 2, accepted: 1, endsAt: '2026-11-21T03:00:00.000Z', state: 'open' },
  canStart: false,
  canEnd: true,
  people: [{ id: PERSON, bridgeRef: REL, label: 'Sam', verified: false, state: 'agreed', canDecide: true }],
  mine: [],
  canBring: false,
  triesLeft: 0,
};
const BRIDGE_VIEW: TwinHuddleFillViewV0 = {
  ...VIEW,
  role: 'bridge',
  canEnd: false,
  people: [],
  mine: [{ id: PERSON, route: 'app', friendRef: REL, state: 'waiting', canWithdraw: true }],
  canBring: false,
  triesLeft: 2,
};
const INVITE: TwinHuddleFillInviteV0 = {
  schemaVersion: TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0,
  id: PERSON,
  bridgeName: 'Bob',
  kind: 'meal',
  slot: { startAt: '2026-11-22T11:00:00.000Z', endAt: '2026-11-22T13:00:00.000Z' },
  region: 'sg_central',
  headcount: 3,
  state: 'waiting',
  initiatorName: null,
  label: null,
  canAnswer: true,
  canWithdraw: false,
};
const ITEMS: TwinHuddleFillInviteItemV0[] = [{ id: PERSON, kind: 'meal', startAt: '2026-11-22T11:00:00.000Z', state: 'waiting', needsMe: true }];

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
  const client = createMobileTwinHuddleFillClient({ transport, baseUrl: `${BASE}/`, webOrigin: WEB, token: () => 'tok' });
  return { calls, client };
}

const failure = async (run: Promise<unknown>): Promise<TwinHuddleError> => {
  try {
    await run;
  } catch (error) {
    if (error instanceof TwinHuddleError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
};

describe('mobile twin huddle fill client', () => {
  it('reads the fill of a plan with the bearer token and the mobile surface', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW });
    await expect(client.get(HUDDLE)).resolves.toEqual(VIEW);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${BASE}/twin-huddle/${HUDDLE}/fill`, headers: { Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' } });
    expect(calls[0].body).toBeUndefined();
  });

  it('also reads an answer wrapped in { data }', async () => {
    const { client } = scripted({ status: 200, body: { data: BRIDGE_VIEW } });
    await expect(client.get(HUDDLE)).resolves.toEqual(BRIDGE_VIEW);
  });

  it('starts with how many are wanted, and checks the count before asking the server', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW });
    await client.start(HUDDLE, 2);
    expect(calls[0]).toMatchObject({ method: 'POST', path: `${BASE}/twin-huddle/${HUDDLE}/fill`, body: { wanted: 2 } });
    for (const wanted of [0, 4, 1.5]) {
      const error = await failure(client.start(HUDDLE, wanted));
      expect(error).toMatchObject({ failure: 'invalid', field: 'body.wanted' });
    }
    expect(calls).toHaveLength(1);
  });

  it('ends, decides and takes back on their own routes', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW }, { status: 200, body: VIEW }, { status: 200, body: BRIDGE_VIEW });
    await client.end(HUDDLE);
    await client.decide(HUDDLE, PERSON, 'accept');
    await client.withdraw(HUDDLE, PERSON);
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', `${BASE}/twin-huddle/${HUDDLE}/fill/end`, {}],
      ['POST', `${BASE}/twin-huddle/${HUDDLE}/fill/decide`, { personId: PERSON, decision: 'accept' }],
      ['POST', `${BASE}/twin-huddle/${HUDDLE}/fill/withdraw`, { personId: PERSON }],
    ]);
  });

  it('brings someone from my own list in the app, or makes a link with the code only after the #', async () => {
    const { calls, client } = scripted({ status: 200, body: { view: BRIDGE_VIEW, route: 'app' } }, { status: 200, body: { view: BRIDGE_VIEW, route: 'link', code: CODE } });
    await expect(client.bring(HUDDLE, REL)).resolves.toEqual({ view: BRIDGE_VIEW, route: 'app' });
    await expect(client.bring(HUDDLE, null)).resolves.toEqual({ view: BRIDGE_VIEW, route: 'link', url: `https://agentrix.example/huddle/bring#${CODE}` });
    expect(calls.map((call) => [call.path, call.body])).toEqual([
      [`${BASE}/twin-huddle/${HUDDLE}/fill/bring`, { friendRef: REL }],
      [`${BASE}/twin-huddle/${HUDDLE}/fill/bring`, {}],
    ]);
  });

  it('someone from the list who cannot be asked in the app comes back as a link, with no reason given', async () => {
    const { client } = scripted({ status: 200, body: { view: BRIDGE_VIEW, route: 'link', code: CODE, reason: 'ignored' } });
    await expect(client.bring(HUDDLE, REL)).resolves.toEqual({ view: BRIDGE_VIEW, route: 'link', url: `https://agentrix.example/huddle/bring#${CODE}` });
  });

  it('never sends a pick that is not from a list', async () => {
    const { calls, client } = scripted();
    const error = await failure(client.bring(HUDDLE, 'bob'));
    expect(error).toMatchObject({ failure: 'invalid', field: 'body.friendRef' });
    expect(calls).toHaveLength(0);
  });

  it('a link answer without a code cannot be read', async () => {
    const { client } = scripted({ status: 200, body: { view: BRIDGE_VIEW, route: 'link' } });
    expect((await failure(client.bring(HUDDLE, null))).failure).toBe('unreadable');
  });

  it('lists where someone wants to bring me and reads one of them', async () => {
    const { calls, client } = scripted({ status: 200, body: { items: ITEMS } }, { status: 200, body: INVITE });
    await expect(client.invites()).resolves.toEqual(ITEMS);
    await expect(client.invite(PERSON)).resolves.toEqual(INVITE);
    expect(calls.map((call) => [call.method, call.path])).toEqual([
      ['GET', `${BASE}/twin-huddle/fill/invites`],
      ['GET', `${BASE}/twin-huddle/fill/invites/${PERSON}`],
    ]);
  });

  it('says yes with the name trimmed, or no without a name; a name that breaks the rules never leaves the phone', async () => {
    const { calls, client } = scripted({ status: 200, body: { ...INVITE, state: 'agreed', label: 'Sam', canAnswer: false, canWithdraw: true } }, { status: 200, body: { ...INVITE, state: 'declined', canAnswer: false } });
    await client.answer(PERSON, { decision: 'come', label: '  Sam ' });
    await client.answer(PERSON, { decision: 'decline' });
    expect(calls.map((call) => [call.path, call.body])).toEqual([
      [`${BASE}/twin-huddle/fill/invites/${PERSON}/answer`, { decision: 'come', label: 'Sam' }],
      [`${BASE}/twin-huddle/fill/invites/${PERSON}/answer`, { decision: 'decline' }],
    ]);
    for (const label of ['', '   ', 'x'.repeat(21), 'sam@example.com']) {
      const error = await failure(client.answer(PERSON, { decision: 'come', label }));
      expect(error).toMatchObject({ failure: 'invalid', field: 'body.label' });
      expect(twinHuddleFillFailureWords(error)).toEqual(twinHuddleFillFailureWords(new TwinHuddleFillError('invalid', { reason: { reasonCode: 'invalid_value', field: 'body.label' } })));
    }
    expect(calls).toHaveLength(2);
  });

  it('steps back on its own route', async () => {
    const { calls, client } = scripted({ status: 200, body: { ...INVITE, state: 'withdrawn', canAnswer: false } });
    await expect(client.leave(PERSON)).resolves.toMatchObject({ state: 'withdrawn' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: `${BASE}/twin-huddle/fill/invites/${PERSON}/withdraw`, body: {} });
  });

  it('an id that is not an id is not found, without a request', async () => {
    const { calls, client } = scripted();
    for (const run of [client.get('x'), client.end('../me'), client.decide(HUDDLE, 'nope', 'pass'), client.withdraw(HUDDLE, ''), client.invite('1'), client.leave('a/b')]) {
      expect((await failure(run)).failure).toBe('not_found');
    }
    expect(calls).toHaveLength(0);
  });

  it('an answer for another plan or another invitation, or one that does not read, is unreadable', async () => {
    const { client } = scripted(
      { status: 200, body: { ...VIEW, huddleId: OTHER_HUDDLE } },
      { status: 200, body: { ...VIEW, schemaVersion: 'v-next' } },
      { status: 200, body: { ...INVITE, id: OTHER_PERSON } },
      { status: 200, body: { ...INVITE, id: null } },
      { status: 200, body: { items: [{ ...ITEMS[0], state: 'maybe' }] } },
    );
    expect((await failure(client.get(HUDDLE))).failure).toBe('unreadable');
    expect((await failure(client.get(HUDDLE))).failure).toBe('unreadable');
    expect((await failure(client.invite(PERSON))).failure).toBe('unreadable');
    expect((await failure(client.invite(PERSON))).failure).toBe('unreadable');
    expect((await failure(client.invites())).failure).toBe('unreadable');
  });

  it('a 409 names the rule; other answers and a dropped connection map to the shared failures', async () => {
    const { client } = scripted(
      { status: 409, body: { code: 'bring_waiting' } },
      { status: 409, body: { code: 'something_new' } },
      { status: 404, body: {} },
      { status: 403, body: { code: 'bridge_only' } },
      { status: 429, body: {} },
      { status: 400, body: { code: 'invalid_request', reasonCode: 'text_violation', field: 'body.label' } },
      new Error('offline'),
    );
    const waiting = await failure(client.bring(HUDDLE, REL));
    expect(waiting).toBeInstanceOf(TwinHuddleFillError);
    expect(twinHuddleFillConflictOf(waiting)).toBe('bring_waiting');
    expect(twinHuddleFillFailureWords(waiting)).toEqual(TWIN_HUDDLE_FILL_CONFLICT_COPY.bring_waiting);
    const unknown = await failure(client.bring(HUDDLE, REL));
    expect(unknown.failure).toBe('changed');
    expect(twinHuddleFillConflictOf(unknown)).toBeNull();
    expect(twinHuddleFillFailureWords(unknown)).toEqual(TWIN_HUDDLE_FAILURE_COPY.changed);
    expect((await failure(client.get(HUDDLE))).failure).toBe('not_found');
    expect((await failure(client.bring(HUDDLE, REL))).failure).toBe('not_allowed');
    expect((await failure(client.end(HUDDLE))).failure).toBe('too_many');
    const invalid = await failure(client.answer(PERSON, { decision: 'come', label: 'Sam' }));
    expect(invalid).toMatchObject({ failure: 'invalid', reasonCode: 'text_violation', field: 'body.label' });
    expect((await failure(client.get(HUDDLE))).failure).toBe('unavailable');
  });

  it('without a session nothing is sent', async () => {
    const calls: HttpRequestV1[] = [];
    const client = createMobileTwinHuddleFillClient({
      transport: { request: async (req) => (calls.push(req), { status: 200, headers: {}, body: VIEW }) },
      baseUrl: BASE,
      webOrigin: WEB,
      token: () => null,
    });
    expect((await failure(client.get(HUDDLE))).failure).toBe('no_session');
    expect(calls).toHaveLength(0);
  });
});

describe('mobile twin huddle fill words', () => {
  const both = (words: { en: string; zh: string }) => {
    expect(words.en.trim()).not.toBe('');
    expect(words.zh).toMatch(CJK);
  };

  it('has words for every rule, every state and every region', () => {
    for (const code of TWIN_HUDDLE_FILL_CONFLICT_CODES_V0) both(TWIN_HUDDLE_FILL_CONFLICT_COPY[code]);
    for (const state of TWIN_HUDDLE_FILL_MINE_STATES_V0) both(TWIN_HUDDLE_FILL_MINE_COPY[state]);
    for (const state of TWIN_HUDDLE_FILL_INVITE_STATES_V0) both(TWIN_HUDDLE_FILL_INVITE_COPY[state]);
    for (const region of INTRODUCTION_NEED_REGIONS_V1) both(TWIN_HUDDLE_FILL_REGION_COPY[region]);
  });

  it('the friend and the person brought only ever hear "not this time" for a no', () => {
    expect(TWIN_HUDDLE_FILL_MINE_COPY.not_this_time.zh).toBe('这次不了');
    expect(TWIN_HUDDLE_FILL_INVITE_COPY.not_this_time.zh).toBe('这次人已经够了');
  });

  it('says how many are still wanted while it is open, and until when', () => {
    const now = new Date('2026-11-20T03:00:00.000Z');
    expect(twinHuddleFillSummaryWords({ wanted: 3, accepted: 1, state: 'open' })).toEqual({ en: '2 more wanted, 1 in so far', zh: '还缺 2 个，已经加进 1 个' });
    expect(twinHuddleFillSummaryWords({ wanted: 2, accepted: 2, state: 'full' }).zh).toContain('有人退出会重新开');
    expect(twinHuddleFillSummaryWords({ wanted: 2, accepted: 0, state: 'ended' }).zh).toBe('已经不再缺人了。');
    expect(twinHuddleFillUntilWords({ endsAt: '2026-11-21T03:00:00.000Z', state: 'open' }, now)?.en).toMatch(/^Until /);
    expect(twinHuddleFillUntilWords({ endsAt: '2026-11-21T03:00:00.000Z', state: 'full' }, now)).toBeNull();
  });

  it('tells each side what it can do', () => {
    both(twinHuddleFillHintWords({ role: 'initiator', fill: null }));
    expect(twinHuddleFillHintWords({ role: 'initiator', fill: VIEW.fill }).zh).toContain('未验证');
    expect(twinHuddleFillHintWords({ role: 'bridge', fill: VIEW.fill }).zh).toContain('由发起人拍板');
    expect(twinHuddleFillTriesWords(1).en).toBe('You can pick 1 more time.');
    expect(twinHuddleFillTriesWords(2)).toEqual({ en: 'You can pick 2 more times.', zh: '这次还能选 2 次。' });
  });

  it('the message with a link names nobody', () => {
    const words = twinHuddleFillShareWords(`https://agentrix.example/huddle/bring#${CODE}`);
    expect(words.zh).toContain(`/huddle/bring#${CODE}`);
    expect(words.en).toContain(`/huddle/bring#${CODE}`);
    expect(words.zh).not.toMatch(/Bob|Sam|发起人/);
  });

  it('the person brought sees who brings them, how many are coming, and the organizer only once they are in', () => {
    expect(twinHuddleFillInviteTitleWords(INVITE)).toEqual({ en: 'Bob would like to bring you along: Meal', zh: 'Bob想带你一起去：吃饭' });
    expect(twinHuddleFillInviteTitleWords({ ...INVITE, bridgeName: '  ' }).zh).toBe('一位朋友想带你一起去：吃饭');
    expect(twinHuddleFillHeadcountWords(3)).toEqual({ en: '3 people are coming so far', zh: '现在确定来的有 3 个人' });
    expect(twinHuddleFillOrganizerWords(INVITE)).toBeNull();
    expect(twinHuddleFillOrganizerWords({ initiatorName: 'Alice' })).toEqual({ en: 'Organized by Alice', zh: '发起人：Alice' });
  });

  it('names the day and the time a plan starts, in local time', () => {
    const now = new Date(2026, 10, 20, 9, 0);
    expect(twinHuddleFillStartWords(new Date(2026, 10, 21, 19, 5).toISOString(), now)).toEqual({ en: 'Tomorrow 19:05', zh: '明天 19:05' });
    expect(twinHuddleFillStartWords(new Date(2026, 10, 20, 7, 30).toISOString(), now)).toEqual({ en: 'Today 07:30', zh: '今天 07:30' });
  });

  it('checks a typed name by the rule the server applies', () => {
    expect(twinHuddleFillLabelProblem('Sam')).toBeNull();
    expect(twinHuddleFillLabelProblem(' 小王 ')).toBeNull();
    for (const label of ['', 'x'.repeat(21), 'sam@example.com']) expect(twinHuddleFillLabelProblem(label)).not.toBeNull();
  });

  it('anything that is not a call failure reads as "not available"', () => {
    expect(twinHuddleFillFailureWords(new Error('boom'))).toEqual(TWIN_HUDDLE_FAILURE_COPY.unavailable);
    expect(twinHuddleFillFailureWords(new TwinHuddleError('too_many'))).toEqual(TWIN_HUDDLE_FAILURE_COPY.too_many);
  });
});
