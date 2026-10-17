/**
 * The Agent mailbox client bound to this app's session (agentMailbox.ts): same transport, API base and token as the
 * automations screen (agentAutomationsSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileAgentMailboxClient, type MobileAgentMailboxClientV0 } from './agentMailbox';

export function mobileAgentMailboxClient(): MobileAgentMailboxClientV0 {
  return createMobileAgentMailboxClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
