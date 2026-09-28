/**
 * fourZoneRoutes — where each catalog zone + tab lands in the M1 four-zone
 * navigator (flag `mobile.four_zone_ia`).
 *
 * Pure data and functions only (no React Native import) so it stays inside
 * the root jest range. The navigator (`FourZoneTabNavigator.tsx`) registers
 * exactly the route names used here; the tests check both sides agree.
 *
 * A tab that is not built yet opens the honest `ZoneUnavailable` notice
 * (5.6 "不可用就显示不可用") instead of a guessed screen.
 */
import { NAV_CATALOG, NAV_ZONE_IDS, type NavDestination, type NavZoneId } from '../navCatalog';

export type FourZoneTabRoute = 'Companion' | 'Matters' | 'Twin' | 'My';

export const FOUR_ZONE_TAB_ROUTES: Readonly<Record<NavZoneId, FourZoneTabRoute>> = {
  companion: 'Companion',
  matters: 'Matters',
  twin: 'Twin',
  my: 'My',
};

/** Legacy tabs kept as hidden routes so old in-app calls and links still resolve (D7). */
export const FOUR_ZONE_HIDDEN_LEGACY_TABS = ['World', 'Summon', 'Plaza', 'Me'] as const;

/**
 * Tab options for the hidden legacy tabs. `tabBarButton: () => null` alone is
 * not enough: bottom-tabs 7 wraps every button in a `flex: 1` item view, so
 * each hidden tab kept an empty slot and the four real tabs were squeezed
 * into the left half of the bar (1.3.0 preview, CI build 528 screenshot).
 * `display: 'none'` on the item removes the slot.
 */
export const FOUR_ZONE_HIDDEN_TAB_OPTIONS = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' },
} as const;

/** Screens registered inside each zone's stack. */
export const FOUR_ZONE_STACK_SCREENS: Readonly<Record<FourZoneTabRoute, readonly string[]>> = {
  Companion: ['CompanionHome'],
  Matters: ['MattersHome', 'MattersDesktop'],
  Twin: ['TwinHome', 'TwinPassport', 'TwinStatus'],
  // `My` reuses MeStackNavigator; these are its existing route names.
  My: ['MyHome', 'Appearance', 'MyDevices', 'MemoryManagement', 'ToyBinding', 'WalletConnect', 'SovereigntyControlPlane', 'Subscribe', 'Settings'],
};

export const ZONE_UNAVAILABLE_ROUTE = 'ZoneUnavailable' as const;

type ScreenTarget = { tab: FourZoneTabRoute; screen: string } | 'unavailable';

/** Catalog tab → screen. Anything not listed is unavailable for now. */
const TAB_TARGETS: Readonly<Record<NavZoneId, Readonly<Record<string, ScreenTarget>>>> = {
  companion: {
    chat: { tab: 'Companion', screen: 'CompanionHome' },
    activity: 'unavailable',
    todo: 'unavailable',
    artifacts: 'unavailable',
    call: 'unavailable',
  },
  matters: {
    pending: { tab: 'Matters', screen: 'MattersHome' },
    goals: 'unavailable',
    schedule: 'unavailable',
    'on-computer': { tab: 'Matters', screen: 'MattersDesktop' },
    ideas: 'unavailable',
  },
  twin: {
    card: { tab: 'Twin', screen: 'TwinHome' },
    passport: { tab: 'Twin', screen: 'TwinPassport' },
    status: { tab: 'Twin', screen: 'TwinStatus' },
    visitors: 'unavailable',
    bookings: 'unavailable',
    services: 'unavailable',
    review: 'unavailable',
    income: 'unavailable',
  },
  my: {
    home: { tab: 'My', screen: 'MyHome' },
    identity: { tab: 'My', screen: 'MemoryManagement' },
    import: 'unavailable',
    connections: 'unavailable',
    // M1-k: computers + hardware in one list; pairing stays on ToyBinding.
    devices: { tab: 'My', screen: 'MyDevices' },
    wallet: { tab: 'My', screen: 'WalletConnect' },
    permissions: { tab: 'My', screen: 'SovereigntyControlPlane' },
    plan: { tab: 'My', screen: 'Subscribe' },
    trust: 'unavailable',
    // 11.3 外观 (D11): its own screen under 我的.
    appearance: { tab: 'My', screen: 'Appearance' },
    settings: { tab: 'My', screen: 'Settings' },
  },
};

export type FourZoneNavigation =
  | {
      name: 'Main';
      params: { screen: FourZoneTabRoute; params: { screen: string; params: { tab: string; ref?: string } } };
    }
  | { name: typeof ZONE_UNAVAILABLE_ROUTE; params: { zone: NavZoneId; tab: string } };

export function fourZoneTarget(zone: NavZoneId, tab: string): ScreenTarget {
  return TAB_TARGETS[zone]?.[tab] ?? 'unavailable';
}

/** Navigation action for a catalog destination (deep link, push, share). */
export function resolveFourZoneNavigation(destination: NavDestination): FourZoneNavigation {
  const target = fourZoneTarget(destination.zone, destination.tab);
  if (target === 'unavailable') {
    return { name: ZONE_UNAVAILABLE_ROUTE, params: { zone: destination.zone, tab: destination.tab } };
  }
  return {
    name: 'Main',
    params: {
      screen: target.tab,
      params: {
        screen: target.screen,
        params: { tab: destination.tab, ...(destination.ref !== undefined ? { ref: destination.ref } : {}) },
      },
    },
  };
}

/** Every catalog tab has a decision (screen or unavailable); used by tests. */
export function uncoveredCatalogTabs(): string[] {
  const missing: string[] = [];
  for (const zone of NAV_ZONE_IDS) {
    for (const tab of NAV_CATALOG[zone].tabs) {
      if (!(tab.id in TAB_TARGETS[zone])) missing.push(`${zone}/${tab.id}`);
    }
  }
  return missing;
}
