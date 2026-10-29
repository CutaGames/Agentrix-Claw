/**
 * The relationship book client bound to this app's session (relationshipBook.ts): same transport, API base and token as
 * the skill drafts client (skillDraftsSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileRelationshipBookClient, type MobileRelationshipBookClient } from './relationshipBook';

export function mobileRelationshipBookClient(): MobileRelationshipBookClient {
  return createMobileRelationshipBookClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
