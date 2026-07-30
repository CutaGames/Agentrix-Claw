export const MOBILE_V6_ROUTE_SCHEMA_VERSION = 'mobile-route/v6' as const;

export const MOBILE_V6_TAB_ROUTE_IDS = [
  'SoulCore',
  'Action',
  'Creation',
  'My',
] as const;

export type MobileV6TabRouteId = (typeof MOBILE_V6_TAB_ROUTE_IDS)[number];

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

export interface MobileV6RouteParamsMap {
  SoulCore: { section?: string };
  Action: { view?: string };
  ActionDetail: { actionId: string; soulCoreId?: string };
  TrustLoopDetail: { actionId: string; soulCoreId?: string; focus?: string };
  VerificationDetail: { actionId: string; verificationId: string; soulCoreId?: string };
  DisputeDetail: { actionId: string; disputeId: string; soulCoreId?: string };
  AssuranceDetail: { subjectId: string; subjectKind?: string; soulCoreId?: string };
  Creation: { mode?: string; filter?: string };
  CreationDetail: { creationId: string };
  My: { section?: string };
  DeviceDetail: { deviceId: string; soulCoreId?: string };
  SoulCardFlow: { step?: SoulCardFlowStep; soulCoreId?: string; actionId?: string };
  PublicVerification: { presentationId: string };
  Inbox: EmptyParams;
  Scan: EmptyParams;
  DestinationError: { reason: string };
}

export type MobileV6RouteId = keyof MobileV6RouteParamsMap;

export type MobileV6DestinationFor<K extends MobileV6RouteId> = Readonly<{
  schemaVersion: typeof MOBILE_V6_ROUTE_SCHEMA_VERSION;
  route: K;
  params: Readonly<MobileV6RouteParamsMap[K]>;
}>;

export type MobileV6Destination = {
  [K in MobileV6RouteId]: MobileV6DestinationFor<K>;
}[MobileV6RouteId];

export type MobileV6RouteErrorCode =
  | 'empty_input'
  | 'input_too_long'
  | 'malformed_url'
  | 'unsupported_origin'
  | 'unsupported_version'
  | 'unknown_route'
  | 'invalid_identifier'
  | 'invalid_query'
  | 'unsafe_parameter';

export interface MobileV6RouteError {
  code: MobileV6RouteErrorCode;
  message: string;
}

export type MobileV6RouteParseResult =
  | { ok: true; destination: MobileV6Destination }
  | { ok: false; error: MobileV6RouteError };

export type MobileV6RouteNormalizeResult =
  | { ok: true; destination: MobileV6Destination; path: string }
  | { ok: false; error: MobileV6RouteError };

export class MobileV6RouteCodecError extends Error {
  readonly code: MobileV6RouteErrorCode;

  constructor(error: MobileV6RouteError) {
    super(error.message);
    this.name = 'MobileV6RouteCodecError';
    this.code = error.code;
  }
}

const MAX_INPUT_LENGTH = 2_048;
const MAX_SEGMENTS = 6;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ALLOWED_HTTPS_HOSTS = new Set(['agentrix.top']);
const ALLOWED_CUSTOM_PROTOCOLS = new Set(['agentrix:']);
const SOUL_CARD_STEPS: ReadonlySet<string> = new Set<SoulCardFlowStep>([
  'capability',
  'scan',
  'attest',
  'preview',
  'tap',
  'receipt',
  'complete',
  'error',
]);

interface ParsedInput {
  segments: string[];
  query: ReadonlyMap<string, string>;
}

function fail(code: MobileV6RouteErrorCode, message: string): never {
  throw new MobileV6RouteCodecError({ code, message });
}

function createDestination<K extends MobileV6RouteId>(
  route: K,
  params: MobileV6RouteParamsMap[K],
): MobileV6DestinationFor<K> {
  return {
    schemaVersion: MOBILE_V6_ROUTE_SCHEMA_VERSION,
    route,
    params,
  };
}

function decodePathSegments(pathname: string): string[] {
  const rawSegments = pathname.split('/').filter(Boolean);
  if (rawSegments.length > MAX_SEGMENTS) fail('unknown_route', 'Route has too many path segments');

  return rawSegments.map((raw) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return fail('malformed_url', 'Route contains invalid percent encoding');
    }
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
      return fail('unsafe_parameter', 'Route contains an unsafe path segment');
    }
    return decoded;
  });
}

function readQuery(searchParams: URLSearchParams): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  searchParams.forEach((value, key) => {
    if (values.has(key)) fail('invalid_query', 'Duplicate query parameters are not allowed');
    values.set(key, value);
  });

  const version = values.get('v');
  if (version !== undefined && version !== '6') {
    fail('unsupported_version', 'Unsupported mobile route version');
  }
  values.delete('v');
  return values;
}

function extractInput(rawInput: string): ParsedInput {
  if (typeof rawInput !== 'string' || !rawInput.trim()) fail('empty_input', 'Route input is empty');

  const input = rawInput.trim();
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
      if (ALLOWED_CUSTOM_PROTOCOLS.has(url.protocol)) {
        if (url.username || url.password || url.port) {
          fail('unsafe_parameter', 'Custom route URL contains authority credentials');
        }
        pathname = `/${url.hostname}${url.pathname}`;
      } else if (url.protocol === 'https:' && ALLOWED_HTTPS_HOSTS.has(url.hostname.toLowerCase())) {
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
    if (error instanceof MobileV6RouteCodecError) throw error;
    return fail('malformed_url', 'Route URL is malformed');
  }

  return {
    segments: decodePathSegments(pathname),
    query: readQuery(url.searchParams),
  };
}

function validateQueryKeys(query: ReadonlyMap<string, string>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of query.keys()) {
    if (!allowedSet.has(key)) fail('invalid_query', `Unsupported query parameter: ${key}`);
  }
}

function optionalValue(
  query: ReadonlyMap<string, string>,
  key: string,
  kind: 'id' | 'slug' = 'slug',
): string | undefined {
  const value = query.get(key);
  if (value === undefined) return undefined;
  const pattern = kind === 'id' ? SAFE_ID : SAFE_SLUG;
  if (!pattern.test(value)) {
    fail(kind === 'id' ? 'invalid_identifier' : 'invalid_query', `Invalid ${key}`);
  }
  return value;
}

function requiredId(value: string | undefined, label: string): string {
  if (!value || !SAFE_ID.test(value)) fail('invalid_identifier', `Invalid ${label}`);
  return value;
}

function parseParams(
  query: ReadonlyMap<string, string>,
  allowed: readonly string[],
): Record<string, string> {
  validateQueryKeys(query, allowed);
  const result: Record<string, string> = {};
  for (const key of allowed) {
    const kind = key === 'soulCoreId' || key === 'actionId' ? 'id' : 'slug';
    const value = optionalValue(query, key, kind);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function parseSegments({ segments, query }: ParsedInput): MobileV6Destination {
  const first = segments[0];

  if (segments.length === 1 && first === 'soul-core') {
    return createDestination('SoulCore', parseParams(query, ['section']));
  }

  if (first === 'actions') {
    if (segments.length === 1) {
      return createDestination('Action', parseParams(query, ['view']));
    }

    const actionId = requiredId(segments[1], 'actionId');
    if (segments.length === 2) {
      return createDestination('ActionDetail', { actionId, ...parseParams(query, ['soulCoreId']) });
    }
    if (segments.length === 3 && segments[2] === 'trust') {
      return createDestination('TrustLoopDetail', {
        actionId,
        ...parseParams(query, ['soulCoreId', 'focus']),
      });
    }
    if (segments.length === 4 && segments[2] === 'verifications') {
      return createDestination('VerificationDetail', {
        actionId,
        verificationId: requiredId(segments[3], 'verificationId'),
        ...parseParams(query, ['soulCoreId']),
      });
    }
    if (segments.length === 4 && segments[2] === 'disputes') {
      return createDestination('DisputeDetail', {
        actionId,
        disputeId: requiredId(segments[3], 'disputeId'),
        ...parseParams(query, ['soulCoreId']),
      });
    }
  }

  if (first === 'assurance' && segments.length === 2) {
    return createDestination('AssuranceDetail', {
      subjectId: requiredId(segments[1], 'subjectId'),
      ...parseParams(query, ['subjectKind', 'soulCoreId']),
    });
  }

  if (first === 'creation') {
    if (segments.length === 1) return createDestination('Creation', parseParams(query, ['mode', 'filter']));
    if (segments.length === 2) {
      validateQueryKeys(query, []);
      return createDestination('CreationDetail', { creationId: requiredId(segments[1], 'creationId') });
    }
  }

  if (first === 'my') {
    if (segments.length === 1) return createDestination('My', parseParams(query, ['section']));
    if (segments.length === 3 && segments[1] === 'devices' && segments[2] === 'soul-card') {
      const params = parseParams(query, ['step', 'soulCoreId', 'actionId']);
      if (params.step && !SOUL_CARD_STEPS.has(params.step)) fail('invalid_query', 'Invalid Soul Card flow step');
      return createDestination('SoulCardFlow', params);
    }
    if (segments.length === 3 && segments[1] === 'devices') {
      return createDestination('DeviceDetail', {
        deviceId: requiredId(segments[2], 'deviceId'),
        ...parseParams(query, ['soulCoreId']),
      });
    }
  }

  if (first === 'verify' && segments.length === 2) {
    validateQueryKeys(query, []);
    return createDestination('PublicVerification', {
      presentationId: requiredId(segments[1], 'presentationId'),
    });
  }

  if (segments.length === 1 && first === 'inbox') {
    validateQueryKeys(query, []);
    return createDestination('Inbox', {});
  }
  if (segments.length === 1 && first === 'scan') {
    validateQueryKeys(query, []);
    return createDestination('Scan', {});
  }
  if (segments.length === 1 && first === 'destination-error') {
    validateQueryKeys(query, ['reason']);
    const reason = optionalValue(query, 'reason');
    if (!reason) fail('invalid_query', 'Destination error reason is required');
    return createDestination('DestinationError', { reason });
  }

  return fail('unknown_route', 'Route is not part of the Mobile V6 contract');
}

export function parseMobileV6Route(input: string): MobileV6RouteParseResult {
  try {
    return { ok: true, destination: parseSegments(extractInput(input)) };
  } catch (error) {
    if (error instanceof MobileV6RouteCodecError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return { ok: false, error: { code: 'malformed_url', message: 'Route could not be parsed' } };
  }
}

function assertId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail('invalid_identifier', `Invalid ${label}`);
  return value;
}

function assertSlug(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !SAFE_SLUG.test(value)) fail('invalid_query', `Invalid ${label}`);
  return value;
}

function encodeId(value: unknown, label: string): string {
  return encodeURIComponent(assertId(value, label));
}

function appendQuery(path: string, entries: ReadonlyArray<readonly [string, string | undefined]>): string {
  const query = entries
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return query ? `${path}?${query}` : path;
}

export function serializeMobileV6Route(destination: MobileV6Destination): string {
  if (!destination || destination.schemaVersion !== MOBILE_V6_ROUTE_SCHEMA_VERSION) {
    return fail('unsupported_version', 'Destination uses an unsupported route schema');
  }

  const params = destination.params as Record<string, unknown>;
  switch (destination.route) {
    case 'SoulCore':
      return appendQuery('/soul-core', [['section', assertSlug(params.section, 'section')]]);
    case 'Action':
      return appendQuery('/actions', [['view', assertSlug(params.view, 'view')]]);
    case 'ActionDetail':
      return appendQuery(`/actions/${encodeId(params.actionId, 'actionId')}`, [
        ['soulCoreId', params.soulCoreId === undefined ? undefined : assertId(params.soulCoreId, 'soulCoreId')],
      ]);
    case 'TrustLoopDetail':
      return appendQuery(`/actions/${encodeId(params.actionId, 'actionId')}/trust`, [
        ['soulCoreId', params.soulCoreId === undefined ? undefined : assertId(params.soulCoreId, 'soulCoreId')],
        ['focus', assertSlug(params.focus, 'focus')],
      ]);
    case 'VerificationDetail':
      return appendQuery(
        `/actions/${encodeId(params.actionId, 'actionId')}/verifications/${encodeId(params.verificationId, 'verificationId')}`,
        [['soulCoreId', params.soulCoreId === undefined ? undefined : assertId(params.soulCoreId, 'soulCoreId')]],
      );
    case 'DisputeDetail':
      return appendQuery(
        `/actions/${encodeId(params.actionId, 'actionId')}/disputes/${encodeId(params.disputeId, 'disputeId')}`,
        [['soulCoreId', params.soulCoreId === undefined ? undefined : assertId(params.soulCoreId, 'soulCoreId')]],
      );
    case 'AssuranceDetail':
      return appendQuery(`/assurance/${encodeId(params.subjectId, 'subjectId')}`, [
        ['subjectKind', assertSlug(params.subjectKind, 'subjectKind')],
        ['soulCoreId', params.soulCoreId === undefined ? undefined : assertId(params.soulCoreId, 'soulCoreId')],
      ]);
    case 'Creation':
      return appendQuery('/creation', [
        ['mode', assertSlug(params.mode, 'mode')],
        ['filter', assertSlug(params.filter, 'filter')],
      ]);
    case 'CreationDetail':
      return `/creation/${encodeId(params.creationId, 'creationId')}`;
    case 'My':
      return appendQuery('/my', [['section', assertSlug(params.section, 'section')]]);
    case 'DeviceDetail':
      return appendQuery(`/my/devices/${encodeId(params.deviceId, 'deviceId')}`, [
        ['soulCoreId', params.soulCoreId === undefined ? undefined : assertId(params.soulCoreId, 'soulCoreId')],
      ]);
    case 'SoulCardFlow': {
      const step = assertSlug(params.step, 'step');
      if (step && !SOUL_CARD_STEPS.has(step)) fail('invalid_query', 'Invalid Soul Card flow step');
      return appendQuery('/my/devices/soul-card', [
        ['step', step],
        ['soulCoreId', params.soulCoreId === undefined ? undefined : assertId(params.soulCoreId, 'soulCoreId')],
        ['actionId', params.actionId === undefined ? undefined : assertId(params.actionId, 'actionId')],
      ]);
    }
    case 'PublicVerification':
      return `/verify/${encodeId(params.presentationId, 'presentationId')}`;
    case 'Inbox':
      return '/inbox';
    case 'Scan':
      return '/scan';
    case 'DestinationError': {
      const reason = assertSlug(params.reason, 'reason');
      if (!reason) fail('invalid_query', 'Destination error reason is required');
      return appendQuery('/destination-error', [['reason', reason]]);
    }
    default:
      return fail('unknown_route', 'Unsupported route');
  }
}

export function normalizeMobileV6Route(input: string): MobileV6RouteNormalizeResult {
  const parsed = parseMobileV6Route(input);
  if (parsed.ok === false) return parsed;
  return {
    ...parsed,
    path: serializeMobileV6Route(parsed.destination),
  };
}
