/**
 * Background wake-word on Android (backgroundWakeWordPlan.ts; Claw build 536, REQ-mobile-086 follow-up):
 * the microphone foreground service is created while the app is in front and only listens in the back.
 */
import { describe, it, expect } from '@jest/globals';
import { planBackgroundWakeWord, runBackgroundWakeWordPlan, type BackgroundWakeWordNativeV1 } from '../backgroundWakeWordPlan';

function fakeNative(options: { running?: boolean; withSignal?: boolean; failing?: string[] } = {}) {
  const calls: string[] = [];
  const step = (name: string, value?: unknown) => async () => {
    calls.push(name);
    if (options.failing?.includes(name)) throw new Error(`${name} failed`);
    return value;
  };
  const native: BackgroundWakeWordNativeV1 = {
    syncConfig: async (json: string) => {
      calls.push(`sync:${json}`);
      if (options.failing?.includes('sync')) throw new Error('sync failed');
      return true;
    },
    startService: step('start', true),
    stopService: step('stop', true),
    ...(options.withSignal === false
      ? {}
      : {
          setAppForeground: async (foreground: boolean) => {
            calls.push(foreground ? 'front' : 'back');
            if (options.failing?.includes('signal')) throw new Error('signal failed');
            return options.running ?? false;
          },
        }),
  };
  return { native, calls };
}

describe('the plan', () => {
  it('in front with the setting on: say so first, then start (a microphone service can only be created in front)', () => {
    expect(planBackgroundWakeWord({ enabled: true, appActive: true, foregroundSignal: true })).toEqual(['front', 'sync', 'start']);
  });

  it('in the back with the setting on: tell the running service to listen; start only if none runs', () => {
    expect(planBackgroundWakeWord({ enabled: true, appActive: false, foregroundSignal: true })).toEqual(['back', 'sync', 'start_if_idle']);
  });

  it('setting off: stop, and still pass on where the app is', () => {
    expect(planBackgroundWakeWord({ enabled: false, appActive: true, foregroundSignal: true })).toEqual(['front', 'sync', 'stop']);
    expect(planBackgroundWakeWord({ enabled: false, appActive: false, foregroundSignal: true })).toEqual(['back', 'sync', 'stop']);
  });

  it('a binary without setAppForeground keeps the 1.3.0 behaviour: never runs while the app is in front', () => {
    expect(planBackgroundWakeWord({ enabled: true, appActive: true, foregroundSignal: false })).toEqual(['sync', 'stop']);
    expect(planBackgroundWakeWord({ enabled: true, appActive: false, foregroundSignal: false })).toEqual(['sync', 'start']);
    expect(planBackgroundWakeWord({ enabled: false, appActive: false, foregroundSignal: false })).toEqual(['sync', 'stop']);
  });

  it('never starts the service while it is told the app is in the back, except when none is running', () => {
    for (const enabled of [true, false]) {
      for (const appActive of [true, false]) {
        const steps = planBackgroundWakeWord({ enabled, appActive, foregroundSignal: true });
        if (!appActive) expect(steps).not.toContain('start');
        if (!enabled) expect(steps).not.toContain('start');
        if (!enabled) expect(steps).not.toContain('start_if_idle');
        // The app state always goes first, so a start or refresh already sees it.
        expect(steps[0]).toBe(appActive ? 'front' : 'back');
      }
    }
  });
});

describe('running the plan', () => {
  it('in the back with a running service: no start', async () => {
    const { native, calls } = fakeNative({ running: true });
    await runBackgroundWakeWordPlan(['back', 'sync', 'start_if_idle'], native, '{"enabled":true}');
    expect(calls).toEqual(['back', 'sync:{"enabled":true}']);
  });

  it('in the back with nothing running: try a start (older Android allows it)', async () => {
    const { native, calls } = fakeNative({ running: false });
    await runBackgroundWakeWordPlan(['back', 'sync', 'start_if_idle'], native, '{}');
    expect(calls).toEqual(['back', 'sync:{}', 'start']);
  });

  it('in front: the flag, the config, then the start', async () => {
    const { native, calls } = fakeNative({ running: true });
    await runBackgroundWakeWordPlan(['front', 'sync', 'start'], native, '{}');
    expect(calls).toEqual(['front', 'sync:{}', 'start']);
  });

  it('a failing step does not skip the rest; the first error is reported', async () => {
    const { native, calls } = fakeNative({ failing: ['sync', 'stop'] });
    await expect(runBackgroundWakeWordPlan(['front', 'sync', 'stop'], native, '{}')).rejects.toThrow('sync failed');
    expect(calls).toEqual(['front', 'sync:{}', 'stop']);
  });

  it('a failed signal counts as nothing running', async () => {
    const { native, calls } = fakeNative({ running: true, failing: ['signal'] });
    await expect(runBackgroundWakeWordPlan(['back', 'sync', 'start_if_idle'], native, '{}')).rejects.toThrow('signal failed');
    expect(calls).toEqual(['back', 'sync:{}', 'start']);
  });

  it('without setAppForeground the front / back steps do nothing', async () => {
    const { native, calls } = fakeNative({ withSignal: false });
    await runBackgroundWakeWordPlan(['back', 'sync', 'start_if_idle'], native, '{}');
    expect(calls).toEqual(['sync:{}', 'start']);
  });
});
