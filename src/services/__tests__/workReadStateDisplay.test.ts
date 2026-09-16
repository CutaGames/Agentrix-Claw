import {
  WORK_READ_STATES,
  isWorkReadState,
  mayRenderPayload,
  reduceWorkReadState,
} from '../workReadStateDisplay';

describe('MTR-R07.2 — every read-state has a readable empty state and a next action', () => {
  it.each([...WORK_READ_STATES])('covers %s', (state) => {
    const display = reduceWorkReadState({ state });
    expect(display.state).toBe(state);
    expect(display.messageKey).toMatch(/^readState\./);
    expect(display.fellBack).toBe(false);
    expect(['ready', 'caution', 'blocked', 'neutral']).toContain(display.tone);
  });

  it('only lets ready / partial / offline_stale render payload', () => {
    const rendering = WORK_READ_STATES.filter((state) => mayRenderPayload({ state }));
    expect(rendering).toEqual(['ready', 'partial', 'offline_stale']);
  });

  it('shows staleness exactly where stale data may appear', () => {
    expect(reduceWorkReadState({ state: 'offline_stale', capturedAt: '2026-09-15T00:00:00.000Z' }).capturedAt)
      .toBe('2026-09-15T00:00:00.000Z');
    expect(reduceWorkReadState({ state: 'ready', capturedAt: '2026-09-15T00:00:00.000Z' }).capturedAt)
      .toBeUndefined();
  });

  it('routes unauthorized to sign-in and offline to reconnect', () => {
    expect(reduceWorkReadState({ state: 'unauthorized' }).nextAction).toBe('sign_in');
    expect(reduceWorkReadState({ state: 'offline_stale' }).nextAction).toBe('reconnect');
    expect(reduceWorkReadState({ state: 'unsupported' }).nextAction).toBe('open_on_web');
  });
});

describe('MTR-R07.3 — unavailable names the capability and the reason', () => {
  it('passes both through verbatim', () => {
    expect(reduceWorkReadState({
      state: 'unavailable',
      capability: 'developer.machines_v1',
      reason: 'developer_api_not_published',
    })).toMatchObject({
      tone: 'blocked',
      showsData: false,
      capability: 'developer.machines_v1',
      reason: 'developer_api_not_published',
    });
  });

  it('substitutes an explicit placeholder rather than rendering blank', () => {
    const display = reduceWorkReadState({ state: 'unavailable' });
    expect(display.capability).toBe('capability_not_reported');
    expect(display.reason).toBe('reason_not_reported');
  });

  it('ignores whitespace-only text', () => {
    const display = reduceWorkReadState({ state: 'unavailable', capability: '   ', reason: '' });
    expect(display.capability).toBe('capability_not_reported');
    expect(display.reason).toBe('reason_not_reported');
  });
});

describe('fail closed on an unrecognised state', () => {
  it.each([undefined, null, '', 'loading', 'ok', 42, {}])('reduces %p to unknown', (state) => {
    const display = reduceWorkReadState({ state });
    expect(display.state).toBe('unknown');
    expect(display.showsData).toBe(false);
    expect(display.fellBack).toBe(true);
  });

  it('recognises only the eight contract values', () => {
    expect(WORK_READ_STATES).toHaveLength(8);
    expect(isWorkReadState('ready')).toBe(true);
    expect(isWorkReadState('loading')).toBe(false);
  });
});
