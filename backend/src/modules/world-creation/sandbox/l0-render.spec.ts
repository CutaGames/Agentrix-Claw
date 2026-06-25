import { mapEcsWorldToRenderDescription } from './l0-render';
import { EcsWorld } from '../../../../shared/types/world-creation';

/**
 * Unit tests for L0 declarative render mapping (design §5.1 L0, R6.1).
 *
 * Verifies the pure ECS_World → RenderDescription mapping: declarative scene
 * data is surfaced for R3F, transform defaults are filled, UI controls are
 * hoisted, and any `rules` / `logicModules` are ignored (L0 executes no logic).
 */
describe('mapEcsWorldToRenderDescription (L0 declarative render)', () => {
  it('maps a Tier_A world exercising the full component catalog', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_gallery',
      substrateTier: 'A',
      entities: [
        {
          id: 'shelf_1',
          components: {
            transform: { pos: [2, 0, 1], rot: [0, 90, 0], scale: [1, 1, 2] },
            mesh: { preset: 'shelf_wood' },
            light: { type: 'point', color: '#ffffff', intensity: 1.5 },
            collider: { shape: 'box', walkable: false },
            affordance: { tags: ['container', 'pickable'] },
            price: { axp: 3 },
          },
        },
      ],
    };

    const desc = mapEcsWorldToRenderDescription(world);

    expect(desc.isolationLevel).toBe('L0');
    expect(desc.plotId).toBe('plot_gallery');
    expect(desc.substrateTier).toBe('A');
    expect(desc.nodes).toHaveLength(1);

    const node = desc.nodes[0];
    expect(node.id).toBe('shelf_1');
    expect(node.transform).toEqual({ pos: [2, 0, 1], rot: [0, 90, 0], scale: [1, 1, 2] });
    expect(node.mesh).toEqual({ preset: 'shelf_wood', assetRef: undefined });
    expect(node.light).toEqual({ type: 'point', color: '#ffffff', intensity: 1.5 });
    expect(node.collider).toEqual({ shape: 'box', walkable: false });
    expect(node.affordanceTags).toEqual(['container', 'pickable']);
    expect(node.priceHint).toEqual({ axp: 3, usd: undefined });
  });

  it('fills transform defaults when transform is omitted', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_default',
      substrateTier: 'A',
      entities: [{ id: 'e0', components: { mesh: { preset: 'cube' } } }],
    };

    const node = mapEcsWorldToRenderDescription(world).nodes[0];
    expect(node.transform).toEqual({ pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] });
  });

  it('hoists UI controls into the ui list keyed by entity id', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_ui',
      substrateTier: 'A',
      entities: [
        {
          id: 'leaderboard',
          components: { ui: { panel: 'leaderboard', kvKey: 'ranks' } },
        },
        { id: 'plain', components: { mesh: { preset: 'cube' } } },
      ],
    };

    const desc = mapEcsWorldToRenderDescription(world);
    expect(desc.ui).toEqual([
      {
        entityId: 'leaderboard',
        panel: 'leaderboard',
        text: undefined,
        button: undefined,
        kvKey: 'ranks',
      },
    ]);
  });

  it('ignores rules and logicModules (L0 executes no logic)', () => {
    const world = {
      ecsVersion: '1.0',
      plotId: 'plot_logic',
      substrateTier: 'A',
      entities: [{ id: 'e0', components: { mesh: { preset: 'cube' } } }],
      rules: [{ id: 'r0', on: { event: 'click' }, do: [{ cap: 'ui.toast' }] }],
      logicModules: [
        { moduleId: 'm0', runtime: 'wasm', entry: 'tick', capabilities: [], hash: 'sha256:x', reviewStatus: 'passed' },
      ],
    } as unknown as EcsWorld;

    const desc = mapEcsWorldToRenderDescription(world);
    // No behavior is attached; only declarative nodes are produced.
    expect(desc.nodes).toHaveLength(1);
    expect((desc as unknown as Record<string, unknown>).rules).toBeUndefined();
    expect((desc as unknown as Record<string, unknown>).logicModules).toBeUndefined();
  });

  it('handles an empty world without entities', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_empty',
      substrateTier: 'A',
      entities: [],
    };
    const desc = mapEcsWorldToRenderDescription(world);
    expect(desc.nodes).toEqual([]);
    expect(desc.ui).toEqual([]);
  });

  it('is pure — does not mutate the input world', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_pure',
      substrateTier: 'A',
      entities: [{ id: 'e0', components: { transform: { pos: [1, 2, 3] } } }],
    };
    const snapshot = JSON.stringify(world);
    mapEcsWorldToRenderDescription(world);
    expect(JSON.stringify(world)).toBe(snapshot);
  });
});
