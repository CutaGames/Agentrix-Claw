import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { TWIN_ASK_TOPICS_V0 } from '../../../shared/types/twin-ask';
import { TWIN_FIND_DATING_OPEN_NOTICE_V0, TWIN_FIND_SCHEMA_VERSION_V0, TWIN_FIND_TOPICS_V0, type TwinFindRequestV0 } from '../../../shared/types/twin-find';
import { TWIN_FIND_FAILURE_COPY, TwinFindError, createMobileTwinFindClient } from '../twinFind';
import {
  TWIN_FIND_ADULT_WORDS,
  TWIN_FIND_DATING_ASK_WORDS,
  TWIN_FIND_DATING_SWITCH_WORDS,
  twinFindConsentFromForm,
  twinFindDatingSwitchFailureWords,
  twinFindProblemWords,
  twinFindRequestFromForm,
  twinFindRowWords,
  twinFindSideWords,
  twinFindTopicChoices,
  twinFindTopicWords,
  type TwinFindWords,
} from '../twinFindView';

const BASE = 'https://api.example/api';
const BRIDGE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const QUESTION = '谁认识喜欢爬山的单身朋友？';
const CJK = /[\u3400-\u9fff]/;
const AGREED = {
  schemaVersion: TWIN_FIND_SCHEMA_VERSION_V0,
  status: 'open',
  topic: 'dating',
  question: QUESTION,
  endsAt: '2026-11-22T08:00:00.000Z',
  bridgeId: BRIDGE_ID,
  role: 'candidate',
  askerName: '小周',
  bridgeName: '老张',
  note: null,
  myState: 'agreed',
  myDisplayName: '小林',
  myLine: null,
  canConsent: false,
  canRevoke: true,
  connectedAt: null,
};
const profileOf = (datingOpen: boolean) => ({ schemaVersion: TWIN_FIND_SCHEMA_VERSION_V0, datingOpen });

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

function bilingual(words: TwinFindWords): void {
  expect(words.en.trim()).not.toBe('');
  expect(words.en).not.toMatch(CJK);
  expect(words.zh).toMatch(CJK);
}

describe('looking for a partner on the phone: the requests', () => {
  it("reads the person's own switch, and nothing but a true or false counts as an answer", async () => {
    const { calls, client } = scripted(
      { status: 200, body: profileOf(false) },
      { status: 200, body: { data: profileOf(true) } },
      { status: 200, body: { schemaVersion: TWIN_FIND_SCHEMA_VERSION_V0, datingOpen: 'yes' } },
      { status: 200, body: { datingOpen: true } },
    );
    await expect(client.profile()).resolves.toEqual(profileOf(false));
    await expect(client.profile()).resolves.toEqual(profileOf(true));
    expect((await failureOf(client.profile())).failure).toBe('unreadable');
    expect((await failureOf(client.profile())).failure).toBe('unreadable');
    expect(sent(calls)).toEqual(Array.from({ length: 4 }, () => ['GET', '/twin-find/profile', undefined]));
    expect(calls[0].headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });

  it('turns the switch on and off with one field, and does not show a value the server did not save', async () => {
    const { calls, client } = scripted(
      { status: 200, body: profileOf(true) },
      { status: 200, body: profileOf(false) },
      { status: 200, body: profileOf(false) },
      { status: 404, body: { message: 'Not Found' } },
      { status: 429, body: { code: 'rate_limited' } },
    );
    await expect(client.setDatingOpen(true)).resolves.toEqual(profileOf(true));
    await expect(client.setDatingOpen(false)).resolves.toEqual(profileOf(false));
    // Asked to turn it on, the server says it is off: the screen must not show it as on.
    expect((await failureOf(client.setDatingOpen(true))).failure).toBe('unreadable');
    const closed = await failureOf(client.setDatingOpen(true));
    expect(closed.failure).toBe('not_found');
    expect(twinFindDatingSwitchFailureWords(closed)).toEqual({ en: 'This is not open yet.', zh: '这一项还没开放。' });
    const busy = await failureOf(client.setDatingOpen(false));
    expect(twinFindDatingSwitchFailureWords(busy)).toEqual(TWIN_FIND_FAILURE_COPY.too_many);
    expect(twinFindDatingSwitchFailureWords(new Error('offline'))).toEqual(TWIN_FIND_FAILURE_COPY.unavailable);
    expect(sent(calls)).toEqual([
      ['PUT', '/twin-find/profile', { datingOpen: true }],
      ['PUT', '/twin-find/profile', { datingOpen: false }],
      ['PUT', '/twin-find/profile', { datingOpen: true }],
      ['PUT', '/twin-find/profile', { datingOpen: true }],
      ['PUT', '/twin-find/profile', { datingOpen: false }],
    ]);
  });

  it('sends nothing about the switch without a session', async () => {
    const calls: HttpRequestV1[] = [];
    const transport: HttpTransportV1 = {
      async request(req) {
        calls.push(req);
        return { status: 200, headers: {}, body: {} };
      },
    };
    const client = createMobileTwinFindClient({ transport, baseUrl: BASE, webOrigin: 'https://web.example', token: () => null });
    expect((await failureOf(client.profile())).failure).toBe('no_session');
    expect((await failureOf(client.setDatingOpen(true))).failure).toBe('no_session');
    expect(calls).toHaveLength(0);
  });

  it('sends the age statement only when the person made it, and never with a no', async () => {
    const { calls, client } = scripted(
      { status: 200, body: { view: AGREED } },
      { status: 200, body: { view: AGREED } },
      { status: 200, body: { view: null } },
      { status: 400, body: { code: 'invalid_request', reasonCode: 'missing_field', field: 'consent.adult' } },
    );
    await expect(client.consent(BRIDGE_ID, { decision: 'agree', displayName: '小林', line: null, adult: true })).resolves.toEqual(AGREED);
    await expect(client.consent(BRIDGE_ID, { decision: 'agree', displayName: '小林', line: null })).resolves.toEqual(AGREED);
    await expect(client.consent(BRIDGE_ID, { decision: 'decline' })).resolves.toBeNull();
    // The server is the one that refuses an agreement without the statement; the form points at the box.
    const refused = await failureOf(client.consent(BRIDGE_ID, { decision: 'agree', displayName: '小林', line: null }));
    expect([refused.failure, refused.reasonCode, refused.field]).toEqual(['invalid', 'missing_field', 'consent.adult']);
    const path = `/twin-find/intro/${BRIDGE_ID}/consent`;
    expect(sent(calls)).toEqual([
      ['POST', path, { decision: 'agree', displayName: '小林', adult: true }],
      ['POST', path, { decision: 'agree', displayName: '小林' }],
      ['POST', path, { decision: 'decline' }],
      ['POST', path, { decision: 'agree', displayName: '小林' }],
    ]);
  });

  it("sends the asker's age statement with a question only when it was made", async () => {
    const refused = { status: 201, body: { started: false, code: 'asker_daily_limit' } };
    const { calls, client } = scripted(refused, refused);
    const asked: TwinFindRequestV0 = { topic: 'dating', question: QUESTION, friendRefs: ['rel:1'] };
    await expect(client.start({ ...asked, adult: true })).resolves.toEqual({ started: false, code: 'asker_daily_limit' });
    await expect(client.start(asked)).resolves.toEqual({ started: false, code: 'asker_daily_limit' });
    expect(sent(calls)).toEqual([
      ['POST', '/twin-find', { ...asked, adult: true }],
      ['POST', '/twin-find', asked],
    ]);
  });
});

describe('looking for a partner on the phone: the words', () => {
  it('offers the topic only in a build that switched it on', () => {
    expect(twinFindTopicChoices(false)).toEqual([...TWIN_ASK_TOPICS_V0]);
    expect(twinFindTopicChoices(true)).toEqual([...TWIN_FIND_TOPICS_V0]);
    expect(twinFindTopicChoices(true)).toEqual([...TWIN_ASK_TOPICS_V0, 'dating']);
    expect(twinFindTopicWords('dating')).toEqual({ en: 'Dating', zh: '找对象' });
    for (const topic of TWIN_FIND_TOPICS_V0) bilingual(twinFindTopicWords(topic));
  });

  it('asks for the age statement only when the question is about a partner', () => {
    expect(twinFindConsentFromForm('小林', '', { adult: true })).toEqual({ ok: true, value: { decision: 'agree', displayName: '小林', line: null, adult: true } });
    expect(twinFindConsentFromForm('小林', ' 周末常去爬山 ', { adult: true })).toEqual({
      ok: true,
      value: { decision: 'agree', displayName: '小林', line: '周末常去爬山', adult: true },
    });
    expect(twinFindConsentFromForm('小林', '', { adult: false })).toEqual({ ok: false, reasonCode: 'missing_field', field: 'consent.adult' });
    // A missing name is said first: one thing to fix at a time, top to bottom.
    expect(twinFindConsentFromForm('', '', { adult: false })).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'consent.displayName' });
    // Any other topic: nothing about age is asked or sent.
    expect(twinFindConsentFromForm('小林', '')).toEqual({ ok: true, value: { decision: 'agree', displayName: '小林', line: null } });
  });

  it('asks the asker for the age statement too, only when the question is about a partner', () => {
    const form = { topic: 'dating' as const, question: QUESTION, friendRefs: ['rel:1'] };
    expect(twinFindRequestFromForm({ ...form, adult: true })).toEqual({ ok: true, value: { topic: 'dating', question: QUESTION, friendRefs: ['rel:1'], adult: true } });
    expect(twinFindRequestFromForm({ ...form, adult: false })).toEqual({ ok: false, reasonCode: 'missing_field', field: 'request.adult' });
    expect(twinFindRequestFromForm(form)).toEqual({ ok: false, reasonCode: 'missing_field', field: 'request.adult' });
    // The question is said first: one thing to fix at a time, top to bottom.
    expect(twinFindRequestFromForm({ ...form, question: '   ', adult: false })).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.question' });
    // Any other topic: the box is not shown and nothing about age is sent.
    expect(twinFindRequestFromForm({ ...form, topic: 'home', adult: true })).toEqual({ ok: true, value: { topic: 'home', question: QUESTION, friendRefs: ['rel:1'] } });
    expect(TWIN_FIND_DATING_ASK_WORDS.zh).toContain('你和被介绍的人都要声明已满 18 岁');
  });

  it('says to tick the box, for the form in the app and for the link page', () => {
    const words = { en: 'Tick that you are 18 or older first.', zh: '请先勾选「我已满 18 岁」。' };
    expect(twinFindProblemWords('missing_field', 'consent.adult')).toEqual(words);
    expect(twinFindProblemWords('missing_field', 'request.adult')).toEqual(words);
    expect(twinFindProblemWords('missing_field', 'body.adult')).toEqual(words);
    expect(twinFindProblemWords('invalid_value', 'consent.adult')).toEqual(words);
  });

  it("keeps the topic and the question off the row of the friend asked and of the person introduced, not off the asker's own", () => {
    for (const role of ['bridge', 'candidate'] as const) {
      // The server already sends an empty question for these rows.
      const row = twinFindRowWords({ role, topic: 'dating', question: '' });
      expect(row.label).toEqual(twinFindSideWords(role));
      expect(row.question).toEqual({ en: 'Open to read it.', zh: '点开看是什么事。' });
      expect(JSON.stringify(row)).not.toMatch(/dating|partner|对象|单身/i);
      // Even if a question text arrived, it is not put on the row.
      expect(JSON.stringify(twinFindRowWords({ role, topic: 'dating', question: QUESTION }))).not.toContain(QUESTION);
    }
    expect(twinFindRowWords({ role: 'asker', topic: 'dating', question: QUESTION })).toEqual({
      label: { en: 'Dating · I asked', zh: '找对象 · 我发起的' },
      question: QUESTION,
    });
    // Every other topic reads as before, for everyone.
    const home = twinFindRowWords({ role: 'bridge', topic: 'home', question: '谁认识靠谱的装修师傅？' });
    expect(home.label.zh).toBe(`${twinFindTopicWords('home').zh} · ${twinFindSideWords('bridge').zh}`);
    expect(home.question).toBe('谁认识靠谱的装修师傅？');
  });

  it('has the fixed sentences in both languages', () => {
    for (const words of [TWIN_FIND_ADULT_WORDS, TWIN_FIND_DATING_SWITCH_WORDS, TWIN_FIND_DATING_ASK_WORDS, TWIN_FIND_DATING_OPEN_NOTICE_V0]) bilingual(words);
    expect(TWIN_FIND_ADULT_WORDS.zh).toBe('我已满 18 岁');
    expect(TWIN_FIND_DATING_SWITCH_WORDS.zh).toBe('找对象：我也在找');
  });
});
