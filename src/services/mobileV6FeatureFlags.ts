export const MOBILE_V6_FEATURE_FLAG_NAMES = [
  'mobile.v6_ia',
  'mobile.agent_first_ia',
  'mobile.agent_economy_v1',
  'mobile.trust_loop',
  'mobile.soul_card_nfc',
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
  'mobile.v6_ia': false,
  'mobile.agent_first_ia': false,
  'mobile.agent_economy_v1': false,
  'mobile.trust_loop': false,
  'mobile.soul_card_nfc': false,
});

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

function envBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

/**
 * Read Expo build-time flags without treating malformed/missing values as on.
 * Remote rollout code may still call `configureMobileV6FeatureFlags` later.
 */
export function configureMobileV6FeatureFlagsFromEnvironment(): MobileV6FeatureFlagSnapshot {
  return configureMobileV6FeatureFlags({
    local: {
      'mobile.v6_ia': envBoolean(process.env.EXPO_PUBLIC_MOBILE_V6_IA),
      'mobile.agent_first_ia': envBoolean(process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA),
      'mobile.agent_economy_v1': envBoolean(process.env.EXPO_PUBLIC_MOBILE_AGENT_ECONOMY_V1),
      'mobile.trust_loop': envBoolean(process.env.EXPO_PUBLIC_MOBILE_TRUST_LOOP),
      'mobile.soul_card_nfc': envBoolean(process.env.EXPO_PUBLIC_MOBILE_SOUL_CARD_NFC),
    },
  });
}
