/**
 * Private vault v1, client side (L8 E4): the encryption every device does BEFORE anything is sent (`private-vault.ts` has the
 * wire contract). Platform neutral: web, desktop and mobile pass their own `PrivateVaultCryptoPortV1`. The web and desktop
 * WebViews use WebCrypto (`webCryptoPrivateVaultPortV1`); mobile has no AES-GCM in its approved dependencies yet, so it supplies
 * a port only once one is approved and reports the vault as unavailable until then.
 *
 * Nothing here talks to a server, logs, or writes to disk. Keys are `Uint8Array`s the caller keeps in memory and zeroes with
 * `zeroPrivateVaultBytesV1` when done.
 */
import {
  PRIVATE_VAULT_ITEM_KEY_SALT_V1,
  PRIVATE_VAULT_LIMITS_V1,
  PRIVATE_VAULT_PRF_KEK_INFO_V1,
  PRIVATE_VAULT_SCHEMA_VERSION_V1,
  decodePrivateVaultItemPutV1,
  decodePrivateVaultKeySlotPutV1,
  privateVaultBase64DecodeV1,
  privateVaultBase64EncodeV1,
  privateVaultItemAadV1,
  privateVaultSlotAadV1,
  type PrivateVaultItemKindV1,
  type PrivateVaultItemPutV1,
  type PrivateVaultKeySlotPutV1,
  type PrivateVaultSlotKindV1,
} from './private-vault';

export interface PrivateVaultCryptoPortV1 {
  randomBytes(length: number): Uint8Array;
  hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array>;
  /** Returns ciphertext || 16-byte tag. */
  aesGcmSeal(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  /** Throws when the tag does not verify (wrong key, wrong AAD, tampered bytes). */
  aesGcmOpen(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** `instanceof Uint8Array` is false for bytes made in another frame or test realm; the tag check is not. */
export function isPrivateVaultBytesV1(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';
}

export function zeroPrivateVaultBytesV1(bytes: Uint8Array): void {
  bytes.fill(0);
}

/** WebCrypto binding (browsers, Tauri WebViews, Node 20). Pass `globalThis.crypto`, or Node's `webcrypto` in tests. */
export function webCryptoPrivateVaultPortV1(cryptoImpl: Crypto): PrivateVaultCryptoPortV1 {
  const subtle = cryptoImpl.subtle;
  return {
    randomBytes(length) {
      const out = new Uint8Array(length);
      cryptoImpl.getRandomValues(out);
      return out;
    },
    async hkdfSha256(ikm, salt, info, length) {
      const key = await subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, length * 8);
      return new Uint8Array(bits);
    },
    async aesGcmSeal(key, iv, plaintext, aad) {
      const k = await subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt']);
      return new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 }, k, plaintext as BufferSource));
    },
    async aesGcmOpen(key, iv, ciphertext, aad) {
      const k = await subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt']);
      return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 }, k, ciphertext as BufferSource));
    },
  };
}

export type PrivateVaultClientErrorCodeV1 = 'invalid_key' | 'invalid_input' | 'cannot_open' | 'too_large';

export class PrivateVaultClientErrorV1 extends Error {
  constructor(readonly code: PrivateVaultClientErrorCodeV1) {
    super(code); // the code only: never the plaintext, a key or a ciphertext
    this.name = 'PrivateVaultClientErrorV1';
  }
}

function assertKey(key: Uint8Array): void {
  if (!isPrivateVaultBytesV1(key) || key.length !== PRIVATE_VAULT_LIMITS_V1.keyBytes) throw new PrivateVaultClientErrorV1('invalid_key');
}

/** A fresh 32-byte vault key. Made on a device; never sent in the clear. */
export function createPrivateVaultKeyV1(port: PrivateVaultCryptoPortV1): Uint8Array {
  return port.randomBytes(PRIVATE_VAULT_LIMITS_V1.keyBytes);
}

async function itemKey(port: PrivateVaultCryptoPortV1, vaultKey: Uint8Array, itemId: string): Promise<Uint8Array> {
  return port.hkdfSha256(vaultKey, utf8(PRIVATE_VAULT_ITEM_KEY_SALT_V1), utf8(itemId), PRIVATE_VAULT_LIMITS_V1.keyBytes);
}

export interface PrivateVaultItemBindingV1 {
  ownerUserId: string;
  itemId: string;
  kind: PrivateVaultItemKindV1;
  version: number;
}

/** Encrypt one entry. The result is what the server stores; its decoder runs here too, so a bad body never leaves the device. */
export async function sealPrivateVaultItemV1(
  port: PrivateVaultCryptoPortV1,
  vaultKey: Uint8Array,
  binding: PrivateVaultItemBindingV1,
  plaintext: Uint8Array,
): Promise<PrivateVaultItemPutV1> {
  assertKey(vaultKey);
  if (!isPrivateVaultBytesV1(plaintext) || plaintext.length === 0) throw new PrivateVaultClientErrorV1('invalid_input');
  if (plaintext.length + PRIVATE_VAULT_LIMITS_V1.tagBytes > PRIVATE_VAULT_LIMITS_V1.ciphertextMaxBytes) throw new PrivateVaultClientErrorV1('too_large');
  const key = await itemKey(port, vaultKey, binding.itemId);
  try {
    const iv = port.randomBytes(PRIVATE_VAULT_LIMITS_V1.ivBytes);
    const sealed = await port.aesGcmSeal(key, iv, plaintext, utf8(privateVaultItemAadV1(binding)));
    const put = {
      schemaVersion: PRIVATE_VAULT_SCHEMA_VERSION_V1,
      itemId: binding.itemId,
      kind: binding.kind,
      version: binding.version,
      iv: privateVaultBase64EncodeV1(iv),
      ciphertext: privateVaultBase64EncodeV1(sealed),
    };
    // The server's own decoder runs here too. A broken port that returned readable text instead of ciphertext is refused
    // before it leaves the device.
    const decoded = decodePrivateVaultItemPutV1(put);
    if (decoded.ok === false) throw new PrivateVaultClientErrorV1('invalid_input');
    return decoded.value;
  } finally {
    zeroPrivateVaultBytesV1(key);
  }
}

/** Decrypt one entry fetched from the server. Throws `cannot_open` for any failure; the message never carries data. */
export async function openPrivateVaultItemV1(
  port: PrivateVaultCryptoPortV1,
  vaultKey: Uint8Array,
  binding: PrivateVaultItemBindingV1,
  stored: { iv: string; ciphertext: string },
): Promise<Uint8Array> {
  assertKey(vaultKey);
  const iv = privateVaultBase64DecodeV1(stored?.iv);
  const ciphertext = privateVaultBase64DecodeV1(stored?.ciphertext);
  if (iv === null || ciphertext === null || iv.length !== PRIVATE_VAULT_LIMITS_V1.ivBytes) throw new PrivateVaultClientErrorV1('cannot_open');
  const key = await itemKey(port, vaultKey, binding.itemId);
  try {
    return await port.aesGcmOpen(key, iv, ciphertext, utf8(privateVaultItemAadV1(binding)));
  } catch {
    throw new PrivateVaultClientErrorV1('cannot_open');
  } finally {
    zeroPrivateVaultBytesV1(key);
  }
}

export interface PrivateVaultSlotBindingV1 {
  ownerUserId: string;
  slotId: string;
  slotKind: PrivateVaultSlotKindV1;
}

/** Wrap the vault key under one device's key (KEK). The result is what the server keeps for that device. */
export async function wrapPrivateVaultKeyV1(
  port: PrivateVaultCryptoPortV1,
  kek: Uint8Array,
  binding: PrivateVaultSlotBindingV1,
  vaultKey: Uint8Array,
  publicParts: { credentialId: string | null; prfSalt: string | null } = { credentialId: null, prfSalt: null },
): Promise<PrivateVaultKeySlotPutV1> {
  assertKey(kek);
  assertKey(vaultKey);
  const iv = port.randomBytes(PRIVATE_VAULT_LIMITS_V1.ivBytes);
  const wrapped = await port.aesGcmSeal(kek, iv, vaultKey, utf8(privateVaultSlotAadV1(binding)));
  const decoded = decodePrivateVaultKeySlotPutV1({
    schemaVersion: PRIVATE_VAULT_SCHEMA_VERSION_V1,
    slotId: binding.slotId,
    slotKind: binding.slotKind,
    iv: privateVaultBase64EncodeV1(iv),
    wrappedKey: privateVaultBase64EncodeV1(wrapped),
    credentialId: publicParts.credentialId,
    prfSalt: publicParts.prfSalt,
  });
  if (decoded.ok === false) throw new PrivateVaultClientErrorV1('invalid_input');
  return decoded.value;
}

/** Recover the vault key from a stored slot with this device's KEK. */
export async function unwrapPrivateVaultKeyV1(
  port: PrivateVaultCryptoPortV1,
  kek: Uint8Array,
  binding: PrivateVaultSlotBindingV1,
  stored: { iv: string; wrappedKey: string },
): Promise<Uint8Array> {
  assertKey(kek);
  const iv = privateVaultBase64DecodeV1(stored?.iv);
  const wrapped = privateVaultBase64DecodeV1(stored?.wrappedKey);
  if (iv === null || wrapped === null || iv.length !== PRIVATE_VAULT_LIMITS_V1.ivBytes) throw new PrivateVaultClientErrorV1('cannot_open');
  let vaultKey: Uint8Array;
  try {
    vaultKey = await port.aesGcmOpen(kek, iv, wrapped, utf8(privateVaultSlotAadV1(binding)));
  } catch {
    throw new PrivateVaultClientErrorV1('cannot_open');
  }
  if (vaultKey.length !== PRIVATE_VAULT_LIMITS_V1.keyBytes) throw new PrivateVaultClientErrorV1('cannot_open');
  return vaultKey;
}

/** The KEK of a passkey slot: HKDF over the authenticator's PRF output, salted with the slot's public salt. */
export async function derivePrfKekV1(port: PrivateVaultCryptoPortV1, prfOutput: Uint8Array, prfSalt: Uint8Array, credentialId: string): Promise<Uint8Array> {
  if (!isPrivateVaultBytesV1(prfOutput) || prfOutput.length < 32) throw new PrivateVaultClientErrorV1('invalid_key');
  return port.hkdfSha256(prfOutput, prfSalt, utf8(`${PRIVATE_VAULT_PRF_KEK_INFO_V1}|${credentialId}`), PRIVATE_VAULT_LIMITS_V1.keyBytes);
}
