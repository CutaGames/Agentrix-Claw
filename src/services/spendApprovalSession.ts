/**
 * The payment approval client bound to this app's session (spendApproval.ts): same transport, API base and token
 * as the step-up client (stepUpSession.ts), so a token replaced after step-up is used by the retry.
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileSpendApprovalClient, type MobileSpendApprovalClientV0 } from './spendApproval';

export function mobileSpendApprovalClient(): MobileSpendApprovalClientV0 {
  return createMobileSpendApprovalClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}
