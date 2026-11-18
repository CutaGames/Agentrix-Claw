import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { TWIN_HUDDLE_KINDS_V0 } from '../../../shared/types/twin-huddle';
import {
  TWIN_HUDDLE_SERIES_LIMITS_V0,
  TWIN_HUDDLE_SERIES_REFUSAL_CODES_V0,
  TWIN_HUDDLE_SERIES_SCHEMA_VERSION_V0,
  TWIN_HUDDLE_SERIES_SKIP_CODES_V0,
  TWIN_HUDDLE_SERIES_SKIP_LABELS_V0,
  type TwinHuddleSeriesRequestV0,
} from '../../../shared/types/twin-huddle-series';
import { TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError } from '../twinHuddle';
import { TWIN_HUDDLE_SERIES_REFUSAL_COPY, createMobileTwinHuddleSeriesClient } from '../twinHuddleSeries';
import {
  twinHuddleSeriesFailureWords,
  twinHuddleSeriesInviteWords,
  twinHuddleSeriesNextWords,
  twinHuddleSeriesProblemWords,
  twinHuddleSeriesRequestFromForm,
  twinHuddleSeriesRunWords,
  twinHuddleSeriesSlotOptions,
  twinHuddleSeriesStartedWords,
  twinHuddleSeriesStatusWords,
  twinHuddleSeriesWeeklyWords,
  type TwinHuddleSeriesStartForm,
} from '../twinHuddleSeriesView';

const BASE = 'https://api.example/api';
const ID = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const OTHER = '1c7a4d2f-3e5b-4a6c-9d0e-2f3a4b5c6d7e';
const KIND = TWIN_HUDDLE_KINDS_V0[0];
const CJK = /[\u3400-\u9fff]/;

// Wednesday 18 November 2026, 11:30 local time.
const NOW = new Date(2026, 10, 18, 11, 30);
const at = (day: number, hour: number, minute = 0): string => new Date(2026, 10, day, hour, minute).toISOString();
const slot = (day: number, hour: number, endHour: number) => ({ startAt: at(day, hour), endAt: at(day, endHour) });
const FIRST = slot(25, 19, 21);

const HEAD = {
  schemaVersion: TWIN_HUDDLE_SERIES_SCHEMA_VERSION_V0,
  id: ID,
  status: 'active',
  details: { kind: KIND, budget: 'mid' },
  first: FIRST,
  next: { occurrence: 0, slot: FIRST, openAt: at(22, 19) },
  createdAt: at(18, 11),
};
const INITIATOR = {
  ...HEAD,
  role: 'initiator',
  endedReason: null,
  occurrencesLeft: 12,
  canEnd: true,
  canRenew: false,
  people: [{ ref: 'u:42', label: '老张', joined: true }],
  auto: false,
  runs: [{ occurrence: 0, startAt: FIRST.startAt, outcome: 'skipped', huddleId: null, skipCode: 'nobody_joined' }],
};
const MEMBER = { ...HEAD, role: 'member', initiatorName: '小周', peopleCount: 2, myState: 'invited', inviteEndsAt: at(25, 11), auto: false, skipNext: false, canJoin: true, canLeave: false };
const REQUEST: TwinHuddleSeriesRequestV0 = { kind: KIND, first: FIRST, budget: 'mid', friendRefs: ['u:42'], auto: true };

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
  const client = createMobileTwinHuddleSeriesClient({ transport, baseUrl: `${BASE}/`, token: () => 'tok' });
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

describe('weekly plans on the phone: the client', () => {
  it('starts one as a signed-in mobile request and reads both answers', async () => {
    const started = { started: true, seriesId: ID, routes: [{ ref: 'u:42', route: 'invite' }] };
    const { calls, client } = scripted({ status: 200, body: started }, { status: 200, body: { data: { started: false, code: 'active_limit' } } });
    await expect(client.start(REQUEST)).resolves.toEqual(started);
    await expect(client.start(REQUEST)).resolves.toEqual({ started: false, code: 'active_limit' });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: `${BASE}/twin-huddle/series`,
      headers: { Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' },
      body: REQUEST,
    });
  });

  it('lists what is still mine', async () => {
    const item = { id: ID, role: 'member', status: 'active', kind: KIND, first: FIRST, nextStartAt: FIRST.startAt, needsMe: true, joined: null, createdAt: at(18, 11) };
    const { calls, client } = scripted({ status: 200, body: { items: [item] } }, { status: 200, body: { data: { items: [] } } });
    await expect(client.list()).resolves.toEqual([item]);
    await expect(client.list()).resolves.toEqual([]);
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${BASE}/twin-huddle/series` });
    expect(calls[0]).not.toHaveProperty('body');
  });

  it('reads one and sends each change to its own route', async () => {
    const joined = { ...MEMBER, myState: 'joined', inviteEndsAt: null, auto: true, canJoin: false, canLeave: true };
    const { calls, client } = scripted(
      { status: 200, body: INITIATOR },
      { status: 200, body: { ...INITIATOR, status: 'ended', endedReason: 'initiator_ended', next: null, canEnd: false } },
      { status: 200, body: INITIATOR },
      { status: 200, body: joined },
      { status: 200, body: { ...joined, skipNext: true } },
    );
    await expect(client.get(ID)).resolves.toMatchObject({ role: 'initiator', people: [{ ref: 'u:42', label: '老张', joined: true }] });
    await expect(client.end(ID)).resolves.toMatchObject({ status: 'ended', next: null });
    await expect(client.renew(ID)).resolves.toMatchObject({ occurrencesLeft: 12 });
    await expect(client.join(ID, true)).resolves.toMatchObject({ myState: 'joined', auto: true });
    await expect(client.setMine(ID, { skipNext: true })).resolves.toMatchObject({ skipNext: true });
    expect(calls.map((call) => [call.method, call.path.slice(BASE.length), call.body])).toEqual([
      ['GET', `/twin-huddle/series/${ID}`, undefined],
      ['POST', `/twin-huddle/series/${ID}/end`, {}],
      ['POST', `/twin-huddle/series/${ID}/renew`, {}],
      ['POST', `/twin-huddle/series/${ID}/join`, { auto: true }],
      ['PUT', `/twin-huddle/series/${ID}/me`, { skipNext: true }],
    ]);
  });

  it('declining and leaving leave nothing to show', async () => {
    const { calls, client } = scripted({ status: 200, body: { view: null } }, { status: 200, body: { data: { view: null } } }, { status: 200, body: MEMBER });
    await expect(client.decline(ID)).resolves.toBeUndefined();
    await expect(client.leave(ID)).resolves.toBeUndefined();
    expect(calls.map((call) => call.path.slice(BASE.length))).toEqual([`/twin-huddle/series/${ID}/decline`, `/twin-huddle/series/${ID}/leave`]);
    expect((await failure(client.leave(ID))).failure).toBe('unreadable');
  });

  it('does not trust an answer about another plan, or one for the other side', async () => {
    const { client } = scripted({ status: 200, body: { ...INITIATOR, id: OTHER } }, { status: 200, body: MEMBER }, { status: 200, body: INITIATOR }, { status: 200, body: { role: 'initiator' } });
    expect((await failure(client.get(ID))).failure).toBe('unreadable');
    expect((await failure(client.end(ID))).failure).toBe('unreadable');
    expect((await failure(client.join(ID, false))).failure).toBe('unreadable');
    expect((await failure(client.get(ID))).failure).toBe('unreadable');
  });

  it('sends nothing without a session or with an id that cannot be one', async () => {
    const calls: HttpRequestV1[] = [];
    const transport: HttpTransportV1 = {
      async request(req) {
        calls.push(req);
        return { status: 200, headers: {}, body: {} };
      },
    };
    const signedOut = createMobileTwinHuddleSeriesClient({ transport, baseUrl: BASE, token: () => null });
    expect((await failure(signedOut.list())).failure).toBe('no_session');
    const signedIn = createMobileTwinHuddleSeriesClient({ transport, baseUrl: BASE, token: () => 'tok' });
    expect((await failure(signedIn.get('../profile'))).failure).toBe('not_found');
    expect((await failure(signedIn.leave('nope'))).failure).toBe('not_found');
    expect(calls).toEqual([]);
  });

  it('names what went wrong', async () => {
    const { client } = scripted(
      { status: 404 },
      { status: 409 },
      { status: 429 },
      { status: 422, body: { reasonCode: 'invalid_value', field: 'request.first' } },
      { status: 500 },
      new Error('offline'),
    );
    expect((await failure(client.list())).failure).toBe('not_found');
    expect((await failure(client.renew(ID))).failure).toBe('changed');
    expect((await failure(client.join(ID, false))).failure).toBe('too_many');
    const invalid = await failure(client.start(REQUEST));
    expect([invalid.failure, invalid.reasonCode, invalid.field]).toEqual(['invalid', 'invalid_value', 'request.first']);
    expect((await failure(client.list())).failure).toBe('unavailable');
    expect((await failure(client.list())).failure).toBe('unavailable');
  });

  it('has words in both languages for every refusal', () => {
    for (const code of TWIN_HUDDLE_SERIES_REFUSAL_CODES_V0) {
      expect(TWIN_HUDDLE_SERIES_REFUSAL_COPY[code].en.length).toBeGreaterThan(0);
      expect(TWIN_HUDDLE_SERIES_REFUSAL_COPY[code].zh).toMatch(CJK);
    }
    expect(TWIN_HUDDLE_SERIES_REFUSAL_COPY.active_limit.zh).toContain(String(TWIN_HUDDLE_SERIES_LIMITS_V0.activePerInitiatorMax));
  });
});

describe('weekly plans on the phone: the form and the words', () => {
  const form = (patch: Partial<TwinHuddleSeriesStartForm> = {}): TwinHuddleSeriesStartForm => ({ kind: KIND, budget: 'mid', first: FIRST, friendRefs: ['u:42'], note: '', auto: false, ...patch });

  it('offers first times for eight days, none closer than the notice the server asks for', () => {
    const options = twinHuddleSeriesSlotOptions(NOW);
    const lead = options.map((option) => Date.parse(option.slot.startAt) - NOW.getTime());
    expect(Math.min(...lead)).toBeGreaterThanOrEqual(TWIN_HUDDLE_SERIES_LIMITS_V0.minNoticeMs);
    // At 11:30 only tonight is still far enough ahead today.
    expect(options.filter((option) => option.dayOffset === 0).map((option) => option.part)).toEqual(['evening']);
    expect(options[options.length - 1].dayOffset).toBe(7);
    expect(options.filter((option) => option.dayOffset === 7)).toHaveLength(4);
  });

  it('says which weekday and hours it repeats on', () => {
    expect(twinHuddleSeriesWeeklyWords(FIRST)).toEqual({ en: 'Every Wednesday 19:00–21:00', zh: '每周三 19:00–21:00' });
    expect(twinHuddleSeriesWeeklyWords(slot(22, 12, 13)).zh).toBe('每周日 12:00–13:00');
  });

  it('builds the request the server expects', () => {
    expect(twinHuddleSeriesRequestFromForm(form({ auto: true, note: '  老地方  ' }), NOW)).toEqual({
      ok: true,
      value: { kind: KIND, first: FIRST, budget: 'mid', friendRefs: ['u:42'], auto: true, note: '老地方' },
    });
    const plain = twinHuddleSeriesRequestFromForm(form(), NOW);
    expect(plain).toEqual({ ok: true, value: { kind: KIND, first: FIRST, budget: 'mid', friendRefs: ['u:42'], auto: false } });
  });

  it('stops a form with no first time, one that is too soon, or nobody invited', () => {
    expect(twinHuddleSeriesRequestFromForm(form({ first: null }), NOW)).toEqual({ ok: false, reasonCode: 'missing_field', field: 'request.first' });
    expect(twinHuddleSeriesRequestFromForm(form({ first: slot(18, 15, 17) }), NOW)).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.first' });
    const nobody = twinHuddleSeriesRequestFromForm(form({ friendRefs: [] }), NOW);
    expect(nobody.ok).toBe(false);
    expect(nobody.ok === false ? nobody.field : '').toContain('friendRefs');
  });

  it('tells the organizer what to fix', () => {
    const hours = String(TWIN_HUDDLE_SERIES_LIMITS_V0.minNoticeMs / 3600000);
    expect(twinHuddleSeriesProblemWords('invalid_value', 'request.first').zh).toContain(hours);
    expect(twinHuddleSeriesProblemWords('invalid_value', 'request.friendRefs').zh).toContain(String(TWIN_HUDDLE_SERIES_LIMITS_V0.friendsMax));
    expect(twinHuddleSeriesProblemWords('text_violation', 'request.note').zh).toMatch(CJK);
    expect(twinHuddleSeriesProblemWords(null, null)).toEqual(TWIN_HUDDLE_FAILURE_COPY.invalid);
  });

  it('has its own words for "not open or gone" and the shared ones for the rest', () => {
    expect(twinHuddleSeriesFailureWords(new TwinHuddleError('not_found')).zh).toContain('每周固定');
    expect(twinHuddleSeriesFailureWords(new TwinHuddleError('changed'))).toEqual(TWIN_HUDDLE_FAILURE_COPY.changed);
    expect(twinHuddleSeriesFailureWords(new TwinHuddleError('invalid', { reasonCode: 'invalid_value', field: 'request.first' }))).toEqual(
      twinHuddleSeriesProblemWords('invalid_value', 'request.first'),
    );
    expect(twinHuddleSeriesFailureWords(new Error('boom'))).toEqual(TWIN_HUDDLE_FAILURE_COPY.unavailable);
  });

  it('says what a weekly plan is waiting for', () => {
    const next = FIRST.startAt;
    expect(twinHuddleSeriesStatusWords({ role: 'member', status: 'active', needsMe: true, nextStartAt: next }, NOW).zh).toBe('等你决定加不加入');
    expect(twinHuddleSeriesStatusWords({ role: 'initiator', status: 'ended', needsMe: true, nextStartAt: null }, NOW).zh).toBe('这一期开完了，要不要续');
    expect(twinHuddleSeriesStatusWords({ role: 'member', status: 'ended', needsMe: false, nextStartAt: null }, NOW).zh).toBe('已结束');
    expect(twinHuddleSeriesStatusWords({ role: 'initiator', status: 'active', needsMe: false, nextStartAt: next }, NOW)).toEqual({ en: 'Next: Wed 25 Nov', zh: '下一次：11月25日 周三' });
    expect(twinHuddleSeriesStatusWords({ role: 'initiator', status: 'active', needsMe: false, nextStartAt: null }, NOW).zh).toBe('没有下一次了');
  });

  it('says when the next one is and when that week\'s plan opens', () => {
    expect(twinHuddleSeriesNextWords(null, NOW).zh).toBe('没有下一次了。');
    expect(twinHuddleSeriesNextWords({ occurrence: 0, slot: FIRST, openAt: at(22, 19) }, NOW).zh).toBe('下一次：11月25日 周三 19:00–21:00。那一周的商量11月22日 周日开。');
    expect(twinHuddleSeriesNextWords({ occurrence: 0, slot: slot(20, 19, 21), openAt: at(17, 19) }, NOW).zh).toBe('下一次：11月20日 周五 19:00–21:00。那一周的商量就快开了。');
  });

  it('says what happened in a past week, with the reason when it was skipped', () => {
    expect(twinHuddleSeriesRunWords({ startAt: at(11, 19), outcome: 'opened', skipCode: null }, NOW).zh).toBe('11月11日 周三：开了商量');
    for (const code of TWIN_HUDDLE_SERIES_SKIP_CODES_V0) {
      const words = twinHuddleSeriesRunWords({ startAt: at(11, 19), outcome: 'skipped', skipCode: code }, NOW);
      expect(words.zh).toContain(TWIN_HUDDLE_SERIES_SKIP_LABELS_V0[code].zh);
      expect(words.en).toContain(TWIN_HUDDLE_SERIES_SKIP_LABELS_V0[code].en);
    }
    expect(twinHuddleSeriesRunWords({ startAt: at(11, 19), outcome: 'skipped', skipCode: null }, NOW).zh).toBe('11月11日 周三：没开成');
  });

  it('counts the invitations that went out and says when one lapses', () => {
    expect(twinHuddleSeriesStartedWords([{ route: 'invite' }, { route: 'invite' }]).zh).toBe('已邀请 2 位。朋友点了加入，每周才会约他。');
    expect(twinHuddleSeriesStartedWords([{ route: 'invite' }, { route: 'unavailable' }]).zh).toBe('已邀请 1 位，1 位现在邀请不了。朋友点了加入，每周才会约他。');
    expect(twinHuddleSeriesInviteWords(null, NOW)).toBeNull();
    expect(twinHuddleSeriesInviteWords(at(19, 11), NOW)).toEqual({ en: 'The invitation lapses Tomorrow.', zh: '明天前不决定，邀请就作废。' });
  });
});
