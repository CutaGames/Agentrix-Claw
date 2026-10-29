/**
 * L8 E4 (mobile): the private vault's device key is a random 32-byte key held in SecureStore (the iOS keychain / the Android
 * keystore), readable only while the phone is unlocked and never copied to another device.
 *
 * Contract: `shared/types/private-vault.ts`. The vault key is wrapped under that key with AES-256-GCM and the server keeps the
 * ciphertext. NOTE: React Native has no WebCrypto, and the approved mobile dependencies have no AES-GCM
 * (`expo-crypto` 15 only hashes and makes random bytes). So this file takes the AES-GCM binding as a port and the vault is OFF on
 * mobile (`aead_unavailable`) until a library is approved and bound with `setMobilePrivateVaultCryptoPort`. Nothing falls back
 * to a server-held key or to a home-made cipher.
 *
 * Off unless `EXPO_PUBLIC_PRIVATE_VAULT_ENABLED=1`; the routes answer 404 while the server switch is off.
 */
import * as SecureStore from 'expo-secure-store';
import {
  privateVaultSurfaceModeV1,
  type PrivateVaultKeySlotViewV1,
  type PrivateVaultSurfaceModeV1,
} from '../../shared/types/private-vault';
import {
  unwrapPrivateVaultKeyV1,
  wrapPrivateVaultKeyV1,
  zeroPrivateVaultBytesV1,
  type PrivateVaultCryptoPortV1,
  type PrivateVaultSlotBindingV1,
} from '../../shared/types/private-vault-client';
import { PrivateVaultSessionV1, type PrivateVaultApiV1, type PrivateVaultDeviceKeyV1 } from '../../shared/types/private-vault-session';

export function isPrivateVaultMobileEnabled(env: { EXPO_PUBLIC_PRIVATE_VAULT_ENABLED?: string } = { EXPO_PUBLIC_PRIVATE_VAULT_ENABLED: process.env.EXPO_PUBLIC_PRIVATE_VAULT_ENABLED }): boolean {
  return env.EXPO_PUBLIC_PRIVATE_VAULT_ENABLED === '1';
}

export const MOBILE_VAULT_KEK_STORE_KEY = 'agentrix.privateVault.kek.v1';
export const MOBILE_VAULT_SLOTS_STORE_KEY = 'agentrix.privateVault.slots.v1';

/** The slice of `expo-secure-store` used here; tests pass an in-memory one. */
export interface MobileSecureStoreV1 {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string, options?: Record<string, unknown>): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: Record<string, unknown>): Promise<void>;
}

// Readable only while the phone is unlocked, and never restored to another phone from a backup.
const SECURE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as Record<string, unknown>;

let boundCrypto: PrivateVaultCryptoPortV1 | null = null;

/** Called once at startup by whichever approved AES-256-GCM library gets bound. Until then the vault is off on mobile. */
export function setMobilePrivateVaultCryptoPort(port: PrivateVaultCryptoPortV1 | null): void {
  boundCrypto = port;
}

export function getMobilePrivateVaultCryptoPort(): PrivateVaultCryptoPortV1 | null {
  return boundCrypto;
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
function fromHex(value: string | null): Uint8Array | null {
  if (!value || !/^[0-9a-f]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) as string[], (pair) => parseInt(pair, 16));
}

/** Whether this phone offers the vault: the SecureStore works and an AES-256-GCM port is bound. */
export async function detectMobilePrivateVaultV1(
  store: Pick<MobileSecureStoreV1, 'isAvailableAsync'> = SecureStore,
  crypto: PrivateVaultCryptoPortV1 | null = boundCrypto,
): Promise<PrivateVaultSurfaceModeV1> {
  let secureStore = false;
  try {
    secureStore = (await store.isAvailableAsync()) === true;
  } catch {
    secureStore = false;
  }
  return privateVaultSurfaceModeV1('mobile', { secureStore, aeadAvailable: crypto !== null });
}

/** This phone's device key. Async because the list of this phone's slot ids is read from SecureStore first. */
export async function createMobileDeviceKeyV1(options: { store?: MobileSecureStoreV1; crypto: PrivateVaultCryptoPortV1 }): Promise<PrivateVaultDeviceKeyV1> {
  const store = options.store ?? (SecureStore as unknown as MobileSecureStoreV1);
  const port = options.crypto;
  let mine: string[] = [];
  try {
    const parsed = JSON.parse((await store.getItemAsync(MOBILE_VAULT_SLOTS_STORE_KEY)) ?? '[]');
    mine = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    mine = [];
  }

  /** `create`: make the key if there is none. Unwrapping never does: a lost key is an error, not a new empty key. */
  async function kek(create: boolean): Promise<Uint8Array> {
    const existing = fromHex(await store.getItemAsync(MOBILE_VAULT_KEK_STORE_KEY, SECURE_OPTIONS));
    if (existing) return existing;
    if (!create) throw new Error('no_device_key');
    const fresh = port.randomBytes(32);
    await store.setItemAsync(MOBILE_VAULT_KEK_STORE_KEY, toHex(fresh), SECURE_OPTIONS);
    return fresh;
  }

  return {
    slotKind: 'secure_store',

    async wrap(binding: PrivateVaultSlotBindingV1, vaultKey: Uint8Array) {
      const key = await kek(true);
      try {
        const slot = await wrapPrivateVaultKeyV1(port, key, binding, vaultKey);
        mine = [...new Set([...mine, binding.slotId])].slice(-50);
        await store.setItemAsync(MOBILE_VAULT_SLOTS_STORE_KEY, JSON.stringify(mine));
        return slot;
      } finally {
        zeroPrivateVaultBytesV1(key);
      }
    },

    async unwrap(binding: PrivateVaultSlotBindingV1, slot: PrivateVaultKeySlotViewV1) {
      const key = await kek(false);
      try {
        return await unwrapPrivateVaultKeyV1(port, key, binding, slot);
      } finally {
        zeroPrivateVaultBytesV1(key);
      }
    },

    owns: (slot: PrivateVaultKeySlotViewV1) => slot.slotKind === 'secure_store' && mine.includes(slot.slotId),
  };
}

/** The vault session on this phone. Throws `aead_unavailable` while no AES-256-GCM port is bound. */
export async function createMobilePrivateVaultSession(options: { ownerUserId: string; api: PrivateVaultApiV1; store?: MobileSecureStoreV1; crypto?: PrivateVaultCryptoPortV1 | null }): Promise<PrivateVaultSessionV1> {
  const crypto = options.crypto ?? boundCrypto;
  if (!crypto) throw new Error('aead_unavailable');
  const deviceKey = await createMobileDeviceKeyV1({ store: options.store, crypto });
  return new PrivateVaultSessionV1({ ownerUserId: options.ownerUserId, surface: 'mobile', crypto, deviceKey, api: options.api });
}
