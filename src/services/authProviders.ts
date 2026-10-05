/**
 * authProviders — reads `GET /api/auth/providers` for the sign-in page (E86; contract
 * `shared/types/auth-providers.ts`).
 *
 * - No sign-in and no token: the route is public and returns booleans and reason codes only.
 * - Decoded with the contract's `decodeAuthProvidersResponseV1`; anything else (network error, non-2xx,
 *   an unknown body, no answer within 5 s) is `null`, and the contract's `splitAuthProvidersV1(null)` decides
 *   what the page then shows. The phone never guesses a method is available.
 * - A good answer is kept for 60 s per API base (the server's `max-age=60`); a failure is not kept, so the
 *   next open reads again.
 */
import type { HttpTransportV1 } from '../../shared/client/transport';
import { decodeAuthProvidersResponseV1, type AuthProvidersResponseV1 } from '../../shared/types/auth-providers';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';

export const AUTH_PROVIDERS_PATH = '/auth/providers';
export const AUTH_PROVIDERS_CACHE_MS = 60_000;
export const AUTH_PROVIDERS_TIMEOUT_MS = 5_000;

let cached: { baseUrl: string; at: number; value: AuthProvidersResponseV1 } | null = null;

export function clearAuthProvidersCache(): void {
  cached = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readAuthProviders(
  input: { baseUrl?: string; transport?: HttpTransportV1; now?: () => number; timeoutMs?: number } = {},
): Promise<AuthProvidersResponseV1 | null> {
  const baseUrl = (input.baseUrl ?? getApiConfig().baseUrl ?? '').replace(/\/+$/, '');
  const now = input.now ?? Date.now;
  if (cached && cached.baseUrl === baseUrl && now() - cached.at < AUTH_PROVIDERS_CACHE_MS) return cached.value;
  const transport = input.transport ?? mobileV6HttpTransport;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      transport.request({ method: 'GET', path: `${baseUrl}${AUTH_PROVIDERS_PATH}`, headers: { Accept: 'application/json', 'X-Agentrix-Surface': 'mobile' } }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), input.timeoutMs ?? AUTH_PROVIDERS_TIMEOUT_MS);
      }),
    ]);
    if (!response || response.status < 200 || response.status >= 300) return null;
    const body = isRecord(response.body) && isRecord(response.body.data) ? response.body.data : response.body;
    const value = decodeAuthProvidersResponseV1(body);
    if (value) cached = { baseUrl, at: now(), value };
    return value;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
