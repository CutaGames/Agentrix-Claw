/**
 * L8-6 own wallet, phone side: the wallet block of the economic status screen (design 7.1 T11, R6-L2). Pure.
 *
 * `GET /agent-accounts/:id/economic-status` with the backend's main switch on gives the wallet dimension from the own
 * wallet status: `pending` / `active` → the 2160 account address (`accountAddress`), the old wallet only in `legacyCustody`;
 * `lost` → failed with the lost address; `owner_mismatch` / `unavailable` → failed with no address; `none` → today's
 * dimension plus `label` by source. This function turns that into the rows the screen draws, so an `active` Agent that still
 * has an old MPC wallet shows the own account address in the wallet row and the old address only on the "旧托管钱包" row.
 *
 * `null` (the screen draws today's block, byte for byte): the phone switch is off, or the answer has no `ownWalletStatus`
 * (the backend's main switch is off, or an older server).
 */
import { ownWalletChainNameV1, shortAddressV1, OWN_WALLET_MOBILE_COPY_V1, type BilingualV1 } from './ownWallet';

export interface EconomicWalletRowV1 {
  id: 'address' | 'custody' | 'chain' | 'legacy';
  label: BilingualV1;
  value: string | BilingualV1 | null;
}

export interface EconomicWalletBlockV1 {
  status: 'enabled' | 'not_enabled' | 'failed';
  rows: EconomicWalletRowV1[];
  /** Words under the rows (appendix C items 20 and 30). */
  detail: BilingualV1 | null;
  /** Rows are shown even when the status is not `enabled` (a lost wallet still lists the old wallet). */
  alwaysRows: boolean;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const ADDRESS_LABEL: BilingualV1 = { en: 'Address', zh: '地址' };
const CUSTODY_LABEL: BilingualV1 = { en: 'Custody', zh: '托管' };
const CHAIN_LABEL: BilingualV1 = { en: 'Chain', zh: '链' };

function shortOrNull(value: unknown): string | null {
  return typeof value === 'string' && ADDRESS.test(value) ? shortAddressV1(value) : null;
}

function legacyRowOf(legacy: unknown): EconomicWalletRowV1 | null {
  if (!isObject(legacy)) return null;
  const short = shortOrNull(legacy.address);
  if (short === null) return null;
  const label = legacy.label === 'external' ? OWN_WALLET_MOBILE_COPY_V1.externalWalletLabel : OWN_WALLET_MOBILE_COPY_V1.legacyCustodyLabel;
  return { id: 'legacy', label, value: short };
}

export function economicWalletBlockV1(wallet: unknown, flags: { ownWalletEnabled: boolean }): EconomicWalletBlockV1 | null {
  if (flags.ownWalletEnabled !== true || !isObject(wallet) || typeof wallet.ownWalletStatus !== 'string') return null;
  const status = wallet.ownWalletStatus;
  const copy = OWN_WALLET_MOBILE_COPY_V1;
  const legacyRow = legacyRowOf(wallet.legacyCustody);
  if (status === 'pending' || status === 'active' || status === 'lost') {
    const address = shortOrNull(wallet.accountAddress);
    const chain = ownWalletChainNameV1(wallet.chainId);
    if (address === null || chain === null) return { status: 'failed', rows: [], detail: copy.statusUnavailable, alwaysRows: false };
    const rows: EconomicWalletRowV1[] = [
      { id: 'address', label: ADDRESS_LABEL, value: address },
      { id: 'chain', label: CHAIN_LABEL, value: chain },
    ];
    if (legacyRow) rows.push(legacyRow);
    if (status === 'lost') return { status: 'failed', rows, detail: copy.walletLost, alwaysRows: true };
    return { status: wallet.status === 'enabled' ? 'enabled' : 'failed', rows, detail: null, alwaysRows: false };
  }
  if (status === 'none') {
    // Today's dimension (`mpcWalletId` / `externalWalletAddress`) with the source named.
    const address = shortOrNull(wallet.mpcWalletId) ?? shortOrNull(wallet.externalWalletAddress) ?? shortOrNull(wallet.address);
    const source = wallet.label === 'legacy_custody' ? copy.legacyCustodyLabel : wallet.label === 'external' ? copy.externalWalletLabel : null;
    const enabled = wallet.status === 'enabled';
    return {
      status: wallet.status === 'failed' ? 'failed' : enabled ? 'enabled' : 'not_enabled',
      rows: [
        { id: 'address', label: ADDRESS_LABEL, value: address },
        { id: 'custody', label: CUSTODY_LABEL, value: source },
      ],
      detail: null,
      alwaysRows: false,
    };
  }
  // Unreadable: item 30 and no address of any wallet (the old one is not offered as a stand-in).
  if (status === 'unavailable') return { status: 'failed', rows: [], detail: copy.statusUnavailable, alwaysRows: false };
  // owner_mismatch, or a status this build does not know: failed, no address, no guess.
  return { status: 'failed', rows: [], detail: null, alwaysRows: false };
}
