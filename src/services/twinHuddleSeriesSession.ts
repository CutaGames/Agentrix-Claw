/**
 * The weekly plan client bound to this app's session (twinHuddleSeries.ts): same transport, API base and token as the
 * twin huddle client (twinHuddleSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinHuddleSeriesClient, type MobileTwinHuddleSeriesClient } from './twinHuddleSeries';

export function mobileTwinHuddleSeriesClient(): MobileTwinHuddleSeriesClient {
  return createMobileTwinHuddleSeriesClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
