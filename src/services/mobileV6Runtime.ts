import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../shared/client';
import { getApiConfig } from './api';
import { createMobileV6SharedClientSet, MobileV6QueryFacade } from './mobileV6Client';

function responseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => { result[key] = value; });
  return result;
}

async function responseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** Mobile fetch adapter for the shared transport seam. Non-2xx stays a response. */
export const mobileV6HttpTransport: HttpTransportV1 = {
  async request(request: HttpRequestV1): Promise<HttpResponseV1> {
    const headers: Record<string, string> = { ...(request.headers ?? {}) };
    let body: BodyInit | undefined;
    if (request.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(request.body);
    }
    const response = await fetch(request.path, {
      method: request.method,
      headers,
      body,
      signal: request.signal as AbortSignal | undefined,
    });
    return {
      status: response.status,
      headers: responseHeaders(response.headers),
      body: await responseBody(response),
    };
  },
};

/**
 * Creates a facade whose token provider reads the current auth config for every
 * request. No token or account data is retained in this module.
 */
export function createMobileV6QueryFacade(): MobileV6QueryFacade {
  const config = getApiConfig();
  return new MobileV6QueryFacade(createMobileV6SharedClientSet(
    mobileV6HttpTransport,
    {
      baseUrl: config.baseUrl ?? '',
      getAuthToken: () => getApiConfig().token,
      schemaVersion: 1,
      defaultHeaders: { 'X-Agentrix-Surface': 'mobile' },
    },
  ));
}
