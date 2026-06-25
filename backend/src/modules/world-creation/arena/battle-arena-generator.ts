/**
 * Battle_Arena_Generator — Tier_B ECS_World generation for the flagship
 * multiplayer character battle arena (design §11.1, R16.1/R16.2).
 *
 * Battle Arena is the highest launch-priority playable (design §11.1 / §15
 * Phase 1): it reuses the shipped v5 World Engine end-to-end — the deterministic
 * Battle_Engine (`battle.start`), World_Asset characters, and the Agent binding
 * XP model — wrapped in a leaderboard + optional AXP wager loop.
 *
 * This module exports a PURE function {@link generateBattleArena} that an
 * AgentBuilderService prompt flow calls to produce the arena's canonical
 * ECS_World. The result is a strict **Tier_B** world:
 *
 *   - declarative scene-graph layout entities (arena, fighter slot, leaderboard UI),
 *   - enemy/Boss spawn declarations (as `affordance`-tagged + `npc` entities plus
 *     a `defs.spawns` manifest, surfaced at match start via a `scene.spawn` rule),
 *   - Substrate_DSL match-flow rules with NO arbitrary code:
 *       match_start → spawn enemies + `battle.start` (deterministic Battle_Engine),
 *       match_end   → append leaderboard ranks (`state.kv`) + award XP (`rpc.toAgent`),
 *       match_end   → optional AXP wager payout (`economy.requestPayout`).
 *
 * Every rule action maps to a whitelisted {@link WorldApiCapability}; no
 * `logicModules` and no `logicModuleRef` components are emitted, so the world is
 * Tier_B-compliant **by construction** and passes {@link validateTier}.
 *
 * IMPORTANT — fighters are NOT bound at generation time. The set of selectable
 * combatants is resolved per-visitor at entry from the Cross_Experience_Identity
 * read-only asset handles (R16.2). Use {@link buildSelectableFighters} to map a
 * visitor's read-only handles into the selectable-fighter list when they enter.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.1 Battle Arena
 */

import {
  ECS_VERSION,
  EcsEntity,
  EcsWorld,
  SubstrateAction,
  SubstrateRule,
  WorldApiCapability,
} from '../../../../shared/types/world-creation';
import type { ReadonlyAssetHandle } from '../../../../shared/types/world-creation-api';

// ============================================================
// Generation options
// ============================================================

/**
 * Declaration of a single enemy / Boss the arena spawns. Kept declarative —
 * a Boss is just data the match-flow rules reference; no executable logic.
 */
export interface BattleArenaEnemySpec {
  /** Unique enemy id within the arena (e.g., "boss_1"). */
  id: string;
  /** Human-readable display name (e.g., "炎魔王"). */
  displayName?: string;
  /**
   * World_Asset id rendered for this enemy (optional). Display-only reference;
   * never an ownership proof.
   */
  assetRef?: string;
  /** Behavior-tree preset reference for the NPC (e.g., "boss_aggressive"). */
  behaviorTreeRef?: string;
  /** Inline dialogue lines (optional). */
  dialogue?: string[];
  /** Whether this enemy is the climactic Boss (drives layout/affordance tags). */
  isBoss?: boolean;
}

/** Options driving {@link generateBattleArena}. */
export interface BattleArenaGeneratorOptions {
  /** Owning Plot id (becomes {@link EcsWorld.plotId}). */
  plotId: string;
  /** Human-readable arena title (defaults to "竞技场"). */
  title?: string;
  /** Arena mesh preset (defaults to "arena_colosseum"). */
  arenaPreset?: string;
  /**
   * Enemy / Boss roster to spawn. When omitted, a single default AI Boss is
   * generated so the arena is playable out of the box.
   */
  enemies?: BattleArenaEnemySpec[];
  /**
   * Number of player fighter slots to lay out (defaults to 1 — the entering
   * player selects one owned World_Asset as their fighter). Clamped to >= 1.
   */
  fighterSlots?: number;
  /** When true, emit the optional AXP wager-payout match-end rule (R16.5). */
  enableWager?: boolean;
}

// ============================================================
// Selectable fighters (resolved per-visitor at entry — R16.2)
// ============================================================

/**
 * A fighter the entering player may select. Derived purely from the read-only
 * asset handles injected by Cross_Experience_Identity at entry — it carries
 * only display data and the asset id, never an ownership proof.
 */
export interface SelectableFighter {
  /** Asset id of the owned World_Asset character. */
  assetId: string;
  /** Display name. */
  name: string;
  /** Optional display thumbnail. */
  thumbnailUrl?: string;
}

/**
 * Map a visitor's read-only asset handles into the arena's selectable fighters
 * (R16.2). Only `worldAsset`-kind handles are eligible combatants; souls/pets
 * are excluded. Pure function — no I/O, no ownership resolution (that already
 * happened server-side when the handles were produced).
 *
 * Call this at entry time with the handles from
 * `IdentityResolverService.resolveReadonlyHandles`; do NOT bake fighters into
 * the generated ECS_World.
 */
export function buildSelectableFighters(
  handles: ReadonlyAssetHandle[],
): SelectableFighter[] {
  if (!handles || handles.length === 0) {
    return [];
  }
  return handles
    .filter((h) => h.kind === 'worldAsset')
    .map((h) => ({
      assetId: h.assetId,
      name: h.name,
      thumbnailUrl: h.thumbnailUrl,
    }));
}

// ============================================================
// Generator
// ============================================================

const DEFAULT_ARENA_PRESET = 'arena_colosseum';
const DEFAULT_TITLE = '竞技场';

/** The single default AI Boss generated when no roster is supplied. */
function defaultEnemyRoster(): BattleArenaEnemySpec[] {
  return [
    {
      id: 'boss',
      displayName: 'AI Boss',
      behaviorTreeRef: 'boss_aggressive',
      isBoss: true,
    },
  ];
}

/** Build the declarative layout entities (arena shell, fighter slots, UI). */
function buildLayoutEntities(slots: number, arenaPreset: string): EcsEntity[] {
  const entities: EcsEntity[] = [
    {
      id: 'arena',
      components: {
        mesh: { preset: arenaPreset },
        light: { type: 'dramatic' },
        collider: { shape: 'box', walkable: true },
      },
    },
  ];

  for (let i = 0; i < slots; i++) {
    entities.push({
      id: `slot_player_${i + 1}`,
      components: {
        // The entering player binds their selected fighter to this slot at runtime.
        affordance: { tags: ['fighter_slot'] },
      },
    });
  }

  entities.push({
    id: 'leaderboard_ui',
    components: {
      ui: { panel: 'leaderboard', kvKey: 'ranks' },
    },
  });

  return entities;
}

/** Build a declarative enemy/Boss entity (npc + affordance spawn tag). */
function buildEnemyEntity(enemy: BattleArenaEnemySpec): EcsEntity {
  const tags = ['enemy_spawn'];
  if (enemy.isBoss) {
    tags.push('boss');
  }
  return {
    id: enemy.id,
    components: {
      affordance: { tags },
      npc: {
        ...(enemy.dialogue ? { dialogue: enemy.dialogue } : {}),
        ...(enemy.behaviorTreeRef ? { behaviorTreeRef: enemy.behaviorTreeRef } : {}),
      },
      ...(enemy.assetRef ? { mesh: { assetRef: enemy.assetRef } } : {}),
    },
  };
}

/** Build the match-flow Substrate_DSL rules (Tier_B — no arbitrary code). */
function buildMatchFlowRules(
  enemies: BattleArenaEnemySpec[],
  enableWager: boolean,
): SubstrateRule[] {
  const primaryEnemy = enemies[0];

  // match_start → spawn declared enemies/Boss into the arena.
  const spawnActions: SubstrateAction[] = enemies.map((enemy) => ({
    cap: WorldApiCapability.SceneSpawn,
    args: { entityRef: enemy.id },
  }));
  const spawnRule: SubstrateRule = {
    id: 'rule_spawn_enemies',
    on: { event: 'match_start' },
    do: spawnActions,
  };

  // match_start → invoke the deterministic Battle_Engine once a fighter is chosen.
  const matchRule: SubstrateRule = {
    id: 'rule_match_start',
    on: { event: 'match_start' },
    when: [{ kv: 'selectedFighter', op: '!=', value: null }],
    do: [
      {
        cap: WorldApiCapability.BattleStart,
        args: { a: 'selectedFighter', b: primaryEnemy.id, seedRef: 'matchSeed' },
      },
    ],
  };

  // match_end → append leaderboard ranks (state.kv) + award XP via Agent binding.
  const winRule: SubstrateRule = {
    id: 'rule_match_end',
    on: { event: 'match_end' },
    do: [
      {
        cap: WorldApiCapability.StateKv,
        args: { op: 'append', scope: 'plot', key: 'ranks', valueRef: 'matchResult' },
      },
      {
        cap: WorldApiCapability.RpcToAgent,
        args: { msg: 'awardXP', valueRef: 'matchResult' },
      },
    ],
  };

  const rules: SubstrateRule[] = [spawnRule, matchRule, winRule];

  // Optional AXP wager payout — settled server-side by Economy_Bridge (R16.5).
  if (enableWager) {
    rules.push({
      id: 'rule_wager_payout',
      on: { event: 'match_end' },
      when: [{ kv: 'wager.active', op: '==', value: true }],
      do: [
        {
          cap: WorldApiCapability.EconomyRequestPayout,
          args: { target: 'winner', amountRef: 'wager.pot' },
        },
      ],
    });
  }

  return rules;
}

/**
 * Generate the Tier_B ECS_World for a Battle Arena (R16.1).
 *
 * Pure function — deterministic given its options, no I/O and no mutation of
 * inputs. The returned world is Tier_B-compliant by construction (declarative
 * layout + Substrate_DSL match-flow rules whose actions all map to whitelisted
 * World_API capabilities; no `logicModules`/`logicModuleRef`) and therefore
 * passes {@link validateTier}.
 *
 * Fighters are intentionally NOT included — the entering player's owned
 * World_Asset characters are resolved per-visitor via
 * {@link buildSelectableFighters} from Cross_Experience_Identity handles (R16.2).
 *
 * @param opts arena generation options (plot id, roster, layout, wager toggle)
 * @returns a Tier_B {@link EcsWorld} ready for diff/version persistence
 */
export function generateBattleArena(opts: BattleArenaGeneratorOptions): EcsWorld {
  const plotId = opts.plotId;
  const title = opts.title ?? DEFAULT_TITLE;
  const arenaPreset = opts.arenaPreset ?? DEFAULT_ARENA_PRESET;
  const fighterSlots = Math.max(1, Math.floor(opts.fighterSlots ?? 1));
  const enemies =
    opts.enemies && opts.enemies.length > 0 ? opts.enemies : defaultEnemyRoster();
  const enableWager = opts.enableWager === true;

  const entities: EcsEntity[] = [
    ...buildLayoutEntities(fighterSlots, arenaPreset),
    ...enemies.map(buildEnemyEntity),
  ];

  const rules = buildMatchFlowRules(enemies, enableWager);

  return {
    ecsVersion: ECS_VERSION,
    plotId,
    substrateTier: 'B',
    entities,
    rules,
    // Declarative spawn manifest — enemy/Boss spawn declarations (R16.1).
    defs: {
      spawns: enemies.map((enemy) => ({
        id: enemy.id,
        isBoss: enemy.isBoss === true,
        ...(enemy.assetRef ? { assetRef: enemy.assetRef } : {}),
        ...(enemy.behaviorTreeRef ? { behaviorTreeRef: enemy.behaviorTreeRef } : {}),
      })),
      fighterSlots,
      wagerEnabled: enableWager,
    },
    meta: {
      createdBy: 'agent',
      title,
      kind: 'battle_arena',
    },
  };
}
