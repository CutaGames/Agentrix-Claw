import { APP_URL } from '../config/env';

/**
 * Web handoff URLs (pure builders, no react-native import).
 *
 * Product doc 1.9: until the native twin surface lands, the phone's 分身 empty
 * state opens the Web flow (`/twin` intro, or the owner's
 * `/agents/:agentId/twin` workspace). D16: content editing and loosening
 * actions stay on Web.
 */
const SAFE_AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

export function joinWebUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}

export const TWIN_INTRO_WEB_PATH = '/twin';

export function getTwinWebPath(agentAccountId?: string | null): string {
  if (typeof agentAccountId === 'string' && SAFE_AGENT_ID.test(agentAccountId)) {
    return `/agents/${encodeURIComponent(agentAccountId)}/twin`;
  }
  return TWIN_INTRO_WEB_PATH;
}

export function getTwinWebUrl(agentAccountId?: string | null, baseUrl: string = APP_URL): string {
  return joinWebUrl(baseUrl, getTwinWebPath(agentAccountId));
}

/**
 * Passport editing and new shares are Web-only (D16: loosening needs an exact
 * preview + step-up). Route from web's zone map (REQ-mobile-011 reply):
 * twin/passport → `/agents/:id/twin?card=passport`.
 */
export function getPassportWebPath(agentAccountId?: string | null): string {
  if (typeof agentAccountId === 'string' && SAFE_AGENT_ID.test(agentAccountId)) {
    return `/agents/${encodeURIComponent(agentAccountId)}/twin?card=passport`;
  }
  return TWIN_INTRO_WEB_PATH;
}

export function getPassportWebUrl(agentAccountId?: string | null, baseUrl: string = APP_URL): string {
  return joinWebUrl(baseUrl, getPassportWebPath(agentAccountId));
}

/**
 * Catalog tabs the phone has not built yet but Web already serves (M1-j),
 * per web's route map (`frontend/lib/navigation/nav-catalog.ts`, integration
 * 497f362a). The phone's "not on the phone yet" notice offers these on Web
 * through the shared zone link `/go/<zone>/<tab>` (8.1, REQ-mobile-011), so
 * the phone never copies Web's internal routes. `APP_URL` is
 * www.agentrix.top, which the Android intent filter does not claim, so the
 * link opens the browser instead of looping back into the app.
 */
export const WEB_SERVED_UNBUILT_TABS: Readonly<Record<string, readonly string[]>> = {
  companion: ['activity'],
  matters: ['schedule'],
  my: ['import', 'connections', 'trust'],
};

export function getZoneWebPath(zone: string, tab: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(WEB_SERVED_UNBUILT_TABS, zone)) return null;
  const tabs = WEB_SERVED_UNBUILT_TABS[zone];
  if (!Array.isArray(tabs) || !tabs.includes(tab)) return null;
  return `/go/${zone}/${tab}`;
}

export function getZoneWebUrl(zone: string, tab: string, baseUrl: string = APP_URL): string | null {
  const path = getZoneWebPath(zone, tab);
  return path ? joinWebUrl(baseUrl, path) : null;
}
