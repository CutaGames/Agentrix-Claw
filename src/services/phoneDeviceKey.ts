/**
 * phoneDeviceKey — the phone as a registered Agent device with its own key (L5 backlog mobile 3,
 * REQ-mobile-095; contracts `device-pairing-proof.ts`, `device-signing-credential.ts`).
 *
 * The same three steps the desktop runs in Rust (`developer_runtime/enrollment.rs`), from the phone:
 * 1. a P-256 key that never leaves the device (Android Keystore / iOS Secure Enclave, every use asks the
 *    owner) gives a self-certifying id `dev_<first 32 hex of the JWK thumbprint>`;
 * 2. pair: `POST /v1/devices/pair/ticket`, then `POST /v1/devices/pair` with the proof (the key signs the
 *    ticket message), `device_class: "phone"`;
 * 3. register the same key as the `device-auth` signing credential, with a proof over the register message
 *    and the device's current fence from `GET /v1/devices`.
 * Each step is resumable: request ids are kept, a 409 means "done already" and is checked, never trusted.
 * The server's answers are checked against this key (device id, thumbprint); anything else fails closed.
 *
 * Nothing here decides what the key may approve: today the approval card only accepts the device that
 * asked (REQ-mobile-095 item 2, open). Off unless `EXPO_PUBLIC_PHONE_DEVICE_KEY=1`.
 * No React Native import: the native key and the HTTP transport are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  DEVICE_PAIRING_PROOF_SCHEMA_VERSION,
  deriveSelfCertifyingDeviceIdV1,
  devicePairingProofMessageV1,
  SELF_CERTIFYING_DEVICE_ID_PATTERN_V1,
  type DevicePairingProofV1,
} from '../../shared/types/device-pairing-proof';
import {
  DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION,
  deviceSigningCredentialRegisterProofMessageV1,
  validateDeviceSigningPublicJwkV1,
  type DeviceSigningCredentialRegisterCommandV1,
  type DeviceSigningPublicJwkV1,
} from '../../shared/types/device-signing-credential';
import type { DeviceEpochFenceV1 } from '../../shared/types/device-lifecycle';
import { computeEmbeddedCanonicalSha256V1 } from '../../shared/types/soul-core-embedded';

export const PHONE_DEVICE_CLASS = 'phone' as const;
export const PHONE_KEY_ALGORITHM = 'ecdsa-p256-sha256' as const;

/** Where the private key lives, as the native side reports it. */
export type PhoneKeyHardwareV1 = 'strongbox' | 'tee' | 'secure_enclave' | 'software' | 'unknown';
const HARDWARE_BACKED: readonly PhoneKeyHardwareV1[] = ['strongbox', 'tee', 'secure_enclave'];

export interface PhoneKeyPublicV1 {
  /** P-256 public point, 32 bytes each, base64url without padding. */
  x: string;
  y: string;
  hardware: PhoneKeyHardwareV1;
}

/** The native module (Kotlin / Swift). Every `sign` asks the owner on the device. */
export interface PhoneDeviceKeyNativeV1 {
  getPublicKey(): Promise<PhoneKeyPublicV1 | null>;
  createKey(): Promise<PhoneKeyPublicV1>;
  /** ECDSA-SHA256 over the UTF-8 bytes of `message`; the DER signature, standard base64. */
  sign(message: string, prompt: string): Promise<string>;
}

export class PhoneDeviceKeyError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'PhoneDeviceKeyError';
    this.code = code;
  }
}
const fail = (code: string): never => {
  throw new PhoneDeviceKeyError(code);
};

// ---------------------------------------------------------------------------
// Key material
// ---------------------------------------------------------------------------

export function phoneKeyJwk(key: Pick<PhoneKeyPublicV1, 'x' | 'y'>): DeviceSigningPublicJwkV1 {
  const jwk: DeviceSigningPublicJwkV1 = { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
  if (!validateDeviceSigningPublicJwkV1(jwk, PHONE_KEY_ALGORITHM).valid) fail('key_invalid');
  return jwk;
}

/** The thumbprint the server computes (`DeviceSigningCredentialService.thumbprint`). */
export function phoneKeyThumbprint(jwk: DeviceSigningPublicJwkV1): string {
  return computeEmbeddedCanonicalSha256V1({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
}

export function phoneDeviceId(jwk: DeviceSigningPublicJwkV1): string {
  return deriveSelfCertifyingDeviceIdV1(phoneKeyThumbprint(jwk));
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) fail('signature_invalid');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | B64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (left > 1) out += B64[(n >> 6) & 63];
    if (left > 2) out += B64[n & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * DER `SEQUENCE { INTEGER r, INTEGER s }` (what Keystore and Secure Enclave return) → IEEE P1363 `r||s`,
 * 32 bytes each, base64url (what the contracts carry). Strict: anything else is refused.
 */
export function derSignatureToP1363(derBase64: string): string {
  const der = base64ToBytes(derBase64);
  let at = 0;
  const byte = () => (at < der.length ? der[at++] : fail('signature_invalid'));
  if (byte() !== 0x30) fail('signature_invalid');
  const seqLength = byte();
  if (seqLength & 0x80 || seqLength !== der.length - 2) fail('signature_invalid');
  const integer = (): Uint8Array => {
    if (byte() !== 0x02) fail('signature_invalid');
    const length = byte();
    if (length < 1 || length > 33 || at + length > der.length) fail('signature_invalid');
    let value = der.slice(at, at + length);
    at += length;
    if (value[0] & 0x80) fail('signature_invalid'); // negative
    if (value.length > 1 && value[0] === 0 && !(value[1] & 0x80)) fail('signature_invalid'); // not minimal
    if (value[0] === 0) value = value.slice(1);
    if (value.length > 32) fail('signature_invalid');
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };
  const r = integer();
  const s = integer();
  if (at !== der.length) fail('signature_invalid');
  if (r.every((b) => b === 0) || s.every((b) => b === 0)) fail('signature_invalid');
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return bytesToBase64Url(out);
}

export async function signWithPhoneKey(native: PhoneDeviceKeyNativeV1, message: string, prompt: string): Promise<string> {
  let der: string;
  try {
    der = await native.sign(message, prompt);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    throw new PhoneDeviceKeyError(code === 'user_cancelled' || code === 'ERR_CANCELED' ? 'user_cancelled' : 'sign_failed');
  }
  return derSignatureToP1363(der);
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export interface PhoneEnrollmentStateV1 {
  deviceId: string;
  pairRequestId?: string;
  paired?: boolean;
  registerRequestId?: string;
  credentialRef?: string;
}

export interface PhoneEnrollmentStoreV1 {
  load(): Promise<PhoneEnrollmentStateV1 | null>;
  save(state: PhoneEnrollmentStateV1): Promise<void>;
}

export interface PhoneEnrollmentDepsV1 {
  native: PhoneDeviceKeyNativeV1;
  transport: HttpTransportV1;
  baseUrl: string;
  token: string;
  store: PhoneEnrollmentStoreV1;
  label: string;
  /** Opaque, unique per call (e.g. 16 random bytes in hex). */
  newRequestId: (prefix: string) => Promise<string>;
  now?: () => Date;
  /** What the owner sees when the key asks (two signatures: pairing, then registering). */
  prompt: string;
  /** Test / emulator only: accept a key that is not hardware-backed. */
  allowSoftwareKey?: boolean;
}

export interface PhoneEnrollmentResultV1 {
  deviceId: string;
  credentialRef: string;
  hardware: PhoneKeyHardwareV1;
}

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const DIGITS = /^(0|[1-9][0-9]*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** A top-level field of the answer, or the same field inside a `data` wrapper. */
function pick(response: HttpResponseV1, name: string): unknown {
  const raw = response.body;
  if (!isRecord(raw)) return undefined;
  if (name in raw) return raw[name];
  return isRecord(raw.data) ? raw.data[name] : undefined;
}
const ok = (response: HttpResponseV1) => response.status >= 200 && response.status < 300;

export function decodePhoneEnrollmentState(value: unknown): PhoneEnrollmentStateV1 | null {
  if (!isRecord(value) || typeof value.deviceId !== 'string' || !SELF_CERTIFYING_DEVICE_ID_PATTERN_V1.test(value.deviceId)) return null;
  const optionalId = (v: unknown) => (typeof v === 'string' && REQUEST_ID.test(v) ? v : undefined);
  return {
    deviceId: value.deviceId,
    pairRequestId: optionalId(value.pairRequestId),
    paired: value.paired === true,
    registerRequestId: optionalId(value.registerRequestId),
    credentialRef: optionalId(value.credentialRef),
  };
}

/** The device's fence from its `GET /v1/devices` row (string decimals, as the desktop reads them). */
export function phoneDeviceFence(row: Record<string, unknown>, deviceId: string, capturedAt: string): DeviceEpochFenceV1 {
  const field = (name: string): string => {
    const v = row[name];
    return typeof v === 'string' && DIGITS.test(v) ? v : fail('unexpected_response');
  };
  return {
    schemaVersion: 1,
    target: { kind: 'device_registry', deviceId },
    deviceRevocationEpoch: field('device_revocation_epoch'),
    credentialRevocationEpoch: field('credential_revocation_epoch'),
    optimisticVersion: field('optimistic_version'),
    credentialVersion: field('credential_version'),
    capturedAt,
  } as DeviceEpochFenceV1;
}

/**
 * Pairs this phone and registers its key. Safe to call again after any failure: it resumes. Throws
 * `PhoneDeviceKeyError` with a stable code; never logs the token, the ticket or a signature.
 */
export async function enrollPhoneDevice(deps: PhoneEnrollmentDepsV1): Promise<PhoneEnrollmentResultV1> {
  const now = deps.now ?? (() => new Date());
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = (method: 'GET' | 'POST', path: string, payload?: unknown): Promise<HttpResponseV1> =>
    deps.transport
      .request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${deps.token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(payload === undefined ? {} : { body: payload }),
      })
      .catch(() => fail('network'));

  const key = (await deps.native.getPublicKey()) ?? (await deps.native.createKey());
  if (!HARDWARE_BACKED.includes(key.hardware) && !deps.allowSoftwareKey) fail('key_not_hardware_backed');
  const jwk = phoneKeyJwk(key);
  const thumbprint = phoneKeyThumbprint(jwk);
  const deviceId = deriveSelfCertifyingDeviceIdV1(thumbprint);

  const stored = await deps.store.load();
  // A state for another key (the key was replaced) starts over.
  const state: PhoneEnrollmentStateV1 = stored && stored.deviceId === deviceId ? { ...stored } : { deviceId };
  const save = () => deps.store.save(state);

  // 1. Pair.
  if (!state.paired) {
    if (!state.pairRequestId) {
      state.pairRequestId = await deps.newRequestId('phone-pair');
      await save();
    }
    const ticketResponse = await call('POST', '/v1/devices/pair/ticket', {});
    if (!ok(ticketResponse)) fail('pair_ticket_rejected');
    const ticket = pick(ticketResponse, 'ticket');
    if (typeof ticket !== 'string' || !ticket) fail('unexpected_response');
    const proof: DevicePairingProofV1 = {
      schemaVersion: DEVICE_PAIRING_PROOF_SCHEMA_VERSION,
      algorithm: PHONE_KEY_ALGORITHM,
      publicJwk: jwk,
      signature: await signWithPhoneKey(deps.native, devicePairingProofMessageV1({ ticket: ticket as string, deviceId }), deps.prompt),
    };
    const pairResponse = await call('POST', '/v1/devices/pair', {
      ticket,
      device_id: deviceId,
      device_class: PHONE_DEVICE_CLASS,
      label: deps.label,
      request_id: state.pairRequestId,
      proof,
    });
    if (pairResponse.status !== 409) {
      if (!ok(pairResponse)) fail('pair_rejected');
      const device = pick(pairResponse, 'device');
      if (!isRecord(device) || device.device_id !== deviceId) fail('pair_device_mismatch');
    }
    // 409: already this owner's (a lost progress record); the device list below confirms it.
    state.paired = true;
    await save();
  }

  // The owner's row for this device: ownership and the fence.
  const listResponse = await call('GET', '/v1/devices');
  if (!ok(listResponse)) fail('devices_rejected');
  const items = pick(listResponse, 'items');
  const row = Array.isArray(items) ? items.find((item) => isRecord(item) && item.device_id === deviceId) : undefined;
  if (!isRecord(row)) fail('device_not_owned');

  // 2. Register the key as device-auth.
  if (!state.credentialRef) {
    if (!state.registerRequestId) {
      state.registerRequestId = await deps.newRequestId('phone-register');
      await save();
    }
    const command: DeviceSigningCredentialRegisterCommandV1 = {
      schemaVersion: DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION,
      requestId: state.registerRequestId!,
      expectedDeviceFence: phoneDeviceFence(row as Record<string, unknown>, deviceId, now().toISOString()),
      algorithm: PHONE_KEY_ALGORITHM,
      purpose: 'device-auth',
      publicJwk: jwk,
      proof: {
        signature: await signWithPhoneKey(
          deps.native,
          deviceSigningCredentialRegisterProofMessageV1({ deviceId, requestId: state.registerRequestId!, publicKeyThumbprint: thumbprint }),
          deps.prompt,
        ),
      },
    };
    const path = `/v1/devices/${encodeURIComponent(deviceId)}/signing-credentials`;
    const registerResponse = await call('POST', `${path}/register`, command);
    let credential: unknown;
    if (registerResponse.status === 409) {
      const current = await call('GET', `${path}/current?purpose=device-auth`);
      if (!ok(current)) fail('signer_rejected');
      credential = pick(current, 'credential');
    } else {
      if (!ok(registerResponse)) fail('signer_rejected');
      const receipt = pick(registerResponse, 'receipt');
      credential = isRecord(receipt) ? receipt.credential : undefined;
    }
    // Only a credential for this key, on this device, active.
    if (
      !isRecord(credential) ||
      credential.deviceId !== deviceId ||
      credential.publicKeyThumbprint !== thumbprint ||
      credential.status !== 'active' ||
      typeof credential.credentialRef !== 'string' ||
      !REQUEST_ID.test(credential.credentialRef)
    ) {
      fail('signer_mismatch');
    }
    state.credentialRef = (credential as Record<string, unknown>).credentialRef as string;
    await save();
  }

  return { deviceId, credentialRef: state.credentialRef!, hardware: key.hardware };
}
