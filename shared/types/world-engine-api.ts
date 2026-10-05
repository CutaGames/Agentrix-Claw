/**
 * World Engine — API Request/Response DTOs
 *
 * Shared request and response types for all World Engine REST endpoints.
 * Used by both the NestJS backend (validation) and mobile/web clients (type safety).
 *
 * All property names use camelCase per the project's global TypeORM SnakeNamingStrategy.
 * API JSON payloads use camelCase on the wire (frontend ↔ backend).
 *
 * @see .kiro/specs/reality-ai-world-engine/design.md — API Design section
 */

import type {
  BattleRound,
  BattleStatus,
  BehaviorTreeNode,
  CharacterStats,
  DungeonLayout,
  ImageMetadata,
  PipelineType,
  QualityScore,
  ScanMode,
  ScanSessionStatus,
  SemanticDescription,
  Skill,
  StyleType,
  WorldAssetCategory,
  WorldAssetSource,
} from './world-engine';

// ============================================================
// §1 Scan & Reconstruction APIs
// ============================================================

/** POST /api/v1/world-engine/scan/start — Request */
export interface StartScanRequest {
  mode: ScanMode;
}

/** POST /api/v1/world-engine/scan/start — Response */
export interface StartScanResponse {
  sessionId: string;
}

/** POST /api/v1/world-engine/scan/:sessionId/upload — Response */
export interface UploadFrameResponse {
  frameIndex: number;
  qualityScore: QualityScore;
}

/** POST /api/v1/world-engine/scan/:sessionId/predict-quality — Response */
export interface PredictQualityResponse {
  overallScore: number;
  suggestions: string[];
}

/** POST /api/v1/world-engine/scan/:sessionId/generate — Request */
export interface GenerateFromScanRequest {
  style: StyleType;
}

/** POST /api/v1/world-engine/scan/:sessionId/generate — Response */
export interface GenerateFromScanResponse {
  jobId: string;
  estimatedSeconds: number;
  /**
   * 方案 B (card-before-mesh): generate 时已同步创建好的 card_ready 资产。
   * 移动端拿到 assetId + characterCard 即可秒显示角色卡, 不必等 3D。
   * 老客户端忽略这些字段仍按 jobId 轮询, 向后兼容。
   */
  assetId?: string;
  characterCard?: {
    name: string;
    stats: Record<string, number>;
    skills: { name: string; type?: string; description?: string }[];
    personalityTraits: string[];
    backstory: string;
    category: string;
    /** 角色卡 2D 占位图(混元 preview 或风格化缩略); 3D 完成后由客户端轮询替换 */
    thumbnailUrl?: string;
    /**
     * Phase A 能力飞轮: 该角色吃到的真实 agent 战绩加成。
     * 移动端用来展示 "⚡ 能力加成 +XX%（来自你的 agent 真实战绩）"。
     * 游客 / 无 agent 时为 undefined 或 multiplier=1。
     */
    abilityBoost?: {
      /** 总倍率, 1.0 = 无加成 */
      multiplier: number;
      /** 加成后的实际战斗属性 (= baseStats × multiplier) */
      effectiveStats: Record<string, number>;
      /** 各项加成明细 + 数据来源 (展示用) */
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
  /** 'card_ready' | 'mesh_pending' | 'complete' | 'mesh_failed' */
  generationStatus?: string;
}

/** GET /api/v1/world-engine/jobs/:jobId/status — Response */
export interface JobStatusResponse {
  status: string;
  progress: number;
  result?: WorldAssetDto;
}

/** WebSocket /api/v1/world-engine/jobs/:jobId/stream — Event payload */
export interface JobStreamEvent {
  type: 'progress' | 'complete' | 'error';
  data: unknown;
}

// ============================================================
// §1b Living World feed APIs (Phase A2)
// ============================================================

/**
 * Legacy compact feed shape retained for direct imports from this module.
 * The canonical `WorldFeedResponse` lives in `world-engine.ts`.
 */
export interface LegacyWorldFeedResponse {
  /** 时间线倒序的事件 */
  events: import('./world-engine').WorldEventItem[];
  /** 本次请求新推进(tick)生成的事件数, 用于客户端"你不在时发生了 N 件事"提示 */
  newlyGenerated: number;
}

/** POST /api/v1/world-engine/world/tick — Response */
export interface WorldTickResponse {
  /** 本次 tick 新生成的事件 */
  events: import('./world-engine').WorldEventItem[];
}

// ============================================================
// §2 World Asset APIs
// ============================================================

/** Full World Asset DTO returned by API endpoints */
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

/** GET /api/v1/world-engine/assets — Query params */
export interface ListAssetsQuery {
  category?: WorldAssetCategory;
  source?: WorldAssetSource;
  sort?: 'newest' | 'level' | 'battles';
  page?: number;
  limit?: number;
}

/** GET /api/v1/world-engine/assets — Response */
export interface ListAssetsResponse {
  items: WorldAssetDto[];
  total: number;
}

/** PATCH /api/v1/world-engine/assets/:id — Request */
export interface UpdateAssetRequest {
  name?: string;
  style?: StyleType;
}

/** POST /api/v1/world-engine/assets/:id/regenerate — Request */
export interface RegenerateAttributeRequest {
  target: 'stats' | 'skills' | 'personality' | 'backstory' | 'name';
}

/** POST /api/v1/world-engine/assets/:id/regenerate — Response */
export interface RegenerateAttributeResponse {
  jobId: string;
}

/** DELETE /api/v1/world-engine/assets/:id — Response */
export interface DeleteAssetResponse {
  success: boolean;
}

// ============================================================
// §3 Character Generation API
// ============================================================

/** POST /api/v1/world-engine/assets/:id/generate-character — Request */
export interface GenerateCharacterRequest {
  semanticDescription: SemanticDescription;
}

/** POST /api/v1/world-engine/assets/:id/generate-character — Response */
export interface GenerateCharacterResponse {
  jobId: string;
  estimatedSeconds: number;
}

// ============================================================
// §4 Dungeon APIs
// ============================================================

/** POST /api/v1/world-engine/dungeons/generate — Request */
export interface GenerateDungeonRequest {
  sessionId: string;
  theme?: string;
}

/** POST /api/v1/world-engine/dungeons/generate — Response */
export interface GenerateDungeonResponse {
  jobId: string;
}

/** Dungeon enemy DTO */
export interface DungeonEnemyDto {
  id: string;
  name: string;
  type: string;
  stats: CharacterStats;
  position: { x: number; y: number };
}

/** Dungeon loot item DTO */
export interface DungeonLootDto {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
}

/** Dungeon boss DTO */
export interface DungeonBossDto {
  id: string;
  name: string;
  stats: CharacterStats;
  skills: Skill[];
  position: { x: number; y: number };
}

/** GET /api/v1/world-engine/dungeons/:code — Response */
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

/** POST /api/v1/world-engine/dungeons/:code/attempt — Response */
export interface DungeonAttemptResponse {
  attemptId: string;
  dungeon: DungeonDto;
}

// ============================================================
// §5 Battle APIs
// ============================================================

/** POST /api/v1/world-engine/battles/create — Request */
export interface CreateBattleRequest {
  challengerAssetId: string;
  defenderAssetId: string;
}

/** Battle DTO returned by API endpoints */
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
  xpAwarded: { challenger: number; defender: number } | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

/** POST /api/v1/world-engine/battles/challenge — Request */
export interface CreateBattleChallengeRequest {
  challengerAssetId: string;
  targetUserId: string;
}

/** POST /api/v1/world-engine/battles/challenge — Response */
export interface CreateBattleChallengeResponse {
  battleId: string;
  shareLink: string;
}

/** GET /api/v1/world-engine/battles/:id/replay — Response */
export interface BattleReplayResponse {
  videoUrl: string;
}

// ============================================================
// §6 Agent Binding APIs
// ============================================================

/** POST /api/v1/world-engine/assets/:id/bind-agent — Response */
export interface BindAgentResponse {
  agentId: string;
  status: 'bound';
}

/** DELETE /api/v1/world-engine/assets/:id/unbind-agent — Response */
export interface UnbindAgentResponse {
  status: 'unbound';
}

/** Agent action record for activity log */
export interface AgentActionDto {
  id: string;
  actionType: string;
  description: string;
  timestamp: string;
}

/**
 * GET /api/v1/agents/:id/status — Extended response (when ?includeWorldEngine=true)
 * New fields are optional to maintain backwards compatibility.
 */
export interface AgentStatusWorldEngineExtension {
  boundAssetId?: string;
  boundAssetName?: string;
  xp?: number;
  level?: number;
  nextThreshold?: number;
  recentActions?: AgentActionDto[];
}

// ============================================================
// §7 Share APIs
// ============================================================

/** Share card type */
export type ShareCardType = 'character' | 'dungeon' | 'battle';

/** POST /api/v1/world-engine/share/card — Request */
export interface GenerateShareCardRequest {
  assetId: string;
  type: ShareCardType;
}

/** POST /api/v1/world-engine/share/card — Response */
export interface GenerateShareCardResponse {
  cardUrl: string;
  deepLink: string;
}

/** POST /api/v1/world-engine/share/video — Request */
export interface GenerateShareVideoRequest {
  battleId: string;
}

/** POST /api/v1/world-engine/share/video — Response */
export interface GenerateShareVideoResponse {
  videoUrl: string;
}

// ============================================================
// §8 Marketplace APIs
// ============================================================

/** Supported marketplace currencies */
export type MarketplaceCurrency = 'USD' | 'AXP';

/** POST /api/v1/marketplace/world-assets/listing — Request */
export interface CreateMarketplaceListingRequest {
  assetId: string;
  price: number;
  currency: MarketplaceCurrency;
}

/** POST /api/v1/marketplace/world-assets/listing — Response */
export interface CreateMarketplaceListingResponse {
  listingId: string;
}

/** Marketplace listing DTO */
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

/** GET /api/v1/marketplace/world-assets — Query params */
export interface BrowseMarketplaceQuery {
  category?: WorldAssetCategory;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'most_battles';
  page?: number;
  limit?: number;
}

/** GET /api/v1/marketplace/world-assets — Response */
export interface BrowseMarketplaceResponse {
  items: MarketplaceListingDto[];
  total: number;
}

/** POST /api/v1/marketplace/world-assets/:listingId/purchase — Response */
export interface PurchaseAssetResponse {
  transactionId: string;
  status: 'completed' | 'failed' | 'reserved';
}

/** Price factors used in suggested price calculation */
export interface PriceFactors {
  /** Rarity based on category distribution in marketplace */
  rarityScore: number;
  /** Battle performance (win count and win rate) */
  battleScore: number;
  /** Skill uniqueness (fewer assets sharing same skills = higher) */
  skillUniquenessScore: number;
  /** Median sale price of comparable assets in last 30 days */
  medianComparablePrice: number;
}

/** GET /api/v1/marketplace/world-assets/:assetId/suggested-price — Response */
export interface SuggestedPriceResponse {
  suggestedPrice: number;
  factors: PriceFactors;
}

// ============================================================
// §9 Quota APIs
// ============================================================

/** POST /api/v1/world-engine/quota/purchase — Request */
export interface PurchaseQuotaRequest {
  /** Type of quota to purchase */
  quotaType: 'quick_scan' | 'detail_scan' | 'dungeon' | 'replay_video';
  /** Number of units to purchase */
  quantity: number;
}

/** POST /api/v1/world-engine/quota/purchase — Response */
export interface PurchaseQuotaResponse {
  /** Total AXP charged */
  axpCharged: number;
  /** New remaining quota for the purchased type */
  remainingQuota: number;
  /** Expiry date for the purchased quota (30 days from purchase) */
  expiresAt: string;
}

/** Scan session summary DTO (used in inventory detail) */
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
