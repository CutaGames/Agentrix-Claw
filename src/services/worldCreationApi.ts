/**
 * World Creation API service (mobile) — AI World Creation Platform (v6).
 *
 * Thin client over the backend `/v1/world-creation/*` endpoints used by the
 * World_Map screen (Task 10.3): viewport fetch, Plot entry, and Creation_Task
 * dispatch (used for the Tier_C → Desktop/Agent path, R13.4 / R8.7).
 *
 * Wraps the standard `apiFetch` helper (auth + base URL + JSON). All payloads
 * use camelCase on the wire, matching the shared DTOs.
 *
 * @see shared/types/world-creation-api.ts
 */

import { apiFetch } from './api';
import type {
  GetMapViewportResponse,
  EnterPlotResponse,
  SubmitCreationTaskRequest,
  SubmitCreationTaskResponse,
} from '../../shared/types/world-creation-api';

const BASE = '/v1/world-creation';

/**
 * Fetch the Plots within a map viewport window plus the requesting user's
 * avatar position (R1.1).
 */
export async function getMapViewport(query: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): Promise<GetMapViewportResponse> {
  const qs = new URLSearchParams({
    minX: String(query.minX),
    minY: String(query.minY),
    maxX: String(query.maxX),
    maxY: String(query.maxY),
  }).toString();
  return apiFetch<GetMapViewportResponse>(`${BASE}/map?${qs}`);
}

/**
 * Instantiate a Plot's experience and transition into the inner experience
 * (R1.4). The server resolves the ECS_World, isolation level, and read-only
 * asset handles.
 */
export async function enterPlot(plotId: string): Promise<EnterPlotResponse> {
  return apiFetch<EnterPlotResponse>(`${BASE}/plots/${encodeURIComponent(plotId)}/enter`, {
    method: 'POST',
  });
}

/**
 * Submit a Creation_Task (R8.1). Used by the World_Map screen to dispatch a
 * Tier_C experience to Desktop or a bound Agent_Builder when it cannot run on
 * the current mobile device (R13.4 / R8.7). The server re-routes Tier_C from
 * Mobile and returns the effective target.
 */
export async function submitCreationTask(
  req: SubmitCreationTaskRequest,
): Promise<SubmitCreationTaskResponse> {
  return apiFetch<SubmitCreationTaskResponse>(`${BASE}/tasks`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
