/**
 * L8-6 own wallet: "本设备核对" on the wallet origin (design 5.2, 6a, R2-M3, R3-L7).
 *
 * Three ways a device comes to hold an account in L, tried in this order:
 *   1. L already has it (`deviceCheckedAccountV1`).
 *   2. Same device, another account of a key L already holds (`sameKeyRecordV1`): no prompt.
 *   3. A new device whose keychain has the synced wallet passkey (5.2): read the account's credentials from the chain
 *      through the pinned public node, ask the authenticator for an assertion over a LOCAL random challenge (rpId is
 *      the build constant, no server value), verify the signature with WebCrypto under one of those on-chain keys,
 *      find the salt index at which that key gives the account, then write L.
 * Accounts that are not deployed yet have no on-chain credentials; a new device cannot check them (open the page on
 * the device that created the wallet).
 *
 * The phone's `state` is only ever put back into the `agentrix://wallet-verified` deep link after the check passed. It
 * is never part of any request this page makes (R3-L7): the chain reads below carry only the account address.
 */
import { concat, getBytes, hexlify, sha256 } from 'ethers';
import { deviceCheckedAccountV1, sameKeyRecordV1, saltIndexOfV1 } from './device-check';
import type { OwnWalletAccountLinkV1 } from './links';
import { readLocalRecordsV1, recordLocalAccountV1, type OwnWalletLocalRecordV1, type OwnWalletLocalStorePortV1 } from './local-store';
import { readWebAuthnCredentialsV1, type OwnWalletPublicChainReaderV1 } from './public-chain-reader';
import { assertionProblemV1, bytesToBase64UrlV1, derToRsV1, type OwnWalletAssertionV1, type OwnWalletWebAuthnPortV1 } from './webauthn';

/** The phone's deep link back (6a). Only built after the check passed. */
export function verifiedDeepLinkV1(state: string, account: string, chainId: number): string {
  const q = new URLSearchParams();
  q.set('state', state);
  q.set('account', String(account).toLowerCase());
  q.set('chainId', String(chainId));
  return `agentrix://wallet-verified?${q.toString()}`;
}

/** P-256 ECDSA over SHA-256 with an IEEE P1363 (r ‖ s) signature; WebCrypto in the browser. */
export interface OwnWalletP256VerifierV1 {
  verify(key: { pubKeyX: string; pubKeyY: string }, data: Uint8Array, signatureRs: Uint8Array): Promise<boolean>;
}

// A fresh ArrayBuffer: WebCrypto's BufferSource does not take every Uint8Array view type.
function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
}

/** WebCrypto implementation; `null` where `crypto.subtle` is missing. */
export function webCryptoP256VerifierV1(): OwnWalletP256VerifierV1 | null {
  const subtle = typeof crypto !== 'undefined' && crypto && crypto.subtle ? crypto.subtle : null;
  if (!subtle) return null;
  return {
    async verify(key, data, signatureRs) {
      try {
        const raw = arrayBufferOf(getBytes(concat(['0x04', key.pubKeyX, key.pubKeyY])));
        const imported = await subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, imported, arrayBufferOf(signatureRs), arrayBufferOf(data));
      } catch {
        return false;
      }
    },
  };
}

interface CredentialLike {
  type?: unknown;
  rawId?: unknown;
  response?: { clientDataJSON?: unknown; authenticatorData?: unknown; signature?: unknown };
}

function asBytes(value: unknown): Uint8Array | null {
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return new Uint8Array(value as ArrayBuffer);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

export type OwnWalletVerifyDeviceProblemV1 =
  | 'chain_not_configured'
  | 'chain_mismatch'
  | 'chain_unavailable'
  | 'account_not_deployed'
  | 'webauthn_unavailable'
  | 'webauthn_cancelled'
  | 'assertion_unexpected'
  | 'key_not_in_account'
  | 'salt_index_not_found'
  | 'record_refused';

export type OwnWalletVerifyDeviceResultV1 =
  | { ok: true; record: OwnWalletLocalRecordV1; how: 'already' | 'same_key' | 'new_device' }
  | { ok: false; reasonCode: OwnWalletVerifyDeviceProblemV1; message?: string };

export interface OwnWalletVerifyDeviceDepsV1 {
  configuredChainId: number | null;
  store: OwnWalletLocalStorePortV1;
  now: () => Date;
}

/** Steps 1 and 2 (no prompt). `null` when neither applies and the page has to ask (step 3). */
export async function verifyWithoutPromptV1(link: OwnWalletAccountLinkV1, deps: OwnWalletVerifyDeviceDepsV1): Promise<OwnWalletVerifyDeviceResultV1 | null> {
  if (deps.configuredChainId === null || deps.configuredChainId === undefined) return { ok: false, reasonCode: 'chain_not_configured' };
  if (link.chainId !== deps.configuredChainId) return { ok: false, reasonCode: 'chain_mismatch' };
  const records = await readLocalRecordsV1(deps.store);
  const checked = deviceCheckedAccountV1(records, link, deps.configuredChainId);
  if (checked.ok === true) return { ok: true, record: checked.record, how: 'already' };
  if (checked.reasonCode !== 'not_checked_on_this_device') return { ok: false, reasonCode: 'record_refused' };
  const candidate = sameKeyRecordV1(records, link, deps.now().toISOString());
  if (!candidate) return null;
  const written = await recordLocalAccountV1(deps.store, candidate);
  if (written.ok === false) return { ok: false, reasonCode: 'record_refused', ...('message' in written ? { message: written.message } : {}) };
  return { ok: true, record: written.record, how: 'same_key' };
}

/** Step 3: a new device with the synced wallet passkey (design 5.2). Asks the authenticator once. */
export async function verifyNewDeviceV1(
  link: OwnWalletAccountLinkV1,
  deps: OwnWalletVerifyDeviceDepsV1 & {
    reader: OwnWalletPublicChainReaderV1 | null;
    webauthn: OwnWalletWebAuthnPortV1 | null;
    verifier: OwnWalletP256VerifierV1 | null;
    rpId: string;
    walletOrigin: string;
    random: (length: number) => Uint8Array;
  },
): Promise<OwnWalletVerifyDeviceResultV1> {
  if (deps.configuredChainId === null || deps.configuredChainId === undefined) return { ok: false, reasonCode: 'chain_not_configured' };
  if (link.chainId !== deps.configuredChainId || !deps.reader || deps.reader.chainId !== link.chainId) return { ok: false, reasonCode: 'chain_mismatch' };
  if (!deps.webauthn || !deps.verifier || !/^[a-z0-9.-]+$/.test(deps.rpId)) return { ok: false, reasonCode: 'webauthn_unavailable' };
  let onChain: Array<{ pubKeyX: string; pubKeyY: string }>;
  try {
    onChain = (await readWebAuthnCredentialsV1(deps.reader, link.account)).credentials;
  } catch {
    return { ok: false, reasonCode: 'chain_unavailable' };
  }
  if (onChain.length === 0) return { ok: false, reasonCode: 'account_not_deployed' };

  const challenge = deps.random(32);
  let credential: unknown;
  try {
    // Discoverable: the authenticator offers the wallet passkeys it has for this RP ID; nothing comes from a server.
    credential = await deps.webauthn.get({ publicKey: { challenge, rpId: deps.rpId, allowCredentials: [], userVerification: 'required', timeout: 120000 } });
  } catch {
    return { ok: false, reasonCode: 'webauthn_cancelled' };
  }
  const pk = credential as CredentialLike | null;
  const rawId = pk ? asBytes(pk.rawId) : null;
  const clientDataJSON = pk?.response ? asBytes(pk.response.clientDataJSON) : null;
  const authenticatorData = pk?.response ? asBytes(pk.response.authenticatorData) : null;
  const signature = pk?.response ? asBytes(pk.response.signature) : null;
  if (!pk || pk.type !== 'public-key' || !rawId || rawId.length === 0 || !clientDataJSON || !authenticatorData || !signature) return { ok: false, reasonCode: 'assertion_unexpected' };
  const assertion: OwnWalletAssertionV1 = {
    credentialId: bytesToBase64UrlV1(rawId),
    clientDataJSON: bytesToBase64UrlV1(clientDataJSON),
    authenticatorData: bytesToBase64UrlV1(authenticatorData),
    signature: bytesToBase64UrlV1(signature),
  };
  // The same local checks as a signature over a UserOp hash, with the local random challenge in its place.
  const problem = assertionProblemV1(assertion, { userOpHash: hexlify(challenge).toLowerCase(), walletOrigin: deps.walletOrigin, rpId: deps.rpId, credentialId: assertion.credentialId });
  if (problem) return { ok: false, reasonCode: 'assertion_unexpected' };
  const rs = derToRsV1(signature);
  if (!rs) return { ok: false, reasonCode: 'assertion_unexpected' };
  const p1363 = getBytes(concat(['0x' + rs.r.toString(16).padStart(64, '0'), '0x' + rs.s.toString(16).padStart(64, '0')]));
  const signed = getBytes(concat([authenticatorData, sha256(clientDataJSON)]));

  let key: { pubKeyX: string; pubKeyY: string } | null = null;
  for (const k of onChain) {
    if (await deps.verifier.verify(k, signed, p1363)) {
      key = k;
      break;
    }
  }
  if (!key) return { ok: false, reasonCode: 'key_not_in_account' };
  const saltIndex = saltIndexOfV1(link.kind, key, link.account);
  if (saltIndex === null) return { ok: false, reasonCode: 'salt_index_not_found' };
  const record: OwnWalletLocalRecordV1 = {
    chainId: link.chainId,
    kind: link.kind,
    accountAddress: link.account,
    saltIndex,
    credentialId: assertion.credentialId,
    pubKeyX: key.pubKeyX,
    pubKeyY: key.pubKeyY,
    createdAt: deps.now().toISOString(),
  };
  if (link.kind === 'agent') record.agentId = link.agentId;
  const written = await recordLocalAccountV1(deps.store, record);
  if (written.ok === false) return { ok: false, reasonCode: 'record_refused', ...('message' in written ? { message: written.message } : {}) };
  return { ok: true, record: written.record, how: 'new_device' };
}
