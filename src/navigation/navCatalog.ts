/**
 * navCatalog — the phone's view of the shared navigation catalog (D3 / D14,
 * product doc 5.3 and 8.1).
 *
 * The contract is `shared/types/nav-catalog.ts` (`agentrix.nav.v1`, backend,
 * commit 01833985, integration 3a9a7281). It started from this file's
 * earlier local draft (59204a8e) and kept every zone id, tab id, label, the
 * `/go/` form and the `ref` rule. This module only re-exports it and binds
 * the surface to `mobile`, so the phone's call sites and tests stay as they
 * were and there is exactly one copy of the catalog.
 */
import {
  visibleNavTabs as visibleNavTabsForSurface,
  type NavTab,
  type NavZoneId,
} from '../../shared/types/nav-catalog';

export {
  DESKTOP_ONLY_NAV_CATALOG,
  DESKTOP_ONLY_ZONE_IDS,
  NAV_APP_SCHEME,
  NAV_CATALOG,
  NAV_CATALOG_SCHEMA_VERSION,
  NAV_REF_PATTERN,
  NAV_WEB_LINK_PREFIX,
  NAV_WEB_ORIGIN,
  NAV_ZONE_IDS,
  NAV_ZONES_BY_SURFACE,
  isDesktopOnlyZoneId,
  isNavRef,
  isNavTab,
  isNavZoneId,
  navDestinationAppUrl,
  navDestinationWebUrl,
  navZone,
  parseNavLink,
  resolveNavDestinationForSurface,
  serializeNavDestination,
} from '../../shared/types/nav-catalog';
export type {
  AnyNavZoneId,
  DesktopOnlyZoneId,
  NavDestination,
  NavLabel,
  NavLinkParseResult,
  NavSurface,
  NavTab,
  NavZone,
  NavZoneId,
} from '../../shared/types/nav-catalog';

export const MOBILE_NAV_SURFACE = 'mobile' as const;

/** Tabs the phone shows now (5.5: 电脑上 only once a computer is paired). */
export function visibleNavTabs(zone: NavZoneId, context: { hasPairedComputer: boolean }): NavTab[] {
  return visibleNavTabsForSurface(zone, { surface: MOBILE_NAV_SURFACE, hasPairedComputer: context.hasPairedComputer });
}
