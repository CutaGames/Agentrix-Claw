/**
 * Tower_Defense_Generator — Tier_C ECS_World generation for the tower-defense
 * demo (design §11.2, R17.1/R17.2/R17.3).
 *
 * Tower Defense is the canonical demonstration that **Tier_C exists for a
 * legitimate reason** (design §11.2 / §15 Phase 3): wave scheduling, enemy
 * pathfinding (A-star / flow-field), and projectile/collision resolution are
 * loop-bearing real-time computations that the Substrate_DSL (no loops, no
 * arbitrary control flow) *cannot* express. They therefore require a
 * Turing-complete logic module running in the **L2 WASM sandbox** via the
 * `compute.run` capability (R17.2). This is the best showcase of the A/B/C
 * "upgrade only when you must" principle.
 *
 * This module exports a PURE function {@link generateTowerDefense} that an
 * AgentBuilderService prompt flow (dispatched to Desktop or a bound Agent — never
 * Mobile, R17.1) calls to produce the game's canonical ECS_World. The result is a
 * strict **Tier_C** world:
 *
 *   - declarative scene-graph layout entities (build grid, enemy spawn, defended
 *     core) — the level layout stays declarative ECS data (R17.3),
 *   - declarative tower / enemy / wave definitions in `defs` (R17.3),
 *   - a `logicModuleRef` component on a controller entity pointing at the
 *     sandboxed WASM logic module, plus the matching `logicModules[]` declaration
 *     (capabilities subset + reviewed bytecode `hash`) (R17.3).
 *
 * **WASM-returns-intents invariant (R17.2, design §11.2):** the WASM `tick`
 * module is pure compute — given the current frame state it returns *intents*
 * ({@link TowerDefenseTickOutput}: spawns / transforms / hits / coreHpDelta /
 * waveCleared / ui). It NEVER touches the scene directly. The host translates
 * those intents into whitelisted `scene.*` / `ui.*` World_API capability calls
 * via {@link translateTickIntents} and applies them under host control. This
 * keeps untrusted compute behind the capability boundary (deny-by-default).
 *
 * The Tier_C economy hooks (AXP tower upgrades / continues), World_Asset hero
 * binding, static code scanning, Resource_Watchdog enforcement, and Mobile
 * playability live in task 22.2 — this module produces the canonical world and
 * the WASM intent model only.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.2 Tower Defense
 */

import {
  ECS_VERSION,
  EcsEntity,
  EcsWorld,
  LogicModuleRef,
  SubstrateRule,
  Vec3,
  WorldApiCapability,
} from '../../../../shared/types/world-creation';

// ============================================================
// Declarative defs (towers / enemies / waves) — Tier_C keeps these as data (R17.3)
// ============================================================

/** Declarative definition of a buildable tower (data only — behavior lives in WASM). */
export interface TowerDefenseTowerSpec {
  /** Unique tower def id (e.g., "arrow"). */
  id: string;
  /** Human-readable display name. */
  displayName?: string;
  /** AXP build cost (declarative; charge is server-authoritative at build time — task 22.2). */
  cost: number;
  /** Attack range in grid cells. */
  range: number;
  /** Damage per second. */
  dps: number;
  /**
   * AXP cost to upgrade this tower in-run (declarative; the charge is
   * server-authoritative at upgrade time via Economy_Bridge — task 22.2, R17.4).
   * Defaults to {@link TowerDefenseTowerSpec.cost} when omitted.
   */
  upgradeCost?: number;
  /**
   * Whether this tower slot may be filled by a player-owned World_Asset hero
   * (resolved per-player via Cross_Experience_Identity — task 22.2, R17.5).
   */
  heroAssetSlot?: boolean;
}

/** Declarative definition of an enemy (data only — pathing/HP logic runs in WASM). */
export interface TowerDefenseEnemySpec {
  /** Unique enemy def id (e.g., "goblin"). */
  id: string;
  /** Human-readable display name. */
  displayName?: string;
  /** Hit points. */
  hp: number;
  /** Movement speed (cells/sec). */
  speed: number;
  /** Whether this enemy is a climactic Boss (drives BGM/affordance — task 22.2). */
  isBoss?: boolean;
}

/** A single enemy spawn burst within a wave. */
export interface TowerDefenseSpawnBurst {
  /** Enemy def id to spawn. */
  enemy: string;
  /** Number of enemies in this burst. */
  count: number;
  /** Seconds between consecutive spawns in the burst. */
  interval: number;
}

/** Declarative definition of a wave (data only — scheduling runs in WASM). */
export interface TowerDefenseWaveSpec {
  /** Wave start time offset (seconds from level/previous wave). */
  t: number;
  /** Enemy spawn bursts that make up this wave. */
  spawn: TowerDefenseSpawnBurst[];
}

// ============================================================
// Generation options
// ============================================================

/** Options driving {@link generateTowerDefense}. */
export interface TowerDefenseGeneratorOptions {
  /** Owning Plot id (becomes {@link EcsWorld.plotId}). */
  plotId: string;
  /** Human-readable game title (defaults to "塔防"). */
  title?: string;
  /** Build-grid mesh preset (defaults to "td_grid_8x8"). */
  gridPreset?: string;
  /** Enemy spawn point grid position (defaults to [0,0,0]). */
  spawnPos?: Vec3;
  /** Defended core grid position (defaults to [7,0,7]). */
  corePos?: Vec3;
  /** Tower roster. When omitted a single default arrow tower is generated. */
  towers?: TowerDefenseTowerSpec[];
  /** Enemy roster. When omitted a single default goblin is generated. */
  enemies?: TowerDefenseEnemySpec[];
  /** Wave schedule. When omitted a single default opening wave is generated. */
  waves?: TowerDefenseWaveSpec[];
  /**
   * AXP cost of a "continue" (revive after a lost level). Stored as a declarative
   * priceable economy entity; the charge is server-authoritative at continue time
   * via Economy_Bridge (task 22.2, R17.4). Defaults to {@link DEFAULT_CONTINUE_COST}.
   */
  continueCost?: number;
  /** WASM logic module id (defaults to "td_core"). */
  logicModuleId?: string;
  /**
   * Reviewed bytecode hash locking the WASM module (design §3.3). Defaults to a
   * `pending` placeholder; the real hash + `reviewStatus:"passed"` are set by the
   * C-tier static-scan moderation step before publish (task 22.2, R17.6).
   */
  logicModuleHash?: string;
}

// ============================================================
// Defaults
// ============================================================

const DEFAULT_TITLE = '塔防';
const DEFAULT_GRID_PRESET = 'td_grid_8x8';
const DEFAULT_SPAWN_POS: Vec3 = [0, 0, 0];
const DEFAULT_CORE_POS: Vec3 = [7, 0, 7];
const DEFAULT_LOGIC_MODULE_ID = 'td_core';
const DEFAULT_LOGIC_MODULE_ENTRY = 'tick';
const PENDING_HASH = 'sha256:pending';

/** Default AXP cost of a "continue" when {@link TowerDefenseGeneratorOptions.continueCost} is omitted. */
export const DEFAULT_CONTINUE_COST = 100;

/** Entity-id prefix for a tower's priceable in-run upgrade economy entity (R17.4). */
export const TD_UPGRADE_ENTITY_PREFIX = 'upgrade_';

/** Entity id of the priceable "continue" economy entity (R17.4). */
export const TD_CONTINUE_ENTITY_ID = 'continue';

/** Controller entity id that carries the Tier_C `logicModuleRef` (R17.3). */
export const TD_CONTROLLER_ENTITY_ID = 'td_controller';

/**
 * The priceable economy entity id for upgrading a given tower (R17.4). This id is
 * passed as the `amountRef` to `economy.requestCharge`; the Economy_Bridge then
 * resolves the **authoritative** AXP price from this entity's declarative `price`
 * component server-side (sandbox-supplied amounts are ignored — Property 2).
 */
export function towerUpgradeEntityId(towerId: string): string {
  return `${TD_UPGRADE_ENTITY_PREFIX}${towerId}`;
}

/**
 * Capabilities the WASM tick module is authorized to use (deny-by-default subset
 * of the World_API whitelist, design §3.3). The module returns intents that the
 * host applies via `scene.*` / `ui.*`; it also drives the tick loop via
 * `compute.run` and reads/writes experience state via `state.kv`. The AXP upgrade
 * charge (`economy.requestCharge`) is wired in task 22.2.
 */
const TD_LOGIC_CAPABILITIES: WorldApiCapability[] = [
  WorldApiCapability.ComputeRun,
  WorldApiCapability.SceneSpawn,
  WorldApiCapability.SceneTransform,
  WorldApiCapability.SceneSetMaterial,
  WorldApiCapability.Ui,
  WorldApiCapability.StateKv,
  // AXP tower-upgrade / continue charges (R17.4). The WASM module may *request* a
  // charge intent, but the host always executes it server-side through the
  // Economy_Bridge under Trust gating — the amount is never computed in the sandbox.
  WorldApiCapability.EconomyRequestCharge,
];

function defaultTowers(): TowerDefenseTowerSpec[] {
  return [
    { id: 'arrow', displayName: '箭塔', cost: 50, range: 3, dps: 20, heroAssetSlot: true },
  ];
}

function defaultEnemies(): TowerDefenseEnemySpec[] {
  return [{ id: 'goblin', displayName: '哥布林', hp: 100, speed: 1.2 }];
}

function defaultWaves(): TowerDefenseWaveSpec[] {
  return [{ t: 0, spawn: [{ enemy: 'goblin', count: 10, interval: 0.5 }] }];
}

// ============================================================
// Entity builders (declarative layout — R17.3)
// ============================================================

/** Build the declarative level layout: build grid, enemy spawn, defended core. */
function buildLayoutEntities(
  gridPreset: string,
  spawnPos: Vec3,
  corePos: Vec3,
): EcsEntity[] {
  return [
    {
      id: 'map',
      components: {
        mesh: { preset: gridPreset },
        affordance: { tags: ['buildable_grid'] },
        collider: { shape: 'box', walkable: true },
      },
    },
    {
      id: 'spawn',
      components: {
        transform: { pos: spawnPos },
        affordance: { tags: ['enemy_spawn'] },
      },
    },
    {
      id: 'core',
      components: {
        transform: { pos: corePos },
        affordance: { tags: ['defend'] },
      },
    },
  ];
}

/**
 * Build the priceable economy entities (R17.4): one in-run upgrade entity per
 * tower plus a single "continue" entity. Each carries a declarative `price`
 * component (Tier_A data) so the Economy_Bridge can resolve the **authoritative**
 * AXP amount server-side at charge time — the sandbox never computes the price
 * (Property 2). These are referenced by `economy.requestCharge`'s `amountRef`.
 */
function buildEconomyEntities(
  towers: TowerDefenseTowerSpec[],
  continueCost: number,
): EcsEntity[] {
  const entities: EcsEntity[] = towers.map((t) => ({
    id: towerUpgradeEntityId(t.id),
    components: {
      price: { axp: t.upgradeCost ?? t.cost },
      affordance: { tags: ['economy_upgrade'] },
    },
  }));
  entities.push({
    id: TD_CONTINUE_ENTITY_ID,
    components: {
      price: { axp: continueCost },
      affordance: { tags: ['economy_continue'] },
    },
  });
  return entities;
}

/**
 * Build the controller entity carrying the Tier_C `logicModuleRef` (R17.3).
 * This entity has no behavior of its own — it merely binds the world to the
 * sandboxed WASM tick module the host invokes via `compute.run`.
 */
function buildControllerEntity(moduleId: string, entry: string): EcsEntity {
  return {
    id: TD_CONTROLLER_ENTITY_ID,
    components: {
      logicModuleRef: { moduleId, entry },
    },
  };
}

// ============================================================
// Substrate_DSL rules (Tier_C may still use declarative rules to bootstrap)
// ============================================================

/**
 * Build the minimal bootstrap rules. The simulation itself is NOT expressed in
 * the DSL (it cannot loop) — the host drives the WASM `tick` each frame. These
 * rules only kick off the frame loop on game start; every action maps to a
 * whitelisted World_API capability so the world passes `validateTier`.
 */
function buildBootstrapRules(moduleId: string): SubstrateRule[] {
  return [
    {
      id: 'rule_start_waves',
      on: { event: 'click', target: 'start_btn' },
      do: [
        // Hand control to the WASM tick module; host applies its returned intents.
        { cap: WorldApiCapability.ComputeRun, args: { moduleId, entry: DEFAULT_LOGIC_MODULE_ENTRY } },
      ],
    },
    {
      id: 'rule_wave_cleared_toast',
      on: { event: 'wave_clear' },
      do: [{ cap: WorldApiCapability.Ui, args: { toast: '波次清除' } }],
    },
  ];
}

// ============================================================
// Generator
// ============================================================

/**
 * Generate the Tier_C ECS_World for a tower-defense game (R17.1/R17.2/R17.3).
 *
 * Pure function — deterministic given its options, no I/O and no mutation of
 * inputs. The returned world is Tier_C: it keeps the **level layout and
 * tower/enemy/wave definitions as declarative ECS data** (R17.3) while
 * referencing a sandboxed WASM `logicModules[]` entry (capabilities subset +
 * bytecode `hash`) through a `logicModuleRef` component on the controller entity.
 * The loop-bearing wave scheduling / pathfinding / projectile resolution runs in
 * the L2 WASM sandbox via `compute.run` (R17.2) — see {@link TowerDefenseTickOutput}
 * and {@link translateTickIntents} for the WASM-returns-intents model.
 *
 * @param opts tower-defense generation options (plot id, towers/enemies/waves, module)
 * @returns a Tier_C {@link EcsWorld} ready for diff/version persistence
 */
export function generateTowerDefense(opts: TowerDefenseGeneratorOptions): EcsWorld {
  const plotId = opts.plotId;
  const title = opts.title ?? DEFAULT_TITLE;
  const gridPreset = opts.gridPreset ?? DEFAULT_GRID_PRESET;
  const spawnPos = opts.spawnPos ?? DEFAULT_SPAWN_POS;
  const corePos = opts.corePos ?? DEFAULT_CORE_POS;
  const towers = opts.towers && opts.towers.length > 0 ? opts.towers : defaultTowers();
  const enemies = opts.enemies && opts.enemies.length > 0 ? opts.enemies : defaultEnemies();
  const waves = opts.waves && opts.waves.length > 0 ? opts.waves : defaultWaves();
  const moduleId = opts.logicModuleId ?? DEFAULT_LOGIC_MODULE_ID;
  const moduleHash = opts.logicModuleHash ?? PENDING_HASH;
  const continueCost = opts.continueCost ?? DEFAULT_CONTINUE_COST;

  const entities: EcsEntity[] = [
    ...buildLayoutEntities(gridPreset, spawnPos, corePos),
    ...buildEconomyEntities(towers, continueCost),
    buildControllerEntity(moduleId, DEFAULT_LOGIC_MODULE_ENTRY),
  ];

  // The sandboxed WASM logic module declaration (design §3.3). reviewStatus
  // stays `pending` until the C-tier static scan passes at publish (task 22.2).
  const logicModule: LogicModuleRef = {
    moduleId,
    runtime: 'wasm',
    entry: DEFAULT_LOGIC_MODULE_ENTRY,
    capabilities: [...TD_LOGIC_CAPABILITIES],
    hash: moduleHash,
    reviewStatus: moduleHash === PENDING_HASH ? 'pending' : 'passed',
  };

  return {
    ecsVersion: ECS_VERSION,
    plotId,
    substrateTier: 'C',
    entities,
    rules: buildBootstrapRules(moduleId),
    logicModules: [logicModule],
    // Declarative towers / enemies / waves manifest (R17.3).
    defs: {
      towers: towers.map((t) => ({ ...t })),
      enemies: enemies.map((e) => ({ ...e })),
      waves: waves.map((w) => ({ t: w.t, spawn: w.spawn.map((s) => ({ ...s })) })),
    },
    meta: {
      createdBy: 'agent',
      title,
      kind: 'tower_defense',
    },
  };
}

// ============================================================
// WASM tick intent model (R17.2 — WASM returns intents, host applies)
// ============================================================

/** A live tower as seen by the WASM tick (declarative def id + placement + cooldown). */
export interface TowerDefenseTickTower {
  /** Instance id (e.g., "tower_3"). */
  id: string;
  /** Tower def id from `defs.towers`. */
  defId: string;
  /** Grid position. */
  pos: Vec3;
  /** Remaining cooldown (ms) before the tower may fire again. */
  cooldownMs?: number;
}

/** A live enemy as seen by the WASM tick (def id + position + remaining HP + path progress). */
export interface TowerDefenseTickEnemy {
  /** Instance id (e.g., "enemy_12"). */
  id: string;
  /** Enemy def id from `defs.enemies`. */
  defId: string;
  /** Grid position. */
  pos: Vec3;
  /** Remaining hit points. */
  hp: number;
  /** Fraction of the path traversed (0..1). */
  pathT?: number;
}

/** Current wave-scheduling state passed to the WASM tick. */
export interface TowerDefenseWaveState {
  /** Index of the active wave. */
  waveIndex: number;
  /** Seconds elapsed within the active wave. */
  elapsed: number;
  /** Defended core remaining HP. */
  coreHp: number;
}

/**
 * Input to the WASM `tick` module (design §11.2 `compute.run` interface).
 * Passed verbatim into `compute.run("td_core", input)`.
 */
export interface TowerDefenseTickInput {
  /** Frame delta time in milliseconds. */
  dtMs: number;
  /** Live towers on the board. */
  towers: TowerDefenseTickTower[];
  /** Live enemies on the board. */
  enemies: TowerDefenseTickEnemy[];
  /** Wave-scheduling state. */
  waveState: TowerDefenseWaveState;
}

/** Intent: spawn a new entity into the scene (host applies via `scene.spawn`). */
export interface TowerDefenseSpawnIntent {
  /** Instance id to assign the spawned entity. */
  entityId: string;
  /** Enemy/projectile def id to render. */
  defId: string;
  /** Spawn position. */
  pos: Vec3;
}

/** Intent: move an existing entity (host applies via `scene.transform`). */
export interface TowerDefenseTransformIntent {
  /** Target entity instance id. */
  entityId: string;
  /** New position. */
  pos: Vec3;
}

/** Intent: a projectile/attack hit resolved by WASM (host applies feedback). */
export interface TowerDefenseHitIntent {
  /** Enemy instance id that was hit. */
  targetId: string;
  /** Damage applied (already resolved server/compute-side). */
  damage: number;
  /** Whether the hit killed the enemy. */
  killed?: boolean;
}

/** Intent: a UI feedback cue (host applies via `ui.*`). */
export interface TowerDefenseUiIntent {
  /** Toast message to surface. */
  toast?: string;
  /** HUD key/value update (e.g., score, core HP). */
  hud?: Record<string, unknown>;
}

/**
 * Output of the WASM `tick` module (design §11.2 `compute.run` interface).
 *
 * This is the **only** way the untrusted module affects the world: it returns
 * *intents*, never mutating the scene directly. The host translates these into
 * whitelisted `scene.*` / `ui.*` capability calls via {@link translateTickIntents}
 * and applies them under host control (R17.2).
 */
export interface TowerDefenseTickOutput {
  /** Entities to spawn this frame (new enemies / projectiles). */
  spawns: TowerDefenseSpawnIntent[];
  /** Entity moves this frame (enemy advance / projectile flight). */
  transforms: TowerDefenseTransformIntent[];
  /** Hits resolved this frame. */
  hits: TowerDefenseHitIntent[];
  /** Net change to the defended core HP (negative = leaked enemies). */
  coreHpDelta: number;
  /** Whether the active wave was cleared this frame. */
  waveCleared: boolean;
  /** Optional UI feedback cues. */
  ui?: TowerDefenseUiIntent[];
}

/** A single host-applied World_API capability call translated from a WASM intent. */
export interface HostCapabilityCall {
  /** The whitelisted capability the host invokes. */
  cap: WorldApiCapability;
  /** Capability arguments. */
  args: Record<string, unknown>;
}

/**
 * Translate a WASM `tick` output into the ordered list of whitelisted `scene.*`
 * / `ui.*` World_API capability calls the HOST applies (R17.2, design §11.2).
 *
 * Pure function — no I/O, no mutation of the input. This is the controlled
 * boundary: untrusted WASM only ever produces {@link TowerDefenseTickOutput}
 * intents, and ONLY `scene.spawn`, `scene.transform`, `scene.setMaterial`, and
 * `ui.*` capabilities are ever emitted here. The WASM module can never reach the
 * scene directly — every effect flows through this host-controlled translation,
 * which the SandboxService then dispatches under deny-by-default.
 *
 * Ordering: spawns → transforms → hits (death material + kill feedback) →
 * core-HP HUD → wave-cleared toast → explicit UI cues. Deterministic.
 *
 * @param output the WASM tick intents
 * @returns the ordered host capability calls to dispatch (only scene.* / ui.*)
 */
export function translateTickIntents(
  output: TowerDefenseTickOutput,
): HostCapabilityCall[] {
  const calls: HostCapabilityCall[] = [];

  for (const spawn of output.spawns ?? []) {
    calls.push({
      cap: WorldApiCapability.SceneSpawn,
      args: { entityId: spawn.entityId, defId: spawn.defId, pos: spawn.pos },
    });
  }

  for (const move of output.transforms ?? []) {
    calls.push({
      cap: WorldApiCapability.SceneTransform,
      args: { id: move.entityId, pos: move.pos },
    });
  }

  for (const hit of output.hits ?? []) {
    if (hit.killed) {
      // A kill recolors/clears the dead enemy (host-controlled scene mutation).
      calls.push({
        cap: WorldApiCapability.SceneSetMaterial,
        args: { id: hit.targetId, material: 'defeated' },
      });
    }
    // Damage feedback floats over the enemy via UI (juice — design §11.0).
    calls.push({
      cap: WorldApiCapability.Ui,
      args: { floatText: { targetId: hit.targetId, text: `-${hit.damage}` } },
    });
  }

  if (output.coreHpDelta && output.coreHpDelta !== 0) {
    calls.push({
      cap: WorldApiCapability.Ui,
      args: { hud: { key: 'coreHpDelta', value: output.coreHpDelta } },
    });
  }

  if (output.waveCleared) {
    calls.push({ cap: WorldApiCapability.Ui, args: { toast: '波次清除' } });
  }

  for (const cue of output.ui ?? []) {
    if (cue.toast !== undefined) {
      calls.push({ cap: WorldApiCapability.Ui, args: { toast: cue.toast } });
    }
    if (cue.hud !== undefined) {
      calls.push({ cap: WorldApiCapability.Ui, args: { hud: cue.hud } });
    }
  }

  return calls;
}
