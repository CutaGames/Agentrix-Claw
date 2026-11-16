import { describe, it, expect } from '@jest/globals';
import {
  TWIN_ASK_ANSWERED_BY_LABELS_V0,
  TWIN_ASK_CLOSE_REASONS_V0,
  TWIN_ASK_LIMITS_V0,
  TWIN_ASK_MY_STATES_V0,
  TWIN_ASK_PUBLIC_ROUTES_V0,
  TWIN_ASK_TWIN_TOPICS_V0,
  type TwinAskListItemV0,
  type TwinAskTwinTopicV0,
} from '../../../shared/types/twin-ask';
import { TWIN_ASK_FAILURE_COPY, TWIN_ASK_STEP_UP_COPY, TwinAskError, type MobileTwinAskStartOutcome } from '../twinAsk';
import {
  TWIN_ASK_CLOSED_WORDS,
  TWIN_ASK_DAILY_CAP_CHOICES,
  TWIN_ASK_OWNER_ONLY_WORDS,
  TWIN_ASK_ROUTE_WORDS,
  TWIN_ASK_SHARING_STEP_UP_REASON,
  twinAskCanRelink,
  twinAskDailyCapWords,
  twinAskFactFits,
  twinAskFactFromForm,
  twinAskFactsByTopic,
  twinAskFailureWords,
  twinAskMyStateWords,
  twinAskPersonLabel,
  twinAskPersonWords,
  twinAskProblemWords,
  twinAskProfilePatch,
  twinAskReceiptWords,
  twinAskRefLabel,
  twinAskReplyFromForm,
  twinAskRequestFromForm,
  twinAskShareWords,
  twinAskSharingChange,
  twinAskSharingSaveWords,
  twinAskSideWords,
  twinAskStartedPeople,
  twinAskStatusWords,
  twinAskTally,
  twinAskTallyWords,
  twinAskTimeLeftWords,
  twinAskWhenWords,
  twinAskWidenWords,
  type TwinAskStartForm,
} from '../twinAskView';

const L = TWIN_ASK_LIMITS_V0;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// Monday 16 November 2026, 17:30 local time.
const NOW = new Date(2026, 10, 16, 17, 30);
const CJK = /[\u3400-\u9fff]/;
const QUESTION = '附近哪家面馆好吃？';

const form = (patch: Partial<TwinAskStartForm> = {}): TwinAskStartForm => ({
  topic: 'food',
  question: `  ${QUESTION} `,
  friendRefs: ['rel:1'],
  guestLabels: [],
  ...patch,
});

type Row = Pick<TwinAskListItemV0, 'role' | 'status' | 'answered' | 'people' | 'needsMe'>;
const row = (patch: Partial<Row> = {}): Row => ({ role: 'asker', status: 'open', answered: 2, people: 5, needsMe: false, ...patch });

const fact = (id: string, topic: TwinAskTwinTopicV0) => ({
  id,
  topic,
  text: id,
  source: 'settings' as const,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

describe('twinAskView', () => {
  it('turns the start form into the request the server checks, with the same rules', () => {
    expect(twinAskRequestFromForm(form({ guestLabels: [' 老王 ', '  '] }))).toEqual({
      ok: true,
      value: { topic: 'food', question: QUESTION, friendRefs: ['rel:1'], guestLabels: ['老王'] },
    });
    expect(twinAskRequestFromForm(form())).toEqual({ ok: true, value: { topic: 'food', question: QUESTION, friendRefs: ['rel:1'] } });
    expect(twinAskRequestFromForm(form({ friendRefs: [], guestLabels: ['老王'] }))).toEqual({
      ok: true,
      value: { topic: 'food', question: QUESTION, friendRefs: [], guestLabels: ['老王'] },
    });
    expect(twinAskRequestFromForm(form({ friendRefs: [] }))).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.friendRefs' });
    expect(twinAskRequestFromForm(form({ question: '   ' }))).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.question' });
    expect(twinAskRequestFromForm(form({ question: '好'.repeat(L.questionMax + 1) }))).toEqual({ ok: false, reasonCode: 'too_long', field: 'request.question' });
    expect(twinAskRequestFromForm(form({ question: 'mail me at a.lee@example.com' }))).toEqual({
      ok: false,
      reasonCode: 'text_violation',
      field: 'request.question',
    });
    expect(twinAskRequestFromForm(form({ guestLabels: ['a.lee@example.com'] }))).toEqual({
      ok: false,
      reasonCode: 'text_violation',
      field: 'request.guestLabels[0]',
    });
  });

  it('says what to fix for each problem the form or the server reports', () => {
    expect(twinAskProblemWords('too_long', 'request.question').zh).toContain(String(L.questionMax));
    expect(twinAskProblemWords('text_violation', 'request.question').zh).toContain('联系方式');
    expect(twinAskProblemWords('invalid_value', 'request.question')).toEqual({ en: 'Please write your question first.', zh: '请先写下要问的问题。' });
    expect(twinAskProblemWords('text_violation', 'request.guestLabels[0]').zh).toContain('称呼里');
    expect(twinAskProblemWords('invalid_value', 'request.friendRefs').zh).toContain(String(L.peopleMax));
    expect(twinAskProblemWords('too_long', 'request.guestLabels[1]').zh).toContain(String(L.guestLabelMax));
    expect(twinAskProblemWords('unknown_field', 'request.extra')).toBe(TWIN_ASK_FAILURE_COPY.invalid);
    expect(twinAskProblemWords(null, null)).toBe(TWIN_ASK_FAILURE_COPY.invalid);
  });

  it('words any client error, pointing at the field when the server names one', () => {
    expect(twinAskFailureWords(new Error('boom'))).toBe(TWIN_ASK_FAILURE_COPY.unavailable);
    expect(twinAskFailureWords(new TwinAskError('too_many'))).toBe(TWIN_ASK_FAILURE_COPY.too_many);
    expect(twinAskFailureWords(new TwinAskError('step_up_required'))).toBe(TWIN_ASK_FAILURE_COPY.step_up_required);
    expect(twinAskFailureWords(new TwinAskError('invalid', { reasonCode: 'too_long', field: 'request.question' }))).toEqual(
      twinAskProblemWords('too_long', 'request.question'),
    );
    expect(twinAskFailureWords(new TwinAskError('invalid'))).toBe(TWIN_ASK_FAILURE_COPY.invalid);
  });

  it('names everyone the question went to and keeps each link with its person', () => {
    const outcome: Extract<MobileTwinAskStartOutcome, { started: true }> = {
      started: true,
      askId: '0b9e3a52-6f1d-4c2e-9a57-3d1f6b8c2e10',
      routes: [
        { ref: 'rel:1', route: 'app' },
        { ref: 'rel:2', route: 'link' },
        { ref: 'guest:1', route: 'link' },
        { ref: 'rel:3', route: 'pair_weekly_limit' },
        { ref: 'rel:9', route: 'unavailable' },
      ],
      links: [
        { ref: 'guest:1', url: 'https://web.example/ask#G' },
        { ref: 'rel:2', url: 'https://web.example/ask#R' },
      ],
    };
    const friends = [
      { friendRef: 'rel:1', label: '阿强' },
      { friendRef: 'rel:2', label: '小美' },
      { friendRef: 'rel:3', label: '老周' },
    ];
    expect(twinAskStartedPeople(outcome, friends, ['阿梅'])).toEqual([
      { ref: 'rel:1', label: '阿强', route: 'app', url: null },
      { ref: 'rel:2', label: '小美', route: 'link', url: 'https://web.example/ask#R' },
      { ref: 'guest:1', label: '阿梅', route: 'link', url: 'https://web.example/ask#G' },
      { ref: 'rel:3', label: '老周', route: 'pair_weekly_limit', url: null },
      { ref: 'rel:9', label: 'rel:9', route: 'unavailable', url: null },
    ]);
    expect(twinAskRefLabel('guest:2', friends, ['阿梅', '老王'])).toBe('老王');
    expect(twinAskRefLabel('guest:3', friends, ['阿梅', '老王'])).toBe('guest:3');
  });

  it('has words for every route, the forwarded link and the owner-only rule', () => {
    for (const route of TWIN_ASK_PUBLIC_ROUTES_V0) {
      expect(TWIN_ASK_ROUTE_WORDS[route].zh).toMatch(CJK);
      expect(TWIN_ASK_ROUTE_WORDS[route].en.length).toBeGreaterThan(0);
    }
    expect(TWIN_ASK_ROUTE_WORDS.pair_weekly_limit.zh).toContain(String(L.perPairPerWeekMax));
    const share = twinAskShareWords('https://web.example/ask#G');
    expect(share.zh).toContain('https://web.example/ask#G');
    expect(share.en).toContain('https://web.example/ask#G');
    expect(TWIN_ASK_OWNER_ONLY_WORDS.zh).toMatch(CJK);
  });

  it('words each list row from its own side', () => {
    expect(twinAskSideWords('asker')).toEqual({ en: 'You asked', zh: '我问的' });
    expect(twinAskSideWords('invited')).toEqual({ en: 'Asked you', zh: '问我的' });
    expect(twinAskStatusWords(row())).toEqual({ en: '2 of 5 answered', zh: '2/5 人回答了' });
    expect(twinAskStatusWords(row({ status: 'closed' }))).toEqual({ en: 'Ended · 2 of 5 answered', zh: '结束了 · 2/5 人回答了' });
    expect(twinAskStatusWords(row({ answered: null, people: null }))).toEqual({ en: 'Waiting for answers', zh: '在等回答' });
    expect(twinAskStatusWords(row({ role: 'invited', answered: null, people: null, needsMe: true }))).toEqual({ en: 'Waiting for your answer', zh: '等你回答' });
    expect(twinAskStatusWords(row({ role: 'invited', answered: null, people: null }))).toEqual({ en: 'Open', zh: '进行中' });
    expect(twinAskStatusWords(row({ role: 'invited', status: 'closed', needsMe: true }))).toEqual({ en: 'Ended', zh: '结束了' });
  });

  it('says when, in local time, and how long a question stays open', () => {
    expect(twinAskWhenWords(new Date(2026, 10, 16, 9, 5), NOW)).toEqual({ en: 'Today 09:05', zh: '今天 09:05' });
    expect(twinAskWhenWords(new Date(2026, 10, 15, 21, 0), NOW)).toEqual({ en: 'Yesterday 21:00', zh: '昨天 21:00' });
    expect(twinAskWhenWords(new Date(2026, 10, 17, 8, 0), NOW)).toEqual({ en: 'Tomorrow 08:00', zh: '明天 08:00' });
    expect(twinAskWhenWords(new Date(2026, 10, 14, 18, 5), NOW)).toEqual({ en: '14 Nov 18:05', zh: '11月14日 18:05' });
    const after = (ms: number): string => new Date(NOW.getTime() + ms).toISOString();
    expect(twinAskTimeLeftWords(after(5 * HOUR + 20 * MINUTE), NOW)).toEqual({ en: '5 h left', zh: '还剩 5 小时' });
    expect(twinAskTimeLeftWords(after(30 * MINUTE), NOW)).toEqual({ en: '30 min left', zh: '还剩 30 分钟' });
    expect(twinAskTimeLeftWords(after(10 * 1000), NOW)).toEqual({ en: '1 min left', zh: '还剩 1 分钟' });
    expect(twinAskTimeLeftWords(after(0), NOW)).toBeNull();
    expect(twinAskTimeLeftWords('not a date', NOW)).toBeNull();
  });

  it('checks the in-app answer like the server, keeping it for the twin only when allowed', () => {
    expect(twinAskReplyFromForm(' 牛肉面不错 ', false, true)).toEqual({ ok: true, value: { text: '牛肉面不错' } });
    expect(twinAskReplyFromForm('牛肉面不错', true, true)).toEqual({ ok: true, value: { text: '牛肉面不错', saveAsFact: true } });
    expect(twinAskReplyFromForm('牛肉面不错', true, false)).toEqual({ ok: true, value: { text: '牛肉面不错' } });
    expect(twinAskReplyFromForm('预算多少钱', true, true)).toEqual({ ok: false, reasonCode: 'text_violation', field: 'reply.saveAsFact' });
    expect(twinAskReplyFromForm('  ', false, true)).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'reply.text' });
    expect(twinAskProblemWords('too_long', 'body.text').zh).toContain(String(L.replyMax));
    expect(twinAskProblemWords('text_violation', 'reply.text').zh).toContain('回答里');
    expect(twinAskProblemWords('text_violation', 'body.saveAsFact').zh).toContain('钱');
    expect(twinAskProblemWords('invalid_value', 'body.text')).toEqual({ en: 'Please write your answer first.', zh: '请先写下回答。' });
  });

  it('words the summary card, the receipt and the asked person\'s own state', () => {
    expect(twinAskPersonWords({ state: 'answered', answeredBy: 'twin' })).toBe(TWIN_ASK_ANSWERED_BY_LABELS_V0.twin);
    expect(twinAskPersonWords({ state: 'answered', answeredBy: 'guest' }).zh).toBe('未验证');
    expect(twinAskPersonWords({ state: 'waiting', answeredBy: null })).toEqual({ en: 'Not answered yet', zh: '还没回答' });
    expect(twinAskPersonWords({ state: 'no_answer', answeredBy: null })).toEqual({ en: 'No answer', zh: '没有回答' });
    const tally = twinAskTally([
      { state: 'answered', answeredBy: 'twin' },
      { state: 'answered', answeredBy: 'guest' },
      { state: 'waiting', answeredBy: null },
    ]);
    expect(tally).toEqual({ answered: 2, total: 3, twin: 1, owner: 0, guest: 1 });
    expect(twinAskTallyWords(tally)).toEqual({
      en: '2 of 3 answered · Relayed by their twin 1 · Unverified 1',
      zh: '2/3 人回答了 · 分身转述 1 · 未验证 1',
    });
    for (const reason of TWIN_ASK_CLOSE_REASONS_V0) expect(TWIN_ASK_CLOSED_WORDS[reason].zh).toMatch(CJK);
    expect(twinAskReceiptWords({ status: 'open', receiptSigned: false })).toBeNull();
    expect(twinAskReceiptWords({ status: 'closed', receiptSigned: true })?.zh).toContain('回执');
    expect(twinAskReceiptWords({ status: 'closed', receiptSigned: false })?.zh).toContain('补签');
    for (const myState of TWIN_ASK_MY_STATES_V0) expect(twinAskMyStateWords({ myState, answeredBy: null }).zh).toMatch(CJK);
    expect(twinAskMyStateWords({ myState: 'answered', answeredBy: 'twin' }).zh).toContain('分身');
    expect(twinAskMyStateWords({ myState: 'answered', answeredBy: 'owner' })).toEqual({ en: 'You answered', zh: '你回答了' });
  });

  it('offers a fresh link only while someone asked by link can still answer', () => {
    const open = { status: 'open' as const, endsAt: new Date(NOW.getTime() + HOUR).toISOString() };
    expect(twinAskCanRelink(open, { via: 'link', state: 'waiting' }, NOW)).toBe(true);
    expect(twinAskCanRelink(open, { via: 'app', state: 'waiting' }, NOW)).toBe(false);
    expect(twinAskCanRelink(open, { via: 'link', state: 'answered' }, NOW)).toBe(false);
    expect(twinAskCanRelink({ status: 'closed', endsAt: open.endsAt }, { via: 'link', state: 'waiting' }, NOW)).toBe(false);
    expect(twinAskCanRelink({ status: 'open', endsAt: new Date(NOW.getTime() - MINUTE).toISOString() }, { via: 'link', state: 'waiting' }, NOW)).toBe(false);
    expect(twinAskPersonLabel('guest:1', [{ ref: 'guest:1', label: '老王' }])).toBe('老王');
    expect(twinAskPersonLabel('rel:7', [])).toBe('rel:7');
  });

  it('keeps settings changes small and the facts within their limits', () => {
    expect(twinAskDailyCapWords(0)).toEqual({ en: 'Pause', zh: '先不接' });
    expect(twinAskDailyCapWords(3)).toEqual({ en: '3 a day', zh: '3 次' });
    expect(TWIN_ASK_DAILY_CAP_CHOICES[TWIN_ASK_DAILY_CAP_CHOICES.length - 1]).toBe(L.perFriendPerDayMax);
    const before = { optIn: false, dailyCap: null };
    expect(twinAskProfilePatch(before, before)).toBeNull();
    expect(twinAskProfilePatch(before, { optIn: true, dailyCap: null })).toEqual({ optIn: true });
    expect(twinAskProfilePatch(before, { optIn: false, dailyCap: 3 })).toEqual({ dailyCap: 3 });
    expect(twinAskFactFromForm('food', ' 牛肉面不错 ')).toEqual({ ok: true, value: { topic: 'food', text: '牛肉面不错' } });
    expect(twinAskFactFromForm(null, '牛肉面不错')).toMatchObject({ ok: false, field: 'fact.topic' });
    expect(twinAskFactFromForm('kids_school', '孩子叫王小明')).toEqual({ ok: false, reasonCode: 'text_violation', field: 'fact.text' });
    expect(twinAskProblemWords('invalid_value', 'fact.topic')).toEqual({ en: 'Pick a topic first.', zh: '请先选一个话题。' });
    expect(twinAskProblemWords('text_violation', 'fact.text').zh).toContain('钱数');
    expect(twinAskProblemWords('invalid_value', 'profile.dailyCap').zh).toContain(String(L.perFriendPerDayMax));
    const facts = [fact('a', 'work'), fact('b', 'food'), fact('c', 'work')];
    expect(twinAskFactsByTopic(facts).map((group) => [group.topic, group.facts.map((item) => item.id)])).toEqual([
      ['food', ['b']],
      ['work', ['a', 'c']],
    ]);
    expect(twinAskFactFits(facts, 'work')).toBe(true);
    const fullTopic = Array.from({ length: L.factsPerTopicMax }, (_, i) => fact(`w${i}`, 'work'));
    expect(twinAskFactFits(fullTopic, 'work')).toBe(false);
    expect(twinAskFactFits(fullTopic, 'food')).toBe(true);
    const full = Array.from({ length: L.factsMax }, (_, i) => fact(`f${i}`, TWIN_ASK_TWIN_TOPICS_V0[i % TWIN_ASK_TWIN_TOPICS_V0.length]));
    expect(twinAskFactFits(full, 'home')).toBe(false);
  });

  it('says what saving a tier changes, and what came of it', () => {
    expect(twinAskSharingChange({ topics: ['food', 'work'] }, ['work', 'food'])).toBeNull();
    expect(twinAskSharingChange({ topics: ['food', 'work'] }, ['travel', 'food'])).toEqual({ added: ['travel'], removed: ['work'] });
    expect(twinAskWidenWords({ en: 'Family', zh: '家人' }, ['food', 'travel'])).toEqual({
      en: 'When friends in "Family" ask about Food and drink, Getting around, your twin may pass on what you wrote on those topics.',
      zh: '「家人」这一档的朋友问到吃喝、出行时，分身可以转述你写的相关条目。',
    });
    expect(twinAskSharingSaveWords({ kind: 'saved', sharing: { tiers: [] } })).toEqual({ en: 'Saved.', zh: '已保存。' });
    expect(twinAskSharingSaveWords({ kind: 'failed', failure: 'step_up_cancelled' })).toBe(TWIN_ASK_STEP_UP_COPY.step_up_cancelled);
    expect(twinAskSharingSaveWords({ kind: 'failed', failure: 'changed' })).toBe(TWIN_ASK_FAILURE_COPY.changed);
    expect(TWIN_ASK_SHARING_STEP_UP_REASON.title.zh).toMatch(CJK);
  });
});
