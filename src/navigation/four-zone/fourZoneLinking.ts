/**
 * fourZoneLinking — deep links and push taps into the four-zone IA
 * (M1-c, flag `mobile.four_zone_ia`).
 *
 * A zone link (`agentrix://matters/pending?ref=…`, `https://agentrix.top/twin`,
 * `/my/devices`) becomes a navigation state built from the route table, so
 * the linking config does not need a second copy of every path. Anything that
 * is not a zone link returns `null` and falls through to the existing
 * v7 / legacy resolution.
 */
import { parseNavLink, type NavDestination } from '../navCatalog';
import { resolveFourZoneNavigation, ZONE_UNAVAILABLE_ROUTE } from './fourZoneRoutes';

export interface FourZonePartialState {
  routes: Array<{
    name: string;
    params?: object;
    state?: FourZonePartialState;
  }>;
}

export function fourZoneStateForDestination(destination: NavDestination): FourZonePartialState {
  const nav = resolveFourZoneNavigation(destination);
  if (nav.name === ZONE_UNAVAILABLE_ROUTE) {
    // Keep Main underneath so "back" lands inside the app.
    return { routes: [{ name: 'Main' }, { name: ZONE_UNAVAILABLE_ROUTE, params: nav.params }] };
  }
  const { screen: tab, params: inner } = nav.params;
  return {
    routes: [
      {
        name: 'Main',
        state: {
          routes: [
            {
              name: tab,
              state: { routes: [{ name: inner.screen, params: inner.params }] },
            },
          ],
        },
      },
    ],
  };
}

/**
 * `Main > My > Appearance`: the focused route name at each level, no params
 * (so nothing from a link ends up in a log). Used by the Maestro E2E build to
 * log where a link or tap landed.
 */
export function describeLinkState(
  state: { index?: number; routes: Array<{ name: string; state?: unknown }> } | null | undefined,
): string {
  const names: string[] = [];
  let current = state;
  while (current && Array.isArray(current.routes) && current.routes.length > 0 && names.length < 8) {
    const index = typeof current.index === 'number' ? current.index : current.routes.length - 1;
    const route = current.routes[index] ?? current.routes[current.routes.length - 1];
    names.push(String(route.name));
    current = route.state as typeof state;
  }
  return names.length > 0 ? names.join(' > ') : '(none)';
}
/**
 * `null` when the path is not a zone link (caller falls back). A zone link
 * that fails validation (unknown tab, bad ref, extra query or depth) fails
 * closed to the notice with no params — nothing from the link is carried.
 */
export function fourZoneStateFromPath(path: string): FourZonePartialState | null {
  const parsed = parseNavLink(path);
  if (parsed.ok) return fourZoneStateForDestination(parsed.destination);
  // `in` narrows under the app's strict:false tsconfig; `!parsed.ok` does not.
  if ('reason' in parsed && parsed.reason === 'not_a_zone_link') return null;
  return { routes: [{ name: 'Main' }, { name: ZONE_UNAVAILABLE_ROUTE }] };
}
