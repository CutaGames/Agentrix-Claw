/**
 * L8-6 own wallet, phone side: binds the pure services (`ownWallet.ts`, `ownWalletVerifyState.ts`) to the app's HTTP,
 * SecureStore and random bytes. Nothing here decides anything; it only carries the answers (status and body, like the
 * main site's `fetchOwnWalletMainHttpV1`, because `apiFetch` throws away the status and the error code).
 */
import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';
import { getApiConfig } from './api';
import { readOwnWalletCardViewV1, type OwnWalletHttpV1 } from './ownWallet';
import type { AcceptVerifiedDepsV1, VerifyStateDepsV1, VerifyStateStoreV1 } from './ownWalletVerifyState';

/** The signed-in owner's bearer token and the API base, JSON in and out; a body that is not JSON is `null`. */
export const ownWalletHttpV1: OwnWalletHttpV1 = async (method, path, body) => {
  const cfg = getApiConfig();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  const res = await fetch(`${cfg.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
};

/** The one-time states and the check records stay on this device (never the cloud keychain). */
export const ownWalletSecureStoreV1: VerifyStateStoreV1 = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

export function ownWalletVerifyDepsV1(): VerifyStateDepsV1 {
  return { store: ownWalletSecureStoreV1, random: (length) => getRandomBytesAsync(length), now: () => Date.now() };
}

/** Deps of the deep-link screen: the card read goes through the same HTTP, and only a live account counts. */
export function ownWalletAcceptDepsV1(): AcceptVerifiedDepsV1 {
  return {
    ...ownWalletVerifyDepsV1(),
    readCard: async (agentId) => {
      const read = await readOwnWalletCardViewV1(ownWalletHttpV1, agentId);
      if (read.kind !== 'ok' || read.view === null) return null;
      return { status: read.view.status, chainId: read.view.chainId, account: read.view.account };
    },
  };
}
