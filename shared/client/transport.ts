/**
 * P1-05 · Shared Client Platform — transport-agnostic adapter + schema/version negotiation.
 *
 * Web (fetch), Mobile (fetch/axios) and Desktop (fetch/tauri) inject their own
 * {@link HttpTransportV1}; all header/auth/schema-version/error logic is shared
 * so no platform reimplements it (roadmap P1-05: "Web/Mobile/Desktop 不各自复制约").
 */
import { toClientError, SoulCoreClientError } from './errors';

export interface HttpRequestV1 {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: unknown;
}

export interface HttpResponseV1 {
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON body (or undefined). Transport is responsible for parsing. */
  body: unknown;
}

/** The only platform-specific seam. Implementations must not throw for non-2xx. */
export interface HttpTransportV1 {
  request(req: HttpRequestV1): Promise<HttpResponseV1>;
}

export interface ClientContextV1 {
  baseUrl: string;
  /** Bearer token provider; may be sync or async. */
  getAuthToken?: () => string | undefined | Promise<string | undefined>;
  /** Requested contract schema version (sent as Accept-Schema-Version). */
  schemaVersion: number;
  /** Optional per-request extra headers (e.g. requestId). */
  defaultHeaders?: Record<string, string>;
}

function joinUrl(baseUrl: string, path: string, query?: HttpRequestV1['query']): string {
  const base = baseUrl.replace(/\/+$/, '');
  const rel = path.replace(/^\/+/, '');
  let url = `${base}/${rel}`;
  if (query) {
    const pairs = Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    if (pairs.length) url += `?${pairs.join('&')}`;
  }
  return url;
}

/**
 * Perform a request with shared header injection (auth + Accept-Schema-Version),
 * schema-version negotiation and normalized error mapping. Returns the decoded
 * `T` on 2xx; throws {@link SoulCoreClientError} otherwise.
 *
 * `decode` receives the parsed body only on 2xx. A decode failure surfaces as a
 * `version_mismatch`/`unknown` error rather than a raw exception.
 */
export async function requestJson<T>(
  transport: HttpTransportV1,
  ctx: ClientContextV1,
  req: HttpRequestV1,
  decode: (body: unknown) => T,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Schema-Version': String(ctx.schemaVersion),
    ...(ctx.defaultHeaders ?? {}),
    ...(req.headers ?? {}),
  };
  const token = ctx.getAuthToken ? await ctx.getAuthToken() : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: HttpResponseV1;
  try {
    res = await transport.request({
      ...req,
      path: joinUrl(ctx.baseUrl, req.path, req.query),
      headers,
    });
  } catch (e: any) {
    // Transport-level failure (DNS/timeout/offline) → network error.
    throw new SoulCoreClientError({
      kind: 'network',
      message: e?.message || 'Network request failed',
      retryable: true,
    });
  }

  if (res.status < 200 || res.status >= 300) {
    throw toClientError(res.status, res.body);
  }

  // Optional response-side schema-version guard (no silent downgrade).
  const respVersion = res.headers['schema-version'] ?? res.headers['Schema-Version'];
  if (respVersion !== undefined && Number(respVersion) !== ctx.schemaVersion) {
    throw new SoulCoreClientError({
      kind: 'version_mismatch',
      message: `Response schema version ${respVersion} != requested ${ctx.schemaVersion}`,
      retryable: false,
      code: 'SCHEMA_VERSION_UNSUPPORTED',
    });
  }

  try {
    return decode(res.body);
  } catch (e: any) {
    if (e instanceof SoulCoreClientError) throw e;
    throw new SoulCoreClientError({
      kind: e?.code === 'SOUL_CORE_SCHEMA_UNSUPPORTED' ? 'version_mismatch' : 'unknown',
      message: e?.message || 'Failed to decode response',
      retryable: false,
      code: e?.code,
    });
  }
}
