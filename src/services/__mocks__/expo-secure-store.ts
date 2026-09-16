/**
 * Jest mock for `expo-secure-store` — the native keychain module cannot load
 * outside a React Native runtime. `jest.config.js` maps the package here via
 * `moduleNameMapper`; this file was referenced there but never existed, which
 * is why every suite whose import graph reached `services/api.ts` failed with
 * "Cannot find module" (petDetail.test.ts was the visible one).
 *
 * In-memory, promise-based, API-compatible with the subset the app uses.
 */
const store = new Map<string, string>();

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const WHEN_UNLOCKED = 2;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 3;
export const ALWAYS = 4;
export const ALWAYS_THIS_DEVICE_ONLY = 5;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 6;

export async function getItemAsync(key: string, _options?: unknown): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string, _options?: unknown): Promise<void> {
  store.set(key, String(value));
}

export async function deleteItemAsync(key: string, _options?: unknown): Promise<void> {
  store.delete(key);
}

export function getItem(key: string, _options?: unknown): string | null {
  return store.has(key) ? (store.get(key) as string) : null;
}

export function setItem(key: string, value: string, _options?: unknown): void {
  store.set(key, String(value));
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export function canUseBiometricAuthentication(): boolean {
  return false;
}

/** Test helper — not part of the real module. */
export function __resetSecureStoreMock(): void {
  store.clear();
}

export default {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  getItem,
  setItem,
  isAvailableAsync,
  canUseBiometricAuthentication,
  AFTER_FIRST_UNLOCK,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  WHEN_UNLOCKED,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  ALWAYS,
  ALWAYS_THIS_DEVICE_ONLY,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
};
