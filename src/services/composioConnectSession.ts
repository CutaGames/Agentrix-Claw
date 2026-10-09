/**
 * The connected-apps client bound to this app's session (composioConnect.ts): same transport, API base and token as
 * the automations screen (agentAutomationsSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileComposioConnectClient, type MobileComposioConnectClientV0 } from './composioConnect';

export function mobileComposioConnectClient(): MobileComposioConnectClientV0 {
  return createMobileComposioConnectClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
