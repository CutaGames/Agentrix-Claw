import { describe, it, expect } from '@jest/globals';
import { TWIN_HUDDLE_DIET_LABELS_V0, TWIN_HUDDLE_STATUSES_V0 } from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError } from '../twinHuddle';
import {
  twinHuddleDailyCapWords,
  twinHuddleDayWords,
  twinHuddleDeadlineWords,
  twinHuddleDietWords,
  twinHuddleFailureWords,
  twinHuddleLinkLabels,
  twinHuddlePeopleLabels,
  twinHuddlePicksFromAnswer,
  twinHuddleProblemWords,
  twinHuddleProfilePatch,
  twinHuddleProposalWords,
  twinHuddleReplyFromPicks,
  twinHuddleRequestFromForm,
  twinHuddleShareWords,
  twinHuddleSlotOptions,
  twinHuddleSlotWords,
  twinHuddleStatusWords,
  type TwinHuddleStartForm,
} from '../twinHuddleView';

// Wednesday 18 November 2026, 11:30 local time.
const NOW = new Date(2026, 10, 18, 11, 30);
const at = (day: number, hour: number, minute = 0): string => new Date(2026, 10, day, hour, minute).toISOString();
const slot = (day: number, hour: number, endHour: number) => ({ startAt: at(day, hour), endAt: at(day, endHour) });
const CJK = /[\u3400-\u9fff]/;

const form = (patch: Partial<TwinHuddleStartForm> = {}): TwinHuddleStartForm => ({
  kind: 'meal',
  budget: 'mid',
  slots: [slot(20, 19, 21), slot(19, 12, 13)],
  friendRefs: ['u:42'],
  guestLabels: ['  阿 May ', ''],
  note: '  ',
  ...patch,
});

describe('twin huddle screen helpers', () => {
  it('offers times from an hour ahead, four a day, in local time', () => {
    const options = twinHuddleSlotOptions(NOW);
    expect(options[0]).toMatchObject({ dayOffset: 0, part: 'afternoon' });
    expect(new Date(options[0].slot.startAt).getHours()).toBe(15);
    expect(options).toHaveLength(2 + 6 * 4);
    expect(options.every((option) => Date.parse(option.slot.startAt) - NOW.getTime() >= 60 * 60 * 1000)).toBe(true);
    expect(options.filter((option) => option.dayOffset === 1).map((option) => option.part)).toEqual(['morning', 'lunch', 'afternoon', 'evening']);
  });

  it('names days and times the way people say them', () => {
    expect(twinHuddleDayWords(new Date(2026, 10, 18, 20), NOW)).toEqual({ en: 'Today', zh: '今天' });
    expect(twinHuddleDayWords(new Date(2026, 10, 19, 8), NOW)).toEqual({ en: 'Tomorrow', zh: '明天' });
    expect(twinHuddleDayWords(new Date(2026, 10, 20, 8), NOW)).toEqual({ en: 'Fri 20 Nov', zh: '11月20日 周五' });
    expect(twinHuddleSlotWords(slot(19, 19, 21), NOW)).toEqual({ en: 'Tomorrow 19:00–21:00', zh: '明天 19:00–21:00' });
    expect(twinHuddleSlotWords({ startAt: at(18, 22), endAt: at(19, 1) }, NOW).zh).toBe('今天 22:00–明天 01:00');
  });

  it('turns the form into a sorted, trimmed request', () => {
    expect(twinHuddleRequestFromForm(form(), NOW)).toEqual({
      ok: true,
      value: { kind: 'meal', candidates: [slot(19, 12, 13), slot(20, 19, 21)], budget: 'mid', friendRefs: ['u:42'], guestLabels: ['阿 May'] },
    });
  });

  it('says what to fix', () => {
    const nobody = twinHuddleRequestFromForm(form({ friendRefs: [], guestLabels: [] }), NOW);
    expect(nobody.ok).toBe(false);
    if (nobody.ok === false) expect(twinHuddleProblemWords(nobody.reasonCode, nobody.field).zh).toContain('1 到 9');
    expect(twinHuddleRequestFromForm(form({ slots: [slot(17, 19, 21)] }), NOW)).toEqual({ ok: false, reasonCode: 'invalid_value', field: 'request.candidates' });
    const contact = twinHuddleRequestFromForm(form({ note: '有事发邮件 me@example.com' }), NOW);
    expect(contact).toMatchObject({ ok: false, reasonCode: 'text_violation' });
    if (contact.ok === false) expect(twinHuddleProblemWords(contact.reasonCode, contact.field).zh).toContain('联系方式');
    expect(twinHuddleProblemWords('too_long', 'body.note').en).toContain('300');
    expect(twinHuddleProblemWords('invalid_type', 'body.kind').zh).toBe('填的内容有不对的地方，请检查后再试。');
  });

  it('labels each link and words the message that goes with it', () => {
    const links = [
      { ref: 'u:7', url: 'https://web.example/huddle#a' },
      { ref: 'guest:2', url: 'https://web.example/huddle#b' },
      { ref: 'guest:9', url: 'https://web.example/huddle#c' },
    ];
    expect(twinHuddleLinkLabels(links, [{ friendRef: 'u:7', label: '老张' }], ['阿 May', '小李']).map((link) => link.label)).toEqual(['老张', '小李', 'guest:9']);
    expect(twinHuddleShareWords('https://web.example/huddle#a').zh).toContain('https://web.example/huddle#a');
  });

  it('has words for every status from both sides', () => {
    for (const status of TWIN_HUDDLE_STATUSES_V0) {
      for (const role of ['initiator', 'invited'] as const) {
        for (const needsMe of [true, false]) {
          const words = twinHuddleStatusWords({ status, role, needsMe });
          expect(words.en.length).toBeGreaterThan(0);
          expect(words.zh).toMatch(CJK);
        }
      }
    }
    expect(twinHuddleStatusWords({ status: 'choosing', role: 'initiator', needsMe: true }).zh).toBe('时间收齐了，等你选');
    expect(twinHuddleStatusWords({ status: 'confirming', role: 'invited', needsMe: true }).zh).toBe('等你确认来不来');
  });
});

describe('twin huddle detail and settings helpers', () => {
  const people = [
    { ref: 'u:1', label: '老张', route: 'twin' as const },
    { ref: 'guest:1', label: '阿梅', route: 'link' as const },
    { ref: 'u:2', label: '小李', route: 'owner' as const },
  ];

  it('words deadlines, who can come and diets', () => {
    expect(twinHuddleDeadlineWords(at(19, 19, 30), NOW)).toEqual({ en: 'Until Tomorrow 19:30', zh: '明天 19:30 前' });
    expect(twinHuddleDeadlineWords(null, NOW)).toBeNull();
    const proposal = { candidate: 1, slot: slot(19, 19, 21), attendees: ['u:2', 'guest:1', 'u:9'], everyone: false, budget: 'mid' as const, dietTags: [] };
    expect(twinHuddlePeopleLabels(proposal.attendees, people)).toEqual(['小李', '阿梅']);
    expect(twinHuddleProposalWords(proposal, people).zh).toBe('2 人能来：小李、阿梅');
    expect(twinHuddleProposalWords({ ...proposal, everyone: true }, people).zh).toBe('大家都行');
    expect(twinHuddleDietWords(['no_spicy', 'halal']).zh).toBe(`忌口：${TWIN_HUDDLE_DIET_LABELS_V0.no_spicy.zh}、${TWIN_HUDDLE_DIET_LABELS_V0.halal.zh}`);
  });

  it('builds the in-app reply only once every time has a yes or no', () => {
    const picks = twinHuddlePicksFromAnswer([{ candidate: 0, value: 'yes', basis: 'published_slots' }, { candidate: 1, value: 'needs_owner' }]);
    expect(picks).toEqual({ 0: 'yes' });
    expect(twinHuddleReplyFromPicks(2, picks)).toBeNull();
    expect(twinHuddleReplyFromPicks(2, { ...picks, 1: 'no' })).toEqual([{ candidate: 0, value: 'yes' }, { candidate: 1, value: 'no' }]);
    expect(twinHuddlePicksFromAnswer(null)).toEqual({});
  });

  it('sends only the settings that changed', () => {
    const before = { optIn: false, dailyCap: null, dietTags: ['halal' as const], budgetMax: null };
    expect(twinHuddleProfilePatch(before, { ...before })).toBeNull();
    expect(twinHuddleProfilePatch(before, { ...before, optIn: true, dietTags: ['halal', 'no_spicy'] })).toEqual({ optIn: true, dietTags: ['no_spicy', 'halal'] });
    expect(twinHuddleProfilePatch(before, { ...before, dailyCap: 0, budgetMax: 'low' })).toEqual({ dailyCap: 0, budgetMax: 'low' });
    expect(twinHuddleDailyCapWords(0).zh).toBe('先不接');
    expect(twinHuddleDailyCapWords(3).zh).toBe('3 次');
  });

  it('turns client errors into words', () => {
    expect(twinHuddleFailureWords(new TwinHuddleError('too_many'))).toEqual(TWIN_HUDDLE_FAILURE_COPY.too_many);
    expect(twinHuddleFailureWords(new TwinHuddleError('invalid', { reasonCode: 'too_long', field: 'body.note' })).zh).toBe('备注最多 300 个字。');
    expect(twinHuddleFailureWords(new Error('boom'))).toEqual(TWIN_HUDDLE_FAILURE_COPY.unavailable);
  });
});
