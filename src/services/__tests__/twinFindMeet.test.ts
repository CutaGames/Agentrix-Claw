import { describe, it, expect } from '@jest/globals';
import type { TwinFindBridgeViewV0 } from '../../../shared/types/twin-find';
import { TWIN_HUDDLE_FRIEND_ROUTES_V0, twinHuddleGuestRefV0 } from '../../../shared/types/twin-huddle';
import { TWIN_FIND_MEET_HINT_WORDS, TWIN_FIND_MEET_WORDS, twinFindMeetOffer, twinFindMeetUnavailableWords, type TwinFindWords } from '../twinFindView';
import { twinHuddlePresetPeople, type TwinHuddleStartPreset } from '../twinHuddleView';

const CJK = /[\u3400-\u9fff]/;
const ASKER_REF = 'rel:bbbbbbbb-0000-4000-8000-000000000005';
const CANDIDATE_REF = 'rel:bbbbbbbb-0000-4000-8000-000000000001';

type MeetView = Pick<TwinFindBridgeViewV0, 'myState' | 'askerName' | 'picked' | 'meet'>;

const CONNECTED: MeetView = {
  myState: 'connected',
  askerName: '小周',
  picked: { route: 'app', label: '李师傅', note: null },
  meet: { askerRef: ASKER_REF, candidateRef: CANDIDATE_REF, candidateLabel: null },
};
const BY_LINK: MeetView = {
  myState: 'connected',
  askerName: '小周',
  picked: { route: 'link', label: '老张', note: null },
  meet: { askerRef: ASKER_REF, candidateRef: null, candidateLabel: '老张' },
};

function bilingual(words: TwinFindWords): void {
  expect(words.en.trim()).not.toBe('');
  expect(words.en).not.toMatch(CJK);
  expect(words.zh).toMatch(CJK);
}

describe('after an introduction went through: setting up a time for the three', () => {
  it('fills the plan with the two people, by the names the friend knows them by', () => {
    expect(twinFindMeetOffer(CONNECTED, true)).toEqual({
      kind: 'start',
      plan: {
        friends: [
          { ref: ASKER_REF, label: '小周' },
          { ref: CANDIDATE_REF, label: '李师傅' },
        ],
        guestLabels: [],
      },
    });
  });

  it('gives the person reached by link a link place under the label the friend wrote', () => {
    expect(twinFindMeetOffer(BY_LINK, true)).toEqual({ kind: 'start', plan: { friends: [{ ref: ASKER_REF, label: '小周' }], guestLabels: ['老张'] } });
  });

  it('shows nothing while the build has it off, before all three agreed, or when the server sent no people', () => {
    expect(twinFindMeetOffer(CONNECTED, false)).toBeNull();
    expect(twinFindMeetOffer({ ...CONNECTED, myState: 'offered' }, true)).toBeNull();
    expect(twinFindMeetOffer({ ...CONNECTED, meet: undefined }, true)).toBeNull();
  });

  it("says who is missing when one of the two is no longer in the friend's list, instead of offering a plan for two", () => {
    const noAsker = twinFindMeetOffer({ ...CONNECTED, meet: { askerRef: null, candidateRef: CANDIDATE_REF, candidateLabel: null } }, true);
    expect(noAsker).toEqual({ kind: 'unavailable', who: 'asker' });
    const noCandidate = twinFindMeetOffer({ ...CONNECTED, meet: { askerRef: ASKER_REF, candidateRef: null, candidateLabel: null } }, true);
    expect(noCandidate).toEqual({ kind: 'unavailable', who: 'candidate' });
    // The asker gone and the other reached by link: still no plan, and it is the asker that is named.
    expect(twinFindMeetOffer({ ...BY_LINK, meet: { askerRef: null, candidateRef: null, candidateLabel: '老张' } }, true)).toEqual({ kind: 'unavailable', who: 'asker' });

    const asker = twinFindMeetUnavailableWords('asker', '小周');
    const candidate = twinFindMeetUnavailableWords('candidate', '小周');
    bilingual(candidate);
    expect(asker.zh).toContain('小周');
    expect(asker.en).toContain('小周');
    expect(candidate.zh).not.toContain('小周');
  });

  it('has the button and its hint in both languages, and the hint says nothing is sent yet', () => {
    bilingual(TWIN_FIND_MEET_WORDS);
    bilingual(TWIN_FIND_MEET_HINT_WORDS);
    expect(TWIN_FIND_MEET_WORDS.zh).toBe('约三个人见一面');
    expect(TWIN_FIND_MEET_HINT_WORDS.zh).toContain('不会发出任何东西');
  });
});

describe('a plan started with the people already filled in', () => {
  const preset: TwinHuddleStartPreset = {
    from: 'find',
    friends: [
      { ref: ASKER_REF, label: '小周' },
      { ref: CANDIDATE_REF, label: '李师傅' },
    ],
    guestLabels: [],
  };

  it('says for each person how they were asked', () => {
    const people = twinHuddlePresetPeople(preset, [
      { ref: ASKER_REF, route: 'twin' },
      { ref: CANDIDATE_REF, route: 'owner' },
    ]);
    expect(people.map((person) => [person.key, person.label, person.asked])).toEqual([
      [ASKER_REF, '小周', true],
      [CANDIDATE_REF, '李师傅', true],
    ]);
    expect(people[0].words.zh).toBe('对方的分身按日历回答');
    expect(people[1].words.zh).toBe('已在 App 里请本人选');
  });

  it('names the one who was not asked: the plan went ahead without them', () => {
    for (const route of ['pair_weekly_limit', 'unavailable'] as const) {
      const people = twinHuddlePresetPeople(preset, [
        { ref: ASKER_REF, route: 'link' },
        { ref: CANDIDATE_REF, route },
      ]);
      expect(people.map((person) => person.asked)).toEqual([true, false]);
      expect(people[1].words.zh.startsWith('没有去问')).toBe(true);
      expect(people[1].words.en.startsWith('Not asked')).toBe(true);
    }
    // The server left someone out of its answer altogether: that reads as not asked, never as asked.
    const missing = twinHuddlePresetPeople(preset, [{ ref: ASKER_REF, route: 'twin' }]);
    expect(missing[1]).toMatchObject({ key: CANDIDATE_REF, asked: false });
    expect(missing[1].words.zh.startsWith('没有去问')).toBe(true);
  });

  it('lists the person reached by link after the friends, with the place the link is for', () => {
    const people = twinHuddlePresetPeople({ from: 'find', friends: [{ ref: ASKER_REF, label: '小周' }], guestLabels: ['老张'] }, [{ ref: ASKER_REF, route: 'owner' }]);
    expect(people.map((person) => [person.key, person.label, person.asked])).toEqual([
      [ASKER_REF, '小周', true],
      [twinHuddleGuestRefV0(0), '老张', true],
    ]);
    expect(people[1].words.zh).toBe('要你把链接转给对方');
  });

  it('has words for every way a friend can be routed', () => {
    for (const route of TWIN_HUDDLE_FRIEND_ROUTES_V0) {
      const [person] = twinHuddlePresetPeople({ from: 'find', friends: [{ ref: ASKER_REF, label: '小周' }], guestLabels: [] }, [{ ref: ASKER_REF, route }]);
      bilingual(person.words);
      expect(person.asked).toBe(route === 'twin' || route === 'owner' || route === 'link');
    }
  });
});
