/**
 * L8-6 own wallet, web side: the owner's local intent I and the wallet link (design 2.0 "本地意图 I", 7.3).
 *
 * - The main site (or the desktop app) puts what the owner typed into the URL fragment:
 *   `${walletOrigin}/wallet/approve#ref=<requestRef>&t=<walletToken>&intent=<base64url(JSON)>`. A fragment is never sent
 *   in a request and never in a Referer, so the intent does not pass through our server.
 * - The intent is read ONLY from the fragment. A query string, a server response or anything else is never an intent.
 * - I has no origin authentication (R2-M2): a hostile server can mail a link whose intent matches a hostile UserOp. It
 *   is used only for the consistency column of W2.6; the page always shows what it decoded from the UserOp itself and
 *   the hard checks compare with L, the chain and pinned constants.
 */
import { decodeBase64, encodeBase64, toUtf8Bytes, toUtf8String } from 'ethers';
import type { OwnWalletGrantSessionIntentV1 } from '../../../shared/types/agent-own-wallet';
import { OWN_WALLET_PURPOSES_V1, type OwnWalletPurposeV1 } from './userop-hash';

export const OWN_WALLET_INTENT_VERSION_V1 = 1 as const;

export interface OwnWalletRecoveryIntentV1 {
  /** Lower-case addresses, in any order (compared as a set). */
  guardians: string[];
  threshold: number;
  /** The owner chose a recovery code (its address must then be among the guardians, W2.6). */
  recoveryCode: boolean;
}

export type OwnWalletDeploySetupIntentV1 = { v: 1; purpose: 'deploy_setup'; agentId?: string; agentName: string; register: boolean; cardUrl?: string } & OwnWalletRecoveryIntentV1;

export type OwnWalletIntentV1 =
  | OwnWalletDeploySetupIntentV1
  | ({ v: 1; purpose: 'install_recovery'; agentId?: string } & OwnWalletRecoveryIntentV1)
  | { v: 1; purpose: 'register'; agentId?: string; cardUrl: string }
  | { v: 1; purpose: 'revoke_registration'; agentId?: string; agentName: string }
  | { v: 1; purpose: 'set_guardians'; agentId?: string; guardians: string[]; threshold: number }
  | { v: 1; purpose: 'transfer'; agentId?: string; to: string; amount: string; asset: 'native' | 'token' }
  | { v: 1; purpose: 'revoke_session' | 'add_credential' | 'remove_credential' | 'recover'; agentId?: string }
  | OwnWalletGrantSessionIntentV1;

export type OwnWalletIntentResultV1 = { ok: true; value: OwnWalletIntentV1 } | { ok: false; reasonCode: 'intent_invalid' | 'intent_purpose_not_supported'; field: string };

const MAX_ENCODED = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const AMOUNT = /^[1-9][0-9]{0,77}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const B64URL = /^[A-Za-z0-9_-]+$/;

const bad = (field: string): { ok: false; reasonCode: 'intent_invalid'; field: string } => ({ ok: false, reasonCode: 'intent_invalid', field });
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function base64UrlToText(value: string): string | null {
  if (value.length === 0 || value.length > MAX_ENCODED || !B64URL.test(value)) return null;
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    return toUtf8String(decodeBase64(b64));
  } catch {
    return null;
  }
}

function textToBase64Url(text: string): string {
  return encodeBase64(toUtf8Bytes(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function label(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !CONTROL.test(value) ? value : null;
}

function guardianList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return null;
  const out: string[] = [];
  for (const g of value) {
    if (typeof g !== 'string' || !ADDRESS.test(g)) return null;
    out.push(g);
  }
  return out;
}

const threshold = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 16 ? value : null);

const SESSION_WORD = /^0x[0-9a-f]{64}$/;
const SESSION_DEVICE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const SESSION_UINT = /^[1-9][0-9]{0,77}$/;
const MAX_SAFE_SECONDS = 9007199254740991;

/** An own-key object whose keys are all in `allowed`. */
function onlyKeysOf(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return null;
  return value;
}

/** The `grant_session` intent (shared `OwnWalletGrantSessionIntentV1`): lower-case hex, decimal strings, strict keys. */
function decodeGrantSessionIntent(value: Record<string, unknown>, base: { v: 1; agentId?: string }): OwnWalletIntentResultV1 {
  if (typeof value.deviceId !== 'string' || !SESSION_DEVICE_ID.test(value.deviceId)) return bad('deviceId');
  if (typeof value.sessionPubKeyX !== 'string' || !SESSION_WORD.test(value.sessionPubKeyX)) return bad('sessionPubKeyX');
  if (typeof value.sessionPubKeyY !== 'string' || !SESSION_WORD.test(value.sessionPubKeyY)) return bad('sessionPubKeyY');
  if (typeof value.validUntil !== 'number' || !Number.isInteger(value.validUntil) || value.validUntil < 1 || value.validUntil > MAX_SAFE_SECONDS) return bad('validUntil');
  const intent: OwnWalletGrantSessionIntentV1 = {
    ...base,
    purpose: 'grant_session',
    deviceId: value.deviceId,
    sessionPubKeyX: value.sessionPubKeyX,
    sessionPubKeyY: value.sessionPubKeyY,
    validUntil: value.validUntil,
  };
  if (value.native !== undefined) {
    const n = onlyKeysOf(value.native, ['payee', 'perTxWei', 'totalWei', 'maxCount']);
    if (!n) return bad('native');
    if (typeof n.payee !== 'string' || !ADDRESS.test(n.payee)) return bad('native.payee');
    if (typeof n.perTxWei !== 'string' || !SESSION_UINT.test(n.perTxWei)) return bad('native.perTxWei');
    if (typeof n.totalWei !== 'string' || !SESSION_UINT.test(n.totalWei)) return bad('native.totalWei');
    if (BigInt(n.perTxWei) > BigInt(n.totalWei)) return bad('native.perTxWei');
    if (typeof n.maxCount !== 'number' || !Number.isInteger(n.maxCount) || n.maxCount < 1 || n.maxCount > 1000) return bad('native.maxCount');
    intent.native = { payee: n.payee, perTxWei: n.perTxWei, totalWei: n.totalWei, maxCount: n.maxCount };
  }
  if (value.token !== undefined) {
    const t = onlyKeysOf(value.token, ['payee', 'perTransfer', 'total']);
    if (!t) return bad('token');
    if (typeof t.payee !== 'string' || !ADDRESS.test(t.payee)) return bad('token.payee');
    if (typeof t.perTransfer !== 'string' || !SESSION_UINT.test(t.perTransfer)) return bad('token.perTransfer');
    if (typeof t.total !== 'string' || !SESSION_UINT.test(t.total)) return bad('token.total');
    if (BigInt(t.perTransfer) > BigInt(t.total)) return bad('token.perTransfer');
    intent.token = { payee: t.payee, perTransfer: t.perTransfer, total: t.total };
  }
  if (!intent.native && !intent.token) return bad('native');
  return { ok: true, value: intent };
}

const KEYS: Readonly<Record<string, readonly string[]>> = {
  deploy_setup: ['v', 'purpose', 'agentId', 'agentName', 'register', 'cardUrl', 'guardians', 'threshold', 'recoveryCode'],
  install_recovery: ['v', 'purpose', 'agentId', 'guardians', 'threshold', 'recoveryCode'],
  register: ['v', 'purpose', 'agentId', 'cardUrl'],
  revoke_registration: ['v', 'purpose', 'agentId', 'agentName'],
  set_guardians: ['v', 'purpose', 'agentId', 'guardians', 'threshold'],
  transfer: ['v', 'purpose', 'agentId', 'to', 'amount', 'asset'],
  revoke_session: ['v', 'purpose', 'agentId'],
  add_credential: ['v', 'purpose', 'agentId'],
  remove_credential: ['v', 'purpose', 'agentId'],
  recover: ['v', 'purpose', 'agentId'],
  grant_session: ['v', 'purpose', 'agentId', 'deviceId', 'sessionPubKeyX', 'sessionPubKeyY', 'validUntil', 'native', 'token'],
};

/** Strict decoder for the intent JSON (unknown fields refused). */
export function decodeIntentV1(value: unknown): OwnWalletIntentResultV1 {
  if (!isPlainObject(value)) return bad('$');
  if (value.v !== OWN_WALLET_INTENT_VERSION_V1) return bad('v');
  const purpose = value.purpose;
  if (typeof purpose !== 'string' || !(OWN_WALLET_PURPOSES_V1 as readonly string[]).includes(purpose)) return bad('purpose');
  const allowed = KEYS[purpose];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return bad(key);
  if ('agentId' in value && (typeof value.agentId !== 'string' || !UUID.test(value.agentId))) return bad('agentId');
  const base: { v: 1; agentId?: string } = { v: 1 };
  if (typeof value.agentId === 'string') base.agentId = value.agentId;

  const recovery = (): OwnWalletRecoveryIntentV1 | string => {
    const guardians = guardianList(value.guardians);
    if (!guardians) return 'guardians';
    const t = threshold(value.threshold);
    if (t === null) return 'threshold';
    if (typeof value.recoveryCode !== 'boolean') return 'recoveryCode';
    return { guardians, threshold: t, recoveryCode: value.recoveryCode };
  };

  switch (purpose as OwnWalletPurposeV1) {
    case 'deploy_setup': {
      const agentName = label(value.agentName, 60);
      if (!agentName) return bad('agentName');
      if (typeof value.register !== 'boolean') return bad('register');
      const r = recovery();
      if (typeof r === 'string') return bad(r);
      const intent: OwnWalletDeploySetupIntentV1 = { ...base, purpose: 'deploy_setup', agentName, register: value.register, ...r };
      if (value.register) {
        const cardUrl = label(value.cardUrl, 2048);
        if (!cardUrl || !/^https:\/\//.test(cardUrl)) return bad('cardUrl');
        intent.cardUrl = cardUrl;
      } else if ('cardUrl' in value) {
        return bad('cardUrl');
      }
      return { ok: true, value: intent };
    }
    case 'install_recovery': {
      const r = recovery();
      if (typeof r === 'string') return bad(r);
      return { ok: true, value: { ...base, purpose: 'install_recovery', ...r } };
    }
    case 'register': {
      const cardUrl = label(value.cardUrl, 2048);
      if (!cardUrl || !/^https:\/\//.test(cardUrl)) return bad('cardUrl');
      return { ok: true, value: { ...base, purpose: 'register', cardUrl } };
    }
    case 'revoke_registration': {
      const agentName = label(value.agentName, 60);
      if (!agentName) return bad('agentName');
      return { ok: true, value: { ...base, purpose: 'revoke_registration', agentName } };
    }
    case 'set_guardians': {
      const guardians = guardianList(value.guardians);
      if (!guardians) return bad('guardians');
      const t = threshold(value.threshold);
      if (t === null) return bad('threshold');
      return { ok: true, value: { ...base, purpose: 'set_guardians', guardians, threshold: t } };
    }
    case 'transfer': {
      if (typeof value.to !== 'string' || !ADDRESS.test(value.to)) return bad('to');
      if (typeof value.amount !== 'string' || !AMOUNT.test(value.amount)) return bad('amount');
      if (value.asset !== 'native' && value.asset !== 'token') return bad('asset');
      return { ok: true, value: { ...base, purpose: 'transfer', to: value.to, amount: value.amount, asset: value.asset } };
    }
    case 'grant_session':
      return decodeGrantSessionIntent(value, base);
    default:
      return { ok: true, value: { ...base, purpose: purpose as 'revoke_session' | 'add_credential' | 'remove_credential' | 'recover' } };
  }
}

export interface OwnWalletWalletLinkV1 {
  requestRef: string;
  walletToken: string;
  /** `null` when the link carries no intent (allowed only for purposes with no consistency column). */
  intent: OwnWalletIntentV1 | null;
}

export type OwnWalletLinkResultV1 = { ok: true; value: OwnWalletWalletLinkV1 } | { ok: false; reasonCode: 'link_invalid' | 'intent_invalid' | 'intent_purpose_not_supported'; field: string };

const REQUEST_REF = /^owr_[0-9a-f]{32}$/;
const WALLET_TOKEN = /^owt_[A-Za-z0-9_-]{43}$/;

/**
 * Reads the approve link from `location.hash` ONLY (pass `window.location.hash`). Each key at most once; nothing but
 * `ref`, `t` and `intent`.
 */
export function readWalletLinkV1(hash: unknown): OwnWalletLinkResultV1 {
  if (typeof hash !== 'string' || !hash.startsWith('#') || hash.length > MAX_ENCODED + 200) return { ok: false, reasonCode: 'link_invalid', field: '#' };
  const params = new URLSearchParams(hash.slice(1));
  const keys = Array.from(params.keys());
  for (const key of keys) {
    if (key !== 'ref' && key !== 't' && key !== 'intent') return { ok: false, reasonCode: 'link_invalid', field: key };
    if (params.getAll(key).length !== 1) return { ok: false, reasonCode: 'link_invalid', field: key };
  }
  const requestRef = params.get('ref');
  const walletToken = params.get('t');
  if (!requestRef || !REQUEST_REF.test(requestRef)) return { ok: false, reasonCode: 'link_invalid', field: 'ref' };
  if (!walletToken || !WALLET_TOKEN.test(walletToken)) return { ok: false, reasonCode: 'link_invalid', field: 't' };
  const encoded = params.get('intent');
  if (encoded === null) return { ok: true, value: { requestRef, walletToken, intent: null } };
  const text = base64UrlToText(encoded);
  if (text === null) return { ok: false, reasonCode: 'intent_invalid', field: 'intent' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reasonCode: 'intent_invalid', field: 'intent' };
  }
  const intent = decodeIntentV1(json);
  if (intent.ok === false) return intent;
  return { ok: true, value: { requestRef, walletToken, intent: intent.value } };
}

/** The main site builds the link: the intent goes into the fragment, never into a request. */
export function walletApproveUrlV1(walletOrigin: string, requestRef: string, walletToken: string, intent: OwnWalletIntentV1): string {
  const fragment = new URLSearchParams();
  fragment.set('ref', requestRef);
  fragment.set('t', walletToken);
  fragment.set('intent', textToBase64Url(JSON.stringify(intent)));
  // The wallet origin is exported with `trailingSlash: true`.
  return `${walletOrigin}/wallet/approve/#${fragment.toString()}`;
}
