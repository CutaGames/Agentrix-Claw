/**
 * World Engine — Core Type Definitions
 *
 * Shared interfaces for the Reality → AI World Engine (Phase 1: AI UGC Engine).
 * Used across mobile client, NestJS backend, and desktop/web surfaces.
 *
 * All entity property names use camelCase per the project's global TypeORM
 * SnakeNamingStrategy (column names auto-derived to snake_case).
 *
 * @see .kiro/specs/reality-ai-world-engine/design.md
 */

// ============================================================
// §1 Semantic Description (AI Interpreter output)
// ============================================================

/** Structured semantic description produced by AI_Interpreter */
export interface SemanticDescription {
  /** Detected object category (e.g., "toy", "shoe", "figurine") */
  objectCategory: string;
  /** Confidence score for the category assignment (0-100) */
  categoryConfidence: number;
  /** Detected material type (e.g., "plastic", "metal", "fabric") */
  materialType: string;
  /** Estimated physical dimensions in centimeters */
  estimatedSize: { length: number; width: number; height: number };
  /** Functional affordances of the object (max 10 tags) */
  functionalAffordances: string[];
  /** Visual style descriptors (max 10 tags) */
  visualStyleTags: string[];
}

// ============================================================
// §2 Character Stats & Skills
// ============================================================

/**
 * Character base stats. Each stat ranges 1-100.
 * Total sum must be between 150 and 350.
 */
export interface CharacterStats {
  /** Hit Points — derived from object size */
  hp: number;
  /** Attack — derived from object sharpness */
  atk: number;
  /** Defense — derived from object density */
  def: number;
  /** Speed — derived from object aerodynamics */
  spd: number;
  /** Intelligence — derived from object complexity */
  int: number;
}

/** Skill type classification */
export type SkillType = 'offensive' | 'defensive' | 'utility';

/** A character skill definition */
export interface Skill {
  /** Skill name (1-25 characters) */
  name: string;
  /** Skill classification */
  type: SkillType;
  /** Description of the skill's effect (10-50 words) */
  effectDescription: string;
  /** Base damage value (only for offensive/some defensive skills) */
  damageBase?: number;
  /** Cooldown in turns before the skill can be used again */
  cooldownTurns?: number;
}

// ============================================================
// §3 Behavior Tree
// ============================================================

/** Behavior tree node type */
export type BehaviorTreeNodeType = 'selector' | 'sequence' | 'action' | 'condition';

/** Context in which a behavior tree node operates */
export type BehaviorTreeContext = 'idle' | 'combat' | 'social';

/** A node in the AI behavior tree */
export interface BehaviorTreeNode {
  /** Node type determining execution logic */
  type: BehaviorTreeNodeType;
  /** Context this node applies to */
  context: BehaviorTreeContext;
  /** Child nodes (for selector/sequence types) */
  children?: BehaviorTreeNode[];
  /** Action identifier (for action type nodes) */
  actionId?: string;
  /** Condition expression (for condition type nodes) */
  conditionExpr?: string;
}

// ============================================================
// §4 Quality Gate Scoring
// ============================================================

/** Per-frame quality score from the Quality Gate system */
export interface QualityScore {
  /** Index of the frame in the scan session */
  frameIndex: number;
  /** Sharpness score (0-100) */
  sharpness: number;
  /** Exposure quality score (0-100) */
  exposure: number;
  /** Angle novelty score — how much new surface this frame adds (0-100) */
  angleNovelty: number;
  /** Overall composite score */
  overall: number;
}

// ============================================================
// §5 Dungeon Layout
// ============================================================

/** A 2D point coordinate */
export interface Point {
  x: number;
  y: number;
}

/** A 3D size measurement */
export interface Size3D {
  length: number;
  width: number;
  height: number;
}

/** A polygon defined by an array of points */
export type Polygon = Point[];

/** Dungeon layout generated from room scan data */
export interface DungeonLayout {
  /** Wall polygons defining room boundaries */
  walls: Polygon[];
  /** Door positions */
  doors: Point[];
  /** Detected furniture with type, position, and size */
  furniturePositions: { type: string; position: Point; size: Size3D }[];
  /** Walkable area polygons */
  walkableAreas: Polygon[];
  /** Open areas suitable for boss encounters */
  openAreas: { position: Point; areaSqm: number }[];
}

// ============================================================
// §6 Battle System
// ============================================================

/** A single round in a battle sequence */
export interface BattleRound {
  /** Round number (1-based) */
  roundNumber: number;
  /** ID of the attacking character */
  attackerId: string;
  /** Name of the skill used in this round */
  skillUsed: string;
  /** Damage dealt this round */
  damageDealt: number;
  /** Whether this was a critical hit */
  isCritical: boolean;
  /** Remaining HP for both combatants after this round */
  hpRemaining: { challenger: number; defender: number };
}

// ============================================================
// §7 Style Renderer
// ============================================================

/** Available stylization presets */
export type StyleType = 'cartoon' | 'pixel-art' | 'fantasy' | 'sci-fi' | 'realistic';

/** Configuration for the Style Renderer post-processing pipeline */
export interface StyleRendererConfig {
  /** Stylization preset to apply */
  style: StyleType;
  /** Whether to preserve the object's recognizable silhouette (always true) */
  preserveSilhouette: boolean;
  /** Whether to apply geometry smoothing (true for fast-track models) */
  smoothGeometry: boolean;
  /** Whether to enhance colors via style-specific palette mapping */
  enhanceColors: boolean;
  /** Optional target polygon count for mesh simplification */
  targetPolyCount?: number;
}

// ============================================================
// §8 Reconstruction Provider System
// ============================================================

/** Provider tier classification */
export type ReconstructionTier = 'fast' | 'precision';

/** Image metadata attached to scan frames */
export interface ImageMetadata {
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Capture timestamp (ISO 8601) */
  capturedAt: string;
  /** Device orientation at capture */
  orientation?: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/** Input to a reconstruction provider */
export interface ReconstructionInput {
  /** Source images with metadata */
  images: { buffer: Buffer; metadata: ImageMetadata }[];
  /** Reconstruction configuration */
  config: {
    /** Target polygon count for the output mesh */
    targetPolyCount?: number;
    /** Output format (always glb in Phase 1) */
    outputFormat: 'glb';
    /** Texture resolution in pixels */
    textureResolution?: number;
  };
}

/** Output from a reconstruction provider */
export interface ReconstructionOutput {
  /** Generated mesh binary (.glb) */
  mesh: Buffer;
  /** Geometry quality self-assessment (0-100) */
  confidence: number;
  /** Actual polygon count of the output mesh */
  polyCount: number;
  /** Actual texture resolution of the output */
  textureResolution: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/** Interface that all reconstruction providers must implement */
export interface ReconstructionProvider {
  /** Provider display name */
  name: string;
  /** Provider tier (fast or precision) */
  type: ReconstructionTier;
  /** Maximum number of input images supported */
  maxImages: number;
  /** Timeout in milliseconds before the provider is considered failed */
  timeoutMs: number;
  /** Perform 3D reconstruction from input images */
  reconstruct(input: ReconstructionInput): Promise<ReconstructionOutput>;
  /** Check if the provider is healthy and available */
  healthCheck(): Promise<boolean>;
}

// ============================================================
// §9 Content Moderation
// ============================================================

/** Moderation pipeline stages */
export type ModerationStage =
  | 'upload_face_check'
  | 'upload_copyright_check'
  | 'generation_text_check'
  | 'marketplace_review'
  | 'user_report';

/** Moderation decision outcomes */
export type ModerationDecisionType = 'approved' | 'rejected' | 'pending' | 'escalated';

/** A moderation decision record for audit purposes (stored ≥12 months) */
export interface ModerationDecision {
  /** Decision record ID */
  id: string;
  /** The World Asset being moderated */
  worldAssetId: string;
  /** Which stage of the moderation pipeline produced this decision */
  stage: ModerationStage;
  /** The decision outcome */
  decision: ModerationDecisionType;
  /** Human-readable reason for the decision */
  reason?: string;
  /** ID of the human reviewer (null for automated decisions) */
  reviewerId?: string;
  /** Automated confidence score from the classifier (0-100) */
  automatedScore?: number;
  /** When this decision was made */
  createdAt: Date;
}

// ============================================================
// §10 Quota & Cost Tracking
// ============================================================

/** Types of usage events tracked for quota and cost */
export type QuotaEventType =
  | 'quick_scan'
  | 'detail_scan'
  | 'room_scan'
  | 'character_generation'
  | 'character_regeneration'
  | 'dungeon_generation'
  | 'style_render'
  | 'replay_video_render'
  | 'share_card_render';

/** A usage event recorded for quota tracking and cost analysis */
export interface QuotaUsageEvent {
  /** User who triggered the event */
  userId: string;
  /** Type of operation performed */
  eventType: QuotaEventType;
  /** Provider used for this operation */
  provider: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Reconstruction tier used */
  tier: ReconstructionTier;
  /** When the event occurred */
  createdAt: Date;
}

/** Health status of a reconstruction/AI provider */
export interface ProviderHealthStatus {
  /** Provider name identifier */
  providerName: string;
  /** Whether the provider is currently healthy */
  isHealthy: boolean;
  /** Timestamp of the last health check */
  lastCheckAt: Date;
  /** 7-day rolling average cost per call in USD */
  avgCostPerCall7d: number;
  /** 7-day rolling average latency in milliseconds */
  avgLatencyMs7d: number;
}

// ============================================================
// §11 Enums & Constants
// ============================================================

/** World Asset categories */
export type WorldAssetCategory = 'character' | 'dungeon' | 'weapon';

/** Scan modes available to users */
export type ScanMode = 'quick' | 'detail' | 'room';

/** Source of a World Asset */
export type WorldAssetSource = 'scanned' | 'purchased' | 'gifted';

/** Battle status lifecycle */
export type BattleStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'expired';

/** Scan session status lifecycle */
export type ScanSessionStatus = 'capturing' | 'submitted' | 'processing' | 'completed' | 'failed';

/** Reconstruction pipeline selection */
export type PipelineType = 'fast' | 'precision';

/** XP thresholds for unlocking growth skill slots */
export const XP_SKILL_SLOT_THRESHOLDS = [100, 500, 1500, 5000] as const;

/** Maximum growth skill slots unlockable via XP */
export const MAX_GROWTH_SKILL_SLOTS = 4;

/** Maximum starter skill slots set at character creation */
export const MAX_STARTER_SKILLS = 4;
export const MIN_STARTER_SKILLS = 2;

/** Character stat constraints */
export const STAT_MIN = 1;
export const STAT_MAX = 100;
export const STAT_SUM_MIN = 150;
export const STAT_SUM_MAX = 350;

/** Battle constraints */
export const BATTLE_MAX_ROUNDS = 20;
export const BATTLE_CHALLENGE_EXPIRY_HOURS = 72;

/** Critical hit formula constants */
export const CRIT_BASE_CHANCE = 0.10;
export const CRIT_SPD_DIVISOR = 1000;

/** Dungeon share code validity in days */
export const DUNGEON_CODE_VALIDITY_DAYS = 30;

// ============================================================
// §X Ability Flywheel — 能力映射飞轮 (Phase A)
// design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §3 支柱2
// ============================================================

/** 能力加成总倍率下限/上限 (PvP 平衡红线: 重度用户最多 2.2 倍, 防碾压) */
export const ABILITY_MULTIPLIER_MIN = 1.0;
export const ABILITY_MULTIPLIER_MAX = 2.2;

/** 各加成项的独立上限 (相加后再被总上限 clamp) */
export const ABILITY_BONUS_CAPS = {
  /** 完成任务数贡献上限 +0.5 (tasksCompleted / 100, cap 0.5) */
  tasks: 0.5,
  /** 质量分贡献上限 +0.15 ((avgQualityScore-50)/100 * 0.3, cap ±0.15) */
  quality: 0.15,
  /** 声望 tier 贡献上限 +0.4 (diamond) */
  tier: 0.4,
  /** 主宠陪伴亲密度贡献上限 +0.2 (intimacyLevel/10 * 0.2) */
  intimacy: 0.2,
} as const;

/** tier → 加成 (bronze 起步 0, diamond 满 0.4) */
export const ABILITY_TIER_BONUS: Record<string, number> = {
  bronze: 0.0,
  silver: 0.1,
  gold: 0.2,
  platinum: 0.3,
  diamond: 0.4,
};

/** 能力加成各项明细 (展示 + 审计用) */
export interface AbilityBreakdown {
  tasksBonus: number;
  qualityBonus: number;
  tierBonus: number;
  intimacyBonus: number;
  /** 数据来源摘要 (展示 "来自你的 agent 真实战绩") */
  sources: {
    tasksCompleted: number;
    avgQualityScore: number;
    tier: string;
    intimacyLevel: number;
    agentAccountId: string | null;
  };
}

/**
 * 能力加成快照 — 写入 WorldAsset.abilitySnapshot。
 * 创建/进化时读真实数据算一次写死, 战斗与展示读 effectiveStats, 保证回放确定性。
 */
export interface AbilitySnapshot {
  version: 1;
  /** 总倍率, clamp [ABILITY_MULTIPLIER_MIN, ABILITY_MULTIPLIER_MAX] */
  multiplier: number;
  breakdown: AbilityBreakdown;
  /** canonical 基础属性 (= WorldAsset.stats, sum 150-350 不变式) */
  baseStats: CharacterStats;
  /** baseStats × multiplier, 每项仍 clamp 到 [1, STAT_MAX*ceil] 用于战斗/展示 */
  effectiveStats: CharacterStats;
  sourceAgentAccountId: string | null;
  computedAt: string;
}

// ============================================================
// §Y Living World — 活世界 (Phase A2)
// design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §7
// ============================================================

/** 世界事件类型 */
export type WorldEventType =
  | 'work'
  | 'social'
  | 'greet'
  | 'reflect'
  | 'explore'
  | 'conflict'
  | 'levelup';

/** 事件结果倾向(feed 着色) */
export type WorldEventOutcome = 'positive' | 'neutral' | 'negative';

/** 一条世界事件(feed item) */
export interface WorldEventItem {
  id: string;
  actorAssetId: string;
  actorName: string;
  type: WorldEventType;
  summary: string;
  outcome: WorldEventOutcome;
  deltaAxp: number;
  deltaXp: number;
  relatedAssetId?: string | null;
  createdAt: string;
}

/** 居民在世界里的状态快照 */
export interface WorldResidentState {
  /** 职业(由能力来源 agent 的 specializations 推断, 缺省 'drifter') */
  job?: string;
  /** 当前心情 */
  mood?: string;
  /** 当前所在地(小镇地点名) */
  location?: string;
  /** 上次结算到的 tick 桶序号(离线快进基准) */
  lastTickBucket?: number;
  /** 当前在忙什么(一句话, feed 展示) */
  activity?: string;
  /** 累计软性 AXP 收益(Phase A2 仅记录, 不结算真实账户) */
  axp?: number;
}

/**
 * 世界 tick 的时间桶大小(ms)。
 * 一个居民每个桶最多产生 1 条事件; 离线补算按桶逐个结算(上限 MAX_CATCHUP_TICKS)。
 * 30 分钟 = 平均每小时约 1-2 条, 与原 idle action 频率一致, 控成本。
 */
export const WORLD_TICK_BUCKET_MS = 30 * 60 * 1000;

/** 离线补算单次最多结算的桶数(防止久未登录用户一次性灌爆 feed + LLM 成本) */
export const WORLD_MAX_CATCHUP_TICKS = 8;

/** 单次 tick 每个居民产出 AXP 的基础区间(再乘能力倍率) */
export const WORLD_WORK_AXP_BASE_MIN = 5;
export const WORLD_WORK_AXP_BASE_MAX = 40;

/** GET /api/v1/world-engine/world/feed — Response */
export interface WorldFeedResponse {
  /** 自上次以来新推进/补算的事件数 */
  newEventCount: number;
  /** 倒序事件流(最新在前) */
  events: WorldEventItem[];
  /** 各居民当前状态摘要 */
  residents: Array<{
    assetId: string;
    name: string;
    level: number;
    state: WorldResidentState;
  }>;
}

// ============================================================
// §Z Interactive Battle — 玩家决策战斗 (Phase B)
// design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §3 支柱3
//
// 核心:把"看动画"变成"做选择",但保留确定性(Property 1)。
//   战斗结果 = 纯函数 f(challengerDecisions[], defenderDecisions[], seed)。
//   逐回合:服务器给局面 → 玩家选 decision → stepRound(state, decisions, seed) → 新局面。
//   存 decisions[] + seed 即可完整重放(无需存每帧)。
// ============================================================

/** 每回合玩家(或 AI)可做的决策类型 */
export type BattleActionType =
  | 'attack'   // 用某个技能攻击(消耗 1 行动力)
  | 'charge'   // 蓄力:下次攻击伤害 +60%,本回合不攻击(攒 1 充能)
  | 'defend';  // 防御:本回合受到伤害 -50%,并反弹 25% 给攻击者

/** 单方一回合的决策 */
export interface BattleDecision {
  action: BattleActionType;
  /** action==='attack' 时,选用的技能下标(0-based, 越界则回退到第 0 个) */
  skillIndex?: number;
}

/** 战斗资源(每方独立) */
export interface BattleResourceState {
  /** 当前 HP */
  hp: number;
  /** 当前行动力(每回合 +1,上限 ENERGY_MAX;attack/charge 各耗规则见引擎) */
  energy: number;
  /** 已累积充能层数(charge 攒、attack 消耗以加伤) */
  charge: number;
  /** 本回合是否处于防御姿态(由上一步 decision 决定,影响本回合受击) */
  defending: boolean;
}

/** 交互战斗的完整可序列化状态(决定论:同 state+decisions+seed → 同结果) */
export interface InteractiveBattleState {
  round: number;
  challenger: BattleResourceState;
  defender: BattleResourceState;
  /** 已结束?谁赢? */
  status: 'active' | 'completed';
  winnerSide?: 'challenger' | 'defender';
}

/** stepRound 产出的单回合明细(用于动画 + 回放) */
export interface InteractiveRound {
  round: number;
  challengerAction: BattleActionType;
  defenderAction: BattleActionType;
  challengerSkill?: string;
  defenderSkill?: string;
  /** 本回合各方实际造成的伤害(已计入防御减免/反弹) */
  challengerDamageDealt: number;
  defenderDamageDealt: number;
  challengerCrit: boolean;
  defenderCrit: boolean;
  hpAfter: { challenger: number; defender: number };
  energyAfter: { challenger: number; defender: number };
  chargeAfter: { challenger: number; defender: number };
}

/** 交互战斗常量 */
export const IBATTLE_ENERGY_START = 1;
export const IBATTLE_ENERGY_MAX = 3;
export const IBATTLE_ENERGY_REGEN = 1;     // 每回合 +1
export const IBATTLE_ATTACK_COST = 1;      // 攻击耗 1 行动力
export const IBATTLE_CHARGE_GAIN = 1;      // 蓄力 +1 充能(也 +1 行动力净不变:不耗只攒)
export const IBATTLE_CHARGE_MAX = 3;
export const IBATTLE_CHARGE_DMG_BONUS = 0.6;   // 每层充能消耗时 +60% 伤害
export const IBATTLE_DEFEND_REDUCTION = 0.5;   // 防御减伤 50%
export const IBATTLE_DEFEND_REFLECT = 0.25;    // 防御反弹 25%
export const IBATTLE_MAX_ROUNDS = 20;          // 与 BATTLE_MAX_ROUNDS 对齐

/** POST /v1/world-engine/battles/interactive/start — Response */
export interface StartInteractiveBattleResponse {
  battleId: string;
  seed: string;
  /** 初始局面 */
  state: InteractiveBattleState;
  /** 双方可用技能(展示用) */
  challengerSkills: { name: string; type: SkillType; damageBase?: number }[];
  defenderSkills: { name: string; type: SkillType; damageBase?: number }[];
}

/** POST /v1/world-engine/battles/interactive/:id/step — Request */
export interface StepInteractiveBattleRequest {
  /** 玩家(challenger)本回合决策;防守方由确定性 AI 依 behaviorTree+seed 生成 */
  decision: BattleDecision;
}

/** POST /v1/world-engine/battles/interactive/:id/step — Response */
export interface StepInteractiveBattleResponse {
  round: InteractiveRound;
  state: InteractiveBattleState;
  /** 战斗结束时返回(否则 undefined) */
  result?: {
    winnerSide: 'challenger' | 'defender';
    totalRounds: number;
    xpAwarded: { challenger: number; defender: number };
  };
}
