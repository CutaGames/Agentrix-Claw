/**
 * L8 E4 (mobile): the device key lives in SecureStore; AES-256-GCM comes from a bound port. Until a library is approved and
 * bound, the vault is off on the phone. The tests use Node's WebCrypto as the stand-in port.
 */
import { webcrypto } from 'crypto';
import type { PrivateVaultApiV1 } from '../../../shared/types/private-vault-session';
import { webCryptoPrivateVaultPortV1 } from '../../../shared/types/private-vault-client';
import {
  MOBILE_VAULT_KEK_STORE_KEY,
  MOBILE_VAULT_SLOTS_STORE_KEY,
  createMobileDeviceKeyV1,
  createMobilePrivateVaultSession,
  detectMobilePrivateVaultV1,
  getMobilePrivateVaultCryptoPort,
  isPrivateVaultMobileEnabled,
  setMobilePrivateVaultCryptoPort,
  type MobileSecureStoreV1,
} from '../privateVault';

const port = webCryptoPrivateVaultPortV1(webcrypto as unknown as Crypto);
const OWNER = 'user-owner-1';

function memoryStore(options: { available?: boolean } = {}): MobileSecureStoreV1 & { data: Map<string, string>; optionsSeen: unknown[] } {
  const data = new Map<string, string>();
  const optionsSeen: unknown[] = [];
  return {
    data,
    optionsSeen,
    isAvailableAsync: async () => options.available !== false,
    getItemAsync: async (key: string, opts?: Record<string, unknown>) => { optionsSeen.push(opts); return data.has(key) ? (data.get(key) as string) : null; },
    setItemAsync: async (key: string, value: string, opts?: Record<string, unknown>) => { optionsSeen.push(opts); data.set(key, value); },
  };
}

function memoryApi() {
  const items = new Map<string, any>();
  const slots: any[] = [];
  const sent: unknown[] = [];
  const api: PrivateVaultApiV1 = {
    listItems: async () => [...items.values()].map((i) => ({ schemaVersion: 1, itemId: i.itemId, kind: i.kind, version: i.version, sizeBytes: 1, updatedAt: 'x' })) as never,
    getItem: async (id) => items.get(id) ?? null,
    putItem: async (put) => { sent.push(put); items.set(put.itemId, { ...put, updatedAt: 'x' }); return { ok: true }; },
    deleteItem: async (id) => items.delete(id),
    listSlots: async () => slots.map((s) => ({ ...s })),
    putSlot: async (slot) => { sent.push(slot); slots.push({ ...slot, createdAt: new Date().toISOString() }); return true; },
  };
  return { api, slots, sent };
}

describe('mobile private vault (E4)', () => {
  afterEach(() => setMobilePrivateVaultCryptoPort(null));

  it('creates the vault with a SecureStore key, saves and reads entries, and the server only gets ciphertext', async () => {
    const store = memoryStore();
    const api = memoryApi();
    const vault = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: api.api, store, crypto: port });
    expect(await vault.openOrCreate()).toBe('created');
    const { itemId } = await vault.saveEntry({ title: 'Wifi codes', body: 'router admin: QUOKKA-4471' });
    expect(await vault.loadEntry(itemId)).toEqual({ title: 'Wifi codes', body: 'router admin: QUOKKA-4471' });
    expect(await vault.search('quokka')).toEqual([{ itemId, title: 'Wifi codes' }]);

    expect(api.slots).toHaveLength(1);
    expect(api.slots[0]).toMatchObject({ slotKind: 'secure_store', credentialId: null, prfSalt: null });
    expect(JSON.stringify(api.sent)).not.toMatch(/Wifi|QUOKKA|4471/);
    // the device key is in SecureStore (64 hex chars) and is not in anything sent to the server
    const kekHex = store.data.get(MOBILE_VAULT_KEK_STORE_KEY) as string;
    expect(kekHex).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(api.sent)).not.toContain(kekHex);
    expect(JSON.stringify(api.sent)).not.toContain(Buffer.from(kekHex, 'hex').toString('base64'));
  });

  it('the key is stored readable-only-while-unlocked and this-device-only', async () => {
    const store = memoryStore();
    await (await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: memoryApi().api, store, crypto: port })).openOrCreate();
    expect(store.optionsSeen.length).toBeGreaterThan(0);
    const withOptions = store.optionsSeen.filter(Boolean) as Array<{ keychainAccessible: unknown }>;
    expect(withOptions.length).toBeGreaterThan(0);
    // 3 = WHEN_UNLOCKED_THIS_DEVICE_ONLY in the jest mock of expo-secure-store
    for (const options of withOptions) expect(options.keychainAccessible).toBe(3);
  });

  it('opens again after a restart on the same phone; a phone with another SecureStore cannot', async () => {
    const store = memoryStore();
    const api = memoryApi();
    const first = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: api.api, store, crypto: port });
    await first.openOrCreate();
    const { itemId } = await first.saveEntry({ title: 't', body: 'b' });

    const again = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: api.api, store, crypto: port });
    expect(await again.openOrCreate()).toBe('unlocked');
    expect(await again.loadEntry(itemId)).toEqual({ title: 't', body: 'b' });

    const other = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: api.api, store: memoryStore(), crypto: port });
    await expect(other.openOrCreate()).rejects.toMatchObject({ code: 'no_slot_for_this_device' });
  });

  it('a lost key is an error, never a new empty key: unwrapping does not make one', async () => {
    const store = memoryStore();
    const api = memoryApi();
    const first = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: api.api, store, crypto: port });
    await first.openOrCreate();
    store.data.delete(MOBILE_VAULT_KEK_STORE_KEY); // the keystore entry is gone, the slot id is still remembered

    const again = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: api.api, store, crypto: port });
    await expect(again.openOrCreate()).rejects.toThrow('no_device_key');
    expect(store.data.has(MOBILE_VAULT_KEK_STORE_KEY)).toBe(false);
    expect(again.unlocked).toBe(false);
  });

  it('a damaged key entry is treated as missing, not guessed at', async () => {
    const store = memoryStore();
    store.data.set(MOBILE_VAULT_KEK_STORE_KEY, 'not-hex');
    const deviceKey = await createMobileDeviceKeyV1({ store, crypto: port });
    await expect(deviceKey.unwrap({ ownerUserId: OWNER, slotId: 'x', slotKind: 'secure_store' }, { iv: 'AAAAAAAAAAAAAAAA', wrappedKey: 'A'.repeat(64) } as never)).rejects.toThrow('no_device_key');
  });

  it('remembers only slot ids, and only this phone\'s secure_store slots count as its own', async () => {
    const store = memoryStore();
    const api = memoryApi();
    const vault = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: api.api, store, crypto: port });
    await vault.openOrCreate();
    const remembered = JSON.parse(store.data.get(MOBILE_VAULT_SLOTS_STORE_KEY) as string);
    expect(remembered).toEqual([api.slots[0].slotId]);
    const deviceKey = await createMobileDeviceKeyV1({ store, crypto: port });
    expect(deviceKey.owns(api.slots[0])).toBe(true);
    expect(deviceKey.owns({ ...api.slots[0], slotKind: 'device_keychain' })).toBe(false);
    expect(deviceKey.owns({ ...api.slots[0], slotId: '00000000-0000-4000-8000-000000000001' })).toBe(false);
    store.data.set(MOBILE_VAULT_SLOTS_STORE_KEY, '{broken');
    expect((await createMobileDeviceKeyV1({ store, crypto: port })).owns(api.slots[0])).toBe(false);
  });

  describe('availability: the vault is off until an AES-256-GCM port is bound', () => {
    it('no port: off with aead_unavailable, and a session cannot be made', async () => {
      expect(getMobilePrivateVaultCryptoPort()).toBeNull();
      expect(await detectMobilePrivateVaultV1(memoryStore())).toEqual({ available: false, reasonCode: 'aead_unavailable' });
      await expect(createMobilePrivateVaultSession({ ownerUserId: OWNER, api: memoryApi().api, store: memoryStore() })).rejects.toThrow('aead_unavailable');
    });

    it('no crypto port: the vault refuses and nothing is stored anywhere (no key, no slot, no request, no plaintext)', async () => {
      expect(getMobilePrivateVaultCryptoPort()).toBeNull();
      const store = memoryStore();
      const api = memoryApi();
      const calls: string[] = [];
      const watched = Object.fromEntries(
        Object.entries(api.api).map(([name, fn]) => [name, async (...args: unknown[]) => { calls.push(name); return (fn as (...a: unknown[]) => unknown)(...args); }]),
      ) as unknown as PrivateVaultApiV1;
      await expect(createMobilePrivateVaultSession({ ownerUserId: OWNER, api: watched, store })).rejects.toThrow('aead_unavailable');
      expect(store.data.size).toBe(0);
      expect(calls).toEqual([]);
      expect(api.slots).toEqual([]);
      expect(api.sent).toEqual([]);
    });

    it('a bound port and a working SecureStore: offered; a broken or missing SecureStore: off', async () => {
      setMobilePrivateVaultCryptoPort(port);
      expect(await detectMobilePrivateVaultV1(memoryStore())).toEqual({ available: true, slotKind: 'secure_store' });
      expect(await detectMobilePrivateVaultV1(memoryStore({ available: false }))).toEqual({ available: false, reasonCode: 'secure_store_unavailable' });
      expect(await detectMobilePrivateVaultV1({ isAvailableAsync: async () => { throw new Error('boom'); } })).toEqual({ available: false, reasonCode: 'secure_store_unavailable' });
      const session = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: memoryApi().api, store: memoryStore() });
      expect(await session.openOrCreate()).toBe('created');
    });

    it('is off unless the exact string 1 is set', () => {
      for (const [value, expected] of [['1', true], ['0', false], ['true', false], [' 1', false], ['', false], [undefined, false]] as const) {
        expect(isPrivateVaultMobileEnabled({ EXPO_PUBLIC_PRIVATE_VAULT_ENABLED: value })).toBe(expected);
      }
    });
  });

  it('an entry never reaches a model from the phone', async () => {
    const vault = await createMobilePrivateVaultSession({ ownerUserId: OWNER, api: memoryApi().api, store: memoryStore(), crypto: port });
    await vault.openOrCreate();
    const { itemId } = await vault.saveEntry({ title: 'a', body: 'b' });
    for (const route of ['local_model', 'cloud_model', 'platform_hosted_model'] as const) {
      await expect(vault.entryForModel(itemId, route)).rejects.toMatchObject({ code: 'model_route_not_allowed' });
    }
  });
});
