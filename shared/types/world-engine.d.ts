export interface SemanticDescription {
    objectCategory: string;
    categoryConfidence: number;
    materialType: string;
    estimatedSize: {
        length: number;
        width: number;
        height: number;
    };
    functionalAffordances: string[];
    visualStyleTags: string[];
}
export interface CharacterStats {
    hp: number;
    atk: number;
    def: number;
    spd: number;
    int: number;
}
export type SkillType = 'offensive' | 'defensive' | 'utility';
export interface Skill {
    name: string;
    type: SkillType;
    effectDescription: string;
    damageBase?: number;
    cooldownTurns?: number;
}
export type BehaviorTreeNodeType = 'selector' | 'sequence' | 'action' | 'condition';
export type BehaviorTreeContext = 'idle' | 'combat' | 'social';
export interface BehaviorTreeNode {
    type: BehaviorTreeNodeType;
    context: BehaviorTreeContext;
    children?: BehaviorTreeNode[];
    actionId?: string;
    conditionExpr?: string;
}
export interface QualityScore {
    frameIndex: number;
    sharpness: number;
    exposure: number;
    angleNovelty: number;
    overall: number;
}
export interface Point {
    x: number;
    y: number;
}
export interface Size3D {
    length: number;
    width: number;
    height: number;
}
export type Polygon = Point[];
export interface DungeonLayout {
    walls: Polygon[];
    doors: Point[];
    furniturePositions: {
        type: string;
        position: Point;
        size: Size3D;
    }[];
    walkableAreas: Polygon[];
    openAreas: {
        position: Point;
        areaSqm: number;
    }[];
}
export interface BattleRound {
    roundNumber: number;
    attackerId: string;
    skillUsed: string;
    damageDealt: number;
    isCritical: boolean;
    hpRemaining: {
        challenger: number;
        defender: number;
    };
}
export type StyleType = 'cartoon' | 'pixel-art' | 'fantasy' | 'sci-fi' | 'realistic';
export interface StyleRendererConfig {
    style: StyleType;
    preserveSilhouette: boolean;
    smoothGeometry: boolean;
    enhanceColors: boolean;
    targetPolyCount?: number;
}
export type ReconstructionTier = 'fast' | 'precision';
export interface ImageMetadata {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: string;
    orientation?: number;
    width: number;
    height: number;
}
export interface ReconstructionInput {
    images: {
        buffer: Buffer;
        metadata: ImageMetadata;
    }[];
    config: {
        targetPolyCount?: number;
        outputFormat: 'glb';
        textureResolution?: number;
    };
}
export interface ReconstructionOutput {
    mesh: Buffer;
    confidence: number;
    polyCount: number;
    textureResolution: number;
    processingTimeMs: number;
}
export interface ReconstructionProvider {
    name: string;
    type: ReconstructionTier;
    maxImages: number;
    timeoutMs: number;
    reconstruct(input: ReconstructionInput): Promise<ReconstructionOutput>;
    healthCheck(): Promise<boolean>;
}
export type ModerationStage = 'upload_face_check' | 'upload_copyright_check' | 'generation_text_check' | 'marketplace_review' | 'user_report';
export type ModerationDecisionType = 'approved' | 'rejected' | 'pending' | 'escalated';
export interface ModerationDecision {
    id: string;
    worldAssetId: string;
    stage: ModerationStage;
    decision: ModerationDecisionType;
    reason?: string;
    reviewerId?: string;
    automatedScore?: number;
    createdAt: Date;
}
export type QuotaEventType = 'quick_scan' | 'detail_scan' | 'room_scan' | 'character_generation' | 'character_regeneration' | 'dungeon_generation' | 'style_render' | 'replay_video_render' | 'share_card_render';
export interface QuotaUsageEvent {
    userId: string;
    eventType: QuotaEventType;
    provider: string;
    processingTimeMs: number;
    estimatedCostUsd: number;
    tier: ReconstructionTier;
    createdAt: Date;
}
export interface ProviderHealthStatus {
    providerName: string;
    isHealthy: boolean;
    lastCheckAt: Date;
    avgCostPerCall7d: number;
    avgLatencyMs7d: number;
}
export type WorldAssetCategory = 'character' | 'dungeon' | 'weapon';
export type ScanMode = 'quick' | 'detail' | 'room';
export type WorldAssetSource = 'scanned' | 'purchased' | 'gifted';
export type BattleStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'expired';
export type ScanSessionStatus = 'capturing' | 'submitted' | 'processing' | 'completed' | 'failed';
export type PipelineType = 'fast' | 'precision';
export declare const XP_SKILL_SLOT_THRESHOLDS: readonly [100, 500, 1500, 5000];
export declare const MAX_GROWTH_SKILL_SLOTS = 4;
export declare const MAX_STARTER_SKILLS = 4;
export declare const MIN_STARTER_SKILLS = 2;
export declare const STAT_MIN = 1;
export declare const STAT_MAX = 100;
export declare const STAT_SUM_MIN = 150;
export declare const STAT_SUM_MAX = 350;
export declare const BATTLE_MAX_ROUNDS = 20;
export declare const BATTLE_CHALLENGE_EXPIRY_HOURS = 72;
export declare const CRIT_BASE_CHANCE = 0.1;
export declare const CRIT_SPD_DIVISOR = 1000;
export declare const DUNGEON_CODE_VALIDITY_DAYS = 30;
export declare const ABILITY_MULTIPLIER_MIN = 1;
export declare const ABILITY_MULTIPLIER_MAX = 2.2;
export declare const ABILITY_BONUS_CAPS: {
    readonly tasks: 0.5;
    readonly quality: 0.15;
    readonly tier: 0.4;
    readonly intimacy: 0.2;
};
export declare const ABILITY_TIER_BONUS: Record<string, number>;
export interface AbilityBreakdown {
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
}
export interface AbilitySnapshot {
    version: 1;
    multiplier: number;
    breakdown: AbilityBreakdown;
    baseStats: CharacterStats;
    effectiveStats: CharacterStats;
    sourceAgentAccountId: string | null;
    computedAt: string;
}
export type WorldEventType = 'work' | 'social' | 'greet' | 'reflect' | 'explore' | 'conflict' | 'levelup';
export type WorldEventOutcome = 'positive' | 'neutral' | 'negative';
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
export interface WorldResidentState {
    job?: string;
    mood?: string;
    location?: string;
    lastTickBucket?: number;
    activity?: string;
    axp?: number;
}
export declare const WORLD_TICK_BUCKET_MS: number;
export declare const WORLD_MAX_CATCHUP_TICKS = 8;
export declare const WORLD_WORK_AXP_BASE_MIN = 5;
export declare const WORLD_WORK_AXP_BASE_MAX = 40;
export interface WorldNpc {
    id: string;
    name: string;
    emoji: string;
    role: 'merchant' | 'guard' | 'guide' | 'trainer';
    location: string;
    line: string;
    actions: Array<'talk' | 'train' | 'trade' | 'quest'>;
}
export interface WorldFeedResponse {
    newEventCount: number;
    events: WorldEventItem[];
    residents: Array<{
        assetId: string;
        name: string;
        level: number;
        portraitUrl?: string | null;
        state: WorldResidentState;
    }>;
    npcs: WorldNpc[];
    town: {
        name: string;
        population: number;
        mainPet?: {
            name: string;
            intimacyLevel: number;
            emotion: string;
        } | null;
    };
}
export type BattleActionType = 'attack' | 'charge' | 'defend';
export interface BattleDecision {
    action: BattleActionType;
    skillIndex?: number;
}
export interface BattleResourceState {
    hp: number;
    energy: number;
    charge: number;
    defending: boolean;
}
export interface InteractiveBattleState {
    round: number;
    challenger: BattleResourceState;
    defender: BattleResourceState;
    status: 'active' | 'completed';
    winnerSide?: 'challenger' | 'defender';
}
export interface InteractiveRound {
    round: number;
    challengerAction: BattleActionType;
    defenderAction: BattleActionType;
    challengerSkill?: string;
    defenderSkill?: string;
    challengerDamageDealt: number;
    defenderDamageDealt: number;
    challengerCrit: boolean;
    defenderCrit: boolean;
    hpAfter: {
        challenger: number;
        defender: number;
    };
    energyAfter: {
        challenger: number;
        defender: number;
    };
    chargeAfter: {
        challenger: number;
        defender: number;
    };
}
export declare const IBATTLE_ENERGY_START = 1;
export declare const IBATTLE_ENERGY_MAX = 3;
export declare const IBATTLE_ENERGY_REGEN = 1;
export declare const IBATTLE_ATTACK_COST = 1;
export declare const IBATTLE_CHARGE_GAIN = 1;
export declare const IBATTLE_CHARGE_MAX = 3;
export declare const IBATTLE_CHARGE_DMG_BONUS = 0.6;
export declare const IBATTLE_DEFEND_REDUCTION = 0.5;
export declare const IBATTLE_DEFEND_REFLECT = 0.25;
export declare const IBATTLE_MAX_ROUNDS = 20;
export interface StartInteractiveBattleResponse {
    battleId: string;
    seed: string;
    state: InteractiveBattleState;
    challengerSkills: {
        name: string;
        type: SkillType;
        damageBase?: number;
    }[];
    defenderSkills: {
        name: string;
        type: SkillType;
        damageBase?: number;
    }[];
}
export interface StepInteractiveBattleRequest {
    decision: BattleDecision;
}
export interface StepInteractiveBattleResponse {
    round: InteractiveRound;
    state: InteractiveBattleState;
    result?: {
        winnerSide: 'challenger' | 'defender';
        totalRounds: number;
        xpAwarded: {
            challenger: number;
            defender: number;
        };
    };
}
