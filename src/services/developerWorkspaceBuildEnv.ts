/**
 * Build-time env for the DRW client layer (M2 slice A5 / B4, decision d-50).
 *
 * `babel-preset-expo` inlines `EXPO_PUBLIC_*` only when the source contains the
 * *literal* member expression `process.env.EXPO_PUBLIC_<NAME>`
 * (`babel-preset-expo/build/inline-env-vars.js`). Handing `process.env` to a
 * helper and reading `env.EXPO_PUBLIC_…` inside it is never rewritten, so in
 * the APK that read hits Metro's runtime `process.env` (which carries no
 * `EXPO_PUBLIC_*` keys) and the flag is off no matter what `build-apk.yml` /
 * `eas.json` inject. Claw #524 (Maestro 91) failed exactly there: the Work face
 * rendered `unavailable · feature_disabled` in fixture mode, so the fixture
 * banner never appeared.
 *
 * Every other `EXPO_PUBLIC_*` read in this app is a literal
 * (`src/app/bootstrap.ts`, `src/services/mobileV6FeatureFlags.ts`); this module
 * is the single literal read for the DRW flag. `isDeveloperWorkspaceFlagEnabled`
 * stays pure (env-in, boolean-out) for the DRW client tests.
 */
import { isDeveloperWorkspaceFlagEnabled } from './developerWorkspaceClient';

export const DEVELOPER_WORKSPACE_FLAG_ENV_KEY = 'EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED';

/**
 * The DRW flag as inlined into this build. Read at call time (not module
 * scope) so jest can set / clear the variable per test; in the APK the
 * member expression below is a compile-time literal either way.
 */
export function readDeveloperWorkspaceBuildEnv(): Record<string, string | undefined> {
  return {
    [DEVELOPER_WORKSPACE_FLAG_ENV_KEY]: process.env.EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED,
  };
}

/** `EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED === '1'` for this build; only `'1'` counts. */
export function isDeveloperWorkspaceBuildFlagEnabled(): boolean {
  return isDeveloperWorkspaceFlagEnabled(readDeveloperWorkspaceBuildEnv());
}
