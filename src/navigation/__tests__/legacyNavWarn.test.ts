/**
 * Tests for legacyNavWarn helper (Sprint D A6).
 */
import {
  warnLegacyTabNav,
  wrapNavigateWithLegacyWarning,
  _resetLegacyNavWarnings,
} from '../legacyNavWarn';

// Force __DEV__ on for warnings to emit.
declare const globalThis: any;
globalThis.__DEV__ = true;

describe('warnLegacyTabNav', () => {
  beforeEach(() => {
    _resetLegacyNavWarnings();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('warns once per legacy tab name', () => {
    warnLegacyTabNav('Agent');
    warnLegacyTabNav('Agent');
    warnLegacyTabNav('Agent');
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect((console.warn as jest.Mock).mock.calls[0][0]).toContain('Agent');
    expect((console.warn as jest.Mock).mock.calls[0][0]).toContain('Summon');
  });

  it('independent counters per tab name', () => {
    warnLegacyTabNav('Agent');
    warnLegacyTabNav('Discover');
    warnLegacyTabNav('Team');
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it('ignores non-legacy names', () => {
    warnLegacyTabNav('Home');
    warnLegacyTabNav('Plaza');
    warnLegacyTabNav('Summon');
    warnLegacyTabNav('Me');
    warnLegacyTabNav('UnknownTab');
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('wrapNavigateWithLegacyWarning', () => {
  beforeEach(() => {
    _resetLegacyNavWarnings();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls through to the original navigate', () => {
    const original = jest.fn().mockReturnValue('ok');
    const wrapped = wrapNavigateWithLegacyWarning(original);
    const result = wrapped('Home');
    expect(original).toHaveBeenCalledWith('Home');
    expect(result).toBe('ok');
  });

  it('emits warning when legacy tab name is used', () => {
    const original = jest.fn();
    const wrapped = wrapNavigateWithLegacyWarning(original);
    wrapped('Agent', { screen: 'AgentChat' });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledWith('Agent', { screen: 'AgentChat' });
  });

  it('no warning for non-legacy names', () => {
    const original = jest.fn();
    const wrapped = wrapNavigateWithLegacyWarning(original);
    wrapped('Plaza', { screen: 'Skills' });
    expect(console.warn).not.toHaveBeenCalled();
  });
});
