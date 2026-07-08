import type { Creation, CreationDiscoveryItem, CreationPreview, CreationType, CreationVerb, CapabilityManifest, McpToolDescriptor, Offering } from './creation';
import type { EcsWorld, SandboxIsolationLevel, SubstrateTier, WorldCreationError } from './world-creation';
import type { CreationQualityResult } from './creation-quality';
import type { ContinuumEditRequest, ContinuumEditResponse, CreationDispatchDecision, CreationSurface, CreationTaskDto, ReadonlyAssetHandle } from './world-creation-api';
import type { MarketplaceCurrency } from './world-engine-api';
import type { TrustLevel } from './agentrix-presence';
import type { AeonPlotPoi } from './aeon-world';
export type { Creation, CreationDiscoveryItem, CreationGeo, CreationPreview, CreationType, CreationVerb, CapabilityManifest, McpToolDescriptor, Offering, } from './creation';
export interface CreationApiError {
    error: WorldCreationError;
}
export interface CursorPage<TItem> {
    items: TItem[];
    nextCursor: string | null;
}
export interface CreateCreationRequest {
    type: CreationType;
    title: string;
    summary?: string;
    substrateTier?: SubstrateTier;
    geo?: {
        lat: number;
        lng: number;
    };
    surface?: CreationSurface;
    prompt?: string;
}
export interface CreateCreationResponse {
    creation: Creation;
    ecsVersionId?: string;
    dispatch?: CreationDispatchDecision;
    task?: CreationTaskDto;
    error?: WorldCreationError;
}
export interface GenerateCreationRequest {
    prompt: string;
    substrateTier?: SubstrateTier;
    surface?: CreationSurface;
}
export interface GenerateCreationResponse {
    ecsVersionId?: string;
    ecsWorld?: EcsWorld;
    quotaWarning?: {
        usedUsd: number;
        capUsd: number;
        message: string;
    };
    dispatch?: CreationDispatchDecision;
    task?: CreationTaskDto;
    error?: WorldCreationError;
}
export type ContinueCreationRequest = ContinuumEditRequest;
export type ContinueCreationResponse = ContinuumEditResponse & {
    task?: CreationTaskDto;
};
export type { ContinuumEditRequest, ContinuumEditResponse, CreationMode, CreationSurface } from './world-creation-api';
export interface PublishCreationRequest {
    preview?: CreationPreview;
}
export interface PublishCreationResponse {
    published: boolean;
    shareCode?: string;
    manifestVersion?: number;
    error?: WorldCreationError;
}
export interface QualityCheckCreationResponse {
    quality: CreationQualityResult;
    enforced: boolean;
}
export type DiscoverMode = 'map' | 'feed' | 'agentSearch';
export type FeedSort = 'newest' | 'hot' | 'following' | 'nearby';
export interface DiscoverMapQuery {
    mode: 'map';
    viewport?: {
        minLat: number;
        minLng: number;
        maxLat: number;
        maxLng: number;
    };
    center?: {
        lat: number;
        lng: number;
    };
    radiusMeters?: number;
    type?: CreationType;
}
export interface DiscoverFeedQuery {
    mode: 'feed';
    cursor?: string;
    limit?: number;
    sort?: FeedSort;
    near?: {
        lat: number;
        lng: number;
    };
    viewerAccountId?: string;
}
export interface DiscoverAgentSearchQuery {
    mode: 'agentSearch';
    query?: string;
    verbs?: CreationVerb[];
    type?: CreationType;
    maxPriceAxp?: number;
    maxPriceUsd?: number;
    near?: {
        lat: number;
        lng: number;
        radiusMeters?: number;
    };
    minTrustLevel?: TrustLevel;
    cursor?: string;
    limit?: number;
}
export type DiscoverCreationsQuery = DiscoverMapQuery | DiscoverFeedQuery | DiscoverAgentSearchQuery;
export interface DiscoverMapResponse {
    mode: 'map';
    markers: CreationDiscoveryItem[];
}
export interface DiscoverFeedResponse extends CursorPage<CreationDiscoveryItem> {
    mode: 'feed';
    sort: FeedSort;
}
export interface CreationAgentSearchItem extends CreationDiscoveryItem {
    manifest: CapabilityManifest;
    relevance?: number;
}
export interface DiscoverAgentSearchResponse extends CursorPage<CreationAgentSearchItem> {
    mode: 'agentSearch';
}
export type DiscoverCreationsResponse = DiscoverMapResponse | DiscoverFeedResponse | DiscoverAgentSearchResponse;
export interface EnterCreationRequest {
    bringAssetIds?: string[];
}
export interface EnterCreationResponse {
    sessionId: string;
    ecsWorld: EcsWorld;
    isolationLevel: SandboxIsolationLevel;
    readonlyAssetHandles: ReadonlyAssetHandle[];
    offerings?: Offering[];
    error?: WorldCreationError;
}
export interface GetCreationManifestResponse {
    manifest: CapabilityManifest;
}
export interface InvokeCreationRequest {
    verb: CreationVerb;
    toolName: string;
    offeringId?: string;
    args: Record<string, unknown>;
    onBehalfOfAccountId: string;
    signedConfirmation?: string;
}
export type InvokeOutcome = 'ok' | 'rejected';
export interface InvokeCreationResponse {
    outcome: InvokeOutcome;
    verb: CreationVerb;
    invocationId: string;
    authoritativeAmount?: number;
    platformCut?: number;
    result?: Record<string, unknown>;
    error?: WorldCreationError;
}
export interface CommentCreationRequest {
    text: string;
    parentCommentId?: string;
}
export interface CreationComment {
    id: string;
    creationId: string;
    authorAccountId: string;
    authorName?: string;
    text: string;
    parentCommentId?: string;
    createdAt: number;
}
export interface CommentCreationResponse {
    comment: CreationComment;
    commentCount: number;
}
export interface LikeCreationRequest {
    liked: boolean;
}
export interface LikeCreationResponse {
    liked: boolean;
    likeCount: number;
}
export interface FollowCreatorRequest {
    following: boolean;
}
export interface FollowCreatorResponse {
    creatorAccountId: string;
    following: boolean;
}
export interface ShareCreationResponse {
    shareCode: string;
    deepLink: string;
    webPreviewUrl: string;
    appDownloadLink: string;
}
export type CreationModerationStage = 'report' | 'takedown' | 'unpublish';
export type CreationModerationDecision = 'pending' | 'approved' | 'rejected' | 'unpublished';
export interface ReportCreationRequest {
    reporterId: string;
    reason: string;
}
export interface ReportCreationResponse {
    reportId: string;
    stage: 'report';
    error?: WorldCreationError;
}
export interface TakedownCreationRequest {
    reason: string;
    reviewerId?: string;
}
export interface TakedownCreationResponse {
    taken: boolean;
    status: CreationStatus;
}
export interface UnpublishCreationRequest {
    reason?: string;
    actorId?: string;
}
export interface UnpublishCreationResponse {
    unpublished: boolean;
    status: CreationStatus;
    error?: WorldCreationError;
}
export interface CreationModerationDecisionEntry {
    id: string;
    creationId: string;
    stage: CreationModerationStage;
    decision: CreationModerationDecision;
    reason: string | null;
    reporterId: string | null;
    reviewerId: string | null;
    ts: number;
}
export interface GetCreationModerationDecisionsResponse {
    decisions: CreationModerationDecisionEntry[];
}
export interface BindCreationPoiRequest {
    poi: AeonPlotPoi;
}
export interface BindCreationPoiResponse {
    creation: Creation;
    error?: WorldCreationError;
}
export interface CheckinCreationRequest {
    location: {
        lat: number;
        lng: number;
    };
}
export interface CheckinCreationResponse {
    checkedIn: boolean;
    awardedAxp?: number;
    streakDays?: number;
    error?: WorldCreationError;
}
export interface CreationMcpToolDescriptor extends McpToolDescriptor {
    zhDescription?: string;
    outputSchema?: Record<string, unknown>;
    requiredTrustLevel?: TrustLevel;
    budgetGated?: boolean;
    currency?: MarketplaceCurrency;
    isCustomTool?: boolean;
}
export interface CreationCapabilityManifestDto {
    creationId: string;
    version: number;
    tools: CreationMcpToolDescriptor[];
    customTools?: CreationMcpToolDescriptor[];
    ecsVersionId: string | null;
}
export type FulfillmentOrderType = 'voucher' | 'agent' | 'support' | 'manual';
export type FulfillmentOrderStatus = 'paid' | 'fulfilled' | 'refunded' | 'failed';
export type FulfillmentEscrowState = 'none' | 'held' | 'released' | 'refunded';
export type FulfillmentVoucherStatus = 'issued' | 'redeemed' | 'revoked';
export interface FulfillmentVoucherView {
    id: string;
    orderId: string;
    creationId: string;
    offeringId: string;
    code: string;
    status: FulfillmentVoucherStatus;
    issuedAt: number;
    redeemedAt: number | null;
}
export interface FulfillmentOrderView {
    id: string;
    creationId: string;
    creationTitle?: string;
    offeringId: string;
    offeringName?: string;
    amount: string;
    currency: string;
    fulfillmentType: FulfillmentOrderType;
    status: FulfillmentOrderStatus;
    escrowState: FulfillmentEscrowState;
    deliverable?: Record<string, unknown> | null;
    vouchers: FulfillmentVoucherView[];
    createdAt: number;
    updatedAt: number;
}
export type BuyerFulfillmentOrderView = FulfillmentOrderView;
export interface SellerFulfillmentOrderView extends FulfillmentOrderView {
    buyerUserId: string;
}
export interface MyFulfillmentOrdersResponse {
    orders: BuyerFulfillmentOrderView[];
}
export interface MyFulfillmentVouchersResponse {
    vouchers: FulfillmentVoucherView[];
}
export interface SellingFulfillmentOrdersResponse {
    orders: SellerFulfillmentOrderView[];
}
export interface RedeemVoucherResponse {
    voucher: FulfillmentVoucherView;
}
export interface CompleteFulfillmentOrderRequest {
    note?: string;
    artifact?: Record<string, unknown>;
}
export interface CompleteFulfillmentOrderResponse {
    order: SellerFulfillmentOrderView;
}
