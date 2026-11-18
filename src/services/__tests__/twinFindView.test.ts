import { describe, it, expect } from '@jest/globals';
import {
  TWIN_FIND_BRIDGE_STATES_V0,
  TWIN_FIND_CLOSE_REASONS_V0,
  TWIN_FIND_FIXED_PHRASES_V0,
  TWIN_FIND_FRIEND_ROUTES_V0,
  TWIN_FIND_INTRO_STATES_V0,
  TWIN_FIND_LIMITS_V0,
  TWIN_FIND_PERSON_STATES_V0,
  TWIN_FIND_REASON_CODES_V0,
} from '../../../shared/types/twin-find';
import { TWIN_FIND_FAILURE_COPY, TwinFindError } from '../twinFind';
import {
  TWIN_FIND_CLOSED_WORDS,
  TWIN_FIND_CONSENT_WORDS,
  TWIN_FIND_HOW_WORDS,
  TWIN_FIND_LINK_ONCE_WORDS,
  TWIN_FIND_ROUTE_WORDS,
  TWIN_FIND_UNVERIFIED_WORDS,
  twinFindBridgeStateWords,
  twinFindConsentFromForm,
  twinFindFailureWords,
  twinFindIntroStateWords,
  twinFindOfferNameWords,
  twinFindOpenTarget,
  twinFindPersonWords,
  twinFindPickFromForm,
  twinFindPickedWords,
  twinFindPicksLeftWords,
  twinFindProblemWords,
  twinFindRequestFromForm,
  twinFindShareWords,
  twinFindSideWords,
  twinFindStartedPeople,
  twinFindStatusWords,
  twinFindTally,
  twinFindTallyWords,
  twinFindTimeLeftWords,
  type TwinFindWords,
} from '../twinFindView';

const L = TWIN_FIND_LIMITS_V0;
const CJK = /[\u3400-\u9fff]/;
const NOW = new Date('2026-11-17T08:00:00.000Z');
const after = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function bilingual(words: TwinFindWords): void {
  expect(words.en.trim().length).toBeGreaterThan(0);
  expect(CJK.test(words.en)).toBe(false);
  expect(CJK.test(words.zh)).toBe(true);
}

describe('what the finding-through-friends screens say', () => {
  it('counts down in days, then hours, then minutes, and stops at the end', () => {
    expect(twinFindTimeLeftWords(after(3 * DAY), NOW)).toEqual({ en: '3 days left', zh: '还剩 3 天' });
    expect(twinFindTimeLeftWords(after(DAY + HOUR), NOW)).toEqual({ en: '1 day left', zh: '还剩 1 天' });
    expect(twinFindTimeLeftWords(after(DAY - 1), NOW)).toEqual({ en: '23 h left', zh: '还剩 23 小时' });
    expect(twinFindTimeLeftWords(after(HOUR), NOW)).toEqual({ en: '1 h left', zh: '还剩 1 小时' });
    expect(twinFindTimeLeftWords(after(HOUR - 1), NOW)).toEqual({ en: '60 min left', zh: '还剩 60 分钟' });
    expect(twinFindTimeLeftWords(after(1), NOW)).toEqual({ en: '1 min left', zh: '还剩 1 分钟' });
    expect(twinFindTimeLeftWords(after(0), NOW)).toBeNull();
    expect(twinFindTimeLeftWords(after(-DAY), NOW)).toBeNull();
    expect(twinFindTimeLeftWords('not a time', NOW)).toBeNull();
  });

  it('turns the start form into a request, or names the field that is wrong', () => {
    expect(twinFindRequestFromForm({ topic: 'home', question: '  谁认识靠谱的装修师傅？ ', friendRefs: ['rel:1', 'rel:2'] })).toEqual({
      ok: true,
      value: { topic: 'home', question: '谁认识靠谱的装修师傅？', friendRefs: ['rel:1', 'rel:2'] },
    });
    expect(twinFindRequestFromForm({ topic: null, question: '谁认识装修师傅？', friendRefs: ['rel:1'] })).toEqual({ ok: false, reasonCode: 'missing_field', field: 'request.topic' });
    expect(twinFindRequestFromForm({ topic: 'home', question: '   ', friendRefs: ['rel:1'] })).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.question' });
    expect(twinFindRequestFromForm({ topic: 'home', question: '字'.repeat(L.questionMax + 1), friendRefs: ['rel:1'] })).toEqual({ ok: false, reasonCode: 'too_long', field: 'request.question' });
    expect(twinFindRequestFromForm({ topic: 'home', question: '打 13800138000 找他', friendRefs: ['rel:1'] })).toEqual({ ok: false, reasonCode: 'text_violation', field: 'request.question' });
    expect(twinFindRequestFromForm({ topic: 'home', question: '谁认识装修师傅？', friendRefs: [] })).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.friendRefs' });
    const many = Array.from({ length: L.friendsMax + 1 }, (_, i) => `rel:${i}`);
    expect(twinFindRequestFromForm({ topic: 'home', question: '谁认识装修师傅？', friendRefs: many })).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.friendRefs' });
  });

  it('turns the pick form into a pick: someone from the list, or a name', () => {
    expect(twinFindPickFromForm({ friendRef: 'rel:9', guestLabel: '忽略', note: '' })).toEqual({ ok: true, value: { person: { kind: 'friend', ref: 'rel:9' } } });
    expect(twinFindPickFromForm({ friendRef: null, guestLabel: ' 李师傅 ', note: ' 我家就是他装的 ' })).toEqual({
      ok: true,
      value: { person: { kind: 'guest', label: '李师傅' }, note: '我家就是他装的' },
    });
    expect(twinFindPickFromForm({ friendRef: null, guestLabel: '', note: '' })).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'pick.person.label' });
    expect(twinFindPickFromForm({ friendRef: null, guestLabel: '字'.repeat(L.labelMax + 1), note: '' })).toEqual({ ok: false, reasonCode: 'too_long', field: 'pick.person.label' });
    expect(twinFindPickFromForm({ friendRef: 'rel:9', guestLabel: '', note: '看 https://example.com/a' })).toEqual({ ok: false, reasonCode: 'text_violation', field: 'pick.note' });
    expect(twinFindPickFromForm({ friendRef: 'rel:9', guestLabel: '', note: '字'.repeat(L.noteMax + 1) })).toEqual({ ok: false, reasonCode: 'too_long', field: 'pick.note' });
  });

  it('turns the consent form into an agreement with a name and an optional line', () => {
    expect(twinFindConsentFromForm(' 李师傅 ', '  ')).toEqual({ ok: true, value: { decision: 'agree', displayName: '李师傅', line: null } });
    expect(twinFindConsentFromForm('李师傅', ' 做了十年旧房翻新 ')).toEqual({ ok: true, value: { decision: 'agree', displayName: '李师傅', line: '做了十年旧房翻新' } });
    expect(twinFindConsentFromForm('', '')).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'consent.displayName' });
    expect(twinFindConsentFromForm('字'.repeat(L.displayNameMax + 1), '')).toEqual({ ok: false, reasonCode: 'too_long', field: 'consent.displayName' });
    expect(twinFindConsentFromForm('李师傅', '字'.repeat(L.lineMax + 1))).toEqual({ ok: false, reasonCode: 'too_long', field: 'consent.line' });
    expect(twinFindConsentFromForm('李师傅', '打 13800138000')).toEqual({ ok: false, reasonCode: 'text_violation', field: 'consent.line' });
  });

  it('has a sentence for every rule on every field, in both languages', () => {
    const fields = ['request.topic', 'request.question', 'request.friendRefs', 'request.friendRefs[3]', 'pick.person.label', 'pick.person.ref', 'pick.note', 'consent.displayName', 'consent.line', 'body.displayName', 'body.line', 'before', null];
    for (const field of fields) for (const reasonCode of [...TWIN_FIND_REASON_CODES_V0, null]) bilingual(twinFindProblemWords(reasonCode, field));
    expect(twinFindProblemWords('too_long', 'request.question').zh).toContain(String(L.questionMax));
    expect(twinFindProblemWords('too_long', 'pick.note').zh).toContain(String(L.noteMax));
    expect(twinFindProblemWords('too_long', 'pick.person.label').zh).toContain(String(L.labelMax));
    expect(twinFindProblemWords('too_long', 'consent.displayName').zh).toContain(String(L.displayNameMax));
    expect(twinFindProblemWords('too_long', 'body.line').zh).toContain(String(L.lineMax));
    expect(twinFindProblemWords('invalid_value', 'request.friendRefs').zh).toContain(String(L.friendsMax));
    expect(twinFindProblemWords('text_violation', 'request.question').zh).toContain('电话');
    expect(twinFindProblemWords('invalid_value', 'pick.person.ref').zh).toContain('换一位');
    expect(twinFindProblemWords(null, null)).toEqual(TWIN_FIND_FAILURE_COPY.invalid);
  });

  it('reads a failure as its own words, a broken rule as the rule, anything else as not available', () => {
    expect(twinFindFailureWords(new TwinFindError('closed'))).toEqual(TWIN_FIND_FAILURE_COPY.closed);
    expect(twinFindFailureWords(new TwinFindError('pick_limit')).zh).toContain(String(L.picksPerBridgeMax));
    expect(twinFindFailureWords(new TwinFindError('invalid', { reasonCode: 'too_long', field: 'pick.note' }))).toEqual(twinFindProblemWords('too_long', 'pick.note'));
    expect(twinFindFailureWords(new TwinFindError('invalid'))).toEqual(TWIN_FIND_FAILURE_COPY.invalid);
    expect(twinFindFailureWords(new Error('boom'))).toEqual(TWIN_FIND_FAILURE_COPY.unavailable);
    expect(twinFindFailureWords(undefined)).toEqual(TWIN_FIND_FAILURE_COPY.unavailable);
  });

  it('shows who was asked after starting, by the names the asker picked them with', () => {
    const friends = [
      { friendRef: 'rel:1', label: '老张' },
      { friendRef: 'rel:2', label: '阿 May' },
    ];
    expect(
      twinFindStartedPeople(
        [
          { ref: 'rel:2', route: 'app' },
          { ref: 'rel:1', route: 'pair_weekly_limit' },
          { ref: 'rel:7', route: 'unavailable' },
        ],
        friends,
      ),
    ).toEqual([
      { ref: 'rel:2', label: '阿 May', route: 'app' },
      { ref: 'rel:1', label: '老张', route: 'pair_weekly_limit' },
      { ref: 'rel:7', label: '', route: 'unavailable' },
    ]);
    expect(Object.keys(TWIN_FIND_ROUTE_WORDS).sort()).toEqual([...TWIN_FIND_FRIEND_ROUTES_V0].sort());
    for (const words of Object.values(TWIN_FIND_ROUTE_WORDS)) bilingual(words);
    expect(TWIN_FIND_ROUTE_WORDS.pair_weekly_limit.zh).toContain(String(L.perPairPerWeekMax));
  });

  it('says in the list whose turn it is, for each of the three sides', () => {
    const asker = { role: 'asker' as const, status: 'open' as const, needsMe: false, offers: 0, connected: 0 };
    expect(twinFindStatusWords(asker).zh).toBe('等朋友回话');
    expect(twinFindStatusWords({ ...asker, needsMe: true, offers: 2 }).zh).toBe('2 位等你点头');
    expect(twinFindStatusWords({ ...asker, needsMe: true, offers: 1 }).en).toBe('1 person is waiting for your answer');
    expect(twinFindStatusWords({ ...asker, needsMe: true, offers: 1, connected: 1 }).zh).toBe('1 位等你点头');
    expect(twinFindStatusWords({ ...asker, connected: 2 }).zh).toBe('已牵上 2 位');
    expect(twinFindStatusWords({ ...asker, status: 'closed', connected: 1 }).en).toBe('Introduced to 1 person');
    expect(twinFindStatusWords({ ...asker, status: 'closed' }).zh).toBe('已结束');

    const other = { status: 'open' as const, needsMe: true, offers: null, connected: null };
    expect(twinFindStatusWords({ ...other, role: 'bridge' }).zh).toBe('等你回话');
    expect(twinFindStatusWords({ ...other, role: 'candidate' }).zh).toBe('等你决定');
    expect(twinFindStatusWords({ ...other, role: 'bridge', needsMe: false }).zh).toBe('进行中');
    expect(twinFindStatusWords({ ...other, role: 'candidate', needsMe: false, status: 'closed' }).zh).toBe('已结束');
    for (const role of ['asker', 'bridge', 'candidate'] as const) bilingual(twinFindSideWords(role));
    expect(new Set((['asker', 'bridge', 'candidate'] as const).map((role) => twinFindSideWords(role).zh)).size).toBe(3);
  });

  it('opens the person introduced on their own page and everyone else on the question', () => {
    expect(twinFindOpenTarget({ role: 'asker', id: 'f1', bridgeId: null })).toEqual({ screen: 'detail', id: 'f1' });
    expect(twinFindOpenTarget({ role: 'bridge', id: 'f1', bridgeId: null })).toEqual({ screen: 'detail', id: 'f1' });
    expect(twinFindOpenTarget({ role: 'candidate', id: 'f1', bridgeId: 'b1' })).toEqual({ screen: 'intro', bridgeId: 'b1' });
    expect(twinFindOpenTarget({ role: 'candidate', id: 'f1', bridgeId: null })).toBeNull();
  });

  it("has words for every state of a friend's row on the asker's side, and marks a name typed on a link", () => {
    for (const state of TWIN_FIND_PERSON_STATES_V0) bilingual(twinFindPersonWords({ state }));
    expect(new Set(TWIN_FIND_PERSON_STATES_V0.map((state) => twinFindPersonWords({ state }).zh)).size).toBe(TWIN_FIND_PERSON_STATES_V0.length);
    expect(twinFindOfferNameWords({ displayName: '李师傅', verified: true })).toEqual({ en: '李师傅', zh: '李师傅' });
    expect(twinFindOfferNameWords({ displayName: '李师傅', verified: false })).toEqual({ en: '李师傅 (Unverified)', zh: '李师傅（未验证）' });
    const people = [{ state: 'offered' as const }, { state: 'connected' as const }, { state: 'waiting' as const }, { state: 'none' as const }, { state: 'offered' as const }];
    expect(twinFindTally(people)).toEqual({ asked: 5, offered: 2, connected: 1 });
    expect(twinFindTallyWords(twinFindTally(people))).toEqual({ en: 'Asked 5 · 2 waiting for you · 1 introduced', zh: '问了 5 位 · 2 位等你点头 · 已牵上 1 位' });
    expect(Object.keys(TWIN_FIND_CLOSED_WORDS).sort()).toEqual([...TWIN_FIND_CLOSE_REASONS_V0].sort());
    for (const words of Object.values(TWIN_FIND_CLOSED_WORDS)) bilingual(words);
  });

  it("has words for every state on the friend's side, open and ended", () => {
    for (const state of TWIN_FIND_BRIDGE_STATES_V0) {
      bilingual(twinFindBridgeStateWords(state, 'open'));
      bilingual(twinFindBridgeStateWords(state, 'closed'));
    }
    expect(new Set(TWIN_FIND_BRIDGE_STATES_V0.map((state) => twinFindBridgeStateWords(state, 'open').zh)).size).toBe(TWIN_FIND_BRIDGE_STATES_V0.length);
    expect(twinFindBridgeStateWords('connected', 'closed')).toEqual(TWIN_FIND_FIXED_PHRASES_V0.bridgeNext);
    expect(twinFindBridgeStateWords('asked', 'closed')).toEqual(twinFindBridgeStateWords('picked', 'closed'));
    expect(twinFindPickedWords({ route: 'app', label: '李师傅' }).zh).toBe('李师傅 · 已在站内问');
    expect(twinFindPickedWords({ route: 'link', label: '李师傅' }).zh).toBe('李师傅 · 用链接问，你来转发');
    expect(twinFindPicksLeftWords(1)).toEqual({ en: 'You can ask 1 more person.', zh: '还可以再问 1 位。' });
    expect(twinFindPicksLeftWords(2).en).toBe('You can ask 2 more people.');
  });

  it('forwards only the link, and says it is shown once', () => {
    const url = 'https://web.example/find#AbCdEfGhIjKlMnOpQrSt_-';
    const words = twinFindShareWords(url);
    expect(words.zh.endsWith(url)).toBe(true);
    expect(words.en.endsWith(url)).toBe(true);
    expect(words.zh).toContain('由你决定');
    bilingual({ en: words.en, zh: words.zh });
    bilingual(TWIN_FIND_LINK_ONCE_WORDS);
  });

  it('has words for every state on the side of the person introduced', () => {
    for (const state of TWIN_FIND_INTRO_STATES_V0) {
      bilingual(twinFindIntroStateWords(state, 'open'));
      bilingual(twinFindIntroStateWords(state, 'closed'));
    }
    expect(twinFindIntroStateWords('asked', 'open').zh).toContain('不会知道是你');
    expect(twinFindIntroStateWords('asked', 'closed').zh).toBe('这次提问已经结束了。');
    expect(twinFindIntroStateWords('agreed', 'open').zh).toContain('可以撤回');
  });

  it('tells every side that no contact details are exchanged', () => {
    for (const words of [TWIN_FIND_HOW_WORDS, TWIN_FIND_CONSENT_WORDS]) {
      bilingual(words);
      expect(words.zh).toContain('平台不交换联系方式');
      expect(words.en).toContain('No contact details are exchanged');
    }
    bilingual(TWIN_FIND_UNVERIFIED_WORDS);
    expect(TWIN_FIND_HOW_WORDS.zh).toContain(`${Math.round(L.openMs / DAY)} 天`);
  });
});
