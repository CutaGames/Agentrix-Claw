/**
 * After an e-mail-code step-up (stepUp.ts): the fresh token replaces the session token everywhere the
 * sign-in functions put one (auth.ts `handleLoginResult`): the API config, storage (with its environment tag)
 * and the auth store. The user stays the same; nothing else is reset.
 */
import { getApiConfig, saveTokenToStorage, setApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';
import { createMobileStepUpClient, type MobileStepUpClientV1 } from './stepUp';

export function mobileStepUpClient(): MobileStepUpClientV1 {
  return createMobileStepUpClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export async function applyStepUpToken(accessToken: string): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!user || !accessToken) throw new Error('step_up_no_session');
  setApiConfig({ token: accessToken });
  await saveTokenToStorage(accessToken);
  await useAuthStore.getState().setAuth(user, accessToken);
}
