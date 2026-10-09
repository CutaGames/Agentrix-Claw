/**
 * The channel inbox client bound to this app's session (channelInbox.ts): same transport, API base and token as
 * the step-up client (stepUpSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileChannelInboxClient, type MobileChannelInboxClientV0 } from './channelInbox';

export function mobileChannelInboxClient(): MobileChannelInboxClientV0 {
  return createMobileChannelInboxClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
