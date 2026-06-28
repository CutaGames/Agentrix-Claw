import type { BattleRound, BattleStatus, BehaviorTreeNode, CharacterStats, DungeonLayout, ImageMetadata, PipelineType, QualityScore, ScanMode, ScanSessionStatus, SemanticDescription, Skill, StyleType, WorldAssetCategory, WorldAssetSource } from './world-engine';
export interface StartScanRequest {
    mode: ScanMode;
}
export interface StartScanResponse {
    sessionId: string;
}
export interface UploadFrameResponse {
    frameIndex: number;
    qualityScore: QualityScore;
}
export interface PredictQualityResponse {
    overallScore: number;
    suggestions: string[];
}
export interface GenerateFromScanRequest {
    style: StyleType;
}
export interface GenerateFromScanResponse {
    jobId: string;
    estimatedSeconds: number;
    assetId?: string;
    characterCard?: {
        name: string;
        stats: Record<string, number>;
        skills: {
            name: string;
            type?: string;
            description?: string;
        }[];
        personalityTraits: string[];
        backstory: string;
        category: string;
        thumbnailUrl?: string;
        abilityBoost?: {
            multiplier: number;
            effectiveStats: Record<string, number>;
            breakdown: {
                tasksBonus: number;
                qualityBonus: number;
                tierBonus: number;
                intimacyBonus: number;
                sources: {
                    tasksCompleted: number;
                    avgQualityScore: number;
                    tier: string;
                    intimacyLevel: number;
                    agentAccountId: string | null;
                };
            };
        };
    };
    generationStatus?: string;
}
export interface JobStatusResponse {
    status: string;
    progress: number;
    result?: WorldAssetDto;
}
export interface JobStreamEvent {
    type: 'progress' | 'complete' | 'error';
    data: unknown;
}
export interface WorldFeedResponse {
    events: import('./world-engine').WorldEventItem[];
    newlyGenerated: number;
}
export interface WorldTickResponse {
    events: import('./world-engine').WorldEventItem[];
}
export interface WorldAssetDto {
    id: string;
    ownerId: string;
    originalCreatorId: string;
    name: string;
    category: WorldAssetCategory;
    scanMode: ScanMode;
    meshUrl: string;
    styledMeshUrl: string;
    styleType: StyleType;
    semanticDescription: SemanticDescription;
    stats: CharacterStats;
    skills: Skill[];
    personalityTraits: string[];
    backstory: string | null;
    behaviorTree: BehaviorTreeNode;
    level: number;
    xp: number;
    unlockedSkillSlots: number;
    battleWins: number;
    battleLosses: number;
    boundAgentId: string | null;
    source: WorldAssetSource;
    sourceImagesMetadata: ImageMetadata[] | null;
    createdAt: string;
    updatedAt: string;
}
export interface ListAssetsQuery {
    category?: WorldAssetCategory;
    source?: WorldAssetSource;
    sort?: 'newest' | 'level' | 'battles';
    page?: number;
    limit?: number;
}
export interface ListAssetsResponse {
    items: WorldAssetDto[];
    total: number;
}
export interface UpdateAssetRequest {
    name?: string;
    style?: StyleType;
}
export interface RegenerateAttributeRequest {
    target: 'stats' | 'skills' | 'personality' | 'backstory' | 'name';
}
export interface RegenerateAttributeResponse {
    jobId: string;
}
export interface DeleteAssetResponse {
    success: boolean;
}
export interface GenerateCharacterRequest {
    semanticDescription: SemanticDescription;
}
export interface GenerateCharacterResponse {
    jobId: string;
    estimatedSeconds: number;
}
export interface GenerateDungeonRequest {
    sessionId: string;
    theme?: string;
}
export interface GenerateDungeonResponse {
    jobId: string;
}
export interface DungeonEnemyDto {
    id: string;
    name: string;
    type: string;
    stats: CharacterStats;
    position: {
        x: number;
        y: number;
    };
}
export interface DungeonLootDto {
    id: string;
    name: string;
    type: string;
    position: {
        x: number;
        y: number;
    };
}
export interface DungeonBossDto {
    id: string;
    name: string;
    stats: CharacterStats;
    skills: Skill[];
    position: {
        x: number;
        y: number;
    };
}
export interface DungeonDto {
    id: string;
    creatorId: string;
    worldAssetId: string;
    shareCode: string;
    layout: DungeonLayout;
    enemies: DungeonEnemyDto[];
    lootItems: DungeonLootDto[];
    boss: DungeonBossDto;
    theme: string;
    roomAreaSqm: number;
    coverageDegrees: number;
    difficultyRating: number;
    expiresAt: string;
    createdAt: string;
}
export interface DungeonAttemptResponse {
    attemptId: string;
    dungeon: DungeonDto;
}
export interface CreateBattleRequest {
    challengerAssetId: string;
    defenderAssetId: string;
}
export interface BattleDto {
    id: string;
    challengerAssetId: string;
    defenderAssetId: string;
    challengerUserId: string;
    defenderUserId: string;
    status: BattleStatus;
    randomSeed: number;
    rounds: BattleRound[] | null;
    winnerAssetId: string | null;
    totalRounds: number;
    replayVideoUrl: string | null;
    xpAwarded: {
        challenger: number;
        defender: number;
    } | null;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}
export interface CreateBattleChallengeRequest {
    challengerAssetId: string;
    targetUserId: string;
}
export interface CreateBattleChallengeResponse {
    battleId: string;
    shareLink: string;
}
export interface BattleReplayResponse {
    videoUrl: string;
}
export interface BindAgentResponse {
    agentId: string;
    status: 'bound';
}
export interface UnbindAgentResponse {
    status: 'unbound';
}
export interface AgentActionDto {
    id: string;
    actionType: string;
    description: string;
    timestamp: string;
}
export interface AgentStatusWorldEngineExtension {
    boundAssetId?: string;
    boundAssetName?: string;
    xp?: number;
    level?: number;
    nextThreshold?: number;
    recentActions?: AgentActionDto[];
}
export type ShareCardType = 'character' | 'dungeon' | 'battle';
export interface GenerateShareCardRequest {
    assetId: string;
    type: ShareCardType;
}
export interface GenerateShareCardResponse {
    cardUrl: string;
    deepLink: string;
}
export interface GenerateShareVideoRequest {
    battleId: string;
}
export interface GenerateShareVideoResponse {
    videoUrl: string;
}
export type MarketplaceCurrency = 'USD' | 'AXP';
export interface CreateMarketplaceListingRequest {
    assetId: string;
    price: number;
    currency: MarketplaceCurrency;
}
export interface CreateMarketplaceListingResponse {
    listingId: string;
}
export interface MarketplaceListingDto {
    listingId: string;
    assetId: string;
    sellerId: string;
    asset: WorldAssetDto;
    price: number;
    currency: MarketplaceCurrency;
    status: 'active' | 'sold' | 'cancelled' | 'pending_review';
    createdAt: string;
}
export interface BrowseMarketplaceQuery {
    category?: WorldAssetCategory;
    minPrice?: number;
    maxPrice?: number;
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'most_battles';
    page?: number;
    limit?: number;
}
export interface BrowseMarketplaceResponse {
    items: MarketplaceListingDto[];
    total: number;
}
export interface PurchaseAssetResponse {
    transactionId: string;
    status: 'completed' | 'failed' | 'reserved';
}
export interface PriceFactors {
    rarityScore: number;
    battleScore: number;
    skillUniquenessScore: number;
    medianComparablePrice: number;
}
export interface SuggestedPriceResponse {
    suggestedPrice: number;
    factors: PriceFactors;
}
export interface PurchaseQuotaRequest {
    quotaType: 'quick_scan' | 'detail_scan' | 'dungeon' | 'replay_video';
    quantity: number;
}
export interface PurchaseQuotaResponse {
    axpCharged: number;
    remainingQuota: number;
    expiresAt: string;
}
export interface ScanSessionDto {
    id: string;
    userId: string;
    scanMode: ScanMode;
    imageCount: number;
    qualityScores: QualityScore[];
    overallPredictionScore: number | null;
    status: ScanSessionStatus;
    resultAssetId: string | null;
    pipelineUsed: PipelineType;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
}
