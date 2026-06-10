/**
 * AI World Creation Platform (v6) — API Request/Response DTOs
 *
 * Shared request and response types for the World Creation REST endpoints:
 * World_Map (navigation/discovery/presence), Plot & Land_Economy, ECS_World
 * creation & diff/revert, Creation_Task_Queue, Economy_Bridge, and Marketplace
 * Plot listing.
 *
 * Used by both the NestJS backend (validation) and mobile/web/desktop clients
 * (type safety). All property names use camelCase per the project's global
 * TypeORM SnakeNamingStrategy; API JSON payloads use camelCase on the wire.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — Components and Interfaces
 */

import type {
  CreationTaskStatus,
  CreationTaskTarget,
  EcsDiff,
  EcsWorld,
  JsonPatchOp,
  PlotListingStatus,
  PlotSaleType,
  PlotStatus,
  SubstrateTier,
  WorldCreationError,
} from './world-creation';

import type { MarketplaceCurrency } from './world-engine-api';

// ============================================================
// §1 World_Map — navigation, discovery, presence (R1)
// ============================================================

/** A Plot summary as seen on the World_Map. */
export interface MapPlotSummary {
  plotId: string;
  /** Plot display title. */
  title: string;
  /** Owner display name. */
  ownerDisplayName: string;
  /** Declared substrate tier. */
  substrateTier: SubstrateTier;
  /** Map grid coordinate. */
  mapX: number;
  mapY: number;
  /** Lifecycle status. */
  status: PlotStatus;
  /** Optional preview image URL. */
  previewUrl?: string;
  /** Popularity rank (lower = more popular), for discovery ordering. */
  popularityRank?: number;
}

/** Another present user's lightweight avatar position. */
export interface PresenceEntry {
  userId: string;
  displayName: string;
  /** Continuous map position [x, y]. */
  position: { x: number; y: number };
  /** Plot the user is currently inside, if any. */
  inPlotId?: string | null;
}

/** GET /api/v1/world-creation/map — Query params (viewport window). */
export interface GetMapViewportQuery {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** GET /api/v1/world-creation/map — Response (R1.1). */
export interface GetMapViewportResponse {
  /** Plots within the requested viewport. */
  plots: MapPlotSummary[];
  /** Requesting user's current avatar position. */
  self: { position: { x: number; y: number } };
}

/** GET /api/v1/world-creation/map/presence — Response (R1.2). */
export interface MapPresenceResponse {
  /** Other present users' avatar positions. */
  entries: PresenceEntry[];
  /** Server-provided refresh budget hint (ms). */
  refreshMs: number;
}

/** GET /api/v1/world-creation/map/discover — Query params (R1.5). */
export interface DiscoverPlotsQuery {
  category?: string;
  substrateTier?: SubstrateTier;
  sort?: 'newest' | 'popularity' | 'tier';
  page?: number;
  limit?: number;
}

/** GET /api/v1/world-creation/map/discover — Response. */
export interface DiscoverPlotsResponse {
  items: MapPlotSummary[];
  total: number;
}

/** GET /api/v1/world-creation/plots/:plotId/preview — Response (R1.3). */
export interface PlotPreviewResponse {
  plotId: string;
  title: string;
  ownerDisplayName: string;
  substrateTier: SubstrateTier;
  previewUrl?: string;
  /** Whether the requesting user can enter the experience. */
  canEnter: boolean;
}

/** POST /api/v1/world-creation/plots/:plotId/enter — Response (R1.4, R1.7). */
export interface EnterPlotResponse {
  /** Instantiated experience session id. */
  sessionId: string;
  /** The ECS_World to render. */
  ecsWorld: EcsWorld;
  /** Sandbox isolation level the experience runs at. */
  isolationLevel: 'L0' | 'L1' | 'L2';
  /** Read-only asset handles injected for the entering user (no ownership proofs). */
  readonlyAssetHandles: ReadonlyAssetHandle[];
}

/** A read-only handle to an owned asset exposed inside a Plot (R9.1, no ownership proof). */
export interface ReadonlyAssetHandle {
  /** Asset id. */
  assetId: string;
  /** Asset kind. */
  kind: 'soul' | 'pet' | 'worldAsset';
  /** Display name. */
  name: string;
  /** Optional display thumbnail. */
  thumbnailUrl?: string;
}

// ============================================================
// §2 Plot & Land_Economy (R2)
// ============================================================

/** Full Plot DTO. */
export interface PlotDto {
  plotId: string;
  ownerAccountId: string;
  title: string;
  substrateTier: SubstrateTier;
  ecsVersionId: string;
  mapX: number;
  mapY: number;
  status: PlotStatus;
  /** Optimistic-lock version (@VersionColumn). */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** POST /api/v1/world-creation/plots/acquire — Request (R2.2). */
export interface AcquirePlotRequest {
  plotId: string;
  /** Declared substrate tier for the new ECS_World bound to this Plot (R2.7). */
  substrateTier: SubstrateTier;
  /** Expected current version for the optimistic-lock acquire. */
  expectedVersion: number;
}

/** POST /api/v1/world-creation/plots/acquire — Response (R2.3). */
export interface AcquirePlotResponse {
  /** Whether this caller won the acquire race. */
  acquired: boolean;
  plot?: PlotDto;
  /** Present when acquired=false (e.g., PLOT_TAKEN). */
  error?: WorldCreationError;
}

/** POST /api/v1/world-creation/plots/:plotId/list — Request (R2.4). */
export interface ListPlotForSaleRequest {
  price: number;
  currency: MarketplaceCurrency;
  saleType: PlotSaleType;
}

/** POST /api/v1/world-creation/plots/:plotId/list — Response. */
export interface ListPlotForSaleResponse {
  listingId: string;
  status: PlotListingStatus;
}

/** POST /api/v1/world-creation/plots/transfer — Request (R2.5, R2.6). */
export interface TransferPlotRequest {
  listingId: string;
  /** Trust-gated signed confirmation token for the purchase. */
  signedConfirmation: string;
}

/** POST /api/v1/world-creation/plots/transfer — Response. */
export interface TransferPlotResponse {
  /** Whether the transfer committed. */
  committed: boolean;
  /** New owner account id when committed. */
  newOwnerAccountId?: string;
  /** Authoritative amount charged (server-computed). */
  authoritativeAmount?: number;
  /** Present when committed=false; balance left unchanged. */
  error?: WorldCreationError;
}

// ============================================================
// §3 ECS_World creation, edit & diff/revert (R3, R4)
// ============================================================

/** Creation mode along the prompt-drive / co-edit / hand-build continuum. */
export type CreationMode = 'promptDrive' | 'coEdit' | 'handBuild';

/** POST /api/v1/world-creation/plots/:plotId/generate — Request (R3.1). */
export interface GenerateEcsWorldRequest {
  /** Natural-language prompt. */
  prompt: string;
  /** Tier the generated world must stay within (defaults to Plot's declared tier). */
  substrateTier?: SubstrateTier;
}

/** POST /api/v1/world-creation/plots/:plotId/generate — Response (R3.6). */
export interface GenerateEcsWorldResponse {
  /** Resulting version id. */
  versionId: string;
  /** Generated world draft. */
  ecsWorld: EcsWorld;
  /** Present when generation was rejected for a tier violation. */
  error?: WorldCreationError;
}

/** POST /api/v1/world-creation/plots/:plotId/edit/nl — Request (R3.2). */
export interface NlEditRequest {
  /** Natural-language edit instruction. */
  instruction: string;
  /** Base version the edit applies onto. */
  baseVersionId: string;
}

/** POST /api/v1/world-creation/plots/:plotId/edit/ops — Request (R3.3, direct manipulation). */
export interface DirectEditRequest {
  /** JSON Patch operations produced by the editor. */
  ops: JsonPatchOp[];
  /** Base version the ops apply onto. */
  baseVersionId: string;
}

/** Response shared by NL/direct edits — emits a diff. */
export interface EcsEditResponse {
  /** Diff produced by the edit. */
  diff: EcsDiff;
  /** Resulting world after applying the diff. */
  ecsWorld: EcsWorld;
  /** Present when the edit was rejected (e.g., TIER_VIOLATION, SCHEMA_INVALID). */
  error?: WorldCreationError;
}

/** POST /api/v1/world-creation/plots/:plotId/revert — Request (R3.5). */
export interface RevertEcsWorldRequest {
  /** Target version id to restore. */
  targetVersionId: string;
}

/** POST /api/v1/world-creation/plots/:plotId/revert — Response. */
export interface RevertEcsWorldResponse {
  /** New version id created by the revert (replay). */
  versionId: string;
  ecsWorld: EcsWorld;
}

/** GET /api/v1/world-creation/plots/:plotId/history — Response. */
export interface EcsWorldHistoryResponse {
  /** Diff chain (oldest → newest). */
  diffs: EcsDiff[];
}

// ============================================================
// §4 Creation_Task_Queue (R8)
// ============================================================

/** Creation_Task DTO. */
export interface CreationTaskDto {
  taskId: string;
  userId: string;
  plotId: string;
  target: CreationTaskTarget;
  status: CreationTaskStatus;
  /** Tier the task authors (Tier_C from Mobile is forced to desktop/agent). */
  substrateTier: SubstrateTier;
  /** Reference to the resulting ECS_World artifact when completed (R8.5). */
  resultRef?: string | null;
  /** Failure reason when status=failed (R8.6). */
  failReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /api/v1/world-creation/tasks — Request (R8.1). */
export interface SubmitCreationTaskRequest {
  plotId: string;
  /** Desired dispatch target; Tier_C from Mobile is re-routed server-side (R8.7). */
  target: CreationTaskTarget;
  substrateTier: SubstrateTier;
  /** Task input (prompt + parameters), retained on failure for retry. */
  input: Record<string, unknown>;
}

/** POST /api/v1/world-creation/tasks — Response. */
export interface SubmitCreationTaskResponse {
  task: CreationTaskDto;
  /** Effective target after server-side re-routing (may differ from requested). */
  effectiveTarget: CreationTaskTarget;
}

/** GET /api/v1/world-creation/tasks/:taskId — Response. */
export interface GetCreationTaskResponse {
  task: CreationTaskDto;
}

/** POST /api/v1/world-creation/tasks/:taskId/retry — Response (R8.6). */
export interface RetryCreationTaskResponse {
  task: CreationTaskDto;
}

// ============================================================
// §5 Economy_Bridge (R7, R15, R16)
// ============================================================

/** POST /api/v1/world-creation/economy/charge — Request (R7.2). */
export interface RequestChargeRequest {
  /** Plot the charge originates from. */
  plotId: string;
  /** Visitor (payer) account id. */
  visitorAccountId: string;
  /** Reference to sandbox cart/state — server recomputes the authoritative total. */
  amountRef: string;
  /** Non-authoritative display hint only; server ignores for accounting (R7.3). */
  displayHintAmount?: number;
  /** Trust-gated signed confirmation (required for Marketplace purchase, R7.4). */
  signedConfirmation?: string;
}

/** POST /api/v1/world-creation/economy/payout — Request. */
export interface RequestPayoutRequest {
  plotId: string;
  /** Target account id to receive the payout. */
  targetAccountId: string;
  /** Reference to the server-side amount source (e.g., wager pot). */
  amountRef: string;
}

/** Response shared by charge/payout — server-authoritative outcome (R7.5, R7.6). */
export interface EconomyBridgeResponse {
  /** Whether the economic action committed. */
  ok: boolean;
  /** Authoritative amount computed server-side (present when ok=true). */
  authoritativeAmount?: number;
  /** Platform revenue share deducted (present when ok=true). */
  platformCut?: number;
  /** Structured error when ok=false; no balance was altered. */
  error?: WorldCreationError;
}

/** GET /api/v1/world-creation/plots/:plotId/sales-report — Response (R15.5). */
export interface PlotSalesReportResponse {
  plotId: string;
  /** Report day (ISO date). */
  day: string;
  /** Total authoritative sales in AXP for the day. */
  totalAxp: number;
  /** Number of completed sales. */
  saleCount: number;
  /** Per-good aggregation derived from state.kv. */
  byGood: Array<{ goodId: string; units: number; axp: number }>;
}

// ============================================================
// §6 Marketplace Plot listing (R11)
// ============================================================

/** Marketplace Plot listing DTO. */
export interface PlotListingDto {
  listingId: string;
  plotId: string;
  sellerAccountId: string;
  title: string;
  substrateTier: SubstrateTier;
  previewUrl?: string;
  priceUsd?: number;
  priceAxp?: number;
  saleType: PlotSaleType;
  status: PlotListingStatus;
  /** Optimistic-lock version (@VersionColumn). */
  version: number;
  createdAt: string;
}

/** POST /api/v1/world-creation/marketplace/plots — Request (R11.2, R11.3). */
export interface CreatePlotListingRequest {
  plotId: string;
  price: number;
  currency: MarketplaceCurrency;
  saleType: PlotSaleType;
}

/** POST /api/v1/world-creation/marketplace/plots — Response. */
export interface CreatePlotListingResponse {
  listing?: PlotListingDto;
  /** Present when rejected (e.g., only original creator may list for first sale). */
  error?: WorldCreationError;
}

/** GET /api/v1/world-creation/marketplace/plots — Query params. */
export interface BrowsePlotListingsQuery {
  substrateTier?: SubstrateTier;
  minPrice?: number;
  maxPrice?: number;
  currency?: MarketplaceCurrency;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popularity';
  page?: number;
  limit?: number;
}

/** GET /api/v1/world-creation/marketplace/plots — Response. */
export interface BrowsePlotListingsResponse {
  items: PlotListingDto[];
  total: number;
}

/** POST /api/v1/world-creation/marketplace/plots/:listingId/purchase — Request (R11.4). */
export interface PurchasePlotListingRequest {
  /** Trust_Level 3 signed confirmation. */
  signedConfirmation: string;
}

/** POST /api/v1/world-creation/marketplace/plots/:listingId/purchase — Response. */
export interface PurchasePlotListingResponse {
  transactionId?: string;
  status: 'completed' | 'failed' | 'reserved';
  /** Revenue share applied to the platform (5% first / 30% secondary). */
  platformCut?: number;
  error?: WorldCreationError;
}

/** POST /api/v1/world-creation/plots/:plotId/publish — Response (R10.1, R11.1). */
export interface PublishPlotResponse {
  /** Whether the Plot passed moderation and is now discoverable. */
  published: boolean;
  /** Shareable code consistent with the existing dungeon share model (R11.5). */
  shareCode?: string;
  /** Present when moderation rejected publication; reports stage + reason (R10.3). */
  error?: WorldCreationError;
}
