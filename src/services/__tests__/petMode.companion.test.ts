/**
 * Unit tests for the P-9 Companion Redesign — petMode.ts CompanionMode
 * extensions (Task 1.4).
 *
 * Pure-Node jest. No RN runtime needed; petMode.ts has no react-native
 * imports. companionEvents has only voiceDiagnostics dependency which is
 * also pure JS.
 */
import {
  COMPANION_MODES,
  COMPANION_MODE_PRIORITY,
  COMPANION_MODE_TO_SPRITE,
  resolveTransition,
  setCompanionMode,
  getCompanionMode,
  subscribeCompanionMode,
  markUserAction,
  resolveSpriteForCompanionMode,
  _internalResetCompanionForTests,
  _internalResetForTests,
  type CompanionMode,
} from '../petMode';

describe('CompanionMode taxonomy + resolveTransition', () => {
  beforeEach(() => {
    _internalResetCompanionForTests();
    _internalResetForTests();
  });

  it('exposes exactly 8 modes per spec R2', () => {
    expect(COMPANION_MODES).toHaveLength(8);
    expect(COMPANION_MODES).toEqual(
      expect.arrayContaining([
        'companion', 'vigil', 'journey', 'whisper',
        'slumber', 'nudge', 'signing', 'working',
      ]),
    );
  });

  it('signing has the highest priority (cannot be preempted)', () => {
    const max = Math.max(...Object.values(COMPANION_MODE_PRIORITY));
    expect(COMPANION_MODE_PRIORITY.signing).toBe(max);
    expect(COMPANION_MODE_PRIORITY.signing).toBeGreaterThan(
      COMPANION_MODE_PRIORITY.nudge,
    );
  });

  it('companion is the default fallback (priority 0)', () => {
    expect(COMPANION_MODE_PRIORITY.companion).toBe(0);
  });

  it('resolves sprite map for every mode without throwing', () => {
    for (const m of COMPANION_MODES) {
      expect(typeof resolveSpriteForCompanionMode(m as CompanionMode)).toBe('string');
      expect(COMPANION_MODE_TO_SPRITE[m as CompanionMode]).toBeDefined();
    }
  });

  describe('resolveTransition() — pure decision', () => {
    it('returns idempotent when proposed === current', () => {
      const r = resolveTransition({
        current: 'companion',
        proposed: 'companion',
        source: 'noop',
      });
      expect(r.applied).toBe(false);
      expect(r.reason).toBe('idempotent');
    });

    it('higher priority always wins', () => {
      const r = resolveTransition({
        current: 'vigil',
        proposed: 'signing',
        source: 'sheet',
      });
      expect(r.applied).toBe(true);
      expect(r.reason).toBe('higher-priority-applied');
      expect(r.next).toBe('signing');
    });

    it('lower-priority drops UNLESS current is the default companion', () => {
      // Lower priority dropped against vigil
      const r1 = resolveTransition({
        current: 'vigil',
        proposed: 'companion',
        source: 'auto',
      });
      expect(r1.applied).toBe(false);
      expect(r1.reason).toBe('lower-priority-applied');

      // But applied if current is the default companion (priority 0)
      const r2 = resolveTransition({
        current: 'companion',
        proposed: 'vigil',
        source: 'tired',
      });
      expect(r2.applied).toBe(true);
      expect(r2.next).toBe('vigil');
    });

    it('Local_Action_Wins suppresses low-priority when user just acted', () => {
      const r = resolveTransition({
        current: 'companion',
        proposed: 'vigil', // priority 30 < 50
        source: 'emotion-tired',
        lastUserActionMs: Date.now() - 1000, // 1 s ago
      });
      expect(r.applied).toBe(false);
      expect(r.reason).toBe('local-action-suppressed');
    });

    it('Local_Action_Wins does NOT suppress priority >= 50', () => {
      const r = resolveTransition({
        current: 'companion',
        proposed: 'whisper', // priority 70
        source: 'voice-greet',
        lastUserActionMs: Date.now() - 1000,
      });
      expect(r.applied).toBe(true);
    });

    it('force=true bypasses Local_Action_Wins', () => {
      const r = resolveTransition({
        current: 'companion',
        proposed: 'vigil',
        source: 'system',
        lastUserActionMs: Date.now() - 1000,
        force: true,
      });
      expect(r.applied).toBe(true);
    });

    it('Local_Action_Wins window is 5s — outside the window the transition applies', () => {
      const r = resolveTransition({
        current: 'companion',
        proposed: 'vigil',
        source: 'tired',
        lastUserActionMs: Date.now() - 6000, // 6 s ago > 5 s window
      });
      expect(r.applied).toBe(true);
    });
  });

  describe('setCompanionMode() — stateful + subscribers', () => {
    it('applies & notifies subscribers', () => {
      const cb = jest.fn();
      subscribeCompanionMode(cb);
      const r = setCompanionMode('vigil', 'test');
      expect(r.applied).toBe(true);
      expect(getCompanionMode()).toBe('vigil');
      expect(cb).toHaveBeenCalledWith('vigil', 'test');
    });

    it('idempotent same-mode set is a no-op', () => {
      const cb = jest.fn();
      setCompanionMode('vigil', 'first');
      subscribeCompanionMode(cb);
      const r = setCompanionMode('vigil', 'again');
      expect(r.applied).toBe(false);
      expect(cb).not.toHaveBeenCalled();
    });

    it('respects markUserAction() Local_Action_Wins', () => {
      markUserAction();
      const r = setCompanionMode('vigil', 'tired');
      expect(r.applied).toBe(false);
      expect(getCompanionMode()).toBe('companion');
    });

    it('higher-priority over already-set mode is allowed', () => {
      setCompanionMode('vigil', 'first');
      const r = setCompanionMode('signing', 'sheet-open');
      expect(r.applied).toBe(true);
      expect(getCompanionMode()).toBe('signing');
    });

    it('debounces > 3 flips in 30s window (with force=true to bypass priority)', () => {
      // Use force=true so all attempts pass through priority arbitration.
      // Debounce is the only thing that can stop them once we hit 3.
      const r1 = setCompanionMode('vigil', 'a', { force: true });
      expect(r1.applied).toBe(true);
      const r2 = setCompanionMode('whisper', 'b', { force: true });
      expect(r2.applied).toBe(true);
      const r3 = setCompanionMode('vigil', 'a2', { force: true });
      expect(r3.applied).toBe(true);
      // 4th flip — would push count to 4, beyond MODE_DEBOUNCE_MAX_FLIPS=3
      const r4 = setCompanionMode('whisper', 'b2', { force: true });
      expect(r4.applied).toBe(false);
      expect(r4.reason).toBe('debounced');
    });

    it('ttlMs schedules revert to companion', () => {
      jest.useFakeTimers();
      setCompanionMode('whisper', 'voice-greet', { ttlMs: 4000 });
      expect(getCompanionMode()).toBe('whisper');
      jest.advanceTimersByTime(4001);
      expect(getCompanionMode()).toBe('companion');
      jest.useRealTimers();
    });

    it('force=true bypasses Local_Action_Wins for low-priority modes', () => {
      markUserAction();
      const r = setCompanionMode('vigil', 'forced', { force: true });
      expect(r.applied).toBe(true);
      expect(getCompanionMode()).toBe('vigil');
    });
  });
});
