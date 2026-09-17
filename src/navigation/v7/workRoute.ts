/**
 * Work-tab deep links — M2 slice A3 (decision d-50), MTR-R10 / R12.
 *
 *   agentrix://work
 *   agentrix://work/machines?agentId=…&machineRef=…
 *   agentrix://work/sessions?agentId=…&sessionRef=…&machineRef=…&instructionRef=…&actionRef=…
 *   agentrix://work/approvals?agentId=…&approvalRef=…&source=push|internal
 *   agentrix://work/receipts?agentId=…&actionRef=…
 *   agentrix://work/handoffs?agentId=…&handoffRef=…
 *
 * Every identifier is an opaque ref in the same alphabet
 * `parseDeveloperWorkspaceOpenRoute` accepts (SAFE_REF); keys that could
 * smuggle a secret or a local path are refused outright; anything else lands
 * on destination-error with the V7 route-contract error code. The screens
 * therefore only ever see validated params. Pure: no navigation, no store.
 */

export const WORK_ROUTE_SCREENS = Object.freeze({
  '': 'WorkHome',
  machines: 'WorkMachines',
  sessions: 'WorkSessions',
  approvals: 'WorkApprovals',
  receipts: 'WorkReceipts',
  handoffs: 'WorkHandoffs',
} as const);

export type WorkRouteScreen = (typeof WORK_ROUTE_SCREENS)[keyof typeof WORK_ROUTE_SCREENS];

export const WORK_ROUTE_PATHS: Readonly<Record<WorkRouteScreen, string>> = Object.freeze({
  WorkHome: 'work',
  WorkMachines: 'work/machines',
  WorkSessions: 'work/sessions',
  WorkApprovals: 'work/approvals',
  WorkReceipts: 'work/receipts',
  WorkHandoffs: 'work/handoffs',
});

const ALLOWED_QUERY: Readonly<Record<WorkRouteScreen, readonly string[]>> = Object.freeze({
  WorkHome: ['agentId', 'fixture'],
  WorkMachines: ['agentId', 'machineRef', 'fixture'],
  WorkSessions: ['agentId', 'sessionRef', 'machineRef', 'instructionRef', 'actionRef', 'fixture'],
  WorkApprovals: ['agentId', 'approvalRef', 'source', 'fixture'],
  WorkReceipts: ['agentId', 'actionRef', 'fixture'],
  WorkHandoffs: ['agentId', 'handoffRef', 'fixture'],
});

/** Screens that cannot render without an Agent scope (MTR-R17.6: never guess one). */
const REQUIRES_AGENT: ReadonlySet<WorkRouteScreen> = new Set([
  'WorkMachines',
  'WorkSessions',
  'WorkReceipts',
  'WorkHandoffs',
]);

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const ABSOLUTE_PATH = /(?:^[A-Za-z]:[\\/])|(?:^\\\\)|(?:^\/)|(?:^~[\\/])|(?:^file:)/i;
const FORBIDDEN_KEYS =
  /^(?:token|secret|password|cookie|authorization|path|absolutepath|localpath|filepath|command|prompt|diff|body|payload)$/i;
const SOURCES: ReadonlySet<string> = new Set(['push', 'internal']);
const MAX_INPUT_LENGTH = 2_048;

export type WorkRouteErrorCode =
  | 'unknown_route'
  | 'invalid_identifier'
  | 'invalid_query'
  | 'unsafe_parameter'
  | 'malformed_url';

export type WorkRouteResult =
  | { ok: true; screen: WorkRouteScreen; params: Readonly<Record<string, string>>; path: string }
  | { ok: false; code: WorkRouteErrorCode };

function stripToPath(input: string): { pathname: string; query: URLSearchParams } | null {
  const trimmed = String(input ?? '').trim();
  if (!trimmed || trimmed.length > MAX_INPUT_LENGTH || trimmed.includes('\0')) return null;
  try {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
      const url = new URL(trimmed);
      if (url.hash || url.username || url.password || url.port) return null;
      const pathname = url.protocol === 'agentrix:' ? `/${url.hostname}${url.pathname}` : url.pathname;
      return { pathname, query: url.searchParams };
    }
    if (trimmed.startsWith('//')) return null;
    const url = new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, 'https://mobile-route.invalid');
    if (url.hash) return null;
    return { pathname: url.pathname, query: url.searchParams };
  } catch {
    return null;
  }
}

/** True for any `work` / `work/*` path, valid or not — the caller then normalises it. */
export function isWorkRoutePath(input: string): boolean {
  const parsed = stripToPath(input);
  if (!parsed) return /^\/?work(?:\/|\?|#|$)/.test(String(input ?? '').trim());
  return /^\/?work(?:\/|$)/.test(parsed.pathname);
}

export function parseWorkRoute(input: string): WorkRouteResult {
  const parsed = stripToPath(input);
  if (!parsed) return { ok: false, code: 'malformed_url' };
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'work' || segments.length > 2) return { ok: false, code: 'unknown_route' };
  const sub = segments[1] ?? '';
  if (!Object.prototype.hasOwnProperty.call(WORK_ROUTE_SCREENS, sub)) {
    return { ok: false, code: 'unknown_route' };
  }
  const screen = WORK_ROUTE_SCREENS[sub as keyof typeof WORK_ROUTE_SCREENS];
  const allowed = ALLOWED_QUERY[screen];

  const params: Record<string, string> = {};
  const seen = new Set<string>();
  let failure: WorkRouteErrorCode | null = null;
  parsed.query.forEach((value, key) => {
    if (failure) return;
    if (FORBIDDEN_KEYS.test(key.replace(/[_-]/g, ''))) { failure = 'unsafe_parameter'; return; }
    if (seen.has(key)) { failure = 'invalid_query'; return; }
    seen.add(key);
    if (!allowed.includes(key)) { failure = 'invalid_query'; return; }
    if (key === 'fixture') {
      if (value !== '1') { failure = 'invalid_query'; return; }
    } else if (key === 'source') {
      if (!SOURCES.has(value)) { failure = 'invalid_query'; return; }
    } else if (!SAFE_REF.test(value) || ABSOLUTE_PATH.test(value)) {
      failure = 'invalid_identifier';
      return;
    }
    params[key] = value;
  });
  if (failure) return { ok: false, code: failure };
  if (REQUIRES_AGENT.has(screen) && !params.agentId) return { ok: false, code: 'invalid_identifier' };

  const ordered = Object.keys(params).sort();
  const queryString = ordered.length
    ? `?${ordered.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&')}`
    : '';
  return { ok: true, screen, params, path: `/${WORK_ROUTE_PATHS[screen]}${queryString}` };
}

/**
 * The string `resolveIncomingPath` hands to React Navigation for a Work link:
 * the canonical path, or the destination-error card with the failure code.
 */
export function normalizeWorkRoutePath(input: string): string {
  const result = parseWorkRoute(input);
  // `=== true`: the app tsconfig is `strict: false`, truthiness does not narrow.
  if (result.ok === true) return result.path;
  return `/destination-error?reason=${encodeURIComponent(result.code)}`;
}
