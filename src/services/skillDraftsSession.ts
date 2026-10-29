/**
 * The skill drafts client bound to this app's session (skillDrafts.ts): same transport, API base and token as the
 * automations client (agentAutomationsSession.ts).
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileSkillDraftsClient, type MobileSkillDraftsClient } from './skillDrafts';

export function mobileSkillDraftsClient(): MobileSkillDraftsClient {
  return createMobileSkillDraftsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
