/**
 * Runtime glue for 我的 → 设备 → 这台手机: the native key (phoneDeviceKeyNative.ts), the enrollment steps
 * (phoneDeviceKey.ts), SecureStore for the progress record, expo-crypto for request ids. Off unless the build
 * sets `EXPO_PUBLIC_PHONE_DEVICE_KEY=1` and the binary has the module.
 */
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { getRandomBytesAsync } from 'expo-crypto';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import {
  PhoneDeviceKeyError,
  decodePhoneEnrollmentState,
  enrollPhoneDevice,
  type PhoneEnrollmentResultV1,
  type PhoneEnrollmentStateV1,
  type PhoneEnrollmentStoreV1,
  type PhoneKeyHardwareV1,
} from './phoneDeviceKey';
import { phoneDeviceKeyNative } from './phoneDeviceKeyNative';

export const PHONE_ENROLLMENT_STORE_KEY = 'agentrix_phone_device_enrollment_v1';

const store: PhoneEnrollmentStoreV1 = {
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PHONE_ENROLLMENT_STORE_KEY);
      return raw ? decodePhoneEnrollmentState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  save: async (state: PhoneEnrollmentStateV1) => {
    await SecureStore.setItemAsync(PHONE_ENROLLMENT_STORE_KEY, JSON.stringify(state));
  },
};

async function newRequestId(prefix: string): Promise<string> {
  const bytes = await getRandomBytesAsync(16);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** The device-list label: the model name, at most 64 characters (never the owner's name). */
function phoneLabel(): string {
  const model = (Device.modelName || Device.deviceName || 'Phone').replace(/[\u0000-\u001f]/g, '').trim();
  return (model || 'Phone').slice(0, 64);
}

export interface ThisPhoneV1 {
  available: boolean;
  deviceId: string | null;
  registered: boolean;
  hardware: PhoneKeyHardwareV1 | null;
}

/** What 这台手机 shows. Never asks the owner (reading the public key needs no confirmation). */
export async function readThisPhone(): Promise<ThisPhoneV1> {
  const native = phoneDeviceKeyNative();
  if (!native) return { available: false, deviceId: null, registered: false, hardware: null };
  const [key, state] = await Promise.all([native.getPublicKey().catch(() => null), store.load()]);
  return {
    available: true,
    deviceId: state?.deviceId ?? null,
    registered: !!state?.credentialRef,
    hardware: key?.hardware ?? null,
  };
}

export async function enrollThisPhone(prompt: string): Promise<PhoneEnrollmentResultV1> {
  const native = phoneDeviceKeyNative();
  if (!native) throw new PhoneDeviceKeyError('unavailable');
  const { baseUrl, token } = getApiConfig();
  if (!token) throw new PhoneDeviceKeyError('pair_ticket_rejected');
  return enrollPhoneDevice({
    native,
    transport: mobileV6HttpTransport,
    baseUrl: baseUrl || 'https://api.agentrix.top/api',
    token,
    store,
    label: phoneLabel(),
    newRequestId,
    prompt,
  });
}
