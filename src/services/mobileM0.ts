/**
 * M0 of the phone redesign (briefs/mobile-redesign-v1.md, owner 10-07: "pocket front desk + remote"). Off unless the
 * build sets EXPO_PUBLIC_MOBILE_M0=1: then 事项 becomes 需要你 and opens first, it leads with the decision cards
 * (NeedsYouSection), 分身 can show the card's QR code full screen, and the old directions have no way in (below).
 * With it off the four-zone build is unchanged.
 */
export function mobileM0Enabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const MOBILE_M0_ENABLED = mobileM0Enabled(process.env.EXPO_PUBLIC_MOBILE_M0);

export const MOBILE_M0_NEEDS_YOU_LABEL = { zh: '需要你', en: 'Needs you' } as const;

/**
 * M0 tab icons (brief section 7: an icon set instead of emoji and text glyphs): Ionicons names from
 * @expo/vector-icons, which ships with Expo. Filled on the focused tab, outline otherwise; other builds keep the glyphs.
 */
export const MOBILE_M0_TAB_ICONS = {
  Companion: { focused: 'chatbubble-ellipses', idle: 'chatbubble-ellipses-outline' },
  Matters: { focused: 'checkmark-done-circle', idle: 'checkmark-done-circle-outline' },
  Twin: { focused: 'person-circle', idle: 'person-circle-outline' },
  My: { focused: 'grid', idle: 'grid-outline' },
} as const;

/**
 * The old directions (world / creation, plaza and its markets, pets, AXP points, the opportunity digest) get no entry in
 * M0 builds (brief section 3: "旧方向在 Yowo 版里不再有任何入口，代码先不删", D7). Their screens stay in the code base;
 * an M0 build does not register them, hides the buttons that led there and sends their old links to the
 * "link no longer works" notice.
 */
export const MOBILE_M0_RETIRED_HIDDEN_TABS = ['World', 'Plaza'] as const;
export const MOBILE_M0_RETIRED_ME_SCREENS = [
  'AxpCenter',
  'AxpRewardShop',
  'PetEarnings',
  'DigestPoster',
  'PetWardrobe',
  'SoulPicker',
  'PetBreed',
  'PetPlayground',
  'PetSkinMarketplace',
] as const;

/** Notification types that only ever opened an old direction (airdrops). */
export const MOBILE_M0_RETIRED_NOTIFICATION_TYPES = ['airdrop_available', 'airdrop_claimed'] as const;

/** False for a retired route in an M0 build; every route stays registered in other builds. */
export function mobileM0Registers(route: string, m0: boolean = MOBILE_M0_ENABLED): boolean {
  if (!m0) return true;
  return !(MOBILE_M0_RETIRED_HIDDEN_TABS as readonly string[]).includes(route) && !(MOBILE_M0_RETIRED_ME_SCREENS as readonly string[]).includes(route);
}

export function mobileM0RetiresNotification(type: unknown, m0: boolean = MOBILE_M0_ENABLED): boolean {
  return m0 && (MOBILE_M0_RETIRED_NOTIFICATION_TYPES as readonly unknown[]).includes(type);
}
