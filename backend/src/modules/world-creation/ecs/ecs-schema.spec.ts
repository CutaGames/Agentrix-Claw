import * as fc from 'fast-check';

import {
  serialize,
  deserialize,
  validateEcsWorld,
  isEcsWorld,
} from './ecs-schema';
import { EcsWorld } from '../../../../shared/types/world-creation';

/**
 * Property 1: ECS 序列化往返 (ECS serialization round-trip).
 *
 * `deserialize(serialize(W)) ≡ W` for any well-formed ECS_World W.
 *
 * `serialize` is a *canonicalizing* encoder (it sorts object keys and drops
 * `undefined`-valued keys), so equivalence is checked up to canonical form —
 * which is exactly the semantically-meaningful notion of equality for an
 * ECS_World (key order and absent-vs-undefined are not meaningful). We assert
 * two robust round-trip invariants that together pin this down:
 *
 *   1. Idempotence of the canonical encoding:
 *        serialize(deserialize(serialize(W))) === serialize(W)
 *   2. Structural fixed point: the decoded world deep-equals the canonical
 *      object produced by the encoder:
 *        deserialize(serialize(W)) ≡ JSON.parse(serialize(W))
 *
 * The fast-check arbitrary below generates random *legal* ECS_Worlds that pass
 * structural schema validation, covering different substrate tiers, entity
 * counts, the full component catalog, and optional `rules` / `logicModules` /
 * `defs` / `meta` sections. All generated numbers are finite (ECS-JSON cannot
 * represent NaN/Infinity), so `serialize` never rejects a generated world.
 *
 * **Validates: Requirements 4.6**
 */
describe('Property 1: ECS_World serialization round-trip (Validates: Requirements 4.6)', () => {
  // --- finite-number primitives (ECS-JSON forbids NaN/Infinity) -------------
  const finiteNum = fc.double({ min: -1e6, max: 1e6, noNaN: true });
  const nonNegNum = fc.double({ min: 0, max: 1e6, noNaN: true });
  const vec3 = fc.tuple(finiteNum, finiteNum, finiteNum);

  // --- component arbitraries (design §2.2 Component Catalog) ----------------
  const transformArb = fc.record(
    { pos: vec3, rot: vec3, scale: vec3 },
    { requiredKeys: ['pos'] },
  );

  const meshArb = fc.record(
    { preset: fc.string(), assetRef: fc.string() },
    { requiredKeys: [] },
  );

  const lightArb = fc.record(
    {
      type: fc.constantFrom('point', 'directional', 'spot', 'ambient', 'dramatic'),
      color: fc.string(),
      intensity: nonNegNum,
    },
    { requiredKeys: ['type'] },
  );

  const colliderArb = fc.record(
    {
      shape: fc.constantFrom('box', 'sphere', 'capsule', 'mesh'),
      walkable: fc.boolean(),
    },
    { requiredKeys: ['shape'] },
  );

  const affordanceArb = fc.record({ tags: fc.array(fc.string(), { maxLength: 5 }) });

  const uiArb = fc.record(
    {
      panel: fc.string(),
      text: fc.string(),
      button: fc.string(),
      kvKey: fc.string(),
    },
    { requiredKeys: [] },
  );

  const priceArb = fc.record(
    { axp: finiteNum, usd: finiteNum },
    { requiredKeys: [] },
  );

  const npcArb = fc.record(
    {
      dialogue: fc.array(fc.string(), { maxLength: 4 }),
      behaviorTreeRef: fc.string(),
    },
    { requiredKeys: [] },
  );

  const logicModuleRefArb = fc.record({
    moduleId: fc.string({ minLength: 1, maxLength: 12 }),
    entry: fc.string({ minLength: 1, maxLength: 12 }),
  });

  const componentsArb = fc.record(
    {
      transform: transformArb,
      mesh: meshArb,
      light: lightArb,
      collider: colliderArb,
      affordance: affordanceArb,
      ui: uiArb,
      price: priceArb,
      npc: npcArb,
      logicModuleRef: logicModuleRefArb,
    },
    { requiredKeys: [] },
  );

  // --- entities (unique, non-empty ids) -------------------------------------
  const entitiesArb = fc
    .array(fc.record({ token: fc.string({ maxLength: 6 }), components: componentsArb }), {
      maxLength: 6,
    })
    .map((list) =>
      list.map((e, i) => ({ id: `ent_${i}_${e.token}`, components: e.components })),
    );

  // --- optional Tier_B rules (structural shape only) ------------------------
  const ruleArb = fc.record(
    {
      id: fc.string({ minLength: 1, maxLength: 10 }),
      on: fc.record(
        {
          event: fc.constantFrom('click', 'pickup', 'enter_zone', 'timer', 'match_end'),
          target: fc.string(),
        },
        { requiredKeys: ['event'] },
      ),
      do: fc.array(
        fc.record(
          {
            cap: fc.constantFrom(
              'scene.spawn',
              'state.kv',
              'ui.*',
              'economy.requestCharge',
              'battle.start',
            ),
            args: fc.dictionary(fc.string(), fc.oneof(fc.string(), finiteNum, fc.boolean()), {
              maxKeys: 3,
            }),
          },
          { requiredKeys: ['cap'] },
        ),
        { minLength: 1, maxLength: 3 },
      ),
    },
    { requiredKeys: ['id', 'on', 'do'] },
  );

  // --- optional Tier_C logic modules (structural shape only) ----------------
  const logicModuleArb = fc.record({
    moduleId: fc.string({ minLength: 1, maxLength: 10 }),
    runtime: fc.constantFrom('wasm', 'js'),
    entry: fc.string({ minLength: 1, maxLength: 10 }),
    capabilities: fc.array(fc.string(), { maxLength: 4 }),
    hash: fc.string({ minLength: 1, maxLength: 16 }),
  });

  // --- JSON-safe scalar values for free-form meta/defs ----------------------
  const jsonScalar = fc.oneof(fc.string(), finiteNum, fc.boolean(), fc.constant(null));

  const metaArb = fc.record(
    {
      createdBy: fc.constantFrom('user', 'agent'),
      title: fc.string(),
      extra: fc.dictionary(fc.string(), jsonScalar, { maxKeys: 3 }),
    },
    { requiredKeys: [] },
  );

  // --- the full ECS_World arbitrary -----------------------------------------
  const ecsWorldArb: fc.Arbitrary<EcsWorld> = fc.record(
    {
      ecsVersion: fc.constantFrom('1.0', '1.1', '2.0'),
      plotId: fc.string({ minLength: 1, maxLength: 12 }),
      substrateTier: fc.constantFrom('A', 'B', 'C'),
      entities: entitiesArb,
      rules: fc.array(ruleArb, { maxLength: 3 }),
      logicModules: fc.array(logicModuleArb, { maxLength: 2 }),
      defs: fc.dictionary(fc.string(), jsonScalar, { maxKeys: 3 }),
      meta: metaArb,
    },
    { requiredKeys: ['ecsVersion', 'plotId', 'substrateTier', 'entities'] },
  ) as unknown as fc.Arbitrary<EcsWorld>;

  it('every generated world is structurally valid (generator sanity check)', () => {
    fc.assert(
      fc.property(ecsWorldArb, (world) => {
        expect(validateEcsWorld(world).valid).toBe(true);
        expect(isEcsWorld(world)).toBe(true);
      }),
    );
  });

  it('deserialize(serialize(W)) reproduces an equivalent ECS_World', () => {
    fc.assert(
      fc.property(ecsWorldArb, (world) => {
        const encoded = serialize(world);
        const decoded = deserialize(encoded);

        // (1) canonical encoding is idempotent: serialize ∘ deserialize ∘ serialize = serialize
        expect(serialize(decoded)).toBe(encoded);

        // (2) the decoded world is a structural fixed point of the canonical form
        expect(decoded).toEqual(JSON.parse(encoded));

        // (3) round-trip output is itself a valid ECS_World
        expect(isEcsWorld(decoded)).toBe(true);
      }),
    );
  });
});

// ============================================================
// Targeted example-based round-trip checks (complement the property test)
// ============================================================

describe('serialize/deserialize round-trip — representative examples', () => {
  it('round-trips a minimal Tier_A world with no entities', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_min',
      substrateTier: 'A',
      entities: [],
    };
    expect(deserialize(serialize(world))).toEqual(world);
  });

  it('round-trips a Tier_A world exercising the full component catalog', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_full',
      substrateTier: 'A',
      entities: [
        {
          id: 'shelf_1',
          components: {
            transform: { pos: [2, 0, 1], rot: [0, 0, 0], scale: [1, 1, 1] },
            mesh: { preset: 'shelf_wood' },
            light: { type: 'point', color: '#ffffff', intensity: 1.5 },
            collider: { shape: 'box', walkable: false },
            affordance: { tags: ['container', 'pickable'] },
            ui: { panel: 'leaderboard', kvKey: 'ranks' },
            price: { axp: 3, usd: 0.99 },
          },
        },
      ],
      meta: { createdBy: 'user', title: '便利店' },
    };
    expect(deserialize(serialize(world))).toEqual(world);
  });

  it('produces a canonical (key-sorted) encoding independent of input key order', () => {
    const a: EcsWorld = {
      substrateTier: 'A',
      plotId: 'plot_order',
      ecsVersion: '1.0',
      entities: [{ id: 'e0', components: { mesh: { preset: 'x' } } }],
    } as EcsWorld;
    const b: EcsWorld = {
      ecsVersion: '1.0',
      entities: [{ components: { mesh: { preset: 'x' } }, id: 'e0' }],
      plotId: 'plot_order',
      substrateTier: 'A',
    } as EcsWorld;
    expect(serialize(a)).toBe(serialize(b));
  });

  it('drops undefined-valued keys so they do not survive the round-trip', () => {
    const world = {
      ecsVersion: '1.0',
      plotId: 'plot_undef',
      substrateTier: 'B',
      entities: [{ id: 'e0', components: { transform: undefined, mesh: { preset: 'p' } } }],
      rules: undefined,
    } as unknown as EcsWorld;
    const decoded = deserialize(serialize(world));
    expect(decoded.entities[0].components).toEqual({ mesh: { preset: 'p' } });
    expect('rules' in decoded).toBe(false);
  });
});
