export const MOBILE_V7_ROUTE_SCHEMA_VERSION = 'mobile-route/v7' as const;

export const MOBILE_V7_TAB_ROUTE_IDS = ['Agent', 'Action', 'Creation', 'My'] as const;
export type MobileV7TabRouteId = (typeof MOBILE_V7_TAB_ROUTE_IDS)[number];

export type SoulCardFlowStep =
  | 'capability'
  | 'scan'
  | 'attest'
  | 'preview'
  | 'tap'
  | 'receipt'
  | 'complete'
  | 'error';

type EmptyParams = Record<string, never>;

export interface MobileV7RouteParamsMap {
  Agent: EmptyParams;
  AgentDetail: { agentId: string };
  AgentActions: { agentId: string };
  AgentSoulCore: { agentId: string };
  AgentTrust: { agentId: string };
  Action: { agentId?: string };
  GoalComposer: { agentId: string };
  CandidateCompare: { agentId: string; goalId: string; planId?: string };
  AuthorityReview: { agentId: string; actionId: string };
  ActionDetail: { agentId: string; actionId: string; view?: 'tracking' | 'receipt' };
  Creation: { mode?: string; filter?: string };
  CreationDetail: { creationId: string };
  My: { section?: string };
  Prediction: EmptyParams;
  Lsm: EmptyParams;
  SoulCardFlow: { agentId: string; step?: SoulCardFlowStep; actionId?: string };
  Inbox: EmptyParams;
  Scan: EmptyParams;
  DestinationError: { reason: string };
}

export type MobileV7RouteId = keyof MobileV7RouteParamsMap;
export type MobileV7DestinationFor<K extends MobileV7RouteId> = Readonly<{
  schemaVersion: typeof MOBILE_V7_ROUTE_SCHEMA_VERSION;
  route: K;
  params: Readonly<MobileV7RouteParamsMap[K]>;
}>;
export type MobileV7Destination = {
  [K in MobileV7RouteId]: MobileV7DestinationFor<K>;
}[MobileV7RouteId];

export type MobileV7RouteErrorCode =
  | 'empty_input'
  | 'input_too_long'
  | 'malformed_url'
  | 'unsupported_origin'
  | 'unsupported_version'
  | 'unknown_route'
  | 'invalid_identifier'
  | 'invalid_query'
  | 'unsafe_parameter';

export interface MobileV7RouteError {
  code: MobileV7RouteErrorCode;
  message: string;
}

export type MobileV7RouteParseResult =
  | { ok: true; destination: MobileV7Destination }
  | { ok: false; error: MobileV7RouteError };

export type MobileV7RouteNormalizeResult =
  | { ok: true; destination: MobileV7Destination; path: string }
  | { ok: false; error: MobileV7RouteError };

const MAX_INPUT_LENGTH = 2_048;
const MAX_SEGMENTS = 7;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HTTPS_HOSTS = new Set(['agentrix.top']);
const SOUL_CARD_STEPS: ReadonlySet<string> = new Set<SoulCardFlowStep>([
  'capability', 'scan', 'attest', 'preview', 'tap', 'receipt', 'complete', 'error',
]);

class MobileV7RouteCodecError extends Error {
  constructor(readonly code: MobileV7RouteErrorCode, message: string) {
    super(message);
    this.name = 'MobileV7RouteCodecError';
  }
}

function fail(code: MobileV7RouteErrorCode, message: string): never {
  throw new MobileV7RouteCodecError(code, message);
}

function destination<K extends MobileV7RouteId>(
  route: K,
  params: MobileV7RouteParamsMap[K],
): MobileV7DestinationFor<K> {
  return { schemaVersion: MOBILE_V7_ROUTE_SCHEMA_VERSION, route, params };
}

function assertId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    fail('invalid_identifier', `Invalid ${name}`);
  }
  return value;
}

function assertSlug(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !SAFE_SLUG.test(value)) {
    fail('invalid_query', `Invalid ${name}`);
  }
  return value;
}

function parseInput(inputValue: string): { segments: string[]; query: URLSearchParams } {
  if (typeof inputValue !== 'string' || !inputValue.trim()) fail('empty_input', 'Route input is empty');
  const input = inputValue.trim();
  if (input.length > MAX_INPUT_LENGTH) fail('input_too_long', 'Route input exceeds the maximum length');
  if (input.includes('\0') || /(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|\?|#|$)/i.test(input)) {
    fail('unsafe_parameter', 'Route input contains traversal characters');
  }

  let url: URL;
  let pathname: string;
  try {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(input)) {
      url = new URL(input);
      if (url.hash) fail('invalid_query', 'Route fragments are not supported');
      if (url.protocol === 'agentrix:') {
        if (url.username || url.password || url.port) fail('unsafe_parameter', 'Unsafe custom URL authority');
        pathname = `/${url.hostname}${url.pathname}`;
      } else if (url.protocol === 'https:' && HTTPS_HOSTS.has(url.hostname.toLowerCase())) {
        pathname = url.pathname;
      } else {
        fail('unsupported_origin', 'Route origin is not allowed');
      }
    } else {
      if (input.startsWith('//')) fail('unsupported_origin', 'Protocol-relative URLs are not allowed');
      url = new URL(input.startsWith('/') ? input : `/${input}`, 'https://mobile-route.invalid');
      if (url.hash) fail('invalid_query', 'Route fragments are not supported');
      pathname = url.pathname;
    }
  } catch (error) {
    if (error instanceof MobileV7RouteCodecError) throw error;
    return fail('malformed_url', 'Route URL is malformed');
  }

  const segments = pathname.split('/').filter(Boolean).map((raw) => {
    try {
      const value = decodeURIComponent(raw);
      if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
        return fail('unsafe_parameter', 'Route contains an unsafe path segment');
      }
      return value;
    } catch {
      return fail('malformed_url', 'Route contains invalid percent encoding');
    }
  });
  if (segments.length > MAX_SEGMENTS) fail('unknown_route', 'Route has too many path segments');

  const seen = new Set<string>();
  url.searchParams.forEach((_value, key) => {
    if (seen.has(key)) fail('invalid_query', 'Duplicate query parameters are not allowed');
    seen.add(key);
  });
  const version = url.searchParams.get('v');
  if (version !== null && version !== '7') fail('unsupported_version', 'Unsupported mobile route version');
  url.searchParams.delete('v');
  return { segments, query: url.searchParams };
}

function readQuery(
  query: URLSearchParams,
  allowed: readonly string[],
  idKeys: readonly string[] = [],
): Record<string, string> {
  const result: Record<string, string> = {};
  const allow = new Set(allowed);
  query.forEach((value, key) => {
    if (!allow.has(key)) fail('invalid_query', `Unsupported query parameter: ${key}`);
    result[key] = idKeys.includes(key) ? assertId(value, key) : assertSlug(value, key)!;
  });
  return result;
}

function parseDestination(input: string): MobileV7Destination {
  const { segments: s, query } = parseInput(input);
  const first = s[0];

  if (s.length === 1 && first === 'agents') {
    readQuery(query, []);
    return destination('Agent', {});
  }
  if (first === 'agents' && s.length >= 2) {
    const agentId = assertId(s[1], 'agentId');
    if (s.length === 2) {
      readQuery(query, []);
      return destination('AgentDetail', { agentId });
    }
    if (s.length === 3 && s[2] === 'actions') {
      readQuery(query, []);
      return destination('AgentActions', { agentId });
    }
    if (s.length === 4 && s[2] === 'actions') {
      const actionId = assertId(s[3], 'actionId');
      const params = readQuery(query, ['view']);
      const view = params.view;
      if (view && view !== 'tracking' && view !== 'receipt') fail('invalid_query', 'Invalid action view');
      return destination('ActionDetail', { agentId, actionId, ...(view ? { view: view as 'tracking' | 'receipt' } : {}) });
    }
    if (s.length === 3 && s[2] === 'soul-core') {
      readQuery(query, []);
      return destination('AgentSoulCore', { agentId });
    }
    if (s.length === 3 && s[2] === 'trust') {
      readQuery(query, []);
      return destination('AgentTrust', { agentId });
    }
  }

  if (first === 'actions') {
    if (s.length === 1) return destination('Action', readQuery(query, ['agentId'], ['agentId']));
    if (s.length === 2 && s[1] === 'new') {
      const params = readQuery(query, ['agentId'], ['agentId']);
      if (!params.agentId) fail('invalid_identifier', 'Missing agentId');
      return destination('GoalComposer', { agentId: params.agentId });
    }
    if (s.length === 2 && s[1] === 'compare') {
      const params = readQuery(query, ['agentId', 'goalId', 'planId'], ['agentId', 'goalId', 'planId']);
      if (!params.agentId || !params.goalId) fail('invalid_identifier', 'Missing compare identifiers');
      return destination('CandidateCompare', {
        agentId: params.agentId,
        goalId: params.goalId,
        ...(params.planId ? { planId: params.planId } : {}),
      });
    }
    if (s.length === 3 && s[2] === 'authority') {
      const params = readQuery(query, ['agentId'], ['agentId']);
      if (!params.agentId) fail('invalid_identifier', 'Missing agentId');
      return destination('AuthorityReview', { agentId: params.agentId, actionId: assertId(s[1], 'actionId') });
    }
  }

  if (first === 'creation') {
    if (s.length === 1) return destination('Creation', readQuery(query, ['mode', 'filter']));
    if (s.length === 2) {
      readQuery(query, []);
      return destination('CreationDetail', { creationId: assertId(s[1], 'creationId') });
    }
  }
  if (s.length === 1 && first === 'my') return destination('My', readQuery(query, ['section']));
  if (s.length === 1 && first === 'prediction') {
    readQuery(query, []);
    return destination('Prediction', {});
  }
  if (s.length === 1 && first === 'lsm') {
    readQuery(query, []);
    return destination('Lsm', {});
  }
  if (s.length === 2 && first === 'my' && s[1] === 'soul-card') {
    const params = readQuery(query, ['agentId', 'step', 'actionId'], ['agentId', 'actionId']);
    if (!params.agentId) fail('invalid_identifier', 'Missing agentId');
    if (params.step && !SOUL_CARD_STEPS.has(params.step)) fail('invalid_query', 'Invalid Soul Card flow step');
    return destination('SoulCardFlow', {
      agentId: params.agentId,
      ...(params.step ? { step: params.step as SoulCardFlowStep } : {}),
      ...(params.actionId ? { actionId: params.actionId } : {}),
    });
  }
  if (s.length === 1 && first === 'inbox') {
    readQuery(query, []);
    return destination('Inbox', {});
  }
  if (s.length === 1 && first === 'scan') {
    readQuery(query, []);
    return destination('Scan', {});
  }
  if (s.length === 1 && first === 'destination-error') {
    const params = readQuery(query, ['reason']);
    if (!params.reason) fail('invalid_query', 'Destination error reason is required');
    return destination('DestinationError', { reason: params.reason });
  }

  return fail('unknown_route', 'Route is not part of the Mobile V7 contract');
}

export function isMobileV7RouteCandidate(input: string): boolean {
  if (typeof input !== 'string' || !input.trim()) return false;
  let routePath = input.trim();
  try {
    const url = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(routePath)
      ? new URL(routePath)
      : new URL(routePath.startsWith('/') ? routePath : `/${routePath}`, 'https://mobile-route.invalid');
    routePath = url.protocol === 'agentrix:'
      ? `${url.hostname}${url.pathname}`
      : url.pathname;
  } catch {
    routePath = routePath.split(/[?#]/, 1)[0];
  }
  routePath = routePath.replace(/^\/+/, '');
  return /^(?:agents|actions|creation|prediction|lsm|destination-error)(?:\/|$)/.test(routePath)
    || /^my\/soul-card(?:\/|$)/.test(routePath);
}

export function parseMobileV7Route(input: string): MobileV7RouteParseResult {
  try {
    return { ok: true, destination: parseDestination(input) };
  } catch (error) {
    if (error instanceof MobileV7RouteCodecError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return { ok: false, error: { code: 'malformed_url', message: 'Route could not be parsed' } };
  }
}

function queryString(entries: ReadonlyArray<readonly [string, string | undefined]>): string {
  const value = entries
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
    .map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`)
    .join('&');
  return value ? `?${value}` : '';
}

export function serializeMobileV7Route(value: MobileV7Destination): string {
  if (!value || value.schemaVersion !== MOBILE_V7_ROUTE_SCHEMA_VERSION) {
    return fail('unsupported_version', 'Destination uses an unsupported route schema');
  }
  const p = value.params as Record<string, unknown>;
  const id = (name: string) => encodeURIComponent(assertId(p[name], name));
  const slug = (name: string) => assertSlug(p[name], name);
  switch (value.route) {
    case 'Agent': return '/agents';
    case 'AgentDetail': return `/agents/${id('agentId')}`;
    case 'AgentActions': return `/agents/${id('agentId')}/actions`;
    case 'AgentSoulCore': return `/agents/${id('agentId')}/soul-core`;
    case 'AgentTrust': return `/agents/${id('agentId')}/trust`;
    case 'Action': return `/actions${queryString([['agentId', p.agentId === undefined ? undefined : assertId(p.agentId, 'agentId')]])}`;
    case 'GoalComposer': return `/actions/new${queryString([['agentId', assertId(p.agentId, 'agentId')]])}`;
    case 'CandidateCompare': return `/actions/compare${queryString([
      ['agentId', assertId(p.agentId, 'agentId')], ['goalId', assertId(p.goalId, 'goalId')],
      ['planId', p.planId === undefined ? undefined : assertId(p.planId, 'planId')],
    ])}`;
    case 'AuthorityReview': return `/actions/${id('actionId')}/authority${queryString([['agentId', assertId(p.agentId, 'agentId')]])}`;
    case 'ActionDetail': {
      const view = slug('view');
      if (view && view !== 'tracking' && view !== 'receipt') fail('invalid_query', 'Invalid action view');
      return `/agents/${id('agentId')}/actions/${id('actionId')}${queryString([['view', view]])}`;
    }
    case 'Creation': return `/creation${queryString([['mode', slug('mode')], ['filter', slug('filter')]])}`;
    case 'CreationDetail': return `/creation/${id('creationId')}`;
    case 'My': return `/my${queryString([['section', slug('section')]])}`;
    case 'Prediction': return '/prediction';
    case 'Lsm': return '/lsm';
    case 'SoulCardFlow': {
      const step = slug('step');
      if (step && !SOUL_CARD_STEPS.has(step)) fail('invalid_query', 'Invalid Soul Card flow step');
      return `/my/soul-card${queryString([
        ['agentId', assertId(p.agentId, 'agentId')], ['step', step],
        ['actionId', p.actionId === undefined ? undefined : assertId(p.actionId, 'actionId')],
      ])}`;
    }
    case 'Inbox': return '/inbox';
    case 'Scan': return '/scan';
    case 'DestinationError': {
      const reason = slug('reason');
      if (!reason) fail('invalid_query', 'Destination error reason is required');
      return `/destination-error${queryString([['reason', reason]])}`;
    }
    default: return fail('unknown_route', 'Unsupported route');
  }
}

export function normalizeMobileV7Route(input: string): MobileV7RouteNormalizeResult {
  const result = parseMobileV7Route(input);
  if (result.ok === false) return result;
  return { ...result, path: serializeMobileV7Route(result.destination) };
}
