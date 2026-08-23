import { SoulCoreClientError } from '../../../shared/client';
import {
  DEFAULT_MOBILE_V6_FEATURE_FLAGS,
  configureMobileV6FeatureFlags,
  configureMobileV6FeatureFlagsFromEnvironment,
  evaluateMobileV6FeatureFlagProvider,
  getMobileV6FeatureFlags,
  isMobileV6FeatureEnabled,
  resetMobileV6FeatureFlags,
  resolveMobileV6FeatureFlags,
} from '../mobileV6FeatureFlags';
import {
  normalizeMobileReadError,
  partialMobileReadState,
  readMobileResource,
} from '../mobileReadState';
import {
  configureMobileV6TelemetrySink,
  createMobileV6TelemetryEvent,
  emitMobileV6Telemetry,
  resetMobileV6TelemetrySink,
  sanitizeMobileV6TelemetryProps,
} from '../mobileV6Telemetry';
import { MobileV6QueryFacade } from '../mobileV6Client';

describe('Mobile V6 feature gates', () => {
  afterEach(() => resetMobileV6FeatureFlags());

  it('defaults every V6 capability off', () => {
    expect(DEFAULT_MOBILE_V6_FEATURE_FLAGS).toEqual({
      'mobile.v6_ia': false,
      'mobile.agent_first_ia': false,
      'mobile.agent_economy_v1': false,
      'mobile.trust_loop': false,
      'mobile.soul_card_nfc': false,
    });
    expect(Object.isFrozen(DEFAULT_MOBILE_V6_FEATURE_FLAGS)).toBe(true);
  });

  it('enables build-time flags only for the exact value 1', () => {
    const previous = process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA;
    try {
      process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA = 'true';
      expect(configureMobileV6FeatureFlagsFromEnvironment()['mobile.agent_first_ia']).toBe(false);
      process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA = '1';
      expect(configureMobileV6FeatureFlagsFromEnvironment()['mobile.agent_first_ia']).toBe(true);
      process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA = '0';
      expect(configureMobileV6FeatureFlagsFromEnvironment()['mobile.agent_first_ia']).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA;
      else process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA = previous;
    }
  });

  it('applies local then remote values while kill switches always win', () => {
    expect(resolveMobileV6FeatureFlags({
      local: {
        'mobile.v6_ia': true,
        'mobile.agent_first_ia': true,
        'mobile.agent_economy_v1': true,
        'mobile.trust_loop': true,
      },
      remote: {
        'mobile.trust_loop': false,
        'mobile.soul_card_nfc': true,
      },
      killSwitches: {
        'mobile.v6_ia': true,
        'mobile.agent_economy_v1': true,
      },
    })).toEqual({
      'mobile.v6_ia': false,
      'mobile.agent_first_ia': true,
      'mobile.agent_economy_v1': false,
      'mobile.trust_loop': false,
      'mobile.soul_card_nfc': true,
    });
  });

  it('ignores malformed values and fails provider evaluation closed', () => {
    expect(resolveMobileV6FeatureFlags({
      remote: {
        'mobile.v6_ia': 'true',
        'mobile.trust_loop': 1,
        unknown: true,
      },
    })).toEqual(DEFAULT_MOBILE_V6_FEATURE_FLAGS);

    expect(evaluateMobileV6FeatureFlagProvider(() => {
      throw new Error('remote unavailable');
    })).toEqual(DEFAULT_MOBILE_V6_FEATURE_FLAGS);
  });

  it('exposes a process-local snapshot without persisting account state', () => {
    configureMobileV6FeatureFlags({ remote: { 'mobile.v6_ia': true } });
    expect(getMobileV6FeatureFlags()['mobile.v6_ia']).toBe(true);
    expect(isMobileV6FeatureEnabled('mobile.v6_ia')).toBe(true);
    expect(isMobileV6FeatureEnabled('mobile.trust_loop')).toBe(false);

    resetMobileV6FeatureFlags();
    expect(getMobileV6FeatureFlags()).toEqual(DEFAULT_MOBILE_V6_FEATURE_FLAGS);
  });
});

describe('Mobile V6 read states', () => {
  it('does not execute a query when the capability is disabled', async () => {
    const query = jest.fn(async () => ({ id: 'should-not-run' }));
    const state = await readMobileResource(query, {
      capability: 'trust_loop.timeline',
      enabled: false,
    });
    expect(query).not.toHaveBeenCalled();
    expect(state).toEqual({
      kind: 'unavailable',
      capability: 'trust_loop.timeline',
      reason: 'feature_disabled',
    });
  });

  it('marks a successful read ready with an explicit capture time', async () => {
    const state = await readMobileResource(async () => ({ id: 'soul-1' }), {
      capability: 'soul_core.aggregate_v1',
      now: () => '2026-07-17T12:00:00.000Z',
    });
    expect(state).toEqual({
      kind: 'ready',
      data: { id: 'soul-1' },
      capturedAt: '2026-07-17T12:00:00.000Z',
    });
  });

  it('maps missing flagged endpoints to explicit capability absence', () => {
    const state = normalizeMobileReadError(
      new SoulCoreClientError({
        kind: 'not_found',
        message: 'Not found',
        retryable: false,
        httpStatus: 404,
      }),
      { capability: 'trust_loop.timeline' },
    );
    expect(state).toEqual({
      kind: 'unavailable',
      capability: 'trust_loop.timeline',
      reason: 'not_found',
    });
  });

  it('never silently downgrades an unsupported schema', () => {
    const state = normalizeMobileReadError(
      new SoulCoreClientError({
        kind: 'version_mismatch',
        message: 'Unsupported',
        retryable: false,
        code: 'SCHEMA_VERSION_UNSUPPORTED',
      }),
      { capability: 'action.detail_v1', schemaVersion: 'action-runtime/v1' },
    );
    expect(state).toEqual({
      kind: 'unsupported_schema',
      schemaVersion: 'action-runtime/v1',
      reason: 'SCHEMA_VERSION_UNSUPPORTED',
    });
  });

  it('keeps cached data explicitly stale during network failure', async () => {
    const state = await readMobileResource<{ id: string }>(
      async () => { throw new Error('Network request failed'); },
      {
        capability: 'soul_core.aggregate_v1',
        staleData: { id: 'cached' },
        staleCapturedAt: '2026-07-16T12:00:00.000Z',
      },
    );
    expect(state).toEqual({
      kind: 'offline_stale',
      data: { id: 'cached' },
      capturedAt: '2026-07-16T12:00:00.000Z',
      reason: 'network',
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [410, 'revoked'],
  ])('preserves HTTP %s as %s instead of success', (status, expectedKind) => {
    const state = normalizeMobileReadError(new Error(`Request failed: ${status}`), {
      capability: 'action.detail_v1',
    });
    expect(state.kind).toBe(expectedKind);
  });

  it('keeps partial data and its missing dependencies explicit', () => {
    expect(partialMobileReadState(
      { id: 'action-1' },
      ['verification', 'settlement'],
      '2026-07-17T12:00:00.000Z',
    )).toEqual({
      kind: 'partial',
      data: { id: 'action-1' },
      missing: ['verification', 'settlement'],
      capturedAt: '2026-07-17T12:00:00.000Z',
    });
  });
});

describe('Mobile V6 telemetry privacy boundary', () => {
  afterEach(() => resetMobileV6TelemetrySink());

  it('keeps only allow-listed scalar fields and requires hashed identifiers', () => {
    const props = sanitizeMobileV6TelemetryProps({
      source: 'push',
      result: 'resolved',
      durationMs: 42,
      actionIdHash: 'hash_abcd1234',
      soulCoreIdHash: 'raw',
      actionId: 'action-raw',
      token: 'bearer-secret',
      nested: { private: true },
    });
    expect(props).toEqual({
      source: 'push',
      result: 'resolved',
      durationMs: 42,
      actionIdHash: 'hash_abcd1234',
    });
    expect(props).not.toHaveProperty('token');
    expect(props).not.toHaveProperty('actionId');
  });

  it('emits to an opt-in supplied sink and stays no-op by default', () => {
    expect(() => emitMobileV6Telemetry('mobile_flag_evaluated', {
      flagName: 'mobile.v6_ia',
      enabled: false,
    })).not.toThrow();

    const sink = jest.fn();
    configureMobileV6TelemetrySink(sink);
    const event = emitMobileV6Telemetry('mobile_route_legacy_resolved', {
      legacyRouteId: 'World',
      canonicalRouteId: 'Creation',
      token: 'drop-me',
    });

    expect(sink).toHaveBeenCalledWith(event);
    expect(event.props).toEqual({
      legacyRouteId: 'World',
      canonicalRouteId: 'Creation',
    });
  });

  it('never lets a failing telemetry sink break the caller', () => {
    configureMobileV6TelemetrySink(() => { throw new Error('sink down'); });
    expect(() => emitMobileV6Telemetry('mobile_boot_failed', {
      reasonCode: 'bootstrap_error',
    })).not.toThrow();
  });

  it('rejects unknown event names at the event boundary', () => {
    expect(() => createMobileV6TelemetryEvent('raw_arbitrary_event' as any)).toThrow(
      'Unsupported Mobile V6 telemetry event',
    );
  });
});

describe('Mobile V6 shared client facade', () => {
  it('uses shared clients and preserves the explicit mobile read state', async () => {
    const getAggregate = jest.fn(async () => ({ soulCoreId: 'soul-1' }));
    const facade = new MobileV6QueryFacade({
      soulCore: { getAggregate } as any,
      actions: {} as any,
      authority: {} as any,
      taskProof: {} as any,
    });

    const state = await facade.getSoulCoreAggregate('soul-1', {
      now: () => '2026-07-17T12:00:00.000Z',
    });
    expect(getAggregate).toHaveBeenCalledWith('soul-1');
    expect(state.kind).toBe('ready');
  });

  it('does not call a shared client while the capability flag is off', async () => {
    const listTasks = jest.fn();
    const facade = new MobileV6QueryFacade({
      soulCore: {} as any,
      actions: { listTasks } as any,
      authority: {} as any,
      taskProof: {} as any,
    });

    const state = await facade.listActions('soul-1', { enabled: false });
    expect(listTasks).not.toHaveBeenCalled();
    expect(state.kind).toBe('unavailable');
  });

  it('rejects an Action response outside the selected Soul Core scope', async () => {
    const getTask = jest.fn(async () => ({
      lifecycle: { soulCoreId: 'soul-b' },
    }));
    const facade = new MobileV6QueryFacade({
      soulCore: {} as any,
      actions: { getTask } as any,
      authority: {} as any,
      taskProof: {} as any,
    });

    const state = await facade.getAction('soul-a', 'action-1');
    expect(getTask).toHaveBeenCalledWith('soul-a', 'action-1');
    expect(state).toEqual({
      kind: 'forbidden',
      reason: 'MOBILE_AGENT_SCOPE_MISMATCH',
    });
  });
});
