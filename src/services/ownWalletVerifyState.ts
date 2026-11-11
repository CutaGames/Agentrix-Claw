/**
 * L8-6 own wallet, phone side: the one-time `state` of the address check (design 6a, share gate G condition 3, R2-M3,
 * P22). Pure: the store (SecureStore), the random bytes and the clock are injected; no React Native import.
 *
 * Why this is enough: `agentrix://` is open to every app, so a link alone proves nothing. The `state` is made on the
 * phone, goes only into the fragment of the wallet origin link (no request, no Referer carries it, so the backend never
 * sees it) and only comes back from the wallet page after that page checked the address on this device. The phone
 * accepts a link only for a `state` it is still waiting for: known, within 10 minutes, never used, and with the account
 * and chain it stored, which must also be the ones of the card now. The record is deleted the moment it is found, so
 * every outcome after that (accepted or not) spends the `state`; a replay finds nothing.
 */
import { ownWalletChainAllowedV1 } from '../../shared/types/agent-own-wallet';
import { readVerifiedParamsV1 } from './ownWallet';

export const VERIFY_STATE_TTL_MS_V1 = 10 * 60 * 1000;
export const VERIFY_STATE_KEY_PREFIX_V1 = 'ownWallet.verifyState.';
export const VERIFIED_KEY_PREFIX_V1 = 'ownWallet.verified.';

export interface VerifyStateStoreV1 {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface VerifyStateDepsV1 {
  store: VerifyStateStoreV1;
  /** 32 bytes of the platform's CSPRNG (`expo-crypto` `getRandomBytesAsync`). */
  random: (length: number) => Promise<Uint8Array> | Uint8Array;
  now: () => number;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding (no `Buffer` or `btoa` in React Native). */
export function base64UrlV1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64URL[b0 >> 2] + B64URL[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64URL[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64URL[b2 & 63];
  }
  return out;
}

const stateKey = (state: string): string => `${VERIFY_STATE_KEY_PREFIX_V1}${state}`;
const verifiedKey = (chainId: number, account: string): string => `${VERIFIED_KEY_PREFIX_V1}${chainId}.${account.toLowerCase()}`;

export type BeginVerifyResultV1 = { ok: true; state: string } | { ok: false; reason: 'input_invalid' | 'random_unavailable' | 'store_unavailable' };

/** Makes and stores the `state` for one address check (the caller then opens the wallet origin link with it). */
export async function beginVerifyV1(input: { agentId: string; account: string; chainId: number }, deps: VerifyStateDepsV1): Promise<BeginVerifyResultV1> {
  if (!UUID.test(String(input.agentId)) || !ADDRESS.test(String(input.account)) || !ownWalletChainAllowedV1(input.chainId)) return { ok: false, reason: 'input_invalid' };
  let bytes: Uint8Array;
  try {
    bytes = await deps.random(32);
  } catch {
    return { ok: false, reason: 'random_unavailable' };
  }
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return { ok: false, reason: 'random_unavailable' };
  const state = base64UrlV1(bytes);
  const record = { agentId: input.agentId, account: input.account.toLowerCase(), chainId: input.chainId, createdAt: deps.now() };
  try {
    await deps.store.setItem(stateKey(state), JSON.stringify(record));
  } catch {
    return { ok: false, reason: 'store_unavailable' };
  }
  return { ok: true, state };
}

export type AcceptVerifiedResultV1 =
  | { ok: true; agentId: string; account: string; chainId: number }
  | { ok: false; reason: 'link_invalid' | 'state_unknown' | 'state_expired' | 'account_mismatch' | 'card_unavailable' | 'card_mismatch' | 'store_unavailable' };

/** What the card says now about an Agent's own account; `null` when it could not be read. */
export type VerifyCardAccountV1 = { status: string; chainId?: number; account?: string } | null;

export interface AcceptVerifiedDepsV1 extends VerifyStateDepsV1 {
  /** Reads the card of the Agent the stored record names (never an id from the link). */
  readCard: (agentId: string) => Promise<VerifyCardAccountV1>;
}

// States being checked in this process: a link delivered twice at once (initial URL and the event) must not pass twice.
const inFlight = new Set<string>();

/**
 * Accepts the deep link's route params. Order: shape of the link → the record (spent here) → age → account and chain
 * against the record → the card now → write the check. Nothing is written unless every step passes.
 */
export async function acceptVerifiedLinkV1(params: unknown, deps: AcceptVerifiedDepsV1): Promise<AcceptVerifiedResultV1> {
  const link = readVerifiedParamsV1(params);
  if (link.ok === false) return { ok: false, reason: 'link_invalid' };
  const { state, account, chainId } = link.value;
  if (inFlight.has(state)) return { ok: false, reason: 'state_unknown' };
  inFlight.add(state);
  try {
    let raw: string | null;
    try {
      raw = await deps.store.getItem(stateKey(state));
    } catch {
      return { ok: false, reason: 'store_unavailable' };
    }
    if (raw === null) return { ok: false, reason: 'state_unknown' };
    // Spend it before any further check; if it cannot be deleted nothing is accepted.
    try {
      await deps.store.deleteItem(stateKey(state));
    } catch {
      return { ok: false, reason: 'store_unavailable' };
    }
    let record: { agentId?: unknown; account?: unknown; chainId?: unknown; createdAt?: unknown };
    try {
      record = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'state_unknown' };
    }
    if (typeof record !== 'object' || record === null) return { ok: false, reason: 'state_unknown' };
    if (typeof record.agentId !== 'string' || !UUID.test(record.agentId) || typeof record.account !== 'string' || typeof record.chainId !== 'number' || typeof record.createdAt !== 'number') return { ok: false, reason: 'state_unknown' };
    const age = deps.now() - record.createdAt;
    if (!(age >= 0) || age > VERIFY_STATE_TTL_MS_V1) return { ok: false, reason: 'state_expired' };
    if (record.account.toLowerCase() !== account || record.chainId !== chainId) return { ok: false, reason: 'account_mismatch' };
    let card: VerifyCardAccountV1;
    try {
      card = await deps.readCard(record.agentId);
    } catch {
      card = null;
    }
    if (card === null) return { ok: false, reason: 'card_unavailable' };
    if ((card.status !== 'pending' && card.status !== 'active') || card.chainId !== chainId || typeof card.account !== 'string' || card.account.toLowerCase() !== account) return { ok: false, reason: 'card_mismatch' };
    try {
      await deps.store.setItem(verifiedKey(chainId, account), JSON.stringify({ agentId: record.agentId, verifiedAt: deps.now() }));
    } catch {
      return { ok: false, reason: 'store_unavailable' };
    }
    return { ok: true, agentId: record.agentId, account, chainId };
  } finally {
    inFlight.delete(state);
  }
}

/** True when this device recorded a check for exactly this account on this chain. Unreadable is false. */
export async function isDeviceVerifiedV1(chainId: number, account: string, deps: { store: VerifyStateStoreV1 }): Promise<boolean> {
  if (!ownWalletChainAllowedV1(chainId) || !ADDRESS.test(String(account))) return false;
  try {
    const raw = await deps.store.getItem(verifiedKey(chainId, account));
    if (raw === null) return false;
    const value = JSON.parse(raw);
    return typeof value === 'object' && value !== null && typeof value.agentId === 'string';
  } catch {
    return false;
  }
}
