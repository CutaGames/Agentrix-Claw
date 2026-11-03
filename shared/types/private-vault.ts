/**
 * Private vault v1 (L8 E4, "私密保险箱"): entries are encrypted ON THE OWNER'S DEVICE and the server stores only ciphertext.
 *
 * Custody is `user_held` (`confidential-compute.ts`): `serverMayOpenOwnerDataV0('user_held', …)` is false, so nothing on the
 * server, in a TEE, or in a log can open an entry. There is no server-side encryption fallback anywhere in this contract: a
 * surface that cannot hold the key on the device does not offer the vault (`privateVaultSurfaceModeV1`).
 *
 * Keys (all AES-256-GCM, HKDF-SHA-256):
 *   vault key (VK)      32 random bytes, made on a device, never sent anywhere in the clear.
 *   item key            HKDF(VK, salt = item-key label, info = itemId); one per item, so an entry is bound to its id.
 *   slot key (KEK)      what wraps VK for one device. Web: derived from the passkey PRF output. Desktop: a key that lives in
 *                       the OS keychain and never leaves Rust. Mobile: a key in SecureStore. A recovery kit slot reuses the
 *                       Soul Key envelope's recovery slot idea (`soul-key-envelope.ts`).
 *   wrapped VK          AES-256-GCM(KEK, iv, VK, AAD = slot binding): exactly 12 + 32 + 16 bytes. The server keeps one per slot.
 *
 * What the server sees: opaque ids, a coarse `kind`, a version, a size, timestamps, and random-looking bytes. It never sees a
 * title, a name, a note, a search term or a model prompt. Searching happens on the device over decrypted entries.
 *
 * Only the desktop may hand a decrypted entry to a model, and only a model that runs on that computer
 * (`privateVaultMayReachModelV1`).
 *
 * Switch: `PRIVATE_VAULT_V1_ENABLED`, exact `'1'`, default off. Opening it to people needs a cryptography review first and the
 * owner's explicit, one-time approval (the lane brief). Decoders reject unknown fields and wrong types and say which field.
 */

export const PRIVATE_VAULT_V1_FLAG = 'PRIVATE_VAULT_V1_ENABLED';
export const PRIVATE_VAULT_SCHEMA_VERSION_V1 = 1 as const;

/** Same word as `SoulKeyCustodyModeV0` in `confidential-compute.ts`; a test pins that the server may not open it. */
export const PRIVATE_VAULT_CUSTODY_V1 = 'user_held' as const;

export const PRIVATE_VAULT_AEAD_V1 = 'AES-256-GCM' as const;
export const PRIVATE_VAULT_KDF_V1 = 'HKDF-SHA-256' as const;

/** A coarse label chosen by the client, not a title. Everything specific is inside the ciphertext. */
export const PRIVATE_VAULT_ITEM_KINDS_V1 = ['note', 'document', 'identity', 'other'] as const;
export type PrivateVaultItemKindV1 = (typeof PRIVATE_VAULT_ITEM_KINDS_V1)[number];

export const PRIVATE_VAULT_SURFACES_V1 = ['web', 'desktop', 'mobile'] as const;
export type PrivateVaultSurfaceV1 = (typeof PRIVATE_VAULT_SURFACES_V1)[number];

export const PRIVATE_VAULT_SLOT_KINDS_V1 = ['webauthn_prf', 'device_keychain', 'secure_store', 'recovery_kit'] as const;
export type PrivateVaultSlotKindV1 = (typeof PRIVATE_VAULT_SLOT_KINDS_V1)[number];

export const PRIVATE_VAULT_LIMITS_V1 = {
  itemsPerOwnerMax: 500,
  slotsPerOwnerMax: 12,
  ciphertextMaxBytes: 256 * 1024,
  ivBytes: 12,
  tagBytes: 16,
  keyBytes: 32,
  /** 32-byte VK + 16-byte tag. */
  wrappedKeyCipherBytes: 48,
  prfSaltBytes: 32,
  credentialIdMaxChars: 1366,
  versionMax: 1_000_000_000,
} as const;

export const PRIVATE_VAULT_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  'ciphertext_too_large',
  /** The "ciphertext" decodes to readable text: a client sent plaintext, or is not encrypting. Refused unread. */
  'looks_like_plaintext',
  'feature_disabled',
] as const;
export type PrivateVaultReasonCodeV1 = (typeof PRIVATE_VAULT_REASON_CODES_V1)[number];

export type PrivateVaultDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: PrivateVaultReasonCodeV1; field: string };

/** What the owner's device sends to store one entry. Nothing in it is readable by the server. */
export interface PrivateVaultItemPutV1 {
  schemaVersion: typeof PRIVATE_VAULT_SCHEMA_VERSION_V1;
  /** Chosen by the client (a random UUID); it is in the AAD, so a ciphertext only opens under its own id. */
  itemId: string;
  kind: PrivateVaultItemKindV1;
  /** 1 for a new entry; each save is previous + 1. Also in the AAD. */
  version: number;
  /** base64, 12 bytes. */
  iv: string;
  /** base64, AES-256-GCM output (ciphertext + 16-byte tag), at most 256 KiB. */
  ciphertext: string;
}

/** What the server shows in a list: no names, no previews. */
export interface PrivateVaultItemViewV1 {
  schemaVersion: typeof PRIVATE_VAULT_SCHEMA_VERSION_V1;
  itemId: string;
  kind: PrivateVaultItemKindV1;
  version: number;
  sizeBytes: number;
  updatedAt: string;
}

/** One device's wrapped copy of the vault key. */
export interface PrivateVaultKeySlotPutV1 {
  schemaVersion: typeof PRIVATE_VAULT_SCHEMA_VERSION_V1;
  slotId: string;
  slotKind: PrivateVaultSlotKindV1;
  /** base64, 12 bytes. */
  iv: string;
  /** base64, exactly 48 bytes: the wrapped 32-byte vault key and its tag. */
  wrappedKey: string;
  /** base64url WebAuthn credential id (public). Required for `webauthn_prf`, null otherwise. */
  credentialId: string | null;
  /** base64, 32 bytes, the public PRF salt. Required for `webauthn_prf`, null otherwise. */
  prfSalt: string | null;
}

export interface PrivateVaultKeySlotViewV1 extends PrivateVaultKeySlotPutV1 {
  createdAt: string;
}

// ── associated data and key derivation labels ───────────────────────────────────────

export const PRIVATE_VAULT_ITEM_AAD_LABEL_V1 = 'agentrix.private-vault.item.v1';
export const PRIVATE_VAULT_SLOT_AAD_LABEL_V1 = 'agentrix.private-vault.slot.v1';
export const PRIVATE_VAULT_ITEM_KEY_SALT_V1 = 'agentrix.private-vault.item-key.v1';
export const PRIVATE_VAULT_PRF_KEK_INFO_V1 = 'agentrix.private-vault.prf-kek.v1';
/** A recovery kit is 32 random bytes shown to the owner once; the slot's KEK is HKDF(kit, this salt, slotId). */
export const PRIVATE_VAULT_RECOVERY_KEK_SALT_V1 = 'agentrix.private-vault.recovery-kit.v1';
export const PRIVATE_VAULT_RECOVERY_CHECK_SALT_V1 = 'agentrix.private-vault.recovery-kit-check.v1';

function aadPart(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f]/.test(value)) {
    throw new Error('private_vault_aad_part_invalid');
  }
  return value;
}

/** The AEAD additional data of an entry. A ciphertext moved to another owner, id, kind or version fails to open. */
export function privateVaultItemAadV1(binding: { ownerUserId: string; itemId: string; kind: PrivateVaultItemKindV1; version: number }): string {
  if (!Number.isInteger(binding.version) || binding.version < 1) throw new Error('private_vault_aad_part_invalid');
  return [PRIVATE_VAULT_ITEM_AAD_LABEL_V1, aadPart(binding.ownerUserId), aadPart(binding.itemId), aadPart(binding.kind), String(binding.version)].join('\n');
}

/** The AEAD additional data of a wrapped vault key. */
export function privateVaultSlotAadV1(binding: { ownerUserId: string; slotId: string; slotKind: PrivateVaultSlotKindV1 }): string {
  return [PRIVATE_VAULT_SLOT_AAD_LABEL_V1, aadPart(binding.ownerUserId), aadPart(binding.slotId), aadPart(binding.slotKind)].join('\n');
}

// ── base64 (no atob/btoa: React Native and old runtimes differ) ─────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function privateVaultBase64EncodeV1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

/** Strict standard base64 with padding; null for anything else (whitespace, url-safe alphabet, missing padding). */
export function privateVaultBase64DecodeV1(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const pad = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((value.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < value.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (value[i + k] === '=' ? 0 : B64.indexOf(value[i + k])));
    const triple = (n[0] << 18) | (n[1] << 12) | (n[2] << 6) | n[3];
    if (o < out.length) out[o++] = (triple >> 16) & 255;
    if (o < out.length) out[o++] = (triple >> 8) & 255;
    if (o < out.length) out[o++] = triple & 255;
  }
  // Canonical form only: re-encoding must give the same text (no stray bits in the last group).
  return privateVaultBase64EncodeV1(out) === value ? out : null;
}

/** True when the bytes read like text: what a client that forgot to encrypt would send. Random ciphertext never does. */
export function privateVaultBytesLookLikeTextV1(bytes: Uint8Array): boolean {
  if (bytes.length < 32) return false;
  let printable = 0;
  for (const byte of bytes) if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) printable += 1;
  return printable / bytes.length >= 0.9;
}

// ── decoding ────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Failure = { ok: false; reasonCode: PrivateVaultReasonCodeV1; field: string };
const fail = (reasonCode: PrivateVaultReasonCodeV1, field: string): Failure => ({ ok: false, reasonCode, field });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

function envelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== PRIVATE_VAULT_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  // Unknown fields first: a body that tries to carry a title, a note, a password or a search term is refused unread.
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

export function decodePrivateVaultItemPutV1(value: unknown): PrivateVaultDecodeResultV1<PrivateVaultItemPutV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['schemaVersion', 'itemId', 'kind', 'version', 'iv', 'ciphertext'], ['itemId', 'kind', 'version', 'iv', 'ciphertext']);
  if (bad) return bad;
  if (typeof value.itemId !== 'string') return fail('invalid_type', 'itemId');
  if (!UUID.test(value.itemId)) return fail('invalid_value', 'itemId');
  if (typeof value.kind !== 'string') return fail('invalid_type', 'kind');
  if (!isOneOf(PRIVATE_VAULT_ITEM_KINDS_V1, value.kind)) return fail('invalid_value', 'kind');
  if (typeof value.version !== 'number') return fail('invalid_type', 'version');
  if (!Number.isInteger(value.version) || value.version < 1 || value.version > PRIVATE_VAULT_LIMITS_V1.versionMax) return fail('invalid_value', 'version');
  if (typeof value.iv !== 'string') return fail('invalid_type', 'iv');
  const iv = privateVaultBase64DecodeV1(value.iv);
  if (iv === null || iv.length !== PRIVATE_VAULT_LIMITS_V1.ivBytes) return fail('invalid_value', 'iv');
  if (typeof value.ciphertext !== 'string') return fail('invalid_type', 'ciphertext');
  // Bound the text before decoding it, so an enormous body is refused without being walked.
  if (value.ciphertext.length > Math.ceil((PRIVATE_VAULT_LIMITS_V1.ciphertextMaxBytes * 4) / 3) + 4) return fail('ciphertext_too_large', 'ciphertext');
  const ciphertext = privateVaultBase64DecodeV1(value.ciphertext);
  if (ciphertext === null) return fail('invalid_value', 'ciphertext');
  if (ciphertext.length > PRIVATE_VAULT_LIMITS_V1.ciphertextMaxBytes) return fail('ciphertext_too_large', 'ciphertext');
  if (ciphertext.length < PRIVATE_VAULT_LIMITS_V1.tagBytes + 1) return fail('invalid_value', 'ciphertext');
  if (privateVaultBytesLookLikeTextV1(ciphertext)) return fail('looks_like_plaintext', 'ciphertext');
  return {
    ok: true,
    value: { schemaVersion: PRIVATE_VAULT_SCHEMA_VERSION_V1, itemId: value.itemId, kind: value.kind, version: value.version, iv: value.iv, ciphertext: value.ciphertext },
  };
}

export function decodePrivateVaultKeySlotPutV1(value: unknown): PrivateVaultDecodeResultV1<PrivateVaultKeySlotPutV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(
    value,
    ['schemaVersion', 'slotId', 'slotKind', 'iv', 'wrappedKey', 'credentialId', 'prfSalt'],
    ['slotId', 'slotKind', 'iv', 'wrappedKey', 'credentialId', 'prfSalt'],
  );
  if (bad) return bad;
  if (typeof value.slotId !== 'string') return fail('invalid_type', 'slotId');
  if (!UUID.test(value.slotId)) return fail('invalid_value', 'slotId');
  if (typeof value.slotKind !== 'string') return fail('invalid_type', 'slotKind');
  if (!isOneOf(PRIVATE_VAULT_SLOT_KINDS_V1, value.slotKind)) return fail('invalid_value', 'slotKind');
  if (typeof value.iv !== 'string') return fail('invalid_type', 'iv');
  const iv = privateVaultBase64DecodeV1(value.iv);
  if (iv === null || iv.length !== PRIVATE_VAULT_LIMITS_V1.ivBytes) return fail('invalid_value', 'iv');
  if (typeof value.wrappedKey !== 'string') return fail('invalid_type', 'wrappedKey');
  const wrapped = privateVaultBase64DecodeV1(value.wrappedKey);
  // A bare 32-byte key (not wrapped) is 32 bytes, not 48: refused here.
  if (wrapped === null || wrapped.length !== PRIVATE_VAULT_LIMITS_V1.wrappedKeyCipherBytes) return fail('invalid_value', 'wrappedKey');
  let credentialId: string | null = null;
  let prfSalt: string | null = null;
  if (value.slotKind === 'webauthn_prf') {
    if (typeof value.credentialId !== 'string') return fail(value.credentialId === null ? 'invalid_value' : 'invalid_type', 'credentialId');
    if (!/^[A-Za-z0-9_-]{1,1366}$/.test(value.credentialId)) return fail('invalid_value', 'credentialId');
    credentialId = value.credentialId;
    if (typeof value.prfSalt !== 'string') return fail(value.prfSalt === null ? 'invalid_value' : 'invalid_type', 'prfSalt');
    const salt = privateVaultBase64DecodeV1(value.prfSalt);
    if (salt === null || salt.length !== PRIVATE_VAULT_LIMITS_V1.prfSaltBytes) return fail('invalid_value', 'prfSalt');
    prfSalt = value.prfSalt;
  } else {
    if (value.credentialId !== null) return fail('invalid_value', 'credentialId');
    if (value.prfSalt !== null) return fail('invalid_value', 'prfSalt');
  }
  return {
    ok: true,
    value: { schemaVersion: PRIVATE_VAULT_SCHEMA_VERSION_V1, slotId: value.slotId, slotKind: value.slotKind, iv: value.iv, wrappedKey: value.wrappedKey, credentialId, prfSalt },
  };
}

// ── which surfaces offer the vault ──────────────────────────────────────────────────

export interface PrivateVaultSurfaceCapsV1 {
  /** The browser and authenticator returned a PRF result for a passkey (`prf.enabled`). */
  webauthnPrf?: boolean;
  /** The OS keychain holds the device key (desktop: the Rust side, never the XOR file store). */
  osKeychain?: boolean;
  /** Hardware-backed SecureStore holds the device key. */
  secureStore?: boolean;
  /** An AES-256-GCM implementation is available on this surface. */
  aeadAvailable?: boolean;
}

export type PrivateVaultSurfaceModeV1 =
  | { available: true; slotKind: Exclude<PrivateVaultSlotKindV1, 'recovery_kit'> }
  | { available: false; reasonCode: 'passkey_prf_unsupported' | 'os_keychain_unavailable' | 'secure_store_unavailable' | 'aead_unavailable' | 'unknown_surface' };

/**
 * Whether this surface offers the vault, and with which key. Never a fallback to a server-held key: when the device key cannot
 * be held, the vault is off.
 */
export function privateVaultSurfaceModeV1(surface: unknown, caps: PrivateVaultSurfaceCapsV1 | null | undefined): PrivateVaultSurfaceModeV1 {
  if (!isOneOf(PRIVATE_VAULT_SURFACES_V1, surface)) return { available: false, reasonCode: 'unknown_surface' };
  if (caps?.aeadAvailable !== true) return { available: false, reasonCode: 'aead_unavailable' };
  if (surface === 'web') return caps.webauthnPrf === true ? { available: true, slotKind: 'webauthn_prf' } : { available: false, reasonCode: 'passkey_prf_unsupported' };
  if (surface === 'desktop') return caps.osKeychain === true ? { available: true, slotKind: 'device_keychain' } : { available: false, reasonCode: 'os_keychain_unavailable' };
  return caps.secureStore === true ? { available: true, slotKind: 'secure_store' } : { available: false, reasonCode: 'secure_store_unavailable' };
}

export const PRIVATE_VAULT_MODEL_ROUTES_V1 = ['local_model', 'cloud_model', 'platform_hosted_model', 'tool_call', 'log', 'telemetry'] as const;
export type PrivateVaultModelRouteV1 = (typeof PRIVATE_VAULT_MODEL_ROUTES_V1)[number];

/** A decrypted entry may reach a model only on the desktop and only a model that runs on that computer. */
export function privateVaultMayReachModelV1(surface: unknown, route: unknown): boolean {
  return surface === 'desktop' && route === 'local_model';
}

/** Local search over entries that are already decrypted on this device. The query never leaves it. */
export function privateVaultLocalSearchV1<T extends { text: string }>(entries: readonly T[], query: string): T[] {
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!needle) return [];
  return entries.filter((entry) => entry.text.toLowerCase().includes(needle));
}
