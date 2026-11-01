/**
 * L8-6 own wallet, web side: the share gate G (design 6a (iii), R-e, A27). A pure function: the identity card's share
 * button calls it and only calls `navigator.share` or the clipboard when it answers `share`.
 *
 * G holds when the Agent has an active own wallet, its ERC-8004 registration is confirmed and re-checked on chain (both
 * come from the backend's `shareGate`, S3b / S8b) and this device checked the address (the wallet origin's badge).
 * The share text is the caller's, passed through unchanged: the gate never builds, edits or adds to it (E128).
 *
 * - Gate switch off: `share` (today's behaviour).
 * - No `shareGate` on the card (the backend's main switch is off): `share`, the web treats the whole feature as off.
 * - A `shareGate` that is not three booleans: `complete_first` (fail closed, nothing is shared).
 * - Registration not open: `not_open` (appendix C item 16), whatever else holds.
 * - Otherwise `share` only with all three conditions, else `complete_first`.
 */
import { shareGateServerSatisfiedV1, type OwnWalletShareGateV1 } from '../../../shared/types/agent-own-wallet';

export type OwnWalletShareDecisionV1 = { action: 'share'; message: string } | { action: 'complete_first' } | { action: 'not_open' };

export interface OwnWalletShareInputV1 {
  /** `agentShareGateWebEnabledV1()`. */
  gateEnabled: boolean;
  /** The card's `shareGate`; `undefined` when the backend sent none. */
  shareGate: unknown;
  /** The badge said this device checked the address (`acceptBadgeMessageV1` accepted the message). */
  deviceVerified: boolean;
  /** Today's share text, built by the caller. */
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
