import {
  BattleArenaEnemySpec,
  buildSelectableFighters,
  generateBattleArena,
} from './battle-arena-generator';
import { validateTier } from '../ecs/tier-validator';
import { WorldApiCapability } from '../../../../shared/types/world-creation';
import type { ReadonlyAssetHandle } from '../../../../shared/types/world-creation-api';

describe('generateBattleArena', () => {
  it('produces a Tier_B-compliant ECS_World (passes validateTier)', () => {
    const world = generateBattleArena({ plotId: 'plot_1' });
    expect(world.substrateTier).toBe('B');
    expect(validateTier(world)).toBeNull();
  });

  it('emits no Tier_C logic modules or logicModuleRef components (no arbitrary code)', () => {
    const world = generateBattleArena({ plotId: 'plot_1', enableWager: true });
    expect(world.logicModules ?? []).toHaveLength(0);
    for (const entity of world.entities) {
      expect(entity.components.logicModuleRef).toBeUndefined();
    }
  });

  it('includes arena layout, fighter slots, and leaderboard UI entities', () => {
    const world = generateBattleArena({ plotId: 'plot_1', fighterSlots: 2 });
    const ids = world.entities.map((e) => e.id);
    expect(ids).toContain('arena');
    expect(ids).toContain('slot_player_1');
    expect(ids).toContain('slot_player_2');
    expect(ids).toContain('leaderboard_ui');

    const slots = world.entities.filter((e) =>
      e.components.affordance?.tags.includes('fighter_slot'),
    );
    expect(slots).toHaveLength(2);

    const ui = world.entities.find((e) => e.id === 'leaderboard_ui');
    expect(ui?.components.ui?.panel).toBe('leaderboard');
    expect(ui?.components.ui?.kvKey).toBe('ranks');
  });

  it('declares enemy/Boss spawns as affordance-tagged entities and in defs.spawns', () => {
    const enemies: BattleArenaEnemySpec[] = [
      { id: 'boss_1', displayName: 'Flame King', assetRef: 'world_asset_42', isBoss: true },
      { id: 'minion_1' },
    ];
    const world = generateBattleArena({ plotId: 'plot_1', enemies });

    const boss = world.entities.find((e) => e.id === 'boss_1');
    expect(boss?.components.affordance?.tags).toEqual(
      expect.arrayContaining(['enemy_spawn', 'boss']),
    );
    expect(boss?.components.mesh?.assetRef).toBe('world_asset_42');

    const spawns = (world.defs?.spawns ?? []) as Array<{ id: string; isBoss: boolean }>;
    expect(spawns.map((s) => s.id)).toEqual(['boss_1', 'minion_1']);
    expect(spawns.find((s) => s.id === 'boss_1')?.isBoss).toBe(true);
  });

  it('generates a default AI Boss when no roster is supplied', () => {
    const world = generateBattleArena({ plotId: 'plot_1' });
    const spawns = (world.defs?.spawns ?? []) as Array<{ id: string }>;
    expect(spawns).toHaveLength(1);
    expect(world.entities.some((e) => e.components.affordance?.tags.includes('boss'))).toBe(true);
  });

  it('emits match-flow rules: match_start spawn + battle.start, match_end ranks + XP', () => {
    const world = generateBattleArena({ plotId: 'plot_1' });
    const rules = world.rules ?? [];

    const spawnRule = rules.find((r) => r.on.event === 'match_start' && r.id === 'rule_spawn_enemies');
    expect(spawnRule?.do.every((a) => a.cap === WorldApiCapability.SceneSpawn)).toBe(true);

    const matchRule = rules.find((r) => r.id === 'rule_match_start');
    expect(matchRule?.do[0].cap).toBe(WorldApiCapability.BattleStart);
    // fighter is NOT hard-bound at generation — selected via guarded state.kv ref.
    expect(matchRule?.when?.[0].kv).toBe('selectedFighter');

    const endRule = rules.find((r) => r.id === 'rule_match_end');
    const caps = endRule?.do.map((a) => a.cap) ?? [];
    expect(caps).toContain(WorldApiCapability.StateKv);
    expect(caps).toContain(WorldApiCapability.RpcToAgent);
  });

  it('omits the wager payout rule unless wagering is enabled, then it is Trust-gated server-side', () => {
    const noWager = generateBattleArena({ plotId: 'plot_1' });
    expect((noWager.rules ?? []).some((r) => r.id === 'rule_wager_payout')).toBe(false);

    const wager = generateBattleArena({ plotId: 'plot_1', enableWager: true });
    const payout = (wager.rules ?? []).find((r) => r.id === 'rule_wager_payout');
    expect(payout?.do[0].cap).toBe(WorldApiCapability.EconomyRequestPayout);
    // still Tier_B-compliant with the wager rule present.
    expect(validateTier(wager)).toBeNull();
  });

  it('is deterministic for identical options', () => {
    const a = generateBattleArena({ plotId: 'plot_1', enableWager: true });
    const b = generateBattleArena({ plotId: 'plot_1', enableWager: true });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('buildSelectableFighters', () => {
  it('exposes only owned World_Asset characters as selectable fighters (R16.2)', () => {
    const handles: ReadonlyAssetHandle[] = [
      { assetId: 'wa_1', kind: 'worldAsset', name: 'Knight', thumbnailUrl: 'http://x/1.png' },
      { assetId: 'pet_1', kind: 'pet', name: 'Soul Pet' },
      { assetId: 'wa_2', kind: 'worldAsset', name: 'Mage' },
    ];
    const fighters = buildSelectableFighters(handles);
    expect(fighters.map((f) => f.assetId)).toEqual(['wa_1', 'wa_2']);
    expect(fighters[0]).toEqual({ assetId: 'wa_1', name: 'Knight', thumbnailUrl: 'http://x/1.png' });
  });

  it('returns an empty list when the visitor owns no World_Assets', () => {
    expect(buildSelectableFighters([])).toEqual([]);
    expect(buildSelectableFighters([{ assetId: 'p', kind: 'pet', name: 'Pet' }])).toEqual([]);
  });

  it('carries no ownership proof — only display data and asset id', () => {
    const fighters = buildSelectableFighters([
      { assetId: 'wa_1', kind: 'worldAsset', name: 'Knight' },
    ]);
    expect(Object.keys(fighters[0]).sort()).toEqual(['assetId', 'name', 'thumbnailUrl']);
  });
});
