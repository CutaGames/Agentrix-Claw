import { envFlagIsOn, shouldRunPushListeners } from '../pushListenerPolicy';

describe('M0.0.6 / MTR-R28.3 — push listeners in E2E builds', () => {
  it('always runs the listeners in a normal build', () => {
    expect(shouldRunPushListeners({
      skipStartupIntegrations: false,
      isMaestroE2E: false,
      keepPushInMaestro: false,
    })).toBe(true);
  });

  it('keeps the default: any E2E mode skips the listeners', () => {
    expect(shouldRunPushListeners({
      skipStartupIntegrations: true,
      isMaestroE2E: true,
      keepPushInMaestro: false,
    })).toBe(false);
    expect(shouldRunPushListeners({
      skipStartupIntegrations: true,
      isMaestroE2E: false,
      keepPushInMaestro: false,
    })).toBe(false);
  });

  it('opts the Maestro build back in with EXPO_PUBLIC_MAESTRO_KEEP_PUSH=1', () => {
    expect(shouldRunPushListeners({
      skipStartupIntegrations: true,
      isMaestroE2E: true,
      keepPushInMaestro: true,
    })).toBe(true);
  });

  it('does not let the keep-push switch leak into the other E2E modes', () => {
    // voice-UI / pet-soul E2E swap the whole app for a surrogate with no
    // notification surface; the switch is Maestro-only by design.
    expect(shouldRunPushListeners({
      skipStartupIntegrations: true,
      isMaestroE2E: false,
      keepPushInMaestro: true,
    })).toBe(false);
  });

  it.each([
    ['1', true],
    ['true', false],
    ['0', false],
    ['', false],
    [undefined, false],
  ])('parses %p strictly like the flag table (%p)', (raw, expected) => {
    expect(envFlagIsOn(raw as string | undefined)).toBe(expected);
  });
});
