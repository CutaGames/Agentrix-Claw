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
