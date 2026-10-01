/**
 * The native side of phoneDeviceKey.ts: the local Expo module `modules/agentrix-device-key`
 * (Android Keystore / iOS Secure Enclave, P-256).
 *
 * - Off unless the build sets `EXPO_PUBLIC_PHONE_DEVICE_KEY=1`; a binary without the module (older APK,
 *   Expo Go) also reads as unavailable.
 * - Android: the key signs only within 15 s of an owner authentication, so every `sign` first asks with
 *   expo-local-authentication (class 3 biometrics or the lock-screen code). iOS: the Secure Enclave asks by
 *   itself (`.userPresence`), with the prompt text passed in.
 */
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { requireOptionalNativeModule } from 'expo';
import type { PhoneDeviceKeyNativeV1, PhoneKeyPublicV1 } from './phoneDeviceKey';

interface AgentrixDeviceKeyModuleV1 {
  getPublicKey(): Promise<{ x: string; y: string; hardware: string } | null>;
  createKey(): Promise<{ x: string; y: string; hardware: string }>;
  sign(message: string, prompt: string): Promise<string>;
}

export const PHONE_DEVICE_KEY_ENABLED = process.env.EXPO_PUBLIC_PHONE_DEVICE_KEY === '1';

/** Below the key's 15 s window (AgentrixDeviceKeyModule.kt), so a reused prompt is still inside it. */
const ANDROID_REUSE_AUTH_MS = 10_000;

const HARDWARE = ['strongbox', 'tee', 'secure_enclave', 'software', 'unknown'] as const;

function readPublic(value: { x: string; y: string; hardware: string }): PhoneKeyPublicV1 {
  const hardware = (HARDWARE as readonly string[]).includes(value.hardware) ? (value.hardware as PhoneKeyPublicV1['hardware']) : 'unknown';
  return { x: String(value.x), y: String(value.y), hardware };
}

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** The native key, or null when this build or binary does not have it. */
export function phoneDeviceKeyNative(): PhoneDeviceKeyNativeV1 | null {
  if (!PHONE_DEVICE_KEY_ENABLED || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return null;
  const module = requireOptionalNativeModule<AgentrixDeviceKeyModuleV1>('AgentrixDeviceKey');
  if (!module) return null;
  // Enrollment signs twice in a row: one prompt covers both while the key's 15 s window is open.
  let lastAuthAt = 0;
  const authenticate = async (prompt: string) => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      biometricsSecurityLevel: 'strong',
      disableDeviceFallback: false,
    });
    if (!result.success) throw Object.assign(new Error('user_cancelled'), { code: 'user_cancelled' });
    lastAuthAt = Date.now();
  };
  return {
    getPublicKey: async () => {
      const value = await module.getPublicKey();
      return value ? readPublic(value) : null;
    },
    createKey: async () => readPublic(await module.createKey()),
    sign: async (message, prompt) => {
      if (Platform.OS !== 'android') return module.sign(message, prompt);
      if (Date.now() - lastAuthAt > ANDROID_REUSE_AUTH_MS) await authenticate(prompt);
      try {
        return await module.sign(message, prompt);
      } catch (error) {
        // The window passed between the prompt and the signature: ask once more.
        if (codeOf(error) !== 'user_not_authenticated') throw error;
        await authenticate(prompt);
        return module.sign(message, prompt);
      }
    },
  };
}
