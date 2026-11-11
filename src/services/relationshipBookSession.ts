/**
 * The relationship book client bound to this app's session (relationshipBook.ts): same transport, API base and token as
 * the skill drafts client (skillDraftsSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import type { L9RegulatedGateResultV1 } from '../../shared/client/l9-regulated';
import { readMobileL9Regulated } from './businessExport';
import { createMobileRelationshipBookClient, type MobileRelationshipBookClient } from './relationshipBook';

export function mobileRelationshipBookClient(): MobileRelationshipBookClient {
  return createMobileRelationshipBookClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

/** L9.2 G6b: is this a licensed-trade account (the relationship book then draws the DNC sentence); anything unreadable is "not regulated". */
export function mobileL9Regulated(): Promise<L9RegulatedGateResultV1> {
  return readMobileL9Regulated({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
