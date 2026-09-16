/**
 * Legacy family → V7 IA resolution — MTR-R08 / M1.3.1.
 *
 * `legacyRouteTable.ts` maps the *pre-4-tab* paths onto today's
 * World / Summon / Plaza / Me IA. This module handles the next hop: once
 * `mobile.agent_first_ia` is on, those four families (plus the Pet family
 * re-homed under `me/pet/*`) are themselves legacy.
 *
 * Rules, in order:
 * 1. A family whose V7 route contract has an exact counterpart maps onto it
 *    (`summon` → `/agents`, `me/*` → `/my?section=…`, World creation ids →
 *    `/creation/:id`).
 * 2. World and Plaza are *hidden routes* behind the L2 product flag
 *    `mobile.world_plaza_l2_surface` (M0.0.7, decision d-35, 2026-09-16): the
 *    navigator still mounts them with no tab button (R09.7), but the flag is
 *    off by default, so their legacy paths land on
 *    `destination-error(surface_flag_off)` — the card's copy is the user
 *    migration note. Flag on → pass through unchanged (share links / QR codes
 *    / pushes resolve again). Aeon / Market / Social links reach here through
 *    `legacyRouteTable` rewrites into `world/*` / `plaza/*`.
 * 3. The Pet family (`me/pet/*`, `me/axp*`) is NOT withdrawn (d-35: it is the
 *    canonical Agent's Shell). It still follows `mobile.pet_l2_surface`, which
 *    now defaults on and only remains as the kill switch (MTR-R09.8). Flag on
 *    → pass through; flag off → `destination-error(surface_flag_off)`.
 *    The caller supplies both flag values; this module stays a pure function
 *    and fails closed when a value is missing.
 * 4. Anything else that looks like a family member but matches no rule is an
 *    honest `unknown_route` error, never a guessed landing.
 */

export type LegacyFamily = 'world' | 'summon' | 'plaza' | 'me' | 'pet';

export type LegacyFamilyErrorReason =
  /** Surface exists but its withdrawal from the default IA is an open product decision (M0.0.7). */
  | 'pending_ia_decision'
  /** Surface is behind a product flag that is currently off (MTR-R09.2 / R09.8). */
  | 'surface_flag_off'
  /** Surface is gone for good; nothing in V7 replaces it. */
  | 'legacy_route_retired'
  /** Path looks like a family member but matches no rule. */
  | 'unknown_route';

export type LegacyFamilyResolution =
  | { readonly ok: true; readonly family: LegacyFamily; readonly path: string }
  | { readonly ok: false; readonly family: LegacyFamily; readonly reason: LegacyFamilyErrorReason };

export interface LegacyFamilyOptions {
  /**
   * `isPetSurfaceEnabled()` at the call site. Defaults to `false` so a caller
   * that forgets to pass it fails closed (Pet hidden), never open.
   */
  readonly petSurfaceEnabled?: boolean;
  /**
   * `isWorldPlazaSurfaceEnabled()` at the call site (decision d-35). Defaults
   * to `false` — the product default — so a caller that forgets to pass it
   * fails closed (World / Plaza deep links land on destination-error).
   */
  readonly worldPlazaSurfaceEnabled?: boolean;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

function stripPath(input: string): string {
  return String(input ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Re-emit a family path in canonical form (`/a/b?x=y`), so pass-through is idempotent. */
function passThrough(clean: string): string {
  return `/${clean}`;
}

export function legacyFamilyOf(path: string): LegacyFamily | null {
  const head = stripPath(path).split(/[/?#]/, 1)[0];
  switch (head) {
    case 'world':
    case 'summon':
    case 'plaza':
    case 'me':
      return head;
    default:
      return null;
  }
}

/**
 * `me/pet/*` and `me/axp*` are the Pet family even though they sit under the
 * Me prefix (MTR-R09.3 lists AxpCenter / AxpRewardShop with the pet screens:
 * AXP is the pet earning flywheel's currency).
 */
function isPetPath(segments: string[]): boolean {
  return segments[0] === 'me' && (segments[1] === 'pet' || segments[1] === 'axp');
}

/** Me sub-pages that map onto `/my?section=…`. */
const ME_SECTIONS: Readonly<Record<string, string>> = Object.freeze({
  account: 'account',
  settings: 'settings',
  orders: 'orders',
  skills: 'skills',
  subscribe: 'subscribe',
  promote: 'promote',
  wallet: 'wallet',
  devices: 'devices',
});

function resolveMe(segments: string[]): LegacyFamilyResolution {
  if (segments.length === 1) return { ok: true, family: 'me', path: '/my' };
  if (segments[1] === 'notifications') return { ok: true, family: 'me', path: '/inbox' };
  if (segments[1] === 'scan') return { ok: true, family: 'me', path: '/scan' };
  // Team (`agent/team-space` → `me/team/*`) is one of the surfaces d-35
  // withdraws from the default IA (M0.0.7). The Me stack registers no Team
  // route, so there is nothing for a flag to re-open here: the migration card
  // is the only honest landing, and a better one than `unknown_route`.
  if (segments[1] === 'team') return { ok: false, family: 'me', reason: 'surface_flag_off' };
  const section = ME_SECTIONS[segments[1]];
  if (section) return { ok: true, family: 'me', path: `/my?section=${section}` };
  return { ok: false, family: 'me', reason: 'unknown_route' };
}

function resolveSummon(segments: string[]): LegacyFamilyResolution {
  // Summon is the conversation surface; in V7 that is the Agent tab, voice
  // and text alike. Full-duplex calling is M3 and has no route yet, so a
  // deeper path is an error rather than a silent landing on chat.
  if (segments.length === 1) return { ok: true, family: 'summon', path: '/agents' };
  if (segments.length === 2 && segments[1] === 'voice') {
    return { ok: true, family: 'summon', path: '/agents' };
  }
  return { ok: false, family: 'summon', reason: 'unknown_route' };
}

/** Every segment must be a safe opaque token; otherwise the path is not passed through. */
function segmentsAreSafe(segments: string[]): boolean {
  return segments.every((segment) => SAFE_SEGMENT.test(segment));
}

function resolveWorld(
  segments: string[],
  clean: string,
  options: LegacyFamilyOptions,
): LegacyFamilyResolution {
  // World paths that carry a creation id have an exact V7 counterpart:
  // `/creation/:creationId` is in the V7 contract already (Creation is an
  // Economy sub-route, MTR-R09.4) — never gated by the World flag.
  if (segments.length === 3 && (segments[1] === 'creation' || segments[1] === 'experience')) {
    const creationId = segments[2];
    if (!SAFE_SEGMENT.test(creationId)) {
      return { ok: false, family: 'world', reason: 'unknown_route' };
    }
    return { ok: true, family: 'world', path: `/creation/${encodeURIComponent(creationId)}` };
  }
  // Everything else is a hidden route behind `mobile.world_plaza_l2_surface`
  // (decision d-35): flag off → the destination-error card (migration note);
  // flag on → the World stack is still mounted without a tab button, so the
  // legacy path resolves as-is.
  if (options.worldPlazaSurfaceEnabled !== true) {
    return { ok: false, family: 'world', reason: 'surface_flag_off' };
  }
  if (!segmentsAreSafe(segments)) return { ok: false, family: 'world', reason: 'unknown_route' };
  return { ok: true, family: 'world', path: passThrough(clean) };
}

function resolvePlaza(
  segments: string[],
  clean: string,
  options: LegacyFamilyOptions,
): LegacyFamilyResolution {
  // Hidden route behind the same L2 flag as World (decision d-35).
  if (options.worldPlazaSurfaceEnabled !== true) {
    return { ok: false, family: 'plaza', reason: 'surface_flag_off' };
  }
  if (!segmentsAreSafe(segments)) return { ok: false, family: 'plaza', reason: 'unknown_route' };
  return { ok: true, family: 'plaza', path: passThrough(clean) };
}

function resolvePet(
  segments: string[],
  clean: string,
  options: LegacyFamilyOptions,
): LegacyFamilyResolution {
  // MTR-R09.3 / R09.8: the Pet family follows `mobile.pet_l2_surface`
  // (default on since d-35 — the flag is the kill switch, not a withdrawal).
  if (options.petSurfaceEnabled !== true) {
    return { ok: false, family: 'pet', reason: 'surface_flag_off' };
  }
  if (!segmentsAreSafe(segments)) return { ok: false, family: 'pet', reason: 'unknown_route' };
  return { ok: true, family: 'pet', path: passThrough(clean) };
}

/**
 * Resolve a legacy-family path under the V7 IA.
 * Returns `null` when the path is not one of the five families, so the caller
 * can fall through to its own handling.
 */
export function resolveLegacyFamilyForV7(
  path: string,
  options: LegacyFamilyOptions = {},
): LegacyFamilyResolution | null {
  const clean = stripPath(path);
  if (!clean) return null;
  const [pathname] = clean.split(/[?#]/, 1);
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  if (isPetPath(segments)) return resolvePet(segments, clean, options);

  switch (segments[0]) {
    case 'me':
      return resolveMe(segments);
    case 'summon':
      return resolveSummon(segments);
    case 'world':
      return resolveWorld(segments, clean, options);
    case 'plaza':
      return resolvePlaza(segments, clean, options);
    default:
      return null;
  }
}

export function legacyFamilyErrorPath(reason: LegacyFamilyErrorReason): string {
  return `/destination-error?reason=${encodeURIComponent(reason)}`;
}

/** Convenience: always yields a path, never `null`, for a family member. */
export function resolveLegacyFamilyPath(
  path: string,
  options: LegacyFamilyOptions = {},
): string | null {
  const result = resolveLegacyFamilyForV7(path, options);
  if (result === null) return null;
  // `=== true` on purpose: the project compiles with `strict: false`, and a
  // truthiness check does not narrow the union in the falsy branch there.
  return result.ok === true ? result.path : legacyFamilyErrorPath(result.reason);
}
