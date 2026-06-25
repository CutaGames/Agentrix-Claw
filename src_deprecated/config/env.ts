/**
 * Environment configuration for ClawLink
 * Switch between dev / staging / production by EAS update channel.
 */
import Constants from 'expo-constants';

export type AppEnv = 'development' | 'staging' | 'production';

function detectEnv(): AppEnv {
  // EAS build channels drive environment selection
  const channel = (Constants.expoConfig?.extra?.easUpdateChannel as string | undefined) ?? '';
  if (channel === 'production') return 'production';
  if (channel === 'staging') return 'staging';
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
    // Replace LAN_IP with the host machine's LAN IP when testing on a physical device
    apiBase: 'http://192.168.1.3:3001/api',
    wsBase: 'ws://192.168.1.3:3001',
    appUrl: 'http://192.168.1.3:3000',
    shareBaseUrl: 'https://clawlink.app', // always prod share URL
  },
  staging: {
    apiBase: 'https://staging-api.agentrix.top/api',
    wsBase: 'wss://staging-api.agentrix.top',
    appUrl: 'https://staging.agentrix.top',
    shareBaseUrl: 'https://clawlink.app',
  },
  production: {
    apiBase: 'https://api.agentrix.top/api',
    wsBase: 'wss://api.agentrix.top',
    appUrl: 'https://www.agentrix.top',
    shareBaseUrl: 'https://clawlink.app',
  },
};

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
