import {
  WORK_READ_STATES,
  reduceWorkReadState,
  type WorkReadStateNextAction,
} from '../workReadStateDisplay';
import {
  WORK_READ_STATE_COPY,
  WORK_READ_STATE_NEXT_ACTION_COPY,
  workReadStateCopyFor,
} from '../workReadStateCopy';

const NEXT_ACTIONS: readonly WorkReadStateNextAction[] = [
  'none', 'retry', 'reconnect', 'sign_in', 'open_on_web', 'contact_support',
];

describe('M1.2.2 — every read-state the reducer can emit has bilingual copy', () => {
  it.each([...WORK_READ_STATES])('has a title and body for %s in en and zh', (state) => {
    const display = reduceWorkReadState({ state });
    const copy = WORK_READ_STATE_COPY[display.messageKey];
    expect(copy).toBeDefined();
    for (const field of [copy.title, copy.body]) {
      expect(field.en.trim().length).toBeGreaterThan(0);
      expect(field.zh.trim().length).toBeGreaterThan(0);
    }
  });

  it('has copy for every next action except none, which renders nothing', () => {
    for (const action of NEXT_ACTIONS) {
      const copy = WORK_READ_STATE_NEXT_ACTION_COPY[action];
      if (action === 'none') {
        expect(copy).toBeNull();
      } else {
        expect(copy?.en.trim().length).toBeGreaterThan(0);
        expect(copy?.zh.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('covers the next action of every reduced state', () => {
    for (const state of WORK_READ_STATES) {
      const { nextAction } = reduceWorkReadState({ state });
      expect(NEXT_ACTIONS).toContain(nextAction);
    }
  });

  it('falls back to the unknown copy for a message key it has never seen', () => {
    expect(workReadStateCopyFor('readState.made_up')).toBe(WORK_READ_STATE_COPY['readState.unknown']);
    // …which is also what an unrecognised state reduces to, so both paths agree.
    const display = reduceWorkReadState({ state: 'made_up' });
    expect(workReadStateCopyFor(display.messageKey)).toBe(WORK_READ_STATE_COPY['readState.unknown']);
  });

  it('never tells the user data is fresh for a state that hides payload', () => {
    for (const state of WORK_READ_STATES) {
      const display = reduceWorkReadState({ state });
      if (display.showsData) continue;
      const copy = WORK_READ_STATE_COPY[display.messageKey];
      expect(`${copy.title.en} ${copy.body.en}`.toLowerCase()).not.toMatch(/up to date|latest confirmed/);
    }
  });
});
