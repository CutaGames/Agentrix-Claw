export const MOBILE_V6_FEATURE_FLAG_NAMES = [
  'mobile.agent_first_ia',
  'mobile.agent_economy_v1',
  'mobile.trust_loop',
  'mobile.soul_card_nfc',
  'mobile.twin_surface',
  'mobile.pet_l2_surface',
  'mobile.world_plaza_l2_surface',
] as const;

export type MobileV6FeatureFlagName = (typeof MOBILE_V6_FEATURE_FLAG_NAMES)[number];
export type MobileV6FeatureFlagSnapshot = Readonly<Record<MobileV6FeatureFlagName, boolean>>;
export type MobileV6FeatureFlagValues = Partial<Record<MobileV6FeatureFlagName, unknown>>;

export interface MobileV6FeatureFlagContext {
  environment?: string;
  accountIdHash?: string;
  cohort?: string;
}

export interface MobileV6FeatureFlagResolutionInput {
  /** Build/local defaults. Invalid values are ignored. */
  local?: unknown;
  /** Remote/account/cohort values. Valid booleans override local values. */
  remote?: unknown;
  /** A `true` value always forces the corresponding flag off. */
  killSwitches?: unknown;
}

export type MobileV6FeatureFlagProvider = (
  context: MobileV6FeatureFlagContext,
) => MobileV6FeatureFlagResolutionInput;

export const DEFAULT_MOBILE_V6_FEATURE_FLAGS: MobileV6FeatureFlagSnapshot = Object.freeze({
  'mobile.agent_first_ia': false,
  'mobile.agent_economy_v1': false,
  'mobile.trust_loop': false,
  'mobile.soul_card_nfc': false,
  'mobile.twin_surface': false,
  // Decision d-35 (2026-09-16, M0.0.8 = "Shell"): the Pet family stays in the
  // Agent-first default IA as the canonical Agent's Shell, so this flag is ON
  // by default and only remains as the remote / build-time kill switch.
  'mobile.pet_l2_surface': true,
  // Decision d-35 (M0.0.7): World / Plaza (and the Aeon / Market / Social
  // families that route into them) are hidden routes behind this L2 flag,
  // default OFF; legacy deep links land on destination-error(surface_flag_off).
  'mobile.world_plaza_l2_surface': false,
});

/**
 * A flag that cannot be on while its prerequisite is off (design §3).
 * `mobile.twin_surface` hangs off the Agent tab, so it is meaningless — and
 * unreachable — in the legacy IA. `mobile.pet_l2_surface` and
 * `mobile.world_plaza_l2_surface` are the L2 product flags MTR-R09 applies
 * *inside* the Agent-first IA; the legacy IA is not gated by them at all (see
 * `isPetSurfaceEnabled` / `isWorldPlazaSurfaceEnabled`).
 */
export const MOBILE_V6_FEATURE_FLAG_DEPENDENCIES: ReadonlyArray<
  readonly [MobileV6FeatureFlagName, MobileV6FeatureFlagName]
> = Object.freeze([
  ['mobile.twin_surface', 'mobile.agent_first_ia'],
  ['mobile.pet_l2_surface', 'mobile.agent_first_ia'],
  ['mobile.world_plaza_l2_surface', 'mobile.agent_first_ia'],
] as const);

const FLAG_NAME_SET: ReadonlySet<string> = new Set(MOBILE_V6_FEATURE_FLAG_NAMES);
let currentSnapshot: MobileV6FeatureFlagSnapshot = DEFAULT_MOBILE_V6_FEATURE_FLAGS;

function asFlagValues(input: unknown): MobileV6FeatureFlagValues {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as MobileV6FeatureFlagValues;
}

function applyBooleanValues(
  target: Record<MobileV6FeatureFlagName, boolean>,
  input: unknown,
): void {
  const values = asFlagValues(input);
  for (const flag of MOBILE_V6_FEATURE_FLAG_NAMES) {
    if (typeof values[flag] === 'boolean') target[flag] = values[flag] as boolean;
  }
}

export function isMobileV6FeatureFlagName(value: unknown): value is MobileV6FeatureFlagName {
  return typeof value === 'string' && FLAG_NAME_SET.has(value);
}

export function resolveMobileV6FeatureFlags(
  input: MobileV6FeatureFlagResolutionInput = {},
): MobileV6FeatureFlagSnapshot {
  const resolved: Record<MobileV6FeatureFlagName, boolean> = {
    ...DEFAULT_MOBILE_V6_FEATURE_FLAGS,
  };

  applyBooleanValues(resolved, input.local);
  applyBooleanValues(resolved, input.remote);

  const killSwitches = asFlagValues(input.killSwitches);
  for (const flag of MOBILE_V6_FEATURE_FLAG_NAMES) {
    if (killSwitches[flag] === true) resolved[flag] = false;
  }

  // Applied after the kill switches so a disabled prerequisite also takes its
  // dependants down with it.
  for (const [flag, requires] of MOBILE_V6_FEATURE_FLAG_DEPENDENCIES) {
    if (resolved[flag] && !resolved[requires]) resolved[flag] = false;
  }

  return Object.freeze({ ...resolved });
}

/**
 * Evaluate an external provider fail-safe. Provider exceptions or malformed
 * output resolve to the all-off default; callers must never infer an enabled
 * flag from a failed remote lookup.
 */
export function evaluateMobileV6FeatureFlagProvider(
  provider: MobileV6FeatureFlagProvider | undefined,
  context: MobileV6FeatureFlagContext = {},
): MobileV6FeatureFlagSnapshot {
  if (!provider) return DEFAULT_MOBILE_V6_FEATURE_FLAGS;
  try {
    return resolveMobileV6FeatureFlags(provider(context));
  } catch {
    return DEFAULT_MOBILE_V6_FEATURE_FLAGS;
  }
}

/** Configure the process-local snapshot. This does not persist account data. */
export function configureMobileV6FeatureFlags(
  input: MobileV6FeatureFlagResolutionInput,
): MobileV6FeatureFlagSnapshot {
  currentSnapshot = resolveMobileV6FeatureFlags(input);
  return currentSnapshot;
}

export function resetMobileV6FeatureFlags(): void {
  currentSnapshot = DEFAULT_MOBILE_V6_FEATURE_FLAGS;
}

export function getMobileV6FeatureFlags(): MobileV6FeatureFlagSnapshot {
  return currentSnapshot;
}

export function isMobileV6FeatureEnabled(flag: MobileV6FeatureFlagName): boolean {
  return currentSnapshot[flag] === true;
}

/**
 * The single source for "is this an Agent-first build" (MTR-R06.4).
 *
 * It MUST stay a function. `App.tsx` used to hold a module-level const reading
 * `process.env` directly, which is how tab / deep link / push could disagree;
 * and a module-level `const x = isMobileV6FeatureEnabled(...)` would be worse
 * still — it evaluates during import hoisting, before
 * `configureMobileV6FeatureFlagsFromEnvironment()` runs, and stably reads off.
 */
export function isAgentFirstIaEnabled(): boolean {
  return isMobileV6FeatureEnabled('mobile.agent_first_ia');
}

export function isTwinSurfaceEnabled(): boolean {
  return isMobileV6FeatureEnabled('mobile.twin_surface');
}

/**
 * Whether the Pet family (global Companion layer, `me/pet/*`, AXP / earnings
 * entries) may be mounted — MTR-R09.3 / R09.8.
 *
 * Decision d-35 (2026-09-16, M0.0.8 = "Shell", supersedes the d-32 interim
 * "hide"): the Pet family is NOT withdrawn from the Agent-first IA. The
 * floating ball / Companion layer is the current canonical Agent's Shell
 * (bound to `SoulCoreRef.agentAccountId`, see `companionShellBinding.ts`), so
 * `mobile.pet_l2_surface` defaults ON and only remains as the kill switch:
 * remote `false`, a kill-switch entry, or `EXPO_PUBLIC_MOBILE_PET_L2_SURFACE=0`
 * hides the whole family again (R09.8: never "routes hidden, overlay still up").
 *
 * - Legacy IA: always on. Pet is `LIVE_BASELINE` there.
 * - Agent-first IA: the flag (default on).
 *
 * Same rule as `isAgentFirstIaEnabled`: stays a function, evaluated per call.
 */
export function isPetSurfaceEnabled(): boolean {
  if (!isAgentFirstIaEnabled()) return true;
  return isMobileV6FeatureEnabled('mobile.pet_l2_surface');
}

/**
 * Whether the World / Plaza families (and the Aeon / Market / Social paths the
 * legacy route table rewrites into them) may be reached through legacy deep
 * links under the Agent-first IA — MTR-R09.2, decision d-35 (M0.0.7).
 *
 * They stay mounted as hidden tabs (R09.7: hide, never delete), but with this
 * flag off (the default) `agentrix://world/*` and `agentrix://plaza/*` land on
 * the destination-error card whose copy is the user migration note. Rollback
 * = remote `true` or `EXPO_PUBLIC_MOBILE_WORLD_PLAZA_L2_SURFACE=1`.
 *
 * - Legacy IA: always on (those tabs ARE the legacy IA).
 * - Agent-first IA: the flag (default off).
 */
export function isWorldPlazaSurfaceEnabled(): boolean {
  if (!isAgentFirstIaEnabled()) return true;
  return isMobileV6FeatureEnabled('mobile.world_plaza_l2_surface');
}

function envBoolean(value: string | undefined): boolean | undefined {
  if (value === '1') return true;
  if (value === '0') return false;
  return undefined;
}

/**
 * Read Expo build-time flags without treating malformed/missing values as on.
 * Remote rollout code may still call `configureMobileV6FeatureFlags` later.
 */
export function configureMobileV6FeatureFlagsFromEnvironment(): MobileV6FeatureFlagSnapshot {
  return configureMobileV6FeatureFlags({
    local: {
      'mobile.agent_first_ia': envBoolean(process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA),
      'mobile.agent_economy_v1': envBoolean(process.env.EXPO_PUBLIC_MOBILE_AGENT_ECONOMY_V1),
      'mobile.trust_loop': envBoolean(process.env.EXPO_PUBLIC_MOBILE_TRUST_LOOP),
      'mobile.soul_card_nfc': envBoolean(process.env.EXPO_PUBLIC_MOBILE_SOUL_CARD_NFC),
      'mobile.twin_surface': envBoolean(process.env.EXPO_PUBLIC_MOBILE_TWIN_SURFACE),
      'mobile.pet_l2_surface': envBoolean(process.env.EXPO_PUBLIC_MOBILE_PET_L2_SURFACE),
      'mobile.world_plaza_l2_surface': envBoolean(process.env.EXPO_PUBLIC_MOBILE_WORLD_PLAZA_L2_SURFACE),
    },
  });
}
