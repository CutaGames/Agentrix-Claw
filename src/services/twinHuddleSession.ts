/**
 * The twin huddle client bound to this app's session (twinHuddle.ts): same transport, API base and token as the card
 * exchange client (cardExchangeSession.ts); link-seat links open on the web app.
 */
import { APP_URL } from '../config/env';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinHuddleClient, type MobileTwinHuddleClient } from './twinHuddle';

export function mobileTwinHuddleClient(): MobileTwinHuddleClient {
  return createMobileTwinHuddleClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    webOrigin: APP_URL,
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
