export type SubstrateTier = 'A' | 'B' | 'C';
export type Vec3 = [number, number, number];
export interface TransformComponent {
    pos: Vec3;
    rot?: Vec3;
    scale?: Vec3;
}
export interface MeshComponent {
    preset?: string;
    assetRef?: string;
}
export type LightType = 'point' | 'directional' | 'spot' | 'ambient' | 'dramatic';
export interface LightComponent {
    type: LightType;
    color?: string;
    intensity?: number;
}
export type ColliderShape = 'box' | 'sphere' | 'capsule' | 'mesh';
export interface ColliderComponent {
    shape: ColliderShape;
    walkable?: boolean;
}
export interface AffordanceComponent {
    tags: string[];
}
export interface UiComponent {
    panel?: string;
    text?: string;
    button?: string;
    kvKey?: string;
}
export interface PriceComponent {
    axp?: number;
    usd?: number;
}
export interface NpcComponent {
    dialogue?: string[];
    behaviorTreeRef?: string;
}
export interface LogicModuleRefComponent {
    moduleId: string;
    entry: string;
}
export interface EcsComponent {
    transform?: TransformComponent;
    mesh?: MeshComponent;
    light?: LightComponent;
    collider?: ColliderComponent;
    affordance?: AffordanceComponent;
    ui?: UiComponent;
    price?: PriceComponent;
    npc?: NpcComponent;
    logicModuleRef?: LogicModuleRefComponent;
}
export interface EcsEntity {
    id: string;
    components: EcsComponent;
}
export type SubstrateEventTrigger = 'click' | 'pickup' | 'enter_zone' | 'timer' | 'collision' | 'match_start' | 'match_end' | 'wave_clear';
export interface SubstrateRuleEvent {
    event: SubstrateEventTrigger;
    target?: string;
}
export type SubstrateGuardOp = '==' | '!=' | '>' | '>=' | '<' | '<=';
export interface SubstrateGuard {
    kv: string;
    op: SubstrateGuardOp;
    value: string | number | boolean | null;
}
export interface SubstrateAction {
    cap: WorldApiCapability;
    args?: Record<string, unknown>;
}
export interface SubstrateRule {
    id: string;
    on: SubstrateRuleEvent;
    when?: SubstrateGuard[];
    do: SubstrateAction[];
}
export type LogicModuleRuntime = 'wasm' | 'js';
export type LogicModuleReviewStatus = 'pending' | 'scanning' | 'passed' | 'rejected';
export interface LogicModuleRef {
    moduleId: string;
    runtime: LogicModuleRuntime;
    entry: string;
    capabilities: WorldApiCapability[];
    hash: string;
    reviewStatus: LogicModuleReviewStatus;
}
export type EcsAuthorType = 'user' | 'agent';
export interface EcsWorldMeta {
    createdBy?: EcsAuthorType;
    title?: string;
    [key: string]: unknown;
}
export interface EcsWorld {
    ecsVersion: string;
    plotId: string;
    substrateTier: SubstrateTier;
    entities: EcsEntity[];
    rules?: SubstrateRule[];
    logicModules?: LogicModuleRef[];
    defs?: Record<string, unknown>;
    meta?: EcsWorldMeta;
}
export type JsonPatchOpType = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
export interface JsonPatchOp {
    op: JsonPatchOpType;
    path: string;
    value?: unknown;
    from?: string;
}
export interface EcsDiff {
    versionId: string;
    parent: string | null;
    plotId: string;
    authorType: EcsAuthorType;
    authorId: string;
    ops: JsonPatchOp[];
    ts: number;
}
export declare enum WorldApiCapability {
    SceneSpawn = "scene.spawn",
    SceneTransform = "scene.transform",
    SceneSetMaterial = "scene.setMaterial",
    AssetImport = "asset.import",
    Ui = "ui.*",
    StateKv = "state.kv",
    EventOn = "event.on",
    Npc = "npc.*",
    BattleStart = "battle.start",
    EconomyRequestCharge = "economy.requestCharge",
    EconomyRequestPayout = "economy.requestPayout",
    RpcToAgent = "rpc.toAgent",
    NetFetch = "net.fetch",
    ComputeRun = "compute.run"
}
export type SandboxIsolationLevel = 'L0' | 'L1' | 'L2';
export type WorldCreationErrorCode = 'TIER_VIOLATION' | 'CAP_DENIED' | 'PLOT_TAKEN' | 'SCHEMA_INVALID' | 'ASSET_NOT_OWNED' | 'ECONOMY_REJECTED' | 'RESOURCE_EXCEEDED' | 'MODERATION_REJECTED' | 'QUOTA_EXCEEDED' | 'LOAD_TIMEOUT' | 'NOT_ORIGINAL_CREATOR' | 'QUALITY_REJECTED';
export interface WorldCreationError {
    error: WorldCreationErrorCode;
    detail: string;
}
export type PlotStatus = 'draft' | 'published' | 'listed' | 'unpublished' | 'suspended';
export type CreationTaskTarget = 'self' | 'desktop' | 'agent';
export type CreationTaskStatus = 'queued' | 'running' | 'completed' | 'failed';
export type PlotSaleType = 'first' | 'secondary';
export type PlotListingStatus = 'active' | 'sold' | 'cancelled' | 'pending_review';
export type PlotDiscoverySort = 'newest' | 'popularity' | 'tier';
export declare const ECS_VERSION: "1.0";
export declare const REVENUE_SHARE_FIRST_SALE = 0.05;
export declare const REVENUE_SHARE_SECONDARY_SALE = 0.1;
export declare const PLOT_PRICE_USD_MIN = 0.01;
export declare const PLOT_PRICE_USD_MAX = 999999.99;
export declare const PLOT_PRICE_AXP_MIN = 1;
export declare const PLOT_PRICE_AXP_MAX = 10000000;
export declare const TRUST_LEVEL_PURCHASE = 3;
export declare const MAP_PRESENCE_REFRESH_MS = 2000;
export declare const PLOT_LOAD_TIMEOUT_MS = 10000;
export declare const FREE_MONTHLY_COST_CAP_USD = 5;
export declare const COST_SOFT_REMINDER_RATIO = 0.8;
export type GenerationKind = 'scene_graph' | 'dsl' | 'model_3d' | 'video';
export type GenerationWarningLevel = 'none' | 'soft_warning' | 'hard_block';
export interface GenerationQuotaWarning {
    warningLevel: Exclude<GenerationWarningLevel, 'none'>;
    currentCost: number;
    ceiling: number;
    ratioUsed: number;
    message: string;
}
export interface GenerationQuotaResult {
    allowed: boolean;
    warningLevel: GenerationWarningLevel;
    currentCost: number;
    ceiling: number;
    daily?: {
        allowed: boolean;
        remaining: number;
        limit: number;
        resetTime: string;
    };
    warning?: GenerationQuotaWarning;
    error?: WorldCreationError;
}
