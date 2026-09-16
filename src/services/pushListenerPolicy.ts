/**
 * Push listener policy — M0.0.6 / MTR-R04.8, MTR-R28.3.
 *
 * Pure decision, no env reads: `src/app/bootstrap.ts` feeds it the build
 * flags. Kept in `src/services/` so the current jest `testMatch` can run it
 * (design §10.1 option (b)).
 *
 * Background: `EXPO_PUBLIC_MAESTRO_E2E=1` sets `skipStartupIntegrations`,
 * which used to return early from both notification effects, so a Maestro
 * build could not exercise push at all. `EXPO_PUBLIC_MAESTRO_KEEP_PUSH=1`
 * is an independent opt-back-in for the listeners only. Default behaviour is
 * unchanged: listeners stay off in any E2E mode unless that flag is `1`.
 */

export interface PushListenerPolicyInput {
  /** True in any E2E mode (voice UI, pet soul, Maestro). */
  readonly skipStartupIntegrations: boolean;
  /** `EXPO_PUBLIC_MAESTRO_E2E === '1'` */
  readonly isMaestroE2E: boolean;
  /** `EXPO_PUBLIC_MAESTRO_KEEP_PUSH === '1'` */
  readonly keepPushInMaestro: boolean;
}

/**
 * Only the Maestro mode has an opt-back-in: the other two E2E modes swap the
 * whole app for a surrogate that has no notification surface.
 */
export function shouldRunPushListeners(input: PushListenerPolicyInput): boolean {
  if (!input.skipStartupIntegrations) return true;
  return input.isMaestroE2E === true && input.keepPushInMaestro === true;
}

/** Strict `'1'` parsing, matching `envBoolean` in the flag table. */
export function envFlagIsOn(value: string | undefined): boolean {
  return value === '1';
}
