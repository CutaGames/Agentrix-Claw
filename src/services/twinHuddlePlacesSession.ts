/**
 * The places client bound to this app's session (twinHuddlePlaces.ts): same transport, API base and token as the twin
 * huddle client (twinHuddleSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinHuddlePlacesClient, type MobileTwinHuddlePlacesClient } from './twinHuddlePlaces';

export function mobileTwinHuddlePlacesClient(): MobileTwinHuddlePlacesClient {
  return createMobileTwinHuddlePlacesClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
