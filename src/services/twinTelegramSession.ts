/**
 * The Telegram link client bound to this app's session (twinTelegram.ts): same transport, API base and token as the
 * twin huddle client (twinHuddleSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileTwinTelegramClient, type MobileTwinTelegramClient } from './twinTelegram';

export function mobileTwinTelegramClient(): MobileTwinTelegramClient {
  return createMobileTwinTelegramClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
