/**
 * The automation proposal client bound to this app's session (automationProposal.ts): same transport, API base and
 * token as the step-up client, so a token replaced after step-up is used by the retry.
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileAutomationProposalClient, type MobileAutomationProposalClientV0 } from './automationProposal';

export function mobileAutomationProposalClient(): MobileAutomationProposalClientV0 {
  return createMobileAutomationProposalClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
