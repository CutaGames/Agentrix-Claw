import type { CreationTaskStatus, CreationTaskTarget, EcsDiff, EcsWorld, GenerationQuotaWarning, JsonPatchOp, PlotListingStatus, PlotSaleType, PlotStatus, SubstrateTier, WorldCreationError } from './world-creation';
import type { MarketplaceCurrency } from './world-engine-api';
export interface MapPlotSummary {
    plotId: string;
    title: string;
    ownerDisplayName: string;
    substrateTier: SubstrateTier;
    mapX: number;
    mapY: number;
    status: PlotStatus;
    previewUrl?: string;
    popularityRank?: number;
}
export interface PresenceEntry {
    userId: string;
    displayName: string;
    position: {
        x: number;
        y: number;
    };
    inPlotId?: string | null;
}
export interface GetMapViewportQuery {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
export interface GetMapViewportResponse {
    plots: MapPlotSummary[];
    self: {
        position: {
            x: number;
            y: number;
        };
    };
}
export interface MapPresenceResponse {
    entries: PresenceEntry[];
    refreshMs: number;
}
export interface DiscoverPlotsQuery {
    category?: string;
    substrateTier?: SubstrateTier;
    sort?: 'newest' | 'popularity' | 'tier';
    page?: number;
    limit?: number;
}
export interface DiscoverPlotsResponse {
    items: MapPlotSummary[];
    total: number;
}
export interface PlotPreviewResponse {
    plotId: string;
    title: string;
    ownerDisplayName: string;
    substrateTier: SubstrateTier;
    previewUrl?: string;
    canEnter: boolean;
}
export interface EnterPlotResponse {
    sessionId: string;
    ecsWorld: EcsWorld;
    isolationLevel: 'L0' | 'L1' | 'L2';
    readonlyAssetHandles: ReadonlyAssetHandle[];
}
export interface ReadonlyAssetHandle {
    assetId: string;
    kind: 'soul' | 'pet' | 'worldAsset';
    name: string;
    thumbnailUrl?: string;
}
export interface PlotDto {
    plotId: string;
    ownerAccountId: string;
    title: string;
    substrateTier: SubstrateTier;
    ecsVersionId: string;
    mapX: number;
    mapY: number;
    status: PlotStatus;
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface AcquirePlotRequest {
    plotId: string;
    substrateTier: SubstrateTier;
    expectedVersion: number;
}
export interface AcquirePlotResponse {
    acquired: boolean;
    plot?: PlotDto;
    error?: WorldCreationError;
}
export interface ListPlotForSaleRequest {
    price: number;
    currency: MarketplaceCurrency;
    saleType: PlotSaleType;
}
export interface ListPlotForSaleResponse {
    listingId: string;
    status: PlotListingStatus;
}
export interface TransferPlotRequest {
    listingId: string;
    signedConfirmation: string;
}
export interface TransferPlotResponse {
    committed: boolean;
    newOwnerAccountId?: string;
    authoritativeAmount?: number;
    error?: WorldCreationError;
}
export type CreationMode = 'promptDrive' | 'coEdit' | 'handBuild';
export type CreationSurface = 'mobile' | 'desktop' | 'web';
export interface CreationDispatchDecision {
    mustDispatch: boolean;
    target: CreationTaskTarget;
    substrateTier: SubstrateTier;
    reason: string;
}
export interface ContinuumEditRequest {
    mode: CreationMode;
    surface?: CreationSurface;
    prompt?: string;
    instruction?: string;
    ops?: JsonPatchOp[];
    baseVersionId?: string;
    dispatchTarget?: 'desktop' | 'agent';
}
export interface ContinuumEditResponse {
    outcome: 'applied' | 'dispatched';
    mode: CreationMode;
    versionId?: string;
    ecsWorld?: EcsWorld;
    diff?: EcsDiff;
    dispatch?: CreationDispatchDecision;
    error?: WorldCreationError;
}
export interface GenerateEcsWorldRequest {
    prompt: string;
    substrateTier?: SubstrateTier;
}
export interface GenerateEcsWorldResponse {
    versionId: string;
    ecsWorld: EcsWorld;
    error?: WorldCreationError;
    quotaWarning?: GenerationQuotaWarning;
}
export interface NlEditRequest {
    instruction: string;
    baseVersionId: string;
}
export interface DirectEditRequest {
    ops: JsonPatchOp[];
    baseVersionId: string;
}
export interface EcsEditResponse {
    diff: EcsDiff;
    ecsWorld: EcsWorld;
    error?: WorldCreationError;
}
export interface RevertEcsWorldRequest {
    targetVersionId: string;
}
export interface RevertEcsWorldResponse {
    versionId: string;
    ecsWorld: EcsWorld;
}
export interface EcsWorldHistoryResponse {
    diffs: EcsDiff[];
}
export interface CreationTaskDto {
    taskId: string;
    userId: string;
    plotId: string;
    target: CreationTaskTarget;
    status: CreationTaskStatus;
    substrateTier: SubstrateTier;
    resultRef?: string | null;
    failReason?: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface SubmitCreationTaskRequest {
    plotId: string;
    target: CreationTaskTarget;
    substrateTier: SubstrateTier;
    surface?: CreationSurface;
    input: Record<string, unknown>;
}
export interface SubmitCreationTaskResponse {
    task: CreationTaskDto;
    effectiveTarget: CreationTaskTarget;
}
export interface GetCreationTaskResponse {
    task: CreationTaskDto;
}
export interface RetryCreationTaskResponse {
    task: CreationTaskDto;
}
export interface RequestChargeRequest {
    plotId: string;
    visitorAccountId: string;
    amountRef: string;
    displayHintAmount?: number;
    signedConfirmation?: string;
}
export interface RequestPayoutRequest {
    plotId: string;
    targetAccountId: string;
    amountRef: string;
}
export interface EconomyBridgeResponse {
    ok: boolean;
    authoritativeAmount?: number;
    platformCut?: number;
    lineItems?: Array<{
        entityId: string;
        quantity: number;
        unitAxp: number;
        lineAxp: number;
    }>;
    error?: WorldCreationError;
}
export interface PlotSalesReportResponse {
    plotId: string;
    day: string;
    totalAxp: number;
    saleCount: number;
    byGood: Array<{
        goodId: string;
        units: number;
        axp: number;
    }>;
}
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
    version: number;
    createdAt: string;
}
export interface CreatePlotListingRequest {
    plotId: string;
    price: number;
    currency: MarketplaceCurrency;
    saleType: PlotSaleType;
}
export interface CreatePlotListingResponse {
    listing?: PlotListingDto;
    error?: WorldCreationError;
}
export interface BrowsePlotListingsQuery {
    substrateTier?: SubstrateTier;
    minPrice?: number;
    maxPrice?: number;
    currency?: MarketplaceCurrency;
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'popularity';
    page?: number;
    limit?: number;
}
export interface BrowsePlotListingsResponse {
    items: PlotListingDto[];
    total: number;
}
export interface PurchasePlotListingRequest {
    signedConfirmation: string;
}
export interface PurchasePlotListingResponse {
    transactionId?: string;
    status: 'completed' | 'failed' | 'reserved';
    platformCut?: number;
    error?: WorldCreationError;
}
export interface ResolvePlotShareResponse {
    available: boolean;
    plotId?: string;
    title?: string;
    substrateTier?: SubstrateTier;
    deepLink?: string;
    webPreviewUrl: string;
    appDownloadLink: string;
    message?: string;
}
export interface PublishPlotResponse {
    published: boolean;
    shareCode?: string;
    error?: WorldCreationError;
}
export interface ReportPlotRequest {
    reason: string;
    detail?: string;
}
export interface ReportPlotResponse {
    reportId: string;
    stage: 'post_publish_report';
}
export interface PlotModerationDecisionEntry {
    id: string;
    plotId: string;
    stage: 'pre_publish' | 'cn_region' | 'static_code_scan' | 'post_publish_report';
    decision: 'approved' | 'rejected' | 'pending';
    reason: string | null;
    reviewerId: string | null;
    ts: string;
}
export interface PlotModerationDecisionsResponse {
    plotId: string;
    decisions: PlotModerationDecisionEntry[];
}
