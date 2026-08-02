/**
 * AI World Creation Platform (v6) — Core Type Definitions
 *
 * Shared interfaces for the open World Creation platform built on top of the
 * shipped v5 Reality → AI World Engine. Defines the single canonical world
 * representation (ECS_World), the tiered substrate model (A/B/C), the restricted
 * behavior DSL (Substrate_DSL), Tier_C logic-module references, the structured
 * diff/version model, and the World_API capability whitelist.
 *
 * Used across mobile client, NestJS backend, and desktop/web surfaces.
 *
 * All entity property names use camelCase per the project's global TypeORM
 * SnakeNamingStrategy (column names auto-derived to snake_case).
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §2 ECS_World, §3 Substrate_Tier, §4 World_API
 */

// ============================================================
// §1 Substrate Tier (生成基底层级)
// design: §3 分层基底 A/B/C
// ============================================================

/**
 * Generation substrate tier — determines authoring ceiling and runtime risk.
 * - A: declarative scene-graph only (pure JSON, no executable logic).
 * - B: declarative + restricted Substrate_DSL event→action rules (no arbitrary code).
 * - C: sandboxed JS/TS + WASM logic modules (Turing-complete, opt-in, heavier review).
 */
export type SubstrateTier = 'A' | 'B' | 'C';

// ============================================================
// §2 Geometry primitives
// ============================================================

/** A 3D vector tuple [x, y, z] used for transforms. */
export type Vec3 = [number, number, number];

// ============================================================
// §3 ECS Component Catalog (组件目录)
// design: §2.2 Component Catalog
// ============================================================

/** `transform` (Tier A) — spatial transform of an entity. */
export interface TransformComponent {
  /** World-space position [x, y, z]. */
  pos: Vec3;
  /** Euler rotation [x, y, z] in degrees. */
  rot?: Vec3;
  /** Scale [x, y, z]. */
  scale?: Vec3;
}

/**
 * `mesh` (Tier A) — preset mesh or a reference to a World_Asset / glb.
 * Exactly one of `preset` or `assetRef` is expected.
 */
export interface MeshComponent {
  /** Built-in preset mesh identifier (e.g., "shelf_wood", "arena_colosseum"). */
  preset?: string;
  /** Reference to a World_Asset id or glb asset to render. */
  assetRef?: string;
}

/** Light type presets. */
export type LightType = 'point' | 'directional' | 'spot' | 'ambient' | 'dramatic';

/** `light` (Tier A) — lighting declaration. */
export interface LightComponent {
  /** Light type. */
  type: LightType;
  /** Hex color string (e.g., "#ffffff"). */
  color?: string;
  /** Light intensity (>= 0). */
  intensity?: number;
}

/** Collider shape. */
export type ColliderShape = 'box' | 'sphere' | 'capsule' | 'mesh';

/** `collider` (Tier A) — collision + walkable semantics. */
export interface ColliderComponent {
  /** Collision shape. */
  shape: ColliderShape;
  /** Whether the entity surface is walkable. */
  walkable?: boolean;
}

/**
 * `affordance` (Tier A) — physics/interaction semantic tags
 * (e.g., pickable / sittable / container / hazard / fighter_slot / buildable_grid).
 */
export interface AffordanceComponent {
  /** Semantic affordance tags. */
  tags: string[];
}

/** `ui` (Tier A) — in-experience UI control declaration. */
export interface UiComponent {
  /** Panel identifier (e.g., "leaderboard"). */
  panel?: string;
  /** Static text content. */
  text?: string;
  /** Button label. */
  button?: string;
  /** state.kv key this UI control is bound to (e.g., "ranks"). */
  kvKey?: string;
}

/**
 * `price` (Tier A) — declarative price for display only.
 * NON-AUTHORITATIVE: the authoritative amount is always computed server-side
 * by the Economy_Bridge (design §6). Sandbox-supplied values are display hints.
 */
export interface PriceComponent {
  /** Display price in AXP. */
  axp?: number;
  /** Display price in USD. */
  usd?: number;
}

/** `npc` (Tier B) — NPC entity definition. */
export interface NpcComponent {
  /** Inline dialogue lines. */
  dialogue?: string[];
  /** Reference to a behavior tree definition. */
  behaviorTreeRef?: string;
}

/**
 * `logicModuleRef` (Tier C) — reference to a sandboxed Tier_C logic module.
 * Points at a WASM/JS module declared in {@link EcsWorld.logicModules}.
 */
export interface LogicModuleRefComponent {
  /** Logic module id (matches {@link LogicModuleRef.moduleId}). */
  moduleId: string;
  /** Entry function name (e.g., "tick"). */
  entry: string;
}

/**
 * The component catalog for an entity. Components are keyed by name; each is
 * optional. Tier validation (design §3.1) enforces which components a Plot's
 * declared Substrate_Tier may contain.
 */
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

/** A single ECS entity = id + its component bag. */
export interface EcsEntity {
  /** Unique entity id within the ECS_World (e.g., "shelf_1"). */
  id: string;
  /** Component catalog for this entity. */
  components: EcsComponent;
}

// ============================================================
// §4 Substrate_DSL — restricted event→action rules (Tier B)
// design: §3.2 Tier_B Substrate_DSL
// ============================================================

/**
 * DSL event triggers (extensible whitelist). The DSL has NO arbitrary control
 * flow (no loops/recursion) — only conditional guards + an ordered action list.
 */
export type SubstrateEventTrigger =
  | 'click'
  | 'pickup'
  | 'enter_zone'
  | 'timer'
  | 'collision'
  | 'match_start'
  | 'match_end'
  | 'wave_clear';

/** Event anchor for a rule. */
export interface SubstrateRuleEvent {
  /** Trigger type. */
  event: SubstrateEventTrigger;
  /** Optional target entity id the trigger applies to (e.g., "checkout_btn"). */
  target?: string;
}

/** Comparison operators allowed in rule guards. */
export type SubstrateGuardOp = '==' | '!=' | '>' | '>=' | '<' | '<=';

/**
 * A read-only guard condition. Guards may only read state.kv and entity
 * components — never mutate state.
 */
export interface SubstrateGuard {
  /** state.kv key or entity-component path to read (e.g., "cart.count"). */
  kv: string;
  /** Comparison operator. */
  op: SubstrateGuardOp;
  /** Right-hand comparison value. */
  value: string | number | boolean | null;
}

/**
 * A single DSL action. Every action MUST map to a World_API capability.
 * Monetary values are never computed here — `amountRef`/`valueRef` reference
 * state and the authoritative amount is computed server-side (design §6).
 */
export interface SubstrateAction {
  /** World_API capability invoked by this action. */
  cap: WorldApiCapability;
  /** Capability arguments (capability-specific, may reference state via *Ref keys). */
  args?: Record<string, unknown>;
}

/**
 * A Tier_B Substrate_DSL rule: an event anchor, optional read-only guards,
 * and a finite ordered list of capability actions.
 */
export interface SubstrateRule {
  /** Unique rule id (e.g., "rule_checkout"). */
  id: string;
  /** Event anchor that triggers the rule. */
  on: SubstrateRuleEvent;
  /** Read-only guard conditions (all must pass). */
  when?: SubstrateGuard[];
  /** Finite, ordered list of capability actions to run. */
  do: SubstrateAction[];
}

// ============================================================
// §5 Tier_C Logic Module reference model
// design: §3.3 Tier_C 逻辑模块引用模型
// ============================================================

/** Runtime a Tier_C logic module executes in. */
export type LogicModuleRuntime = 'wasm' | 'js';

/** Review status of a logic module's bytecode. */
export type LogicModuleReviewStatus = 'pending' | 'scanning' | 'passed' | 'rejected';

/**
 * A Tier_C logic module declaration referenced by an ECS_World. The module
 * declares the capability subset it needs (deny-by-default authorization) and
 * locks its reviewed bytecode by hash to prevent post-publish replacement.
 */
export interface LogicModuleRef {
  /** Module id (referenced by {@link LogicModuleRefComponent.moduleId}). */
  moduleId: string;
  /** Execution runtime: WASM → L2, JS → L1. */
  runtime: LogicModuleRuntime;
  /** Entry function name (e.g., "tick"). */
  entry: string;
  /** Capabilities this module is authorized to use (subset of the whitelist). */
  capabilities: WorldApiCapability[];
  /** Content hash locking the reviewed bytecode (e.g., "sha256:..."). */
  hash: string;
  /** Moderation/static-scan review status. */
  reviewStatus: LogicModuleReviewStatus;
}

// ============================================================
// §6 ECS_World — single canonical world representation
// design: §2.1 顶层结构
// ============================================================

/** Authorship of an ECS_World or a diff. */
export type EcsAuthorType = 'user' | 'agent';

/** ECS_World metadata. */
export interface EcsWorldMeta {
  /** Who created this world ("user" | "agent"). */
  createdBy?: EcsAuthorType;
  /** Human-readable title (e.g., "便利店"). */
  title?: string;
  /** Optional free-form key/value metadata. */
  [key: string]: unknown;
}

/**
 * The single canonical world representation for a Plot: Entity-Component-System
 * JSON that is diffable, composable, and serializable. Humans and AI write into
 * the same structure.
 */
export interface EcsWorld {
  /** ECS schema version (e.g., "1.0"). */
  ecsVersion: string;
  /** Owning Plot id. */
  plotId: string;
  /** Declared substrate tier constraining what this world may contain. */
  substrateTier: SubstrateTier;
  /** All entities in the world. */
  entities: EcsEntity[];
  /** Tier_B Substrate_DSL rules (must be empty for Tier_A). */
  rules?: SubstrateRule[];
  /** Tier_C logic-module references (must be empty for Tier_A/B). */
  logicModules?: LogicModuleRef[];
  /** Optional declarative defs (e.g., tower-defense towers/enemies/waves). */
  defs?: Record<string, unknown>;
  /** World metadata. */
  meta?: EcsWorldMeta;
}

// ============================================================
// §7 Diff / Version / Revert model
// design: §2.3 Diff / Revert 模型 (JSON Patch RFC 6902 风格)
// ============================================================

/** JSON Patch (RFC 6902) operation kinds. */
export type JsonPatchOpType = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

/**
 * A single JSON Patch (RFC 6902) operation over an ECS_World document.
 */
export interface JsonPatchOp {
  /** Operation kind. */
  op: JsonPatchOpType;
  /** JSON Pointer path the operation targets (e.g., "/entities/2/components/price/axp"). */
  path: string;
  /** New value for add/replace/test operations. */
  value?: unknown;
  /** Source path for move/copy operations. */
  from?: string;
}

/**
 * A structured, diffable, reversible change to an ECS_World. Each creation
 * action (prompt generation / NL edit / direct manipulation / Agent autonomy)
 * produces one diff rather than overwriting the whole world. Stored as an
 * incremental chain anchored by periodic snapshots.
 */
export interface EcsDiff {
  /** Version id this diff produces (e.g., "v17"). */
  versionId: string;
  /** Parent version id this diff applies onto (e.g., "v16"). */
  parent: string | null;
  /** Owning Plot id. */
  plotId: string;
  /** Author type — attribution for revert and Agent autonomy (design §9.7). */
  authorType: EcsAuthorType;
  /** Author id (user id or Agent_Builder id). */
  authorId: string;
  /** Ordered JSON Patch operations. */
  ops: JsonPatchOp[];
  /** Unix epoch millis when the diff was produced. */
  ts: number;
}

// ============================================================
// §8 World_API capability whitelist (deny-by-default)
// design: §4 World_API 能力模型
// ============================================================

/**
 * The whitelist of capabilities exposed to experiences. Deny-by-default: any
 * capability not in this enum (and not declared by the experience's logic
 * module) is rejected and audited. Raw filesystem / network / process access
 * is never exposed.
 */
export enum WorldApiCapability {
  /** Spawn a new entity into the scene (L0). */
  SceneSpawn = 'scene.spawn',
  /** Update an entity transform (L0). */
  SceneTransform = 'scene.transform',
  /** Update an entity material (L0). */
  SceneSetMaterial = 'scene.setMaterial',
  /** Import a read-only asset handle; ownership validated server-side (L0). */
  AssetImport = 'asset.import',
  /** UI controls: panel/text/button/toast (L0). */
  Ui = 'ui.*',
  /** Key/value experience state read/write/append (L1). */
  StateKv = 'state.kv',
  /** Subscribe a rule to a trigger (L1). */
  EventOn = 'event.on',
  /** NPC spawn / dialogue / behavior tree (L1). */
  Npc = 'npc.*',
  /** Start a deterministic battle via the v5 Battle_Engine (L1 → server). */
  BattleStart = 'battle.start',
  /** Request a charge — server-authoritative (Economy_Bridge). */
  EconomyRequestCharge = 'economy.requestCharge',
  /** Request a payout — server-authoritative (Economy_Bridge). */
  EconomyRequestPayout = 'economy.requestPayout',
  /** Send a rate-limited message to a bound Agent (L1). */
  RpcToAgent = 'rpc.toAgent',
  /** The single egress channel — host-proxied, rate-limited, audited (L2). */
  NetFetch = 'net.fetch',
  /** Run a Tier_C computation inside the L2 WASM sandbox. */
  ComputeRun = 'compute.run',
}

/** Sandbox isolation levels (design §5.1). */
export type SandboxIsolationLevel = 'L0' | 'L1' | 'L2';

/** Structured capability-denial / tier-violation error codes. */
export type WorldCreationErrorCode =
  | 'TIER_VIOLATION'
  | 'CAP_DENIED'
  | 'PLOT_TAKEN'
  | 'SCHEMA_INVALID'
  | 'ASSET_NOT_OWNED'
  | 'ECONOMY_REJECTED'
  | 'RESOURCE_EXCEEDED'
  | 'MODERATION_REJECTED'
  | 'QUOTA_EXCEEDED'
  | 'LOAD_TIMEOUT'
  | 'NOT_ORIGINAL_CREATOR'
  // 发布前质量门未过(区别于 MODERATION_REJECTED 的"违规";这是"不够好/不可用")。
  // world-growth-engine 质量门:内容保留、可改重生(对齐需求 3.3 语义)。
  | 'QUALITY_REJECTED';

/** A structured error returned by the platform (design §Error Handling). */
export interface WorldCreationError {
  /** Machine-readable error code. */
  error: WorldCreationErrorCode;
  /** Human-readable detail describing the violating item. */
  detail: string;
}

// ============================================================
// §9 Plot & domain enums
// ============================================================

/** Lifecycle status of a Plot. */
export type PlotStatus = 'draft' | 'published' | 'listed' | 'unpublished' | 'suspended';

/** Creation_Task dispatch targets. */
export type CreationTaskTarget = 'self' | 'desktop' | 'agent';

/** Creation_Task lifecycle status. */
export type CreationTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

/** Plot listing sale type — drives the platform revenue-share rate. */
export type PlotSaleType = 'first' | 'secondary';

/** Plot listing lifecycle status. */
export type PlotListingStatus = 'active' | 'sold' | 'cancelled' | 'pending_review';

/** Plot discovery sort / filter rank. */
export type PlotDiscoverySort = 'newest' | 'popularity' | 'tier';

// ============================================================
// §10 Constants
// ============================================================

/** Current ECS schema version. */
export const ECS_VERSION = '1.0' as const;

/** Platform revenue-share rates (reused from v5 economy model). */
export const REVENUE_SHARE_FIRST_SALE = 0.05;
export const REVENUE_SHARE_SECONDARY_SALE = 0.10;

/** Plot listing price ranges (design §7.1, R2.4). */
export const PLOT_PRICE_USD_MIN = 0.01;
export const PLOT_PRICE_USD_MAX = 999_999.99;
export const PLOT_PRICE_AXP_MIN = 1;
export const PLOT_PRICE_AXP_MAX = 10_000_000;

/** Trust level required for Marketplace purchase / payout (R7.4). */
export const TRUST_LEVEL_PURCHASE = 3;

/** Presence sync refresh budget on the World_Map (R1.2), in milliseconds. */
export const MAP_PRESENCE_REFRESH_MS = 2000;

/** Plot load timeout before falling back to the map view (R1.7), in milliseconds. */
export const PLOT_LOAD_TIMEOUT_MS = 10_000;

/** FREE monthly cost cap (USD) and soft-reminder threshold (R12.2/12.3). */
export const FREE_MONTHLY_COST_CAP_USD = 5;
export const COST_SOFT_REMINDER_RATIO = 0.8;

// ============================================================
// §11 Generation metering & quota (R12.1/12.4/12.5)
// ============================================================

/**
 * Kind of generation operation metered against `agent_cost_records` (R12.1).
 *  - scene_graph: Tier_A declarative scene-graph generation.
 *  - dsl:         Tier_B Substrate_DSL (event→action rules) generation.
 *  - model_3d:    3D model reconstruction via the pluggable provider strategy
 *                 (Hunyuan3D primary, Meshy backup — R12.5).
 *  - video:       Replay / experience video rendering.
 */
export type GenerationKind = 'scene_graph' | 'dsl' | 'model_3d' | 'video';

/** Cost soft/hard warning level derived from the FREE monthly cost ceiling. */
export type GenerationWarningLevel = 'none' | 'soft_warning' | 'hard_block';

/**
 * User-facing cost-ceiling notice surfaced to generation callers (R12.2/12.3).
 *
 * Emitted ONLY when the FREE monthly cost ceiling is in a non-`none` state:
 *  - `soft_warning` — accumulated cost is at or above 80% of the cap; generation
 *    still proceeds but the caller should display the soft reminder.
 *  - `hard_block`   — accumulated cost reached 100% of the cap; generation is
 *    blocked until the next billing cycle or an upgrade.
 */
export interface GenerationQuotaWarning {
  /** Non-`none` ceiling state (soft 80% reminder / hard 100% block). */
  warningLevel: Exclude<GenerationWarningLevel, 'none'>;
  /** Accumulated monthly cost (USD) for the user this UTC month. */
  currentCost: number;
  /** Monthly cost ceiling (USD). */
  ceiling: number;
  /** Fraction of the ceiling consumed (clamped to ≥ 0; ≥ 1 means at/over cap). */
  ratioUsed: number;
  /** User-facing reminder / block message. */
  message: string;
}

/**
 * Result of a pre-generation quota check (design §13, R12.4). Combines the
 * world-engine monthly cost ceiling (FREE $5/mo, R12.2/12.3) with the optional
 * per-event daily quota. `allowed=false` blocks the generation.
 */
export interface GenerationQuotaResult {
  /** Whether the generation may proceed. */
  allowed: boolean;
  /** Cost-ceiling warning level (none / soft 80% / hard 100%). */
  warningLevel: GenerationWarningLevel;
  /** Accumulated monthly cost (USD) for the user this UTC month. */
  currentCost: number;
  /** Monthly cost ceiling (USD); Infinity for non-FREE tiers. */
  ceiling: number;
  /** Optional daily-quota view when an event type was supplied. */
  daily?: {
    allowed: boolean;
    remaining: number;
    limit: number;
    resetTime: string;
  };
  /** Present when the FREE cost ceiling is in a soft/hard state (R12.2/12.3). */
  warning?: GenerationQuotaWarning;
  /** Present when allowed=false; structured QUOTA_EXCEEDED error. */
  error?: WorldCreationError;
}
