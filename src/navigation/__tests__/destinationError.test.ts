import {
  MOBILE_NAVIGATION_FAILURE_REASONS,
  describeDestinationError,
  destinationErrorPath,
  destinationErrorTarget,
  handleUnhandledNavigationAction,
  isMobileNavigationFailureReason,
  navigateToDestinationError,
  safeNavigate,
} from '../destinationError';

describe('MTR-R09.2 / d-35 — the destination-error card copy is the user migration note', () => {
  it('tells a World / Plaza / Aeon / Market / Social / Team deep link where the journey now lives', () => {
    const copy = describeDestinationError('surface_flag_off');
    for (const text of [copy.en, copy.zh]) {
      expect(text.length).toBeGreaterThan(40);
      // Names the folded surfaces and the three Agent-first destinations that replace them.
      expect(text).toMatch(/World|世界/);
      expect(text).toMatch(/Plaza|广场/);
      expect(text).toMatch(/Economy|经济/);
      expect(text).toMatch(/Agent/);
      expect(text).toMatch(/My|我的/);
      // And says nothing destructive happened (MTR-R08.2: no action started).
      expect(text).toMatch(/Nothing was deleted|no action was started|未删除|没有启动/);
    }
  });

  it('has dedicated copy for retired entries and unmounted routes, generic copy for the rest', () => {
    expect(describeDestinationError('legacy_route_retired')).not.toEqual(describeDestinationError('unknown_route'));
    expect(describeDestinationError('route_not_mounted')).not.toEqual(describeDestinationError('unknown_route'));
    const generic = describeDestinationError('unknown_route');
    expect(describeDestinationError('navigation_threw')).toEqual(generic);
    expect(describeDestinationError(undefined)).toEqual(generic);
    expect(describeDestinationError('<script>')).toEqual(generic);
  });
});

function fakeNavigation(overrides: Partial<{ navigate: jest.Mock; isReady: () => boolean }> = {}) {
  return {
    navigate: jest.fn(),
    ...overrides,
  };
}

describe('MTR-R03.2 — navigation failures funnel into destination-error with a reason code', () => {
  it('declares a closed set of reason codes', () => {
    expect([...MOBILE_NAVIGATION_FAILURE_REASONS]).toEqual([
      'route_not_mounted',
      'legacy_route_retired',
      'surface_flag_off',
      'unknown_route',
      'navigation_threw',
      'navigator_not_ready',
    ]);
    expect(isMobileNavigationFailureReason('route_not_mounted')).toBe(true);
    expect(isMobileNavigationFailureReason('something_else')).toBe(false);
    expect(isMobileNavigationFailureReason(undefined)).toBe(false);
  });

  it('targets the Agent-tab DestinationError screen and the shared path contract', () => {
    expect(destinationErrorTarget('route_not_mounted')).toEqual({
      tab: 'Agent',
      screen: 'DestinationError',
      params: { reason: 'route_not_mounted' },
    });
    expect(destinationErrorPath('unknown_route')).toBe('/destination-error?reason=unknown_route');
  });

  it('navigates through the tab first', () => {
    const nav = fakeNavigation();
    expect(navigateToDestinationError(nav, 'route_not_mounted')).toBe(true);
    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith('Agent', {
      screen: 'DestinationError',
      params: { reason: 'route_not_mounted' },
    });
  });

  it('falls back to the flat route when the nested navigate throws', () => {
    const navigate = jest.fn()
      .mockImplementationOnce(() => { throw new Error('no Agent tab'); })
      .mockImplementationOnce(() => undefined);
    const nav = fakeNavigation({ navigate });
    expect(navigateToDestinationError(nav, 'legacy_route_retired')).toBe(true);
    expect(navigate).toHaveBeenNthCalledWith(2, 'DestinationError', { reason: 'legacy_route_retired' });
  });

  it('reports false instead of pretending when nothing is reachable', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const navigate = jest.fn(() => { throw new Error('unmounted'); });
      expect(navigateToDestinationError(fakeNavigation({ navigate }), 'unknown_route')).toBe(false);
      expect(navigateToDestinationError(null, 'unknown_route')).toBe(false);
      expect(navigateToDestinationError(
        fakeNavigation({ isReady: () => false }),
        'navigator_not_ready',
      )).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('safeNavigate funnels a throwing attempt into destination-error', () => {
    const nav = fakeNavigation();
    expect(safeNavigate(nav, () => { throw new Error('param mismatch'); })).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('Agent', {
      screen: 'DestinationError',
      params: { reason: 'navigation_threw' },
    });
  });

  it('safeNavigate leaves a successful attempt alone', () => {
    const nav = fakeNavigation();
    const attempt = jest.fn();
    expect(safeNavigate(nav, attempt)).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});

describe('MTR-R03.2 — NavigationContainer.onUnhandledAction funnel', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each(['DesktopControl', 'AgentLogs', 'Wallet', 'PetCompanion', 'ApprovalCenter'])(
    'sends an unhandled navigate to %s to destination-error(route_not_mounted)',
    (name) => {
      const nav = fakeNavigation();
      expect(handleUnhandledNavigationAction(nav, { type: 'NAVIGATE', payload: { name } }))
        .toBe('route_not_mounted');
      expect(nav.navigate).toHaveBeenCalledWith('Agent', {
        screen: 'DestinationError',
        params: { reason: 'route_not_mounted' },
      });
    },
  );

  it('never re-funnels its own routes (no loop when DestinationError is unmounted)', () => {
    const nav = fakeNavigation();
    expect(handleUnhandledNavigationAction(nav, { type: 'NAVIGATE', payload: { name: 'Agent' } })).toBeNull();
    expect(handleUnhandledNavigationAction(nav, { type: 'NAVIGATE', payload: { name: 'DestinationError' } })).toBeNull();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('leaves non-navigate actions and malformed payloads alone', () => {
    const nav = fakeNavigation();
    expect(handleUnhandledNavigationAction(nav, { type: 'GO_BACK' })).toBeNull();
    expect(handleUnhandledNavigationAction(nav, { type: 'NAVIGATE', payload: { name: 42 } })).toBeNull();
    expect(handleUnhandledNavigationAction(nav, null)).toBeNull();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('does not recurse when the fallback navigate is itself unhandled', () => {
    // Simulate React Navigation calling onUnhandledAction again from inside
    // navigate(): the nested call must return null instead of re-entering.
    const nav: { navigate: jest.Mock } = {
      navigate: jest.fn((name: string) => {
        if (name === 'Agent') {
          // A non-funnel name would normally be funnelled; inside the funnel it must not be.
          expect(handleUnhandledNavigationAction(nav, { type: 'NAVIGATE', payload: { name: 'SomethingElse' } })).toBeNull();
        }
      }),
    };
    expect(handleUnhandledNavigationAction(nav, { type: 'NAVIGATE', payload: { name: 'AgentMemory' } }))
      .toBe('route_not_mounted');
    expect(nav.navigate).toHaveBeenCalledTimes(1);
  });
});
