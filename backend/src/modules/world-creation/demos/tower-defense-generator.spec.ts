/**
 * Unit tests for the Tier_C tower-defense demo generator + WASM intent model
 * (task 22.1, R17.1/R17.2/R17.3).
 *
 * Verifies:
 *   - the generator emits a Tier_C ECS_World that passes validateTier, keeps the
 *     level layout + tower/enemy/wave definitions as declarative data (R17.3),
 *     and references a sandboxed WASM logic module via both `logicModules[]` and a
 *     `logicModuleRef` component on the controller entity (R17.3),
 *   - the WASM `tick` returns-intents model: translateTickIntents maps intents
 *     ONLY to whitelisted `scene.*` / `ui.*` capability calls — never letting the
 *     untrusted module touch the scene directly (R17.2),
 *   - determinism for identical options.
 */

import {
  TD_CONTROLLER_ENTITY_ID,
  TD_CONTINUE_ENTITY_ID,
  generateTowerDefense,
  translateTickIntents,
  towerUpgradeEntityId,
  type TowerDefenseTickOutput,
} from './tower-defense-generator';
import { validateTier } from '../ecs/tier-validator';
import { WorldApiCapability } from '../../../../shared/types/world-creation';

describe('generateTowerDefense (Tier_C tower-defense demo)', () => {
  // ── R17.3: Tier_C, declarative layout/defs + sandboxed WASM module ────────
  describe('Tier_C compliance & structure (R17.3)', () => {
    it('produces a Tier_C ECS_World that passes validateTier', () => {
      const world = generateTowerDefense({ plotId: 'plot_td' });
      expect(world.substrateTier).toBe('C');
      expect(validateTier(world)).toBeNull();
    });

    it('keeps the level layout as declarative ECS data', () => {
      const world = generateTowerDefense({ plotId: 'plot_td' });
      const ids = world.entities.map((e) => e.id);
      expect(ids).toContain('map');
      expect(ids).toContain('spawn');
      expect(ids).toContain('core');

      const map = world.entities.find((e) => e.id === 'map');
      expect(map?.components.affordance?.tags).toContain('buildable_grid');
      const core = world.entities.find((e) => e.id === 'core');
      expect(core?.components.affordance?.tags).toContain('defend');
    });

    it('keeps tower / enemy / wave definitions as declarative defs', () => {
      const world = generateTowerDefense({
        plotId: 'plot_td',
        towers: [{ id: 'cannon', cost: 80, range: 2, dps: 60 }],
        enemies: [{ id: 'orc', hp: 250, speed: 0.9 }],
        waves: [{ t: 0, spawn: [{ enemy: 'orc', count: 5, interval: 1 }] }],
      });
      const defs = world.defs as Record<string, unknown>;
      expect(defs.towers).toEqual([{ id: 'cannon', cost: 80, range: 2, dps: 60 }]);
      expect(defs.enemies).toEqual([{ id: 'orc', hp: 250, speed: 0.9 }]);
      expect(defs.waves).toEqual([
        { t: 0, spawn: [{ enemy: 'orc', count: 5, interval: 1 }] },
      ]);
    });

    it('references a sandboxed WASM logic module via logicModules[] and a logicModuleRef component', () => {
      const world = generateTowerDefense({ plotId: 'plot_td' });

      // Top-level WASM logic module declaration (capabilities subset + hash).
      expect(world.logicModules).toHaveLength(1);
      const mod = world.logicModules![0];
      expect(mod.runtime).toBe('wasm');
      expect(mod.entry).toBe('tick');
      expect(mod.moduleId).toBe('td_core');
      expect(mod.capabilities).toContain(WorldApiCapability.ComputeRun);
      // Deny-by-default: only declared caps — raw fs/net/process never present.
      expect(mod.capabilities).not.toContain(WorldApiCapability.NetFetch);

      // A controller entity carries the Tier_C logicModuleRef pointing at it.
      const controller = world.entities.find((e) => e.id === TD_CONTROLLER_ENTITY_ID);
      expect(controller?.components.logicModuleRef?.moduleId).toBe('td_core');
      expect(controller?.components.logicModuleRef?.entry).toBe('tick');
    });

    it('defaults the WASM module to a pending review status until the C-tier scan passes', () => {
      const pending = generateTowerDefense({ plotId: 'plot_td' });
      expect(pending.logicModules![0].reviewStatus).toBe('pending');
      expect(pending.logicModules![0].hash).toBe('sha256:pending');

      const reviewed = generateTowerDefense({
        plotId: 'plot_td',
        logicModuleHash: 'sha256:abc123',
      });
      expect(reviewed.logicModules![0].reviewStatus).toBe('passed');
      expect(reviewed.logicModules![0].hash).toBe('sha256:abc123');
    });

    it('emits only whitelisted capabilities in its bootstrap rules', () => {
      const world = generateTowerDefense({ plotId: 'plot_td' });
      // validateTier already enforces this for Tier_C rules, but assert explicitly.
      for (const rule of world.rules ?? []) {
        for (const action of rule.do) {
          expect(Object.values(WorldApiCapability)).toContain(action.cap);
        }
      }
    });

    it('emits priceable economy entities for tower upgrades and continue (R17.4)', () => {
      const world = generateTowerDefense({
        plotId: 'plot_td',
        towers: [{ id: 'arrow', cost: 50, range: 3, dps: 20, upgradeCost: 75 }],
        continueCost: 120,
      });
      // The upgrade entity carries the authoritative AXP price as declarative data.
      const upgrade = world.entities.find((e) => e.id === towerUpgradeEntityId('arrow'));
      expect(upgrade?.components.price?.axp).toBe(75);
      // Continue entity priced via continueCost option.
      const cont = world.entities.find((e) => e.id === TD_CONTINUE_ENTITY_ID);
      expect(cont?.components.price?.axp).toBe(120);
      // The WASM module is authorized to request (not compute) economy charges.
      expect(world.logicModules![0].capabilities).toContain(
        WorldApiCapability.EconomyRequestCharge,
      );
      // Tier_C world with declarative price components still validates.
      expect(validateTier(world)).toBeNull();
    });

    it('defaults a tower upgrade price to its build cost when upgradeCost is omitted', () => {
      const world = generateTowerDefense({
        plotId: 'plot_td',
        towers: [{ id: 'cannon', cost: 80, range: 2, dps: 60 }],
      });
      const upgrade = world.entities.find((e) => e.id === towerUpgradeEntityId('cannon'));
      expect(upgrade?.components.price?.axp).toBe(80);
    });
  });

  // ── R17.2: WASM returns intents; host applies via scene.*/ui.* only ───────
  describe('WASM tick intent translation — host-controlled application (R17.2)', () => {
    const output: TowerDefenseTickOutput = {
      spawns: [{ entityId: 'enemy_1', defId: 'goblin', pos: [0, 0, 0] }],
      transforms: [{ entityId: 'enemy_1', pos: [1, 0, 0] }],
      hits: [
        { targetId: 'enemy_1', damage: 20, killed: false },
        { targetId: 'enemy_2', damage: 100, killed: true },
      ],
      coreHpDelta: -1,
      waveCleared: true,
      ui: [{ toast: 'Boss 来袭' }, { hud: { score: 1200 } }],
    };

    it('translates spawn intents to scene.spawn calls', () => {
      const calls = translateTickIntents(output);
      const spawn = calls.find(
        (c) => c.cap === WorldApiCapability.SceneSpawn,
      );
      expect(spawn?.args).toMatchObject({ entityId: 'enemy_1', defId: 'goblin' });
    });

    it('translates transform intents to scene.transform calls', () => {
      const calls = translateTickIntents(output);
      const move = calls.find((c) => c.cap === WorldApiCapability.SceneTransform);
      expect(move?.args).toMatchObject({ id: 'enemy_1', pos: [1, 0, 0] });
    });

    it('translates a killed hit to a scene.setMaterial call', () => {
      const calls = translateTickIntents(output);
      const mat = calls.find((c) => c.cap === WorldApiCapability.SceneSetMaterial);
      expect(mat?.args).toMatchObject({ id: 'enemy_2', material: 'defeated' });
    });

    it('only ever emits scene.* / ui.* capabilities (never economy / compute / net directly)', () => {
      const calls = translateTickIntents(output);
      const allowed = new Set<WorldApiCapability>([
        WorldApiCapability.SceneSpawn,
        WorldApiCapability.SceneTransform,
        WorldApiCapability.SceneSetMaterial,
        WorldApiCapability.Ui,
      ]);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(allowed.has(call.cap)).toBe(true);
      }
      // The untrusted module never reaches economy/compute/net via translation.
      const caps = calls.map((c) => c.cap);
      expect(caps).not.toContain(WorldApiCapability.EconomyRequestCharge);
      expect(caps).not.toContain(WorldApiCapability.ComputeRun);
      expect(caps).not.toContain(WorldApiCapability.NetFetch);
    });

    it('surfaces a wave-cleared toast and tolerates empty intents', () => {
      const calls = translateTickIntents(output);
      expect(
        calls.some(
          (c) => c.cap === WorldApiCapability.Ui && (c.args as any).toast === '波次清除',
        ),
      ).toBe(true);

      const empty = translateTickIntents({
        spawns: [],
        transforms: [],
        hits: [],
        coreHpDelta: 0,
        waveCleared: false,
      });
      expect(empty).toEqual([]);
    });
  });

  // ── Determinism ──────────────────────────────────────────────────────────
  it('is deterministic for identical options', () => {
    const opts = {
      plotId: 'plot_td',
      title: '我的塔防',
      towers: [{ id: 'arrow', cost: 50, range: 3, dps: 20, heroAssetSlot: true }],
      enemies: [{ id: 'goblin', hp: 100, speed: 1.2 }],
      waves: [{ t: 0, spawn: [{ enemy: 'goblin', count: 10, interval: 0.5 }] }],
    };
    const a = generateTowerDefense(opts);
    const b = generateTowerDefense(opts);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
