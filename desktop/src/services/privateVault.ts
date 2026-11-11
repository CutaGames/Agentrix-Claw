/**
 * L8 E4 (desktop): the private vault's device key is a key in the OS keychain. It never leaves Rust: this file sends the
 * vault key in (`desktop_bridge_private_vault_wrap`) and gets ciphertext back, and to open the vault sends the ciphertext in
 * (`desktop_bridge_private_vault_unwrap`). The old `desktop_bridge_keychain_*` commands are NOT used: they write an XOR-obfuscated
 * file, not the OS keychain.
 *
 * Contract: `shared/types/private-vault.ts`. Off unless `VITE_PRIVATE_VAULT_ENABLED=1`; the routes answer 404 while the server
 * switch is off. If the keychain or WebCrypto is not available, the vault is not offered and nothing falls back to another key.
 *
 * An entry may be handed to a model only from here and only to a model running on this computer (`canSendVaultEntryToModel`).
 */
import {
  privateVaultBase64DecodeV1,
  privateVaultBase64EncodeV1,
  privateVaultMayReachModelV1,
  privateVaultSlotAadV1,
  decodePrivateVaultKeySlotPutV1,
  PRIVATE_VAULT_SCHEMA_VERSION_V1,
  privateVaultSurfaceModeV1,
  type PrivateVaultKeySlotViewV1,
  type PrivateVaultModelRouteV1,
  type PrivateVaultSurfaceModeV1,
} from "../../../shared/types/private-vault";
import { webCryptoPrivateVaultPortV1, type PrivateVaultCryptoPortV1, type PrivateVaultSlotBindingV1 } from "../../../shared/types/private-vault-client";
import { PrivateVaultSessionV1, type PrivateVaultApiV1, type PrivateVaultDeviceKeyV1 } from "../../../shared/types/private-vault-session";

export function isPrivateVaultDesktopEnabled(env: { VITE_PRIVATE_VAULT_ENABLED?: string } = (import.meta as unknown as { env: { VITE_PRIVATE_VAULT_ENABLED?: string } }).env): boolean {
  return env?.VITE_PRIVATE_VAULT_ENABLED === "1";
}

export interface PrivateVaultDesktopDeps {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  crypto?: PrivateVaultCryptoPortV1;
  /** Which slot ids belong to THIS computer (not secret). */
  slotMemory?: { has(slotId: string): boolean; add(slotId: string): void };
}

async function realInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

const SLOT_MEMORY_KEY = "agentrix.privateVault.deviceSlots";

/** Slot ids kept in localStorage: only ids, never a key. */
export function localStorageSlotMemory(storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
  const read = (): string[] => {
    try {
      const parsed = JSON.parse(storage.getItem(SLOT_MEMORY_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  };
  return {
    has: (slotId: string) => read().includes(slotId),
    add: (slotId: string) => storage.setItem(SLOT_MEMORY_KEY, JSON.stringify([...new Set([...read(), slotId])].slice(-50))),
  };
}

const utf8 = (text: string) => new TextEncoder().encode(text);

export function createDesktopDeviceKeyV1(deps: PrivateVaultDesktopDeps): PrivateVaultDeviceKeyV1 {
  const invoke = deps.invoke;
  const memory = deps.slotMemory ?? localStorageSlotMemory();
  return {
    slotKind: "device_keychain",

    async wrap(binding: PrivateVaultSlotBindingV1, vaultKey: Uint8Array) {
      const aadB64 = privateVaultBase64EncodeV1(utf8(privateVaultSlotAadV1(binding)));
      const wrapped = (await invoke("desktop_bridge_private_vault_wrap", { vaultKeyB64: privateVaultBase64EncodeV1(vaultKey), aadB64 })) as { iv?: unknown; ciphertext?: unknown };
      const decoded = decodePrivateVaultKeySlotPutV1({
        schemaVersion: PRIVATE_VAULT_SCHEMA_VERSION_V1,
        slotId: binding.slotId,
        slotKind: binding.slotKind,
        iv: wrapped?.iv,
        wrappedKey: wrapped?.ciphertext,
        credentialId: null,
        prfSalt: null,
      });
      if (decoded.ok === false) throw new Error("private_vault_wrap_unreadable");
      memory.add(binding.slotId);
      return decoded.value;
    },

    async unwrap(binding: PrivateVaultSlotBindingV1, slot: PrivateVaultKeySlotViewV1) {
      const aadB64 = privateVaultBase64EncodeV1(utf8(privateVaultSlotAadV1(binding)));
      const keyB64 = await invoke("desktop_bridge_private_vault_unwrap", { ivB64: slot.iv, ciphertextB64: slot.wrappedKey, aadB64 });
      const key = privateVaultBase64DecodeV1(keyB64);
      if (key === null || key.length !== 32) throw new Error("private_vault_unwrap_unreadable");
      return key;
    },

    owns: (slot: PrivateVaultKeySlotViewV1) => slot.slotKind === "device_keychain" && memory.has(slot.slotId),
  };
}

/** Whether this computer offers the vault: WebCrypto for the entries, the OS keychain for the device key. */
export async function detectDesktopPrivateVaultV1(deps: Pick<PrivateVaultDesktopDeps, "invoke"> = { invoke: realInvoke }, cryptoImpl: { subtle?: unknown } | null | undefined = globalThis.crypto): Promise<PrivateVaultSurfaceModeV1> {
  let osKeychain = false;
  try {
    // `status` reads the keychain; it throws `keychain_unavailable` when there is none. It never makes a key.
    await deps.invoke("desktop_bridge_private_vault_status");
    osKeychain = true;
  } catch {
    osKeychain = false;
  }
  return privateVaultSurfaceModeV1("desktop", { osKeychain, aeadAvailable: !!cryptoImpl?.subtle });
}

export function createDesktopPrivateVaultSession(options: { ownerUserId: string; api: PrivateVaultApiV1; deps?: PrivateVaultDesktopDeps }): PrivateVaultSessionV1 {
  const deps = options.deps ?? { invoke: realInvoke };
  return new PrivateVaultSessionV1({
    ownerUserId: options.ownerUserId,
    surface: "desktop",
    crypto: deps.crypto ?? webCryptoPrivateVaultPortV1(globalThis.crypto),
    deviceKey: createDesktopDeviceKeyV1(deps),
    api: options.api,
  });
}

/** Only a model running on this computer may see a decrypted entry. */
export function canSendVaultEntryToModel(route: PrivateVaultModelRouteV1 | string): boolean {
  return privateVaultMayReachModelV1("desktop", route);
}
