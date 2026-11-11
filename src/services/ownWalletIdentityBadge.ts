/**
 * L8-6 own wallet, phone side: the on-chain identity badge of an Agent card (design 7.1 T10 first row, R-h 2). Pure.
 *
 * Today the badge reads `GET /agent-accounts/:id/onchain-status` and, when not registered, offers "注册链上身份", which
 * posts `onchain-register` (the platform's relayer signs). With `EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED=1` and the backend's
 * main switch on, the badge follows the backend's new reading: `registered` is true only for a confirmed ERC-8004 registration
 * the chain agrees with (an old Agent that only has the relayer's registration shows "not registered"), and the button never
 * posts `onchain-register` (the backend answers 409 `onchain_register_moved` anyway).
 *
 * - `legacy_post`: today's button.
 * - `open_wallet_origin`: the Agent has no own account yet (`ownWalletStatus` `none`): the button takes the owner to the
 *   wallet origin's first account path.
 * - `open_setup` (S11c): the Agent has an account (`pending` / `active`) that is not registered: the button "去完成" takes the
 *   owner to the main site's setup page, which reads the card and opens the wizard or the registration signature (or says
 *   in words that nothing can be done now).
 * - `none`: no button. A lost account, an unreadable or unknown wallet status never guesses a button.
 */
export interface OnchainStatusLikeV1 {
  registered?: unknown;
  /** Present only when the backend's main switch is on (`resolveOnchainIdentityV1`'s status). */
  identityStatus?: unknown;
  chain?: unknown;
  verifyUrl?: unknown;
}

export type IdentityBadgeV1 = {
  badge: 'registered' | 'not_registered';
  register: 'legacy_post' | 'open_wallet_origin' | 'open_setup' | 'none';
  /** Which reading produced it: the old fields or the backend's new ones. */
  source: 'legacy' | 'own_wallet';
};

// S11c: the backend may end the link in `#eas=<0x + 64 hex>` (the platform certificate) and `&easRevoke=pending`; those are the
// only fragments accepted, a query string or any other fragment is still no link (same rule as the web's verifyLinkOrNullV1).
const VERIFY_PAGE_URL = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?\/verify\/agent\/[1-9][0-9]{0,9}\/[0-9]{1,78}(?:#eas=0x[0-9a-f]{64}(?:&easRevoke=pending)?)?$/;

/** The public verify page the backend names for a registration: a plain https link of exactly that shape, else none. */
export function verifyPageLinkV1(url: unknown): string | null {
  return typeof url === 'string' && VERIFY_PAGE_URL.test(url) ? url : null;
}

export function decideIdentityBadgeV1(
  onchain: OnchainStatusLikeV1,
  flags: { ownWalletEnabled: boolean; ownWalletStatus?: string | null },
): IdentityBadgeV1 {
  const newReading = flags.ownWalletEnabled === true && typeof onchain.identityStatus === 'string';
  if (!newReading) return { badge: onchain.registered === true ? 'registered' : 'not_registered', register: 'legacy_post', source: 'legacy' };
  const registered = onchain.registered === true && onchain.identityStatus === 'confirmed';
  if (registered) return { badge: 'registered', register: 'none', source: 'own_wallet' };
  const register = flags.ownWalletStatus === 'none' ? 'open_wallet_origin' : flags.ownWalletStatus === 'pending' || flags.ownWalletStatus === 'active' ? 'open_setup' : 'none';
  return { badge: 'not_registered', register, source: 'own_wallet' };
}
