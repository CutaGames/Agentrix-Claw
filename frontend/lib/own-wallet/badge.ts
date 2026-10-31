/**
 * L8-6 own wallet: the badge (design 2.0 "徽章页", 6a condition 3). The main site embeds
 * `${walletOrigin}/wallet/badge/#chainId=…&account=…&kind=…&agent=…`; the badge reads the wallet origin's own L and
 * reports `{ account, chainId, verified }` to its parent with `postMessage(msg, MAIN_ORIGIN)`: the target origin is the
 * build-time main origin, never `'*'`. The main site accepts a message only when `event.origin` is the wallet origin,
 * `event.source` is that very iframe's window, and the account, chain, kind and Agent equal what the card shows.
 */
import { ownWalletChainAllowedV1, type OwnWalletAccountKindV1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';
import type { OwnWalletDeviceCheckV1 } from './device-check';
import type { OwnWalletAccountLinkV1 } from './links';

export const OWN_WALLET_BADGE_MESSAGE_TYPE_V1 = 'agentrix.own-wallet.badge' as const;

export interface OwnWalletBadgeMessageV1 {
  type: typeof OWN_WALLET_BADGE_MESSAGE_TYPE_V1;
  v: 1;
  chainId: OwnWalletChainIdV1;
  account: string;
  kind: OwnWalletAccountKindV1;
  agentId: string | null;
  verified: boolean;
}

const ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;
const KEYS = ['type', 'v', 'chainId', 'account', 'kind', 'agentId', 'verified'];

export function badgeMessageV1(link: OwnWalletAccountLinkV1, check: OwnWalletDeviceCheckV1): OwnWalletBadgeMessageV1 {
  return {
    type: OWN_WALLET_BADGE_MESSAGE_TYPE_V1,
    v: 1,
    chainId: link.chainId,
    account: link.account,
    kind: link.kind,
    agentId: link.agentId ?? null,
    verified: check.ok === true,
  };
}

export interface OwnWalletMessageTargetV1 {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** Posts to the pinned main origin only; refuses when it is not a plain https origin (so never `'*'`). */
export function postBadgeMessageV1(target: OwnWalletMessageTargetV1 | null | undefined, mainOrigin: string, message: OwnWalletBadgeMessageV1): boolean {
  if (!target || typeof target.postMessage !== 'function' || !ORIGIN.test(mainOrigin)) return false;
  target.postMessage(message, mainOrigin);
  return true;
}

export interface OwnWalletBadgeExpectationV1 {
  walletOrigin: string;
  /** The `contentWindow` of the badge iframe this component rendered. */
  frame: unknown;
  chainId: number;
  account: string;
  kind: OwnWalletAccountKindV1;
  agentId?: string;
}

/**
 * Main site side. `null`: not a message for this badge (ignored). Otherwise whether this device checked the address.
 */
export function acceptBadgeMessageV1(event: { origin: unknown; source: unknown; data: unknown }, expect: OwnWalletBadgeExpectationV1): boolean | null {
  if (!ORIGIN.test(expect.walletOrigin) || event.origin !== expect.walletOrigin) return null;
  if (!expect.frame || event.source !== expect.frame) return null;
  const data = event.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const m = data as Record<string, unknown>;
  for (const key of Object.keys(m)) if (!KEYS.includes(key)) return null;
  if (m.type !== OWN_WALLET_BADGE_MESSAGE_TYPE_V1 || m.v !== 1 || typeof m.verified !== 'boolean') return null;
  if (!ownWalletChainAllowedV1(m.chainId) || m.chainId !== expect.chainId) return null;
  if (typeof m.account !== 'string' || m.account !== String(expect.account).toLowerCase()) return null;
  if (m.kind !== expect.kind) return null;
  if ((m.agentId ?? undefined) !== (expect.kind === 'agent' ? expect.agentId : undefined)) return null;
  return m.verified;
}
