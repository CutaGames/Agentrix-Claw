/**
 * Jest mock for `expo-constants` — `expo-constants/build/Constants.js` ships
 * as ESM and ts-jest does not transform node_modules, so any import graph that
 * reaches `src/config/env.ts` used to die with "Cannot use import statement
 * outside a module" (ttsSpeaker.property.test.ts, petDetail.test.ts).
 *
 * Only the fields `src/config/env.ts` and friends read are modelled. No EAS
 * channel is set, so `detectEnv()` resolves the same way a local dev build does.
 */
export const ExecutionEnvironment = {
  Bare: 'bare',
  Standalone: 'standalone',
  StoreClient: 'storeClient',
} as const;

export const AppOwnership = {
  Expo: 'expo',
  Standalone: 'standalone',
  Guest: 'guest',
} as const;

const Constants = {
  expoConfig: { name: 'agentrix-jest', slug: 'agentrix-jest', extra: {} as Record<string, unknown> },
  expoGoConfig: null,
  easConfig: null,
  manifest: null,
  manifest2: null,
  executionEnvironment: ExecutionEnvironment.Bare,
  appOwnership: null,
  deviceName: 'jest',
  sessionId: 'jest-session',
  statusBarHeight: 0,
  systemFonts: [] as string[],
  platform: {},
  isDevice: false,
  debugMode: false,
};

export default Constants;
