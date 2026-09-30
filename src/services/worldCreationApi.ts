/**
 * World Creation API service (mobile) — AI World Creation Platform (v6).
 *
 * Thin, full-endpoint client over the backend `/v1/world-creation/*` REST
 * surface: World_Map (viewport / discovery / presence / preview), Plot &
 * Land_Economy (acquire / list / transfer), ECS_World creation & edit
 * (generate / NL-edit / direct-ops / continuum / revert / history),
 * Creation_Task_Queue (submit / get / retry), Economy_Bridge (charge /
 * payout / sales-report), Marketplace Plot listing (create / browse /
 * purchase / publish / share resolve), Moderation (report / decisions),
 * and Arena (publish).
 *
 * Each function is a thin wrapper over the standard `apiFetch` helper
 * (auth + base URL + JSON). GET endpoints serialize query params with
 * `URLSearchParams` (skipping undefined/null); POST endpoints send a JSON
 * body. All payloads use camelCase on the wire, matching the shared DTOs.
 *
 * @see shared/types/world-creation-api.ts
 */

import { apiFetch } from './api';
import type {
  // World_Map
  GetMapViewportResponse,
  MapPresenceResponse,
  DiscoverPlotsQuery,
  DiscoverPlotsResponse,
  PlotPreviewResponse,
  EnterPlotResponse,
  // Land_Economy
  AcquirePlotRequest,
  AcquirePlotResponse,
  ListPlotForSaleRequest,
  ListPlotForSaleResponse,
  TransferPlotRequest,
  TransferPlotResponse,
  // ECS creation / edit
  GenerateEcsWorldRequest,
  GenerateEcsWorldResponse,
  NlEditRequest,
  DirectEditRequest,
  EcsEditResponse,
  ContinuumEditRequest,
  ContinuumEditResponse,
  RevertEcsWorldRequest,
  RevertEcsWorldResponse,
  EcsWorldHistoryResponse,
  // Creation_Task
  SubmitCreationTaskRequest,
  SubmitCreationTaskResponse,
  GetCreationTaskResponse,
  RetryCreationTaskResponse,
  // Economy_Bridge
  RequestChargeRequest,
  RequestPayoutRequest,
  EconomyBridgeResponse,
  PlotSalesReportResponse,
  // Marketplace
  CreatePlotListingRequest,
  CreatePlotListingResponse,
  BrowsePlotListingsQuery,
  BrowsePlotListingsResponse,
  PurchasePlotListingRequest,
  PurchasePlotListingResponse,
  PublishPlotResponse,
  ResolvePlotShareResponse,
  // Moderation
  ReportPlotRequest,
  ReportPlotResponse,
  PlotModerationDecisionsResponse,
} from '../../shared/types/world-creation-api';

const BASE = '/v1/world-creation';

/**
 * Build a query string from a record, skipping undefined/null values so we
 * never serialize `?foo=undefined` onto the wire (R1.5 discovery filters etc.).
 */
function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ============================================================
// World_Map — navigation, discovery, presence (R1)
// ============================================================

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
 * Browse/discover published Plots with optional category/tier filters and
 * sort/pagination (R1.5). Undefined query fields are skipped.
 */
export async function discoverPlots(
  query: DiscoverPlotsQuery = {},
): Promise<DiscoverPlotsResponse> {
  return apiFetch<DiscoverPlotsResponse>(
    `${BASE}/map/discover${toQuery(query as Record<string, unknown>)}`,
  );
}

/**
 * Fetch other present users' lightweight avatar positions plus the server's
 * refresh budget hint (R1.2).
 */
export async function getPresence(): Promise<MapPresenceResponse> {
  return apiFetch<MapPresenceResponse>(`${BASE}/map/presence`);
}

/**
 * Fetch a Plot's preview card (title, owner, tier, can-enter) before entering
 * the experience (R1.3).
 */
export async function previewPlot(plotId: string): Promise<PlotPreviewResponse> {
  return apiFetch<PlotPreviewResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/preview`,
  );
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

// ============================================================
// Plot & Land_Economy (R2)
// ============================================================

/**
 * Acquire an unowned Plot via optimistic-lock (R2.2, R2.3). Returns whether the
 * caller won the acquire race.
 */
export async function acquirePlot(
  body: AcquirePlotRequest,
): Promise<AcquirePlotResponse> {
  return apiFetch<AcquirePlotResponse>(`${BASE}/plots/acquire`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * List an owned Plot for sale (R2.4). Returns the created listing id + status.
 */
export async function listPlotForSale(
  plotId: string,
  body: ListPlotForSaleRequest,
): Promise<ListPlotForSaleResponse> {
  return apiFetch<ListPlotForSaleResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/list`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Execute a trust-gated Plot ownership transfer against a listing (R2.5, R2.6).
 */
export async function transferPlot(
  body: TransferPlotRequest,
): Promise<TransferPlotResponse> {
  return apiFetch<TransferPlotResponse>(`${BASE}/plots/transfer`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ============================================================
// ECS_World creation, edit & diff/revert (R3, R4)
// ============================================================

/**
 * Generate an ECS_World draft for a Plot from a natural-language prompt (R3.1).
 */
export async function generateEcsWorld(
  plotId: string,
  body: GenerateEcsWorldRequest,
): Promise<GenerateEcsWorldResponse> {
  return apiFetch<GenerateEcsWorldResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/generate`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Apply a natural-language edit onto a base version, emitting a diff (R3.2).
 */
export async function editNl(
  plotId: string,
  body: NlEditRequest,
): Promise<EcsEditResponse> {
  return apiFetch<EcsEditResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/edit/nl`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Apply direct-manipulation JSON Patch ops onto a base version (R3.3).
 */
export async function editOps(
  plotId: string,
  body: DirectEditRequest,
): Promise<EcsEditResponse> {
  return apiFetch<EcsEditResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/edit/ops`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Unified continuum edit — switch among prompt-drive / co-edit / hand-build on
 * the same ECS_World; may apply locally or dispatch off-surface (R3.4, R3.7).
 */
export async function continueEditing(
  plotId: string,
  body: ContinuumEditRequest,
): Promise<ContinuumEditResponse> {
  return apiFetch<ContinuumEditResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/continue`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Revert a Plot's ECS_World to a target version, creating a new replay version
 * (R3.5).
 */
export async function revertEcsWorld(
  plotId: string,
  body: RevertEcsWorldRequest,
): Promise<RevertEcsWorldResponse> {
  return apiFetch<RevertEcsWorldResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/revert`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Fetch the Plot's ECS_World diff chain (oldest → newest) for history view.
 */
export async function getEcsHistory(
  plotId: string,
): Promise<EcsWorldHistoryResponse> {
  return apiFetch<EcsWorldHistoryResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/history`,
  );
}

// ============================================================
// Creation_Task_Queue (R8)
// ============================================================

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

/**
 * Fetch a Creation_Task's current status/result (R8.5/R8.6 polling).
 */
export async function getCreationTask(
  taskId: string,
): Promise<GetCreationTaskResponse> {
  return apiFetch<GetCreationTaskResponse>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}`,
  );
}

/**
 * Retry a failed Creation_Task, reusing the retained input (R8.6).
 */
export async function retryCreationTask(
  taskId: string,
): Promise<RetryCreationTaskResponse> {
  return apiFetch<RetryCreationTaskResponse>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/retry`,
    { method: 'POST' },
  );
}

// ============================================================
// Economy_Bridge (R7, R15, R16)
// ============================================================

/**
 * Request a server-authoritative charge originating from a Plot experience
 * (R7.2). The server recomputes the authoritative total.
 */
export async function requestCharge(
  body: RequestChargeRequest,
): Promise<EconomyBridgeResponse> {
  return apiFetch<EconomyBridgeResponse>(`${BASE}/economy/charge`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Request a server-authoritative payout to a target account (e.g. wager pot).
 */
export async function requestPayout(
  body: RequestPayoutRequest,
): Promise<EconomyBridgeResponse> {
  return apiFetch<EconomyBridgeResponse>(`${BASE}/economy/payout`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Fetch a Plot's daily sales report; `day` (ISO date) is an optional query that
 * defaults server-side to the current day (R15.5).
 */
export async function getSalesReport(
  plotId: string,
  day?: string,
): Promise<PlotSalesReportResponse> {
  return apiFetch<PlotSalesReportResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/sales-report${toQuery({ day })}`,
  );
}

// ============================================================
// Marketplace Plot listing (R11)
// ============================================================

/**
 * Create a Marketplace listing for an owned Plot (R11.2, R11.3).
 */
export async function createPlotListing(
  body: CreatePlotListingRequest,
): Promise<CreatePlotListingResponse> {
  return apiFetch<CreatePlotListingResponse>(`${BASE}/marketplace/plots`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Browse Marketplace Plot listings with optional tier/price/currency filters
 * and sort/pagination. Undefined query fields are skipped.
 */
export async function browsePlotListings(
  query: BrowsePlotListingsQuery = {},
): Promise<BrowsePlotListingsResponse> {
  return apiFetch<BrowsePlotListingsResponse>(
    `${BASE}/marketplace/plots${toQuery(query as Record<string, unknown>)}`,
  );
}

/**
 * Purchase a Marketplace Plot listing with a Trust_Level 3 signed confirmation
 * (R11.4).
 */
export async function purchasePlotListing(
  listingId: string,
  body: PurchasePlotListingRequest,
): Promise<PurchasePlotListingResponse> {
  return apiFetch<PurchasePlotListingResponse>(
    `${BASE}/marketplace/plots/${encodeURIComponent(listingId)}/purchase`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Publish a Plot through moderation, returning a shareable code on success
 * (R10.1, R11.1).
 */
export async function publishPlot(plotId: string): Promise<PublishPlotResponse> {
  return apiFetch<PublishPlotResponse>(
    `${BASE}/plots/${encodeURIComponent(plotId)}/publish`,
    { method: 'POST' },
  );
}

/**
 * Resolve a shareable Plot `share_code` into a deep link plus a web-preview
 * fallback (R11.5, R11.6).
 */
export async function resolvePlotShare(
  shareCode: string,
): Promise<ResolvePlotShareResponse> {
  return apiFetch<ResolvePlotShareResponse>(
    `${BASE}/marketplace/share/${encodeURIComponent(shareCode)}`,
  );
}

// ============================================================
// Moderation — post-publish report / audit (R10.4–R10.6)
// ============================================================

/**
 * File a post-publish report against a Plot (R10.4).
 */
export async function reportPlot(
  plotId: string,
  body: ReportPlotRequest,
): Promise<ReportPlotResponse> {
  return apiFetch<ReportPlotResponse>(
    `${BASE}/moderation/plots/${encodeURIComponent(plotId)}/report`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/**
 * Fetch a Plot's moderation decision audit trail (R10.6).
 */
export async function getModerationDecisions(
  plotId: string,
): Promise<PlotModerationDecisionsResponse> {
  return apiFetch<PlotModerationDecisionsResponse>(
    `${BASE}/moderation/plots/${encodeURIComponent(plotId)}/decisions`,
  );
}

// ============================================================
// Arena
// ============================================================

/**
 * Publish a Plot to the Arena, returning a shareable code on success. Reuses
 * the Plot publish response shape.
 */
export async function publishArena(plotId: string): Promise<PublishPlotResponse> {
  return apiFetch<PublishPlotResponse>(
    `${BASE}/arena/${encodeURIComponent(plotId)}/publish`,
    { method: 'POST' },
  );
}
