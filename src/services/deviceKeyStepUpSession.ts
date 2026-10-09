/**
 * Binds deviceKeyStepUp.ts to the app: the v6 transport and API base, the signed-in token, this phone's registered device
 * id (phone enrollment), the biometric-gated phone key, and the fresh token replacing the session token exactly like an
 * e-mail-code step-up (stepUpSession.ts applyStepUpToken). Null when the build has no phone key module or nobody is signed in.
 */
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { readThisPhone } from './phoneDeviceEnrollment';
import { phoneDeviceKeyNative } from './phoneDeviceKeyNative';
import { signWithPhoneKey } from './phoneDeviceKey';
import { applyStepUpToken } from './stepUpSession';
import { useAuthStore } from '../stores/authStore';
import type { DeviceKeyStepUpDeps } from './deviceKeyStepUp';

export async function deviceKeyStepUpDeps(prompt: string): Promise<(DeviceKeyStepUpDeps & { onToken: (accessToken: string) => Promise<void> }) | null> {
  const config = getApiConfig();
  const token = config.token || useAuthStore.getState().token;
  const native = phoneDeviceKeyNative();
  if (!token || !native) return null;
  const phone = await readThisPhone();
  return {
    transport: mobileV6HttpTransport,
    baseUrl: (config.baseUrl || 'https://api.agentrix.top/api').replace(/\/+$/, ''),
    token,
    deviceId: phone.registered ? phone.deviceId : null,
    sign: (message) => signWithPhoneKey(native, message, prompt),
    onToken: applyStepUpToken,
  };
}

/** True when this build has the phone key and this phone registered one (no prompt, no network). */
export async function thisPhoneHasDeviceKey(): Promise<boolean> {
  if (!phoneDeviceKeyNative()) return false;
  return (await readThisPhone()).registered;
}
