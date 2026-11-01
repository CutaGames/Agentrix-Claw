/**
 * L9 S16: the "My things" client the screens use, wired to the app's transport and session (deviceAssets.ts holds the
 * logic and is tested without React Native). The token is read again for every request; nothing is kept here.
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { createMobileDeviceAssetsClient, type MobileDeviceAssetsClient } from './deviceAssets';

/** Every "My things" read shares this prefix, so one invalidation refreshes the list, a detail and the cards. */
export const DEVICE_ASSETS_QUERY_KEY = ['four-zone', 'device-assets'] as const;

export function mobileDeviceAssetsClient(): MobileDeviceAssetsClient {
  return createMobileDeviceAssetsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token ?? null,
  });
}
