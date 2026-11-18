/**
 * The finding-through-friends client bound to this app's session (twinFind.ts): same transport, API base and token as
 * the asking-around client (twinAskSession.ts); consent links open on the web app.
 */
import { APP_URL } from '../config/env';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinFindClient, type MobileTwinFindClient } from './twinFind';

export function mobileTwinFindClient(): MobileTwinFindClient {
  return createMobileTwinFindClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    webOrigin: APP_URL,
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
