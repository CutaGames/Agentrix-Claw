/**
 * Environment configuration for ClawLink.
 *
 * Staging is reached only through the preview build's "连接 staging" switch
 * (`stagingMode.ts`, I-046): a build without `EXPO_PUBLIC_STAGING_SWITCH=1` is
 * always production (or development under `__DEV__`). The old `staging` EAS
 * channel pointed at a host that does not exist and no build profile uses it.
 */
import Constants from 'expo-constants';
import { STAGING_ORIGIN, STAGING_SELECTION, ensureStagingNetworkGuard } from './stagingMode';

export type AppEnv = 'development' | 'staging' | 'production';

function detectEnv(): AppEnv {
  // Read once at bundle start; switching reloads the app (stagingSwitch.ts).
  if (STAGING_SELECTION.active) return 'staging';
  const channel = (Constants.expoConfig?.extra?.easUpdateChannel as string | undefined) ?? '';
  if (channel === 'production') return 'production';
  // In local dev (__DEV__ = true), use development config
  if (__DEV__) return 'development';
  return 'production';
}

interface EnvConfig {
  apiBase: string;
  wsBase: string;
  appUrl: string;
  shareBaseUrl: string;
}

const CONFIGS: Record<AppEnv, EnvConfig> = {
  development: {
    apiBase: 'https://api.agentrix.top/api',
    wsBase: 'wss://api.agentrix.top',
    appUrl: 'https://www.agentrix.top',
    shareBaseUrl: 'https://clawlink.app', // always prod share URL
  },
  // Staging plan §9: one host, the same paths as production.
  staging: {
    apiBase: `${STAGING_ORIGIN}/api`,
    wsBase: 'wss://stg.agentrix.top',
    appUrl: STAGING_ORIGIN,
    shareBaseUrl: 'https://clawlink.app',
  },
  production: {
    apiBase: 'https://api.agentrix.top/api',
    wsBase: 'wss://api.agentrix.top',
    appUrl: 'https://www.agentrix.top',
    shareBaseUrl: 'https://clawlink.app',
  },
};

// Before anything talks to the network: in a switch build, the staging header / host guard.
ensureStagingNetworkGuard();
export const APP_ENV: AppEnv = detectEnv();
export const ENV: EnvConfig = CONFIGS[APP_ENV];

/** Backend REST API base URL */
export const API_BASE = ENV.apiBase;
/** WebSocket / SSE base URL */
export const WS_BASE = ENV.wsBase;
/** Frontend web base URL */
export const APP_URL = ENV.appUrl;
/** Share / deep link base URL (always production) */
export const SHARE_BASE_URL = ENV.shareBaseUrl;

/** Override API base for self-hosted instances */
export function getBackendBaseUrl(): string {
  return API_BASE;
}
