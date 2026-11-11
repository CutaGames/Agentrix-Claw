/**
 * L9 P1-0 for the phone and the desktop: ask `GET /l9/cohort/me` ("am I in the list") before drawing an owner-side
 * L9 entry. Each surface injects its own `HttpTransportV1` and token. No React, no platform import.
 * Only `inCohort: true` opens the entry; no token, a non-200, an answer that cannot be decoded or a network error all
 * count as "out" (the web does the same, `frontend/lib/l9/use-l9-cohort.ts`).
 */
import { L9_COHORT_ROUTE_V1, decodeL9CohortStatusV1 } from '../types/introduction';
import type { HttpTransportV1 } from './transport';

export type L9CohortGateResultV1 = 'in' | 'out';

export async function readL9CohortGateV1(deps: {
  transport: HttpTransportV1;
  /** Includes the `/api` prefix when the server has one. */
  baseUrl: string;
  token: () => string | null | undefined;
  headers?: Record<string, string>;
}): Promise<L9CohortGateResultV1> {
  const token = deps.token();
  if (!token) return 'out';
  try {
    const response = await deps.transport.request({
      method: 'GET',
      path: `${deps.baseUrl.replace(/\/+$/, '')}${L9_COHORT_ROUTE_V1}`,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(deps.headers ?? {}) },
    });
    if (response.status !== 200) return 'out';
    const decoded = decodeL9CohortStatusV1(response.body);
    return decoded.ok === true && decoded.value.inCohort === true ? 'in' : 'out';
  } catch {
    return 'out';
  }
}
