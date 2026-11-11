/**
 * L9.2 G2 / G6b for the phone and the desktop: ask `GET /l9/regulated/me` ("is this a licensed-trade account") before drawing
 * the one sentence a licensed owner reads next to their contacts (the relationship book, the business-data export).
 * Each surface injects its own `HttpTransportV1` and token. No React, no platform import.
 *
 * Only `regulated: true` counts. No token, a non-200, an answer that cannot be decoded (the strict decoder refuses an extra
 * or a missing field) or a network error all count as "not regulated": the screen then draws exactly what it drew before.
 */
import { L9_REGULATED_ROUTE_V1, decodeL9RegulatedStatusV1 } from '../types/l9-orders';
import type { HttpTransportV1 } from './transport';

export type L9RegulatedGateResultV1 = 'regulated' | 'not_regulated';

export async function readL9RegulatedGateV1(deps: {
  transport: HttpTransportV1;
  /** Includes the `/api` prefix when the server has one. */
  baseUrl: string;
  token: () => string | null | undefined;
  headers?: Record<string, string>;
}): Promise<L9RegulatedGateResultV1> {
  const token = deps.token();
  if (!token) return 'not_regulated';
  try {
    const response = await deps.transport.request({
      method: 'GET',
      path: `${deps.baseUrl.replace(/\/+$/, '')}${L9_REGULATED_ROUTE_V1}`,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(deps.headers ?? {}) },
    });
    if (response.status !== 200) return 'not_regulated';
    const decoded = decodeL9RegulatedStatusV1(response.body);
    return decoded !== null && decoded.regulated === true ? 'regulated' : 'not_regulated';
  } catch {
    return 'not_regulated';
  }
}
