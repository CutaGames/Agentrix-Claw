/**
 * L8-6 own wallet: the links between the main site (or the phone) and the wallet origin pages (design W1.2, 5.1, 5.2,
 * 6a). Everything a wallet origin page needs travels in the URL fragment, which is never sent in a request and never
 * in a Referer, so it does not pass through our server.
 *
 * - `create`: `#ref=<requestRef>&t=<walletToken>&kind=agent|owner_vault[&agent=<uuid>&name=<display name>]`. The
 *   request ref and token come from `POST /api/agent-own-wallet/accounts/create-requests`; the Agent id and name are
 *   what this device writes into L next to the new account.
 * - `receive`, `badge`, `verify-device`: `#chainId=<n>&account=<0x…>&kind=…[&agent=<uuid>]`; `verify-device` may also
 *   carry the phone's one-time `state` (6a), which the page only ever puts back into the `agentrix://` deep link.
 * - Pages are exported with `trailingSlash: true`, so the links end in `/`.
 * - Each key at most once; nothing outside the page's own key list.
 */
import { OWN_WALLET_ACCOUNT_KINDS_V1, ownWalletChainAllowedV1, type OwnWalletAccountKindV1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';

const REQUEST_REF = /^owr_[0-9a-f]{32}$/;
const WALLET_TOKEN = /^owt_[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAIN = /^[1-9][0-9]{0,9}$/;
const STATE = /^[A-Za-z0-9_-]{22,128}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_HASH = 1024;
const WALLET_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;

export type OwnWalletLinkProblemV1 = { ok: false; reasonCode: 'link_invalid'; field: string };
const bad = (field: string): OwnWalletLinkProblemV1 => ({ ok: false, reasonCode: 'link_invalid', field });

function fragmentParams(hash: unknown, allowed: readonly string[]): URLSearchParams | OwnWalletLinkProblemV1 {
  if (typeof hash !== 'string' || !hash.startsWith('#') || hash.length > MAX_HASH) return bad('#');
  const params = new URLSearchParams(hash.slice(1));
  for (const key of Array.from(params.keys())) {
    if (!allowed.includes(key)) return bad(key);
    if (params.getAll(key).length !== 1) return bad(key);
  }
  return params;
}

const isProblem = (v: unknown): v is OwnWalletLinkProblemV1 => typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;

function kindOf(raw: string | null): OwnWalletAccountKindV1 | null {
  return raw !== null && (OWN_WALLET_ACCOUNT_KINDS_V1 as readonly string[]).includes(raw) ? (raw as OwnWalletAccountKindV1) : null;
}

/** An Agent account carries exactly one Agent id; a vault carries none. */
function agentOf(params: URLSearchParams, kind: OwnWalletAccountKindV1): { agentId?: string } | OwnWalletLinkProblemV1 {
  const agent = params.get('agent');
  if (kind === 'agent') return agent !== null && UUID.test(agent) ? { agentId: agent } : bad('agent');
  return agent === null ? {} : bad('agent');
}

export interface OwnWalletCreateLinkV1 {
  requestRef: string;
  walletToken: string;
  kind: OwnWalletAccountKindV1;
  agentId?: string;
  agentName?: string;
}

/** Reads the create link from `location.hash` only. */
export function readCreateLinkV1(hash: unknown): { ok: true; value: OwnWalletCreateLinkV1 } | OwnWalletLinkProblemV1 {
  const params = fragmentParams(hash, ['ref', 't', 'kind', 'agent', 'name']);
  if (isProblem(params)) return params;
  const requestRef = params.get('ref');
  const walletToken = params.get('t');
  if (!requestRef || !REQUEST_REF.test(requestRef)) return bad('ref');
  if (!walletToken || !WALLET_TOKEN.test(walletToken)) return bad('t');
  const kind = kindOf(params.get('kind'));
  if (!kind) return bad('kind');
  const agent = agentOf(params, kind);
  if (isProblem(agent)) return agent;
  const value: OwnWalletCreateLinkV1 = { requestRef, walletToken, kind, ...agent };
  const name = params.get('name');
  if (name !== null) {
    if (kind !== 'agent' || name.length === 0 || name.length > 60 || CONTROL.test(name)) return bad('name');
    value.agentName = name;
  }
  return { ok: true, value };
}

/** The main site builds the create link (fragment only). */
export function walletCreateUrlV1(walletOrigin: string, link: OwnWalletCreateLinkV1): string {
  const fragment = new URLSearchParams();
  fragment.set('ref', link.requestRef);
  fragment.set('t', link.walletToken);
  fragment.set('kind', link.kind);
  if (link.kind === 'agent' && link.agentId) fragment.set('agent', link.agentId);
  if (link.kind === 'agent' && link.agentName) fragment.set('name', link.agentName);
  return `${walletOrigin}/wallet/create/#${fragment.toString()}`;
}

/**
 * S6 (5.4 step 2): the recover link the main site opens after `POST /recovery/requests`. Same keys as the create link
 * (`ref`, `t`, `kind`, `agent`, `name`): the kind and Agent go into this device's L next to the new key.
 */
export function walletRecoverUrlV1(walletOrigin: string, link: OwnWalletCreateLinkV1): string {
  return walletCreateUrlV1(walletOrigin, link).replace('/wallet/create/#', '/wallet/recover/#');
}

/** Reads the recover link from `location.hash` only. */
export const readRecoverLinkV1 = readCreateLinkV1;

/** S6 (5.4 step 5): the guardian link carries only the request ref and the one-time token. */
export function walletGuardianUrlV1(walletOrigin: string, requestRef: string, walletToken: string): string | null {
  if (typeof walletOrigin !== 'string' || !WALLET_ORIGIN.test(walletOrigin)) return null;
  if (!REQUEST_REF.test(String(requestRef)) || !WALLET_TOKEN.test(String(walletToken))) return null;
  const fragment = new URLSearchParams();
  fragment.set('ref', requestRef);
  fragment.set('t', walletToken);
  return `${walletOrigin}/wallet/guardian/#${fragment.toString()}`;
}

/** Reads the guardian link from `location.hash` only. */
export function readGuardianLinkV1(hash: unknown): { ok: true; value: { requestRef: string; walletToken: string } } | OwnWalletLinkProblemV1 {
  const params = fragmentParams(hash, ['ref', 't']);
  if (isProblem(params)) return params;
  const requestRef = params.get('ref');
  const walletToken = params.get('t');
  if (!requestRef || !REQUEST_REF.test(requestRef)) return bad('ref');
  if (!walletToken || !WALLET_TOKEN.test(walletToken)) return bad('t');
  return { ok: true, value: { requestRef, walletToken } };
}

export type OwnWalletAccountPageV1 = 'receive' | 'badge' | 'verify-device';

export interface OwnWalletAccountLinkV1 {
  chainId: OwnWalletChainIdV1;
  /** Lower case. */
  account: string;
  kind: OwnWalletAccountKindV1;
  agentId?: string;
  /** `verify-device` only: the phone's one-time state (6a). */
  state?: string;
}

/** Reads the account link of one page from `location.hash` only. */
export function readAccountLinkV1(hash: unknown, page: OwnWalletAccountPageV1): { ok: true; value: OwnWalletAccountLinkV1 } | OwnWalletLinkProblemV1 {
  const keys = page === 'verify-device' ? ['chainId', 'account', 'kind', 'agent', 'state'] : ['chainId', 'account', 'kind', 'agent'];
  const params = fragmentParams(hash, keys);
  if (isProblem(params)) return params;
  const rawChain = params.get('chainId');
  if (rawChain === null || !CHAIN.test(rawChain)) return bad('chainId');
  const chainId = Number(rawChain);
  if (!ownWalletChainAllowedV1(chainId)) return bad('chainId');
  const account = params.get('account');
  if (account === null || !/^0x[0-9a-fA-F]{40}$/.test(account)) return bad('account');
  const kind = kindOf(params.get('kind'));
  if (!kind) return bad('kind');
  const agent = agentOf(params, kind);
  if (isProblem(agent)) return agent;
  const value: OwnWalletAccountLinkV1 = { chainId, account: account.toLowerCase(), kind, ...agent };
  const state = params.get('state');
  if (state !== null) {
    if (!STATE.test(state)) return bad('state');
    value.state = state;
  }
  return { ok: true, value };
}

/** The main site (or the phone) builds the link of one account page. */
export function walletAccountUrlV1(walletOrigin: string, page: OwnWalletAccountPageV1, link: OwnWalletAccountLinkV1): string | null {
  // No configured wallet origin (or not a plain https origin): no link at all, so nothing points anywhere else.
  if (typeof walletOrigin !== 'string' || !WALLET_ORIGIN.test(walletOrigin)) return null;
  if (!ownWalletChainAllowedV1(link.chainId) || !ADDRESS.test(String(link.account).toLowerCase())) return null;
  if (link.kind === 'agent' ? !link.agentId || !UUID.test(link.agentId) : link.agentId !== undefined) return null;
  const fragment = new URLSearchParams();
  fragment.set('chainId', String(link.chainId));
  fragment.set('account', link.account.toLowerCase());
  fragment.set('kind', link.kind);
  if (link.kind === 'agent' && link.agentId) fragment.set('agent', link.agentId);
  if (page === 'verify-device' && link.state !== undefined) {
    if (!STATE.test(link.state)) return null;
    fragment.set('state', link.state);
  }
  return `${walletOrigin}/wallet/${page}/#${fragment.toString()}`;
}
