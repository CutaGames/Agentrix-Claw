/**
 * Runtime glue for 我的 → 设备 → 这台手机: the native key (phoneDeviceKeyNative.ts), the enrollment steps
 * (phoneDeviceKey.ts), SecureStore for the progress record and the shell binding, expo-crypto for request ids.
 * Off unless the build sets `EXPO_PUBLIC_PHONE_DEVICE_KEY=1` and the binary has the module; telling the Agent what
 * the phone can do also needs `EXPO_PUBLIC_DEVICE_MESH_ENABLED=1`.
 */
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { getRandomBytesAsync, randomUUID } from 'expo-crypto';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { declarePhoneCapabilities, type PhoneDeclareResult } from './phoneCapabilityDeclaration';
import {
  HARDWARE_BACKED,
  PhoneDeviceKeyError,
  decodePhoneEnrollmentState,
  enrollPhoneDevice,
  type PhoneEnrollmentResultV1,
  type PhoneEnrollmentStateV1,
  type PhoneEnrollmentStoreV1,
  type PhoneKeyHardwareV1,
} from './phoneDeviceKey';
import { phoneDeviceKeyNative } from './phoneDeviceKeyNative';
import type { PhoneShellBindingStoreV1 } from './phoneShellBinding';

export const PHONE_ENROLLMENT_STORE_KEY = 'agentrix_phone_device_enrollment_v1';
export const PHONE_SHELL_BINDING_STORE_KEY = 'agentrix_phone_shell_binding_v1';

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

const bindingStore: PhoneShellBindingStoreV1 = {
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PHONE_SHELL_BINDING_STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save: async (binding) => {
    await SecureStore.setItemAsync(PHONE_SHELL_BINDING_STORE_KEY, JSON.stringify(binding));
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(PHONE_SHELL_BINDING_STORE_KEY);
  },
};

/**
 * 这台手机 → tell the Agent what it can do. Runs on the owner's tap, so the app is in the foreground. No sensors are
 * declared yet (that needs the permission reads); push counts as reachable once a push token is registered.
 */
export async function declareThisPhone(input: { agentAccountId: string | null; pushReachable: boolean }, prompt: string): Promise<PhoneDeclareResult> {
  const native = phoneDeviceKeyNative();
  if (!native) return { ok: false, reason: 'off' };
  const { baseUrl, token } = getApiConfig();
  const base = (baseUrl || 'https://api.agentrix.top/api').replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
    const response = await mobileV6HttpTransport.request({
      method,
      path: `${base}${path}`,
      headers: { Accept: 'application/json', 'X-Agentrix-Surface': 'mobile', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body }),
    });
    return { status: response.status, body: response.body };
  };
  const [state, key] = await Promise.all([store.load(), native.getPublicKey().catch(() => null)]);
  return declarePhoneCapabilities(
    {
      agentAccountId: input.agentAccountId,
      deviceId: state?.deviceId ?? null,
      credentialRef: state?.credentialRef ?? null,
      pushReachable: input.pushReachable,
      hardwareKey: !!key && HARDWARE_BACKED.includes(key.hardware),
      foreground: true,
    },
    {
      localEnabled: process.env.EXPO_PUBLIC_DEVICE_MESH_ENABLED === '1',
      nowMs: () => Date.now(),
      getJson: (path) => call('GET', path),
      postJson: (path, body) => call('POST', path, body),
      native,
      prompt,
      bindingStore,
      newDeclarationId: () => randomUUID(),
    },
  );
}
