/**
 * L8-6 own wallet, phone side: the share gate G (design 6a (iii), R-e, M9, appendix C items 4, 4a, 16, 30). Pure
 * functions: the identity card's `shareIdentity` builds the share text with `buildShareMessageV1`, asks `decideShareV1`
 * and only calls `Share.share` when it answers `share`. The gate never builds, edits or adds to the text (E128).
 *
 * G holds when the Agent has an active own wallet, its ERC-8004 registration is confirmed and re-checked on chain (both
 * from the backend's `shareGate`) and this device checked the address (the deep-link `state` round trip, `ownWalletVerifyState.ts`).
 *
 * - Gate switch off: `share` (today's behaviour).
 * - No `shareGate` on the card (the backend's main switch is off): `share`, the phone treats the whole feature as off.
 * - A `shareGate` that is not three booleans: `complete_first` (fail closed, nothing is shared).
 * - Registration not open: `not_open` (appendix C item 16), whatever else holds.
 * - Otherwise `share` only with all three conditions, else `complete_first`.
 */
import { shareGateServerSatisfiedV1, type OwnWalletShareGateV1 } from '../../shared/types/agent-own-wallet';
import { OWN_WALLET_MOBILE_COPY_V1, type BilingualV1 } from './ownWallet';

export type OwnWalletShareDecisionV1 = { action: 'share'; message: string } | { action: 'complete_first' } | { action: 'not_open' };

export interface OwnWalletShareInputV1 {
  /** `agentShareGateMobileEnabledV1()`. */
  gateEnabled: boolean;
  /** The card's `shareGate`; `undefined` when the backend sent none. */
  shareGate: unknown;
  /** This device recorded the address check for the card's account (`isDeviceVerifiedV1`). */
  deviceVerified: boolean;
  /** Today's share text, built by the caller with `buildShareMessageV1`. */
  message: string;
}

function shareGateOf(value: unknown): OwnWalletShareGateV1 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.ownWalletActive !== 'boolean' || typeof v.registrationConfirmed !== 'boolean' || typeof v.registrationOpen !== 'boolean') return null;
  return { ownWalletActive: v.ownWalletActive, registrationConfirmed: v.registrationConfirmed, registrationOpen: v.registrationOpen };
}

export function decideShareV1(input: OwnWalletShareInputV1): OwnWalletShareDecisionV1 {
  if (input.gateEnabled !== true) return { action: 'share', message: input.message };
  if (input.shareGate === undefined) return { action: 'share', message: input.message };
  const gate = shareGateOf(input.shareGate);
  if (gate === null) return { action: 'complete_first' };
  if (gate.registrationOpen !== true) return { action: 'not_open' };
  if (shareGateServerSatisfiedV1(gate) && input.deviceVerified === true) return { action: 'share', message: input.message };
  return { action: 'complete_first' };
}

// D22: the prediction-market subdomain is retired; share the main site instead.
export const SHARE_DEEP_LINK_V1 = 'https://agentrix.top';

export interface ShareCardV1 {
  wallet: { address?: string };
  credit: { status: string; level: string; creditScore: number };
  earnings: { totalTx: number };
}

/**
 * Today's share text, word for word (it used to sit inside the card's `shareIdentity`): the headline, the short wallet
 * address, the credit line, the transaction count and the main site. Moved here so a test can pin it; with the switches
 * off the output is exactly what the card shared before.
 */
export function buildShareMessageV1(card: ShareCardV1, t: (d: BilingualV1) => string): string {
  const lines = [
    t({ en: 'My AI agent has its own wallet & identity 🤖', zh: '我的 AI agent 有独立钱包和链上身份 🤖' }),
    card.wallet.address ? `👛 ${card.wallet.address.slice(0, 8)}…${card.wallet.address.slice(-6)}` : '',
    card.credit.status === 'enabled' ? `🎯 ${card.credit.level} (${card.credit.creditScore})` : '',
    card.earnings.totalTx > 0 ? `📈 ${card.earnings.totalTx} txs` : '',
    SHARE_DEEP_LINK_V1,
  ].filter(Boolean);
  return lines.join('\n');
}

export type ShareCompleteStepV1 = 'create' | 'verify' | 'setup' | 'wait' | 'unavailable';

/**
 * What "去完成" can start for a `complete_first` answer:
 * - `create`: the Agent has no own account yet → the first account path (wallet origin create page).
 * - `verify`: everything the server checks holds and only this device has not checked the address → the check link.
 * - `setup` (S11c): an account that is not finished and whose card plainly says what is missing (`setupAvailable`, from
 *   `ownWalletSetupAvailableV1`) → the main site's setup page, which opens the wizard or the registration signature.
 * - `wait`: an account that is not finished and the card does not say what is missing → the text and "先不了" only.
 * - `unavailable`: the wallet status could not be read (item 30) → no button.
 */
export function shareCompleteStepV1(input: { walletStatus: string; shareGate: unknown; deviceVerified: boolean; setupAvailable?: boolean }): ShareCompleteStepV1 {
  if (input.walletStatus === 'unavailable') return 'unavailable';
  if (input.walletStatus === 'none') return 'create';
  const live = input.walletStatus === 'active' || input.walletStatus === 'pending';
  const gate = shareGateOf(input.shareGate);
  if (gate !== null && shareGateServerSatisfiedV1(gate) && input.deviceVerified !== true && live) return 'verify';
  if (live && input.setupAvailable === true) return 'setup';
  return 'wait';
}

export interface ShareSheetV1 {
  text: BilingualV1;
  /** The button that starts the next step; `null` when there is none the card can start. */
  go: BilingualV1 | null;
  step: ShareCompleteStepV1 | null;
  /** The only other button: "知道了" for `not_open`, otherwise "先不了". */
  close: BilingualV1;
}

/** The words and buttons of the sheet the share button shows when G does not let the text out. */
export function shareSheetV1(input: { variant: 'complete_first' | 'not_open'; walletStatus: string; hasLegacyCustody: boolean; shareGate: unknown; deviceVerified: boolean; setupAvailable?: boolean }): ShareSheetV1 {
  const copy = OWN_WALLET_MOBILE_COPY_V1;
  if (input.variant === 'not_open') return { text: copy.shareNotOpen, go: null, step: null, close: copy.shareAcknowledge };
  const step = shareCompleteStepV1({ walletStatus: input.walletStatus, shareGate: input.shareGate, deviceVerified: input.deviceVerified, setupAvailable: input.setupAvailable });
  const text = step === 'unavailable' ? copy.statusUnavailable : input.hasLegacyCustody ? copy.shareCompleteFirstLegacy : copy.shareCompleteFirst;
  return { text, go: step === 'create' || step === 'verify' || step === 'setup' ? copy.shareGoComplete : null, step, close: copy.shareLater };
}
