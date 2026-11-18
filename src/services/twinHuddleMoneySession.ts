/**
 * The money client bound to this app's session (twinHuddleMoney.ts): same transport, API base and token as the twin
 * huddle client (twinHuddleSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinHuddleMoneyClient, type MobileTwinHuddleMoneyClient } from './twinHuddleMoney';

export function mobileTwinHuddleMoneyClient(): MobileTwinHuddleMoneyClient {
  return createMobileTwinHuddleMoneyClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
