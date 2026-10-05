/**
 * The automations client bound to this app's session (agentAutomations.ts): same transport, API base and token as
 * the channel inbox (channelInboxSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileAgentAutomationsClient, type MobileAgentAutomationsClientV0 } from './agentAutomations';

export function mobileAgentAutomationsClient(): MobileAgentAutomationsClientV0 {
  return createMobileAgentAutomationsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
