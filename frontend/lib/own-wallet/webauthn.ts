/**
 * L8-6 own wallet, web side: the wallet passkey (design 2.0 "钱包 passkey", W2.5 (c), W3.3, H2). Browser-native
 * WebAuthn through a port (tests inject a fake one); no server value reaches `navigator.credentials`.
 *
 * - `rpId` is ALWAYS the build-time `walletRpId` (wallet.agentrix.top). A server-supplied `rpId`, `challenge` or
 *   `allowCredentials` is never read (the request decoder drops them; this file has no parameter for them). The
 *   existing `lib/smart-account/client.ts` pattern "sign whatever the server sends" is not used here.
 * - Creation: ES256 only (`alg: -7`), resident key required, user verification required, attestation none. The public
 *   key comes from `getPublicKey()` (SPKI) at creation time and is kept in L.
 * - Signing: the challenge is the 32 raw bytes of the locally computed `userOpHash`; only L's credential is allowed.
 * - `derToRsV1` / `lowSV1` mirror the backend encoder: strict DER, `s` moved to the low half.
 */
import { decodeBase64, encodeBase64, getBytes, hexlify, sha256, toUtf8Bytes, toUtf8String } from 'ethers';

/** What this file passes to `navigator.credentials.create` (structural, so tests can inspect it). */
export interface OwnWalletCreationOptionsV1 {
  publicKey: {
    rp: { id: string; name: string };
    user: { id: Uint8Array; name: string; displayName: string };
    challenge: Uint8Array;
    pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
    authenticatorSelection: { residentKey: 'required'; requireResidentKey: true; userVerification: 'required' };
    attestation: 'none';
    timeout: number;
  };
}

/** What this file passes to `navigator.credentials.get`: never a server value. */
export interface OwnWalletRequestOptionsV1 {
  publicKey: {
    challenge: Uint8Array;
    rpId: string;
    allowCredentials: Array<{ type: 'public-key'; id: Uint8Array }>;
    userVerification: 'required';
    timeout: number;
  };
}

export interface OwnWalletWebAuthnPortV1 {
  create(options: OwnWalletCreationOptionsV1): Promise<unknown>;
  get(options: OwnWalletRequestOptionsV1): Promise<unknown>;
}

/** `navigator.credentials`, or `null` where WebAuthn is not available. */
export function browserWebAuthnPortV1(): OwnWalletWebAuthnPortV1 | null {
  if (typeof navigator === 'undefined' || !navigator.credentials || typeof navigator.credentials.get !== 'function') return null;
  return {
    create: (o) => navigator.credentials.create(o as unknown as CredentialCreationOptions),
    get: (o) => navigator.credentials.get(o as unknown as CredentialRequestOptions),
  };
}

// `instanceof ArrayBuffer` fails across frames and test realms; the tag check does not.
function asBytes(value: unknown): Uint8Array | null {
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return new Uint8Array(value as ArrayBuffer);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

interface CredentialLike {
  type?: unknown;
  rawId?: unknown;
  response?: {
    getPublicKey?: () => unknown;
    getPublicKeyAlgorithm?: () => unknown;
    getAuthenticatorData?: () => unknown;
    clientDataJSON?: unknown;
    authenticatorData?: unknown;
    signature?: unknown;
  };
}

export function bytesToBase64UrlV1(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytesV1(value: string): Uint8Array | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return decodeBase64(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
  } catch {
    return null;
  }
}

const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const P256_SPKI_PREFIX = '0x3059301306072a8648ce3d020106082a8648ce3d030107034200';
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const TIMEOUT_MS = 120000;

/** An uncompressed P-256 SPKI (91 bytes) → the two key words; `null` for anything else. */
export function spkiP256ToXyV1(spki: Uint8Array): { pubKeyX: string; pubKeyY: string } | null {
  if (!(spki instanceof Uint8Array) || spki.length !== 91) return null;
  const hex = hexlify(spki).toLowerCase();
  if (!hex.startsWith(P256_SPKI_PREFIX) || hex.slice(P256_SPKI_PREFIX.length, P256_SPKI_PREFIX.length + 2) !== '04') return null;
  const body = hex.slice(P256_SPKI_PREFIX.length + 2);
  const pubKeyX = '0x' + body.slice(0, 64);
  const pubKeyY = '0x' + body.slice(64, 128);
  if (BigInt(pubKeyX) === BigInt(0) || BigInt(pubKeyY) === BigInt(0)) return null;
  return { pubKeyX, pubKeyY };
}

/** Strict DER ECDSA-Sig-Value: SEQUENCE { INTEGER r, INTEGER s }, minimal lengths, positive, below n. */
export function derToRsV1(der: Uint8Array): { r: bigint; s: bigint } | null {
  if (!(der instanceof Uint8Array) || der.length < 8 || der.length > 72 || der[0] !== 0x30 || der[1] !== der.length - 2) return null;
  let at = 2;
  const int = (): bigint | null => {
    if (der[at] !== 0x02) return null;
    const len = der[at + 1];
    if (len === undefined || len === 0 || len > 33 || at + 2 + len > der.length) return null;
    const bytes = der.subarray(at + 2, at + 2 + len);
    if (bytes[0] & 0x80) return null;
    if (len > 1 && bytes[0] === 0x00 && !(bytes[1] & 0x80)) return null;
    at += 2 + len;
    const v = BigInt(hexlify(bytes));
    if (v === BigInt(0) || v >= P256_N) return null;
    return v;
  };
  const r = int();
  if (r === null) return null;
  const s = int();
  if (s === null || at !== der.length) return null;
  return { r, s };
}

/** The low half of `s` (n - s when s > n/2); WebAuthnValidator refuses a high `s`. */
export function lowSV1(s: bigint): bigint {
  return s > P256_N / BigInt(2) ? P256_N - s : s;
}

/** Key fingerprint shown on both devices: the first 8 bytes of sha256(0x04 ‖ x ‖ y), four groups of four hex digits. */
export function keyFingerprintV1(key: { pubKeyX: string; pubKeyY: string }): string {
  const x = String(key.pubKeyX).replace(/^0x/i, '').padStart(64, '0').toLowerCase();
  const y = String(key.pubKeyY).replace(/^0x/i, '').padStart(64, '0').toLowerCase();
  const digest = sha256('0x04' + x + y).slice(2, 18);
  return [digest.slice(0, 4), digest.slice(4, 8), digest.slice(8, 12), digest.slice(12, 16)].join(' ');
}

/** Creation options for a wallet passkey. `rpId` must be the build-time constant. */
export function walletPasskeyCreationOptionsV1(input: { rpId: string; userName: string; userId: Uint8Array; challenge: Uint8Array }): OwnWalletCreationOptionsV1 {
  return {
    publicKey: {
      rp: { id: input.rpId, name: 'Agentrix Wallet' },
      user: { id: input.userId, name: input.userName, displayName: input.userName },
      challenge: input.challenge,
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      attestation: 'none',
      timeout: TIMEOUT_MS,
    },
  };
}

export type OwnWalletWebAuthnProblemV1 =
  | 'webauthn_unavailable'
  | 'rp_id_not_configured'
  | 'webauthn_cancelled'
  | 'credential_malformed'
  | 'public_key_unavailable'
  | 'algorithm_not_es256'
  | 'public_key_invalid'
  | 'rp_id_mismatch'
  | 'user_verification_missing'
  | 'hash_invalid'
  | 'credential_id_invalid'
  | 'assertion_unexpected';

export interface OwnWalletCreatedPasskeyV1 {
  credentialId: string;
  pubKeyX: string;
  pubKeyY: string;
  /** BS flag: the passkey is synced to the owner's cloud keychain; `null` when the browser did not say. */
  backedUp: boolean | null;
}

type Fail = { ok: false; reasonCode: OwnWalletWebAuthnProblemV1 };
const fail = (reasonCode: OwnWalletWebAuthnProblemV1): Fail => ({ ok: false, reasonCode });

function rpIdHashOk(authData: Uint8Array, rpId: string): boolean {
  return authData.length >= 37 && hexlify(authData.subarray(0, 32)).toLowerCase() === sha256(toUtf8Bytes(rpId)).toLowerCase();
}

/** Creates a wallet passkey on this device; random bytes come from the caller (`crypto.getRandomValues`). */
export async function createWalletPasskeyV1(
  port: OwnWalletWebAuthnPortV1 | null,
  input: { rpId: string; userName: string; random: (length: number) => Uint8Array },
): Promise<{ ok: true; value: OwnWalletCreatedPasskeyV1 } | Fail> {
  if (!port) return fail('webauthn_unavailable');
  if (!/^[a-z0-9.-]+$/.test(input.rpId)) return fail('rp_id_not_configured');
  let credential: unknown;
  try {
    credential = await port.create(walletPasskeyCreationOptionsV1({ rpId: input.rpId, userName: input.userName, userId: input.random(16), challenge: input.random(32) }));
  } catch {
    return fail('webauthn_cancelled');
  }
  const pk = credential as CredentialLike | null;
  const rawId = pk ? asBytes(pk.rawId) : null;
  if (!pk || pk.type !== 'public-key' || !rawId || rawId.length === 0 || !pk.response) return fail('credential_malformed');
  const response = pk.response;
  if (typeof response.getPublicKey !== 'function') return fail('public_key_unavailable');
  if (typeof response.getPublicKeyAlgorithm === 'function' && response.getPublicKeyAlgorithm() !== -7) return fail('algorithm_not_es256');
  const spki = asBytes(response.getPublicKey());
  if (!spki) return fail('public_key_unavailable');
  const key = spkiP256ToXyV1(spki);
  if (!key) return fail('public_key_invalid');
  let backedUp: boolean | null = null;
  if (typeof response.getAuthenticatorData === 'function') {
    const authData = asBytes(response.getAuthenticatorData());
    if (!authData || !rpIdHashOk(authData, input.rpId)) return fail('rp_id_mismatch');
    if (!(authData[32] & FLAG_UV)) return fail('user_verification_missing');
    backedUp = (authData[32] & FLAG_BE) !== 0 && (authData[32] & FLAG_BS) !== 0;
  }
  return { ok: true, value: { credentialId: bytesToBase64UrlV1(rawId), ...key, backedUp } };
}

/** Request options: the challenge is the local hash's 32 raw bytes, `rpId` the build constant, only L's credential. */
export function walletAssertionOptionsV1(input: { userOpHash: string; credentialId: string; rpId: string }): OwnWalletRequestOptionsV1 | null {
  if (typeof input.userOpHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(input.userOpHash)) return null;
  const id = base64UrlToBytesV1(input.credentialId);
  if (!id) return null;
  return {
    publicKey: {
      challenge: getBytes(input.userOpHash),
      rpId: input.rpId,
      allowCredentials: [{ type: 'public-key', id }],
      userVerification: 'required',
      timeout: TIMEOUT_MS,
    },
  };
}

/** The fields `POST /wallet-requests/:ref/signature` takes (all base64url). */
export interface OwnWalletAssertionV1 {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

/**
 * Local sanity check of what the authenticator returned before it is sent: `webauthn.get`, the challenge is the local
 * hash, the origin is the wallet origin, not cross-origin, the RP ID hash, UP and UV, a strict DER signature. The
 * backend checks all of it again with the 2161 key.
 */
export function assertionProblemV1(assertion: OwnWalletAssertionV1, check: { userOpHash: string; walletOrigin: string; rpId: string; credentialId: string }): OwnWalletWebAuthnProblemV1 | null {
  if (assertion.credentialId !== check.credentialId) return 'assertion_unexpected';
  const clientData = base64UrlToBytesV1(assertion.clientDataJSON);
  const authData = base64UrlToBytesV1(assertion.authenticatorData);
  const der = base64UrlToBytesV1(assertion.signature);
  if (!clientData || !authData || !der) return 'assertion_unexpected';
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(toUtf8String(clientData));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'assertion_unexpected';
    parsed = value as Record<string, unknown>;
  } catch {
    return 'assertion_unexpected';
  }
  if (parsed.type !== 'webauthn.get') return 'assertion_unexpected';
  if (parsed.challenge !== bytesToBase64UrlV1(getBytes(check.userOpHash))) return 'assertion_unexpected';
  if (parsed.origin !== check.walletOrigin || parsed.crossOrigin === true) return 'assertion_unexpected';
  if (!rpIdHashOk(authData, check.rpId)) return 'rp_id_mismatch';
  if (!(authData[32] & FLAG_UP) || !(authData[32] & FLAG_UV)) return 'user_verification_missing';
  if (!derToRsV1(der)) return 'assertion_unexpected';
  return null;
}

/**
 * Signs the locally computed `userOpHash` with L's wallet passkey. The caller computed the hash from the decoded
 * UserOp and ran every W2.5 / W2.6 check first; this function is never reached when any check refused.
 */
export async function signUserOpHashV1(
  port: OwnWalletWebAuthnPortV1 | null,
  input: { userOpHash: string; credentialId: string; rpId: string; walletOrigin: string },
): Promise<{ ok: true; value: OwnWalletAssertionV1 } | Fail> {
  if (!port) return fail('webauthn_unavailable');
  if (!/^[a-z0-9.-]+$/.test(input.rpId)) return fail('rp_id_not_configured');
  if (!/^0x[0-9a-f]{64}$/.test(String(input.userOpHash))) return fail('hash_invalid');
  const options = walletAssertionOptionsV1(input);
  if (!options) return fail('credential_id_invalid');
  let credential: unknown;
  try {
    credential = await port.get(options);
  } catch {
    return fail('webauthn_cancelled');
  }
  const pk = credential as CredentialLike | null;
  const rawId = pk ? asBytes(pk.rawId) : null;
  if (!pk || pk.type !== 'public-key' || !rawId || !pk.response) return fail('credential_malformed');
  const clientDataJSON = asBytes(pk.response.clientDataJSON);
  const authenticatorData = asBytes(pk.response.authenticatorData);
  const signature = asBytes(pk.response.signature);
  if (!clientDataJSON || !authenticatorData || !signature) return fail('credential_malformed');
  const assertion: OwnWalletAssertionV1 = {
    credentialId: bytesToBase64UrlV1(rawId),
    clientDataJSON: bytesToBase64UrlV1(clientDataJSON),
    authenticatorData: bytesToBase64UrlV1(authenticatorData),
    signature: bytesToBase64UrlV1(signature),
  };
  const problem = assertionProblemV1(assertion, { userOpHash: input.userOpHash, walletOrigin: input.walletOrigin, rpId: input.rpId, credentialId: input.credentialId });
  if (problem) return fail(problem);
  return { ok: true, value: assertion };
}
