/**
 * L8-6 own wallet, phone side: what happens after "new Agent" and on "打开独立钱包" (design 7.1 T10, 6a (i)). Pure.
 *
 * Today the phone calls `POST /mpc-wallet/create` right after an Agent is created and from the "打开独立钱包" button.
 * With `EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED=1` and the backend's main switch on it never does: the backend's default
 * switch has already made the Agent's counterfactual account when the owner has a wallet passkey (then the phone says so,
 * appendix C item 1), and otherwise the owner is taken to the wallet origin to make the passkey and the account.
 *
 * - Phone switch off: `legacy_mpc_create` (today).
 * - Phone switch on, the card read worked and has no `ownWallet` key (the backend's main switch is off): `legacy_mpc_create`.
 * - Phone switch on, the card could not be read: `own_wallet_unavailable`. Not the old path: with the backend switch on that
 *   path answers 409 `mpc_wallet_create_moved` anyway, and with it off a blind retry later is the owner's choice.
 * - `pending` / `active` with an account: `own_wallet_ready` (short address only).
 * - `none`: `open_wallet_origin`. `unavailable`, `lost`, `owner_mismatch`: `own_wallet_unavailable` (item 30, no wallet is made).
 */
import type { OwnWalletViewV1 } from './ownWallet';
import { shortAddressV1 } from './ownWallet';

export type AfterAgentCreatedV1 =
  | { action: 'legacy_mpc_create' }
  | { action: 'own_wallet_ready'; shortAddress: string }
  | { action: 'open_wallet_origin' }
  | { action: 'own_wallet_unavailable' };

export interface AfterAgentCreatedInputV1 {
  /** `ownWalletMobileEnabledV1()`. */
  ownWalletEnabled: boolean;
  /** The card read after the Agent was created: `ok` with the view (null = no `ownWallet` key), or `failed`. */
  card: { kind: 'ok'; view: OwnWalletViewV1 | null } | { kind: 'failed' };
}

export function decideAfterAgentCreatedV1(input: AfterAgentCreatedInputV1): AfterAgentCreatedV1 {
  if (input.ownWalletEnabled !== true) return { action: 'legacy_mpc_create' };
  if (input.card.kind !== 'ok') return { action: 'own_wallet_unavailable' };
  const view = input.card.view;
  if (view === null) return { action: 'legacy_mpc_create' };
  if ((view.status === 'pending' || view.status === 'active') && typeof view.account === 'string') return { action: 'own_wallet_ready', shortAddress: shortAddressV1(view.account) };
  if (view.status === 'none') return { action: 'open_wallet_origin' };
  return { action: 'own_wallet_unavailable' };
}

/**
 * The "打开独立钱包" button of an Agent without a wallet row: with the phone switch off it creates the MPC wallet as
 * today; with it on it opens the wallet origin (the account path decides what the wallet origin needs).
 */
export function decideOpenWalletV1(input: { ownWalletEnabled: boolean }): { action: 'legacy_mpc_create' } | { action: 'open_wallet_origin' } {
  return input.ownWalletEnabled === true ? { action: 'open_wallet_origin' } : { action: 'legacy_mpc_create' };
}
