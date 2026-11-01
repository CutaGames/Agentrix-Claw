/**
 * L8-6 own wallet: "this device checked this address" (design W1.2, 6a condition 3). Only the wallet origin's own L
 * decides: the record for `(chainId, account)` exists, belongs to the same kind and Agent, and the address computed
 * from its key and index equals the account. The receive page, the badge and the verify-device page all use this.
 */
import type { OwnWalletAccountKindV1 } from '../../../shared/types/agent-own-wallet';
import { displayableAccountAddressV1, localAccountOfV1 } from './kernel-address';
import { findLocalAccountV1, ownWalletAddressKeyOfV1, type OwnWalletLocalRecordV1 } from './local-store';
import type { OwnWalletAccountLinkV1 } from './links';

export type OwnWalletDeviceCheckProblemV1 = 'chain_not_configured' | 'chain_mismatch' | 'not_checked_on_this_device' | 'kind_mismatch' | 'agent_mismatch' | 'address_mismatch';

export type OwnWalletDeviceCheckV1 = { ok: true; record: OwnWalletLocalRecordV1; address: string } | { ok: false; reasonCode: OwnWalletDeviceCheckProblemV1 };

export function deviceCheckedAccountV1(records: readonly OwnWalletLocalRecordV1[], link: OwnWalletAccountLinkV1, configuredChainId: number | null): OwnWalletDeviceCheckV1 {
  if (configuredChainId === null || configuredChainId === undefined) return { ok: false, reasonCode: 'chain_not_configured' };
  if (link.chainId !== configuredChainId) return { ok: false, reasonCode: 'chain_mismatch' };
  const record = findLocalAccountV1(records, link.chainId, link.account);
  if (!record) return { ok: false, reasonCode: 'not_checked_on_this_device' };
  if (record.kind !== link.kind) return { ok: false, reasonCode: 'kind_mismatch' };
  if (link.kind === 'agent' && record.agentId !== link.agentId) return { ok: false, reasonCode: 'agent_mismatch' };
  // A record a recovery added (S6) computes its address from the root key it stores.
  const address = displayableAccountAddressV1(link.account, { kind: record.kind, saltIndex: record.saltIndex, ...ownWalletAddressKeyOfV1(record) });
  if (address === null) return { ok: false, reasonCode: 'address_mismatch' };
  return { ok: true, record, address };
}

/** Salt indexes searched when a device derives a known key's other accounts (an owner has few accounts per chain). */
export const OWN_WALLET_SALT_SEARCH_LIMIT_V1 = 256;

/** The salt index at which `key` gives `account` for `kind`, or `null`. */
export function saltIndexOfV1(kind: OwnWalletAccountKindV1, key: { pubKeyX: string; pubKeyY: string }, account: string, limit = OWN_WALLET_SALT_SEARCH_LIMIT_V1): number | null {
  const target = String(account).toLowerCase();
  for (let i = 0; i < limit; i += 1) {
    const mine = localAccountOfV1({ kind, saltIndex: i, pubKeyX: key.pubKeyX, pubKeyY: key.pubKeyY });
    if (!mine) return null;
    if (mine.accountAddress === target) return i;
  }
  return null;
}

/**
 * The same device, another account of a key it already holds (the server made the account from the owner's wallet
 * passkey through `/accounts/agent` or `/accounts/vault`): a key in L on this chain gives `link.account` at some index.
 * The key was created or checked on this device, so no signature is needed. Returns the record to write, or `null`.
 */
export function sameKeyRecordV1(records: readonly OwnWalletLocalRecordV1[], link: OwnWalletAccountLinkV1, createdAt: string): OwnWalletLocalRecordV1 | null {
  const seen = new Set<string>();
  for (const r of records) {
    if (r.chainId !== link.chainId) continue;
    const id = `${r.pubKeyX}:${r.pubKeyY}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const saltIndex = saltIndexOfV1(link.kind, r, link.account);
    if (saltIndex === null) continue;
    const record: OwnWalletLocalRecordV1 = {
      chainId: link.chainId,
      kind: link.kind,
      accountAddress: link.account,
      saltIndex,
      credentialId: r.credentialId,
      pubKeyX: r.pubKeyX,
      pubKeyY: r.pubKeyY,
      createdAt,
    };
    if (link.kind === 'agent') record.agentId = link.agentId;
    if (r.credentialLabel) record.credentialLabel = r.credentialLabel;
    return record;
  }
  return null;
}
