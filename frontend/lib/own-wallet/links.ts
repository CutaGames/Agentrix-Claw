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

function fragmentParams(hash: unknown, allowed: readonly string[], max: number = MAX_HASH): URLSearchParams | OwnWalletLinkProblemV1 {
  if (typeof hash !== 'string' || !hash.startsWith('#') || hash.length > max) return bad('#');
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

// ---------------------------------------------------------------------------------------------------------------------
// S11c: the setup wizard (design 5.1 step 3-5). The wallet origin has no login, so it cannot ask the backend for a
// UserOp. The wizard only makes the recovery means (a recovery code made on that page and / or guardians) and goes back
// to the main site's fixed page `/own-wallet/setup`, which prepares the UserOp with the owner's login and opens the
// approve page. Both directions carry public data only (addresses, a threshold, the Agent id and name) plus a one-time
// `s` that the main site stored in that tab before it left; nothing secret is ever in a link.

export const OWN_WALLET_SETUP_MODES_V1 = ['deploy_setup', 'install_recovery'] as const;
export type OwnWalletSetupModeV1 = (typeof OWN_WALLET_SETUP_MODES_V1)[number];

/** The main site's fixed page; the wallet origin builds the way back from the pinned main origin only, never from a link. */
export const OWN_WALLET_MAIN_SETUP_PATH_V1 = '/own-wallet/setup';

const SETUP_MAX_HASH = 4096;
const SETUP_MAX_NAME = 60;
const SETUP_MAX_GUARDIANS = 16;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

function setupModeOf(raw: string | null): OwnWalletSetupModeV1 | null {
  return raw !== null && (OWN_WALLET_SETUP_MODES_V1 as readonly string[]).includes(raw) ? (raw as OwnWalletSetupModeV1) : null;
}

/** An Agent name the links can carry: control characters become spaces, trimmed, at most 60 UTF-16 units; `undefined` when nothing is left. */
export function setupAgentNameV1(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let cut = '';
  // Whole characters only, and at most 60 UTF-16 units (the length the intent and the links check).
  for (const ch of raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()) {
    if (cut.length + ch.length > SETUP_MAX_NAME) break;
    cut += ch;
  }
  cut = cut.trim();
  return cut.length > 0 ? cut : undefined;
}

function nameOf(params: URLSearchParams): { agentName?: string } | OwnWalletLinkProblemV1 {
  const name = params.get('name');
  if (name === null) return {};
  return name.length > 0 && name.length <= SETUP_MAX_NAME && !CONTROL.test(name) ? { agentName: name } : bad('name');
}

export interface OwnWalletSetupLinkV1 {
  chainId: OwnWalletChainIdV1;
  /** Lower case. */
  account: string;
  agentId: string;
  agentName?: string;
  mode: OwnWalletSetupModeV1;
  /** The main site offers to register in the same signature; only with `deploy_setup`. */
  register: boolean;
  state: string;
}

/** Reads the wizard link of the wallet origin from `location.hash` only. */
export function readSetupLinkV1(hash: unknown): { ok: true; value: OwnWalletSetupLinkV1 } | OwnWalletLinkProblemV1 {
  const params = fragmentParams(hash, ['chainId', 'account', 'kind', 'agent', 'name', 'mode', 'reg', 's'], SETUP_MAX_HASH);
  if (isProblem(params)) return params;
  const rawChain = params.get('chainId');
  if (rawChain === null || !CHAIN.test(rawChain)) return bad('chainId');
  const chainId = Number(rawChain);
  if (!ownWalletChainAllowedV1(chainId)) return bad('chainId');
  const account = params.get('account');
  if (account === null || !/^0x[0-9a-fA-F]{40}$/.test(account)) return bad('account');
  if (params.get('kind') !== 'agent') return bad('kind');
  const agentId = params.get('agent');
  if (agentId === null || !UUID.test(agentId)) return bad('agent');
  const mode = setupModeOf(params.get('mode'));
  if (!mode) return bad('mode');
  const reg = params.get('reg');
  if (reg !== '0' && reg !== '1') return bad('reg');
  if (reg === '1' && mode !== 'deploy_setup') return bad('reg');
  const state = params.get('s');
  if (state === null || !STATE.test(state)) return bad('s');
  const name = nameOf(params);
  if (isProblem(name)) return name;
  return { ok: true, value: { chainId, account: account.toLowerCase(), agentId, ...name, mode, register: reg === '1', state } };
}

/** The main site builds the wizard link. `null` when anything is not of the allowed shape (then there is no link at all). */
export function walletSetupUrlV1(walletOrigin: string, link: OwnWalletSetupLinkV1): string | null {
  if (typeof walletOrigin !== 'string' || !WALLET_ORIGIN.test(walletOrigin)) return null;
  if (!ownWalletChainAllowedV1(link.chainId) || !ADDRESS.test(String(link.account).toLowerCase())) return null;
  if (!UUID.test(String(link.agentId)) || !setupModeOf(link.mode)) return null;
  if (typeof link.register !== 'boolean' || (link.register && link.mode !== 'deploy_setup')) return null;
  if (typeof link.state !== 'string' || !STATE.test(link.state)) return null;
  if (link.agentName !== undefined && (link.agentName.length === 0 || link.agentName.length > SETUP_MAX_NAME || CONTROL.test(link.agentName))) return null;
  const fragment = new URLSearchParams();
  fragment.set('chainId', String(link.chainId));
  fragment.set('account', link.account.toLowerCase());
  fragment.set('kind', 'agent');
  fragment.set('agent', link.agentId);
  if (link.agentName !== undefined) fragment.set('name', link.agentName);
  fragment.set('mode', link.mode);
  fragment.set('reg', link.register ? '1' : '0');
  fragment.set('s', link.state);
  return `${walletOrigin}/wallet/setup/#${fragment.toString()}`;
}

/** What the wizard hands back to the main site. All of it is public; the recovery code itself is not in it. */
export interface OwnWalletSetupReturnV1 {
  state: string;
  agentId: string;
  agentName?: string;
  mode: OwnWalletSetupModeV1;
  register: boolean;
  /** The recovery code's address is one of `guardians`. */
  recoveryCode: boolean;
  threshold: number;
  /** Lower case, strictly ascending, no zero address, 1-16. */
  guardians: string[];
}

/** 1-16 lower-case non-zero addresses in strictly ascending order (the order the chain call is encoded in). */
function guardianArrayOk(list: unknown): list is string[] {
  if (!Array.isArray(list) || list.length === 0 || list.length > SETUP_MAX_GUARDIANS) return false;
  for (let i = 0; i < list.length; i += 1) {
    const g: unknown = list[i];
    if (typeof g !== 'string' || !ADDRESS.test(g) || g === ZERO_ADDRESS) return false;
    if (i > 0 && !((list[i - 1] as string) < g)) return false;
  }
  return true;
}

function guardianListOfReturn(raw: string | null): string[] | null {
  if (raw === null || raw.length === 0) return null;
  const list = raw.split(',');
  return guardianArrayOk(list) ? list : null;
}

function returnProblem(v: OwnWalletSetupReturnV1): string | null {
  if (typeof v.state !== 'string' || !STATE.test(v.state)) return 's';
  if (typeof v.agentId !== 'string' || !UUID.test(v.agentId)) return 'agent';
  if (v.agentName !== undefined && (typeof v.agentName !== 'string' || v.agentName.length === 0 || v.agentName.length > SETUP_MAX_NAME || CONTROL.test(v.agentName))) return 'name';
  if (!setupModeOf(v.mode)) return 'mode';
  if (typeof v.register !== 'boolean' || (v.register && v.mode !== 'deploy_setup')) return 'reg';
  if (typeof v.recoveryCode !== 'boolean') return 'code';
  if (!guardianArrayOk(v.guardians)) return 'g';
  if (!Number.isInteger(v.threshold) || v.threshold < 1 || v.threshold > v.guardians.length) return 't';
  return null;
}

/** The wallet origin builds the way back to the main site; `origin` is the pinned main origin. `null` when anything is not of the allowed shape. */
export function walletSetupReturnUrlV1(mainOrigin: string, value: OwnWalletSetupReturnV1): string | null {
  if (typeof mainOrigin !== 'string' || !WALLET_ORIGIN.test(mainOrigin)) return null;
  if (returnProblem(value) !== null) return null;
  const fragment = new URLSearchParams();
  fragment.set('s', value.state);
  fragment.set('agent', value.agentId);
  if (value.agentName !== undefined) fragment.set('name', value.agentName);
  fragment.set('mode', value.mode);
  fragment.set('reg', value.register ? '1' : '0');
  fragment.set('code', value.recoveryCode ? '1' : '0');
  fragment.set('t', String(value.threshold));
  fragment.set('g', value.guardians.join(','));
  // `URLSearchParams` writes the commas as %2C; both ends read them back.
  return `${mainOrigin}${OWN_WALLET_MAIN_SETUP_PATH_V1}#${fragment.toString()}`;
}

/** The main site reads what came back from the wizard. */
export function readSetupReturnV1(hash: unknown): { ok: true; value: OwnWalletSetupReturnV1 } | OwnWalletLinkProblemV1 {
  const params = fragmentParams(hash, ['s', 'agent', 'name', 'mode', 'reg', 'code', 't', 'g'], SETUP_MAX_HASH);
  if (isProblem(params)) return params;
  const state = params.get('s');
  if (state === null || !STATE.test(state)) return bad('s');
  const agentId = params.get('agent');
  if (agentId === null || !UUID.test(agentId)) return bad('agent');
  const name = nameOf(params);
  if (isProblem(name)) return name;
  const mode = setupModeOf(params.get('mode'));
  if (!mode) return bad('mode');
  const reg = params.get('reg');
  if (reg !== '0' && reg !== '1') return bad('reg');
  if (reg === '1' && mode !== 'deploy_setup') return bad('reg');
  const code = params.get('code');
  if (code !== '0' && code !== '1') return bad('code');
  const rawThreshold = params.get('t');
  if (rawThreshold === null || !/^[1-9][0-9]?$/.test(rawThreshold)) return bad('t');
  const threshold = Number(rawThreshold);
  const guardians = guardianListOfReturn(params.get('g'));
  if (!guardians) return bad('g');
  if (threshold > guardians.length) return bad('t');
  return { ok: true, value: { state, agentId, ...name, mode, register: reg === '1', recoveryCode: code === '1', threshold, guardians } };
}

export interface OwnWalletSetupStartV1 {
  agentId: string;
  agentName?: string;
}

/** The main site's own start link (`#agent=…&name=…`); the return link carries an `s`, so this reader refuses it. */
export function readSetupStartV1(hash: unknown): { ok: true; value: OwnWalletSetupStartV1 } | OwnWalletLinkProblemV1 {
  const params = fragmentParams(hash, ['agent', 'name'], SETUP_MAX_HASH);
  if (isProblem(params)) return params;
  const agentId = params.get('agent');
  if (agentId === null || !UUID.test(agentId)) return bad('agent');
  const name = nameOf(params);
  if (isProblem(name)) return name;
  return { ok: true, value: { agentId, ...name } };
}

/** A same-site path for the buttons of the main site's pages; `null` for an id that is not a UUID. */
export function mainSetupStartPathV1(agentId: string, agentName?: string): string | null {
  if (typeof agentId !== 'string' || !UUID.test(agentId)) return null;
  const fragment = new URLSearchParams();
  fragment.set('agent', agentId);
  const name = setupAgentNameV1(agentName);
  if (name !== undefined) fragment.set('name', name);
  return `${OWN_WALLET_MAIN_SETUP_PATH_V1}#${fragment.toString()}`;
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
