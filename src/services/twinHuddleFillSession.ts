/**
 * The fill client bound to this app's session (twinHuddleFill.ts): same transport, API base and token as the twin huddle
 * client (twinHuddleSession.ts); bring links open on the web app.
 */
import { APP_URL } from '../config/env';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinHuddleFillClient, type MobileTwinHuddleFillClient } from './twinHuddleFill';

export function mobileTwinHuddleFillClient(): MobileTwinHuddleFillClient {
  return createMobileTwinHuddleFillClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    webOrigin: APP_URL,
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
