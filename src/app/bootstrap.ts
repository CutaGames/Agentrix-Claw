/**
 * Startup orchestration — extracted from `App.tsx` by M1.5.1.
 *
 * Order matters. `configureMobileV6FeatureFlagsFromEnvironment()` runs first
 * and on its own (design §3): every later reader — tab selection, v7 deep link
 * normalization, push destination gating — resolves the flag at call time, and
 * anything evaluated before this call stably reads the all-off default.
 */
import { Platform } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import { configureMobileV6FeatureFlagsFromEnvironment } from '../services/mobileV6FeatureFlags';
import { initLlamaBridge } from '../services/llamaRnBridge';
import { initCrashReport } from '../services/crashReport';
import { bootPetModeBus } from '../services/petMode';
import { initAnalytics, trackEvent } from '../services/analytics.service';
import {
  envFlagIsOn,
  shouldRunPushListeners as decidePushListeners,
} from '../services/pushListenerPolicy';

let flagsConfigured = false;
let integrationsBooted = false;

/**
 * Idempotent. `App.tsx` calls this explicitly at the top of its module scope;
 * exported so tests can assert the before/after resolution.
 */
export function configureMobileFeatureFlagsOnce(): void {
  if (flagsConfigured) return;
  flagsConfigured = true;
  configureMobileV6FeatureFlagsFromEnvironment();
}

export function resetMobileBootstrapForTests(): void {
  flagsConfigured = false;
  integrationsBooted = false;
}

/**
 * Module-scope side effects that used to sit inline in `App.tsx`.
 * All of them are no-ops when their feature is unconfigured.
 */
export function bootMobileIntegrations(): void {
  if (integrationsBooted) return;
  integrationsBooted = true;

  // Register llama.rn bridge for on-device LLM inference
  initLlamaBridge();

  // Sprint P-6 (2026-05-22): boot the pet form-state bus so the
  // GlobalFloatingBall and any future pet surfaces can subscribe to a
  // single source of truth for "what is the pet doing right now". Mirror
  // of the desktop bus, mobile-tailored (no Pro Mode, no Computer Use).
  bootPetModeBus();

  // Initialize Sentry crash reporting (no-op if SENTRY_DSN unset)
  initCrashReport();

  // Initialize mobile analytics (no-op if user has not opted in)
  initAnalytics();
  trackEvent('mobile_launch', { platform: Platform.OS });
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, retry: 2 },
    },
  });
}

export const isMaestroE2E = envFlagIsOn(process.env.EXPO_PUBLIC_MAESTRO_E2E);

/**
 * M0.0.6 — independent escape hatch for the E2E build
 * (`EXPO_PUBLIC_MAESTRO_KEEP_PUSH=1`). Decision logic and rationale live in
 * `src/services/pushListenerPolicy.ts`, where jest can reach it.
 */
export const isMaestroKeepPushEnabled = envFlagIsOn(process.env.EXPO_PUBLIC_MAESTRO_KEEP_PUSH);

/** Whether the push listeners should run for this build. */
export function shouldRunPushListeners(input: {
  skipStartupIntegrations: boolean;
  isMaestroE2E?: boolean;
  keepPushInMaestro?: boolean;
}): boolean {
  return decidePushListeners({
    skipStartupIntegrations: input.skipStartupIntegrations,
    isMaestroE2E: input.isMaestroE2E ?? isMaestroE2E,
    keepPushInMaestro: input.keepPushInMaestro ?? isMaestroKeepPushEnabled,
  });
}
