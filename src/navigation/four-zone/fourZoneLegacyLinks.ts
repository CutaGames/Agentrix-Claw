/**
 * fourZoneLegacyLinks — where an old deep link lands in the four-zone IA
 * (M1-i; product doc 5.7 M1 "旧路由映射到新 IA 或'链接无效'页", D7).
 *
 * Pure (no React Native import). Runs after `fourZoneStateFromPath` found no
 * zone link, in this order:
 *   1. The link points at a retired feature (玩乐 / 广场 / 私信 / 共养 / 贺卡 /
 *      空投 / NFT 铸造): the "this link no longer works" notice.
 *   2. The old path has a real four-zone equivalent (for example `me/settings`
 *      → 我的 → 设置, the old home tab → 伙伴): that zone and tab. Nothing from
 *      the link (query, ids) is carried over.
 *   3. Otherwise the existing legacy resolution runs and the link opens the
 *      hidden legacy route it always opened (D7, 5.3 "保留为隐藏路由").
 *   4. A legacy path no route matches: the family it belongs to, when it has
 *      one (M1-o: an old 设备 / 高级 / 钱包 link opens 我的 → 设备 / 设置 /
 *      钱包; the desktop QR link `connect` opens the in-app scanner, without
 *      the token it carries), otherwise the notice instead of silently doing
 *      nothing.
 * The notice carries only a fixed reason code, never text from the link.
 */
import { resolveLegacyPath } from '../legacyRouteTable';
import { MOBILE_M0_ENABLED } from '../../services/mobileM0';
import type { NavDestination } from '../navCatalog';
import { fourZoneStateForDestination, fourZoneStateFromPath, type FourZonePartialState } from './fourZoneLinking';
import { ZONE_UNAVAILABLE_ROUTE } from './fourZoneRoutes';

export const FOUR_ZONE_LINK_NOTICE_REASONS = ['link_retired', 'link_unknown'] as const;
export type FourZoneLinkNoticeReason = (typeof FOUR_ZONE_LINK_NOTICE_REASONS)[number];

export function isFourZoneLinkNoticeReason(value: unknown): value is FourZoneLinkNoticeReason {
  return (FOUR_ZONE_LINK_NOTICE_REASONS as readonly unknown[]).includes(value);
}

/**
 * Old paths (as they arrive, before the legacy table) whose features are
 * retired. The legacy table sends these to the old 集市 root; in the
 * four-zone IA that would be a hidden page unrelated to the link. A pattern
 * ending in `/*` matches its base path and anything under it.
 */
export const FOUR_ZONE_RETIRED_LEGACY_PATHS: readonly string[] = [
  // 玩乐 / 预测 (D22)
  'discover/predict',
  'discover/predict/*',
  // 广场
  'discover/feed',
  'discover/post/*',
  'discover/user/*',
  'social',
  'social/feed',
  'social/post/*',
  'social/user/*',
  // 私信
  'social/dm/*',
  'social/group/*',
  'social/chat-list',
  // 共养 / 贺卡
  'co_raising',
  'co-raising',
  'co-raising/*',
  'greeting',
  'greeting/*',
  'home/co-raising',
  'home/co-raising/*',
  // 空投, NFT 铸造
  'airdrop',
  'home/nft-mint',
];

/**
 * Old canonical paths (after the legacy table) of the directions an M0 build does not register (`mobileM0.ts`): the
 * world / creation platform, plaza and its markets, AXP points and the pet screens. Checked after the redirects, so
 * `world` itself still opens 伙伴 and `me/pet/memory` still opens 我的 → 身份.
 */
export const MOBILE_M0_RETIRED_CANONICAL_PATHS: readonly string[] = [
  'world/*',
  'creation/*',
  'plaza/*',
  'me/axp/*',
  'me/pet/wardrobe',
  'me/pet/soul',
  'me/pet/breed',
  'me/pet/playground',
  'me/pet/skins',
];

/** Old canonical paths (after the legacy table) that have a real four-zone screen. */
export const FOUR_ZONE_LEGACY_REDIRECTS: Readonly<Record<string, NavDestination>> = {
  // The old default tabs; 伙伴 is the four-zone default (5.3).
  world: { zone: 'companion', tab: 'chat' },
  // `today` → `home` in the legacy table is one hop short of `world`.
  home: { zone: 'companion', tab: 'chat' },
  summon: { zone: 'companion', tab: 'chat' },
  me: { zone: 'my', tab: 'home' },
  'me/settings': { zone: 'my', tab: 'settings' },
  'me/subscribe': { zone: 'my', tab: 'plan' },
  'me/wallet': { zone: 'my', tab: 'wallet' },
  'me/wallet/connect': { zone: 'my', tab: 'wallet' },
  'me/pet/memory': { zone: 'my', tab: 'identity' },
  'me/devices/toy': { zone: 'my', tab: 'devices' },
  'me/devices/desktop': { zone: 'matters', tab: 'on-computer' },
};

/**
 * Families for old paths that resolve to no registered route (checked only
 * after the legacy route parser found nothing, so a hidden route that still
 * exists keeps winning, D7). Longest prefix first; nothing from the link is
 * carried over.
 */
export const FOUR_ZONE_LEGACY_FAMILY_FALLBACKS: ReadonlyArray<{ prefix: string; destination: NavDestination }> = [
  { prefix: 'me/devices', destination: { zone: 'my', tab: 'devices' } },
  { prefix: 'me/advanced', destination: { zone: 'my', tab: 'settings' } },
  { prefix: 'me/wallet', destination: { zone: 'my', tab: 'wallet' } },
];

/**
 * The desktop installer's QR link (`agentrix://connect?instanceId=…&token=…&host=…`)
 * has no registered route. It opens the in-app scanner, which reads the QR
 * itself and asks before connecting; the token in the link is dropped.
 */
export const FOUR_ZONE_SCANNER_LEGACY_PATHS: readonly string[] = ['connect', 'agent/local-connect', 'me/devices/local-connect'];
export const FOUR_ZONE_SCANNER_PATH = 'scan' as const;

function ownRedirect(canonical: string): NavDestination | null {
  return Object.prototype.hasOwnProperty.call(FOUR_ZONE_LEGACY_REDIRECTS, canonical) ? FOUR_ZONE_LEGACY_REDIRECTS[canonical] : null;
}

export function fourZoneLegacyFamilyFallback(canonicalPath: string): NavDestination | null {
  const clean = cleanLinkPath(canonicalPath);
  const match = FOUR_ZONE_LEGACY_FAMILY_FALLBACKS.find(({ prefix }) => clean === prefix || clean.startsWith(`${prefix}/`));
  return match ? { zone: match.destination.zone, tab: match.destination.tab } : null;
}

export type FourZoneLegacyOutcome =
  | { kind: 'zone'; destination: NavDestination }
  | { kind: 'notice'; reason: FourZoneLinkNoticeReason }
  /** Hand to React Navigation (hidden legacy routes); `path` is the legacy table's output. */
  | { kind: 'legacy'; path: string };

/** `/a/b/?x=1#y` → `a/b`. */
export function cleanLinkPath(path: string): string {
  return String(path ?? '')
    .replace(/[?#].*$/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return path === base || path.startsWith(`${base}/`);
  }
  return path === pattern;
}

export function isRetiredLegacyPath(path: string): boolean {
  const clean = cleanLinkPath(path);
  return FOUR_ZONE_RETIRED_LEGACY_PATHS.some((pattern) => matchesPattern(clean, pattern));
}

export function isMobileM0RetiredCanonicalPath(path: string): boolean {
  const clean = cleanLinkPath(path);
  return MOBILE_M0_RETIRED_CANONICAL_PATHS.some((pattern) => matchesPattern(clean, pattern));
}

/** `null` for an empty path (opening the app with a bare scheme keeps the current screen). */
export function classifyFourZoneLegacyPath(path: string, m0: boolean = MOBILE_M0_ENABLED): FourZoneLegacyOutcome | null {
  const raw = cleanLinkPath(path);
  if (!raw) return null;
  if (isRetiredLegacyPath(raw)) return { kind: 'notice', reason: 'link_retired' };
  const resolved = resolveLegacyPath(String(path ?? ''));
  const canonical = cleanLinkPath(resolved);
  // Checked on both: the legacy table does not match a path that still carries a query.
  if (FOUR_ZONE_SCANNER_LEGACY_PATHS.includes(raw) || FOUR_ZONE_SCANNER_LEGACY_PATHS.includes(canonical)) {
    return { kind: 'legacy', path: FOUR_ZONE_SCANNER_PATH };
  }
  const destination = ownRedirect(canonical);
  if (destination) return { kind: 'zone', destination: { zone: destination.zone, tab: destination.tab } };
  if (m0 && (isMobileM0RetiredCanonicalPath(canonical) || isMobileM0RetiredCanonicalPath(raw))) return { kind: 'notice', reason: 'link_retired' };
  return { kind: 'legacy', path: resolved };
}

export function fourZoneLinkNoticeState(reason: FourZoneLinkNoticeReason): FourZonePartialState {
  // Keep Main underneath so "back" lands inside the app.
  return { routes: [{ name: 'Main' }, { name: ZONE_UNAVAILABLE_ROUTE, params: { reason } }] };
}

/**
 * Four-zone fallback for a path that is not a zone link. `legacyState` is
 * React Navigation's own parser over the existing linking config; when it
 * finds no route the notice opens instead.
 */
export function fourZoneStateFromLegacyPath<T>(
  path: string,
  legacyState: (legacyPath: string) => T | undefined,
): FourZonePartialState | T | undefined {
  const outcome = classifyFourZoneLegacyPath(path);
  if (!outcome) return legacyState(String(path ?? ''));
  if (outcome.kind === 'notice') return fourZoneLinkNoticeState(outcome.reason);
  if (outcome.kind === 'zone') return fourZoneStateForDestination(outcome.destination);
  const state = legacyState(outcome.path);
  if (state !== undefined) return state;
  const family = fourZoneLegacyFamilyFallback(outcome.path);
  return family ? fourZoneStateForDestination(family) : fourZoneLinkNoticeState('link_unknown');
}

/**
 * The four-zone `getStateFromPath`: a zone link first (M1-c), then the legacy
 * mapping above (M1-i). Never throws. React Navigation calls this from its
 * `url` listener without a try/catch, and its own parser throws `URIError`
 * on a malformed escape in a path param (`agentrix://onboarding/social/%E0`),
 * so an exception here would be an uncaught JS error that closes the release
 * app. Any failure opens the "link no longer works" notice instead.
 */
export function resolveFourZoneLinkState<T>(
  path: string,
  legacyState: (legacyPath: string) => T | undefined,
): FourZonePartialState | T | undefined {
  try {
    return fourZoneStateFromPath(path) ?? fourZoneStateFromLegacyPath(path, legacyState);
  } catch {
    return fourZoneLinkNoticeState('link_unknown');
  }
}
