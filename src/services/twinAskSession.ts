/**
 * The asking-around client bound to this app's session (twinAsk.ts): same transport, API base and token as the twin
 * huddle client (twinHuddleSession.ts); link answers open on the web app. The token is read on every call, so a
 * confirmation that renews it (stepUpSession.ts) applies to the next request.
 */
import { APP_URL } from '../config/env';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinAskClient, type MobileTwinAskClient } from './twinAsk';

export function mobileTwinAskClient(): MobileTwinAskClient {
  return createMobileTwinAskClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    webOrigin: APP_URL,
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
