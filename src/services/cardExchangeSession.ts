/**
 * The card exchange client bound to this app's session (cardExchange.ts): same transport, API base and token as the
 * relationship book client (relationshipBookSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileCardExchangeClient, type MobileCardExchangeClient } from './cardExchange';

export function mobileCardExchangeClient(): MobileCardExchangeClient {
  return createMobileCardExchangeClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
