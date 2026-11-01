/**
 * L8-6 own wallet, wallet origin side: the three backend routes the wallet origin calls (design 7.3 "钱包源路由"),
 * authenticated by the one-time wallet token only (`Authorization: OwnWalletRequest <walletToken>`), never by a login
 * cookie. The routes themselves arrive in S5b.
 *
 * - The URL carries only the request ref; the intent from the fragment is never sent anywhere.
 * - Responses are decoded strictly; whatever the server says about the UserOp is re-checked locally before display.
 * - Errors come back as a code from a fixed shape (401 `wallet_token_invalid`, 410 `request_expired`, …); no response
 *   text is shown to the owner as is.
 */
import { OWN_WALLET_ACCOUNT_KINDS_V1, OWN_WALLET_SALT_INDEX_MAX_V1, type OwnWalletAccountKindV1 } from '../../../shared/types/agent-own-wallet';
import { decodeWalletRequestV1, type OwnWalletWalletRequestV1 } from './userop-hash';
import type { OwnWalletAssertionV1 } from './webauthn';

export interface OwnWalletHttpRequestV1 {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}
export type OwnWalletHttpTransportV1 = (request: OwnWalletHttpRequestV1) => Promise<{ status: number; body: unknown }>;

/** Browser transport: no cookies, no referrer, no cache. */
export const fetchHttpTransportV1: OwnWalletHttpTransportV1 = async (request) => {
  const res = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
};

export type OwnWalletClientResultV1<T> = { ok: true; value: T } | { ok: false; status: number; code: string };

export interface OwnWalletServerAccountV1 {
  accountAddress: string;
  initData: string;
  salt: string;
  saltIndex: number;
  kind: OwnWalletAccountKindV1;
}

export interface OwnWalletSignatureStateV1 {
  state: string;
  userOpHash: string;
  txHash?: string;
}

const REQUEST_REF = /^owr_[0-9a-f]{32}$/;
const WALLET_TOKEN = /^owt_[A-Za-z0-9_-]{43}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const HEX = /^0x(?:[0-9a-f]{2})*$/;
const HASH = /^0x[0-9a-f]{64}$/;
const STATES = ['pending', 'signed', 'submitted', 'confirmed', 'reverted', 'failed', 'expired'];

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function errorOf(status: number, body: unknown): { ok: false; status: number; code: string } {
  const code = isPlainObject(body) && typeof body.code === 'string' && CODE.test(body.code) ? body.code : status === 401 ? 'wallet_token_invalid' : status === 410 ? 'request_expired' : 'request_failed';
  return { ok: false, status, code };
}

/** S6: the answer to a recovery-key request's credential (the second request, which guardians sign). */
export interface OwnWalletRecoverRequestV1 {
  requestRef: string;
  walletToken: string;
  expiresAt: string;
  userOpHash: string;
  threshold: number;
  guardianCount: number;
}

/** S6: the state after guardian / recovery-code signatures were posted. */
export interface OwnWalletGuardianStateV1 {
  state: string;
  userOpHash: string | null;
  collected: number;
  required: number;
  txHash?: string;
}

export interface OwnWalletOriginClientV1 {
  getRequest(requestRef: string, walletToken: string): Promise<OwnWalletClientResultV1<OwnWalletWalletRequestV1>>;
  postCredential(requestRef: string, walletToken: string, key: { credentialId: string; pubKeyX: string; pubKeyY: string }): Promise<OwnWalletClientResultV1<OwnWalletServerAccountV1>>;
  postSignature(requestRef: string, walletToken: string, assertion: OwnWalletAssertionV1): Promise<OwnWalletClientResultV1<OwnWalletSignatureStateV1>>;
  /** S6: the new wallet passkey of a recovery (same route as `postCredential`, other answer). */
  postRecoveryCredential(requestRef: string, walletToken: string, key: { credentialId: string; pubKeyX: string; pubKeyY: string }): Promise<OwnWalletClientResultV1<OwnWalletRecoverRequestV1>>;
  /** S6: 65-byte signatures of the recovery code or a guardian (same route as `postSignature`); nothing else is sent. */
  postEcdsaSignatures(requestRef: string, walletToken: string, signatures: readonly string[]): Promise<OwnWalletClientResultV1<OwnWalletGuardianStateV1>>;
}

const SIGNATURE_65 = /^0x[0-9a-f]{130}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const count = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

export function createWalletOriginClientV1(input: { apiOrigin: string; transport?: OwnWalletHttpTransportV1 }): OwnWalletOriginClientV1 {
  const transport = input.transport ?? fetchHttpTransportV1;
  const base = `${input.apiOrigin}/api/agent-own-wallet/wallet-requests`;
  const configured = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(input.apiOrigin);

  const send = async (method: 'GET' | 'POST', requestRef: string, walletToken: string, path: string, body?: unknown): Promise<{ status: number; body: unknown } | { ok: false; status: number; code: string }> => {
    if (!configured) return { ok: false, status: 0, code: 'api_origin_not_configured' };
    if (!REQUEST_REF.test(String(requestRef)) || !WALLET_TOKEN.test(String(walletToken))) return { ok: false, status: 0, code: 'link_invalid' };
    const headers: Record<string, string> = { authorization: `OwnWalletRequest ${walletToken}`, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    try {
      return await transport({ method, url: `${base}/${requestRef}${path}`, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      return { ok: false, status: 0, code: 'network_unavailable' };
    }
  };

  return {
    async getRequest(requestRef, walletToken) {
      const res = await send('GET', requestRef, walletToken, '');
      if ('ok' in res) return res;
      if (res.status !== 200) return errorOf(res.status, res.body);
      const decoded = decodeWalletRequestV1(res.body);
      if (decoded.ok === false) return { ok: false, status: res.status, code: decoded.reasonCode };
      return { ok: true, value: decoded.value };
    },
    async postCredential(requestRef, walletToken, key) {
      const res = await send('POST', requestRef, walletToken, '/credential', { credentialId: key.credentialId, pubKeyX: key.pubKeyX, pubKeyY: key.pubKeyY });
      if ('ok' in res) return res;
      if (res.status !== 200 && res.status !== 201) return errorOf(res.status, res.body);
      const b = res.body;
      if (!isPlainObject(b)) return { ok: false, status: res.status, code: 'response_malformed' };
      for (const k of Object.keys(b)) if (!['accountAddress', 'initData', 'salt', 'saltIndex', 'kind'].includes(k)) return { ok: false, status: res.status, code: 'response_malformed' };
      const { accountAddress, initData, salt, saltIndex, kind } = b;
      if (typeof accountAddress !== 'string' || !ADDRESS.test(accountAddress)) return { ok: false, status: res.status, code: 'response_malformed' };
      if (typeof initData !== 'string' || !HEX.test(initData) || typeof salt !== 'string' || !HASH.test(salt)) return { ok: false, status: res.status, code: 'response_malformed' };
      if (typeof saltIndex !== 'number' || !Number.isInteger(saltIndex) || saltIndex < 0 || saltIndex > OWN_WALLET_SALT_INDEX_MAX_V1) return { ok: false, status: res.status, code: 'response_malformed' };
      if (typeof kind !== 'string' || !(OWN_WALLET_ACCOUNT_KINDS_V1 as readonly string[]).includes(kind)) return { ok: false, status: res.status, code: 'response_malformed' };
      return { ok: true, value: { accountAddress, initData, salt, saltIndex, kind: kind as OwnWalletAccountKindV1 } };
    },
    async postSignature(requestRef, walletToken, assertion) {
      const res = await send('POST', requestRef, walletToken, '/signature', {
        assertion: { credentialId: assertion.credentialId, clientDataJSON: assertion.clientDataJSON, authenticatorData: assertion.authenticatorData, signature: assertion.signature },
      });
      if ('ok' in res) return res;
      if (res.status !== 200 && res.status !== 201) return errorOf(res.status, res.body);
      const b = res.body;
      if (!isPlainObject(b) || typeof b.state !== 'string' || !STATES.includes(b.state) || typeof b.userOpHash !== 'string' || !HASH.test(b.userOpHash)) {
        return { ok: false, status: res.status, code: 'response_malformed' };
      }
      const value: OwnWalletSignatureStateV1 = { state: b.state, userOpHash: b.userOpHash };
      if (typeof b.txHash === 'string' && HASH.test(b.txHash)) value.txHash = b.txHash;
      return { ok: true, value };
    },
    async postRecoveryCredential(requestRef, walletToken, key) {
      const res = await send('POST', requestRef, walletToken, '/credential', { credentialId: key.credentialId, pubKeyX: key.pubKeyX, pubKeyY: key.pubKeyY });
      if ('ok' in res) return res;
      if (res.status !== 200 && res.status !== 201) return errorOf(res.status, res.body);
      const b = res.body;
      if (!isPlainObject(b)) return { ok: false, status: res.status, code: 'response_malformed' };
      for (const k of Object.keys(b)) if (!['requestRef', 'walletToken', 'expiresAt', 'userOpHash', 'threshold', 'guardianCount'].includes(k)) return { ok: false, status: res.status, code: 'response_malformed' };
      const { requestRef: ref, walletToken: token, expiresAt, userOpHash, threshold, guardianCount } = b;
      if (typeof ref !== 'string' || !REQUEST_REF.test(ref) || typeof token !== 'string' || !WALLET_TOKEN.test(token)) return { ok: false, status: res.status, code: 'response_malformed' };
      if (typeof expiresAt !== 'string' || !ISO_TIME.test(expiresAt) || typeof userOpHash !== 'string' || !HASH.test(userOpHash)) return { ok: false, status: res.status, code: 'response_malformed' };
      if (!count(threshold, 16) || threshold < 1 || !count(guardianCount, 16) || guardianCount < threshold) return { ok: false, status: res.status, code: 'response_malformed' };
      return { ok: true, value: { requestRef: ref, walletToken: token, expiresAt, userOpHash, threshold, guardianCount } };
    },
    async postEcdsaSignatures(requestRef, walletToken, signatures) {
      const list = Array.from(signatures ?? []).map((s) => String(s).toLowerCase());
      if (list.length === 0 || list.length > 16 || list.some((s) => !SIGNATURE_65.test(s))) return { ok: false, status: 0, code: 'signature_malformed' };
      const res = await send('POST', requestRef, walletToken, '/signature', { ecdsaSignatures: list });
      if ('ok' in res) return res;
      if (res.status !== 200 && res.status !== 201) return errorOf(res.status, res.body);
      const b = res.body;
      if (!isPlainObject(b)) return { ok: false, status: res.status, code: 'response_malformed' };
      const { state, userOpHash, collected, required, txHash } = b;
      if (typeof state !== 'string' || !STATES.includes(state) || !count(collected, 16) || !count(required, 16)) return { ok: false, status: res.status, code: 'response_malformed' };
      if (userOpHash !== null && (typeof userOpHash !== 'string' || !HASH.test(userOpHash))) return { ok: false, status: res.status, code: 'response_malformed' };
      const value: OwnWalletGuardianStateV1 = { state, userOpHash: userOpHash as string | null, collected, required };
      if (typeof txHash === 'string' && HASH.test(txHash)) value.txHash = txHash;
      return { ok: true, value };
    },
  };
}
