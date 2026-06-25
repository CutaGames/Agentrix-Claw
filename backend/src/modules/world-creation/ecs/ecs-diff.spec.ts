/**
 * Unit + property tests for the ECS_World diff / version / revert model
 * (task 2.6, design §2.3). Validates: Requirements 3.2, 3.5.
 *
 * Coverage:
 *  1. diff / applyPatch round-trip — `applyPatch(a, diff(a, b)) ≡ b`.
 *  2. applyDiffChain — ordered replay of multiple diffs yields the final world.
 *  3. revert semantics — v0→v1→v2 chain replays back to any intermediate version.
 *  4. unaffected-entity preservation — editing one entity leaves the rest intact.
 *
 * A fast-check property reinforces the round-trip invariant across random worlds.
 */

import fc from 'fast-check';
import {
  diff,
  applyPatch,
  applyDiffChain,
  deepClone,
  deepEqual,
} from './ecs-diff';
import type {
  EcsWorld,
  EcsEntity,
  JsonPatchOp,
} from '../../../../shared/types/world-creation';

// ============================================================
// Fixtures
// ============================================================

/** A minimal valid Tier_A world with a couple of declarative entities. */
function baseWorld(): EcsWorld {
  return {
    ecsVersion: '1.0',
    plotId: 'plot_test',
    substrateTier: 'A',
    entities: [
      {
        id: 'floor',
        components: {
          transform: { pos: [0, 0, 0] },
          mesh: { preset: 'floor_tile' },
          collider: { shape: 'box', walkable: true },
        },
      },
      {
        id: 'shelf_1',
        components: {
          transform: { pos: [1, 0, 2] },
          mesh: { preset: 'shelf_wood' },
          price: { axp: 10 },
        },
      },
    ],
    meta: { title: '便利店', createdBy: 'user' },
  };
}

// ============================================================
// 1. diff / applyPatch round-trip
// ============================================================

describe('diff / applyPatch round-trip', () => {
  it('reproduces b from a via diff then applyPatch', () => {
    const a = baseWorld();
    const b = deepClone(a);
    b.entities[1].components.price = { axp: 25 };
    b.entities.push({
      id: 'lamp',
      components: { transform: { pos: [0, 3, 0] }, light: { type: 'point', intensity: 2 } },
    });

    const ops = diff(a, b);
    const result = applyPatch(a, ops);

    expect(deepEqual(result, b)).toBe(true);
  });

  it('does not mutate the input world', () => {
    const a = baseWorld();
    const snapshot = deepClone(a);
    const b = deepClone(a);
    b.entities[0].components.transform = { pos: [5, 0, 5] };

    applyPatch(a, diff(a, b));

    expect(deepEqual(a, snapshot)).toBe(true);
  });

  it('produces an empty op list for identical worlds', () => {
    const a = baseWorld();
    const ops = diff(a, deepClone(a));
    expect(ops).toEqual([]);
  });

  it('handles entity removal', () => {
    const a = baseWorld();
    const b = deepClone(a);
    b.entities.splice(0, 1); // remove "floor"

    const result = applyPatch(a, diff(a, b));
    expect(deepEqual(result, b)).toBe(true);
    expect(result.entities.map((e) => e.id)).toEqual(['shelf_1']);
  });

  it('handles nested scalar replace deep in a component', () => {
    const a = baseWorld();
    const b = deepClone(a);
    b.entities[1].components.transform!.pos = [9, 9, 9];

    const ops = diff(a, b);
    // Only the changed transform should be touched.
    expect(ops.length).toBeGreaterThan(0);
    expect(deepEqual(applyPatch(a, ops), b)).toBe(true);
  });
});

// ============================================================
// 2. applyDiffChain — ordered replay
// ============================================================

describe('applyDiffChain ordered replay', () => {
  it('replays multiple diffs in order to reach the final world', () => {
    const v0 = baseWorld();

    const v1 = deepClone(v0);
    v1.entities[1].components.price = { axp: 30 };

    const v2 = deepClone(v1);
    v2.entities.push({
      id: 'register',
      components: { transform: { pos: [4, 0, 0] }, mesh: { preset: 'register' } },
    });

    const chain = [{ ops: diff(v0, v1) }, { ops: diff(v1, v2) }];
    const result = applyDiffChain(v0, chain);

    expect(deepEqual(result, v2)).toBe(true);
  });

  it('is equivalent to a single diff from base to final', () => {
    const v0 = baseWorld();
    const v1 = deepClone(v0);
    v1.meta = { title: '改名了', createdBy: 'agent' };
    const v2 = deepClone(v1);
    v2.entities[0].components.collider = { shape: 'mesh', walkable: false };

    const chained = applyDiffChain(v0, [{ ops: diff(v0, v1) }, { ops: diff(v1, v2) }]);
    const direct = applyPatch(v0, diff(v0, v2));

    expect(deepEqual(chained, direct)).toBe(true);
    expect(deepEqual(chained, v2)).toBe(true);
  });

  it('returns an equivalent base for an empty chain', () => {
    const v0 = baseWorld();
    const result = applyDiffChain(v0, []);
    expect(deepEqual(result, v0)).toBe(true);
  });
});

// ============================================================
// 3. revert semantics — replay to any intermediate version
// ============================================================

describe('revert to any version', () => {
  // Build a v0 → v1 → v2 lineage with per-step diffs (the ecs_world_diffs chain).
  function lineage(): { versions: EcsWorld[]; diffs: JsonPatchOp[][] } {
    const v0 = baseWorld();

    const v1 = deepClone(v0);
    v1.entities[1].components.price = { axp: 50 };

    const v2 = deepClone(v1);
    v2.entities.push({
      id: 'npc_clerk',
      components: { transform: { pos: [2, 0, 2] } },
    });

    return {
      versions: [v0, v1, v2],
      diffs: [diff(v0, v1), diff(v1, v2)],
    };
  }

  it('reverts to v0 (base snapshot, no diffs replayed)', () => {
    const { versions } = lineage();
    const reverted = applyDiffChain(versions[0], []);
    expect(deepEqual(reverted, versions[0])).toBe(true);
  });

  it('reverts to v1 by replaying only the first diff', () => {
    const { versions, diffs } = lineage();
    const reverted = applyDiffChain(versions[0], [{ ops: diffs[0] }]);
    expect(deepEqual(reverted, versions[1])).toBe(true);
  });

  it('reverts to v2 by replaying the full chain', () => {
    const { versions, diffs } = lineage();
    const reverted = applyDiffChain(versions[0], [{ ops: diffs[0] }, { ops: diffs[1] }]);
    expect(deepEqual(reverted, versions[2])).toBe(true);
  });

  it('reverting from v2 back to v1 via an inverse diff restores prior state', () => {
    const { versions } = lineage();
    const [, v1, v2] = versions;
    const inverse = diff(v2, v1); // diff history allows restoring prior ECS_World (R3.5)
    const restored = applyPatch(v2, inverse);
    expect(deepEqual(restored, v1)).toBe(true);
  });
});

// ============================================================
// 4. unaffected-entity preservation
// ============================================================

describe('unaffected entity preservation', () => {
  it('leaves other entities untouched when one entity changes', () => {
    const a = baseWorld();
    const b = deepClone(a);
    b.entities[1].components.price = { axp: 99 }; // only change shelf_1

    const ops = diff(a, b);
    const result = applyPatch(a, ops);

    // The unaffected "floor" entity must be byte-for-byte identical.
    expect(deepEqual(result.entities[0], a.entities[0])).toBe(true);
    // The changed entity reflects the edit.
    expect(result.entities[1].components.price).toEqual({ axp: 99 });
  });

  it('only emits ops scoped to the changed entity subtree', () => {
    const a = baseWorld();
    const b = deepClone(a);
    b.entities[1].components.price = { axp: 99 };

    const ops = diff(a, b);
    // No op should reference entity index 0 (the floor).
    expect(ops.every((op) => !op.path.startsWith('/entities/0'))).toBe(true);
    // Every op targets entity index 1.
    expect(ops.every((op) => op.path.startsWith('/entities/1'))).toBe(true);
  });

  it('preserves unaffected entities across a multi-step chain', () => {
    const v0 = baseWorld();
    const floorSnapshot = deepClone(v0.entities[0]);

    const v1 = deepClone(v0);
    v1.entities[1].components.transform = { pos: [3, 0, 3] };
    const v2 = deepClone(v1);
    v2.entities.push({ id: 'extra', components: { mesh: { preset: 'plant' } } });

    const result = applyDiffChain(v0, [{ ops: diff(v0, v1) }, { ops: diff(v1, v2) }]);

    expect(deepEqual(result.entities[0], floorSnapshot)).toBe(true);
  });
});

// ============================================================
// 5. Property: diff/apply round-trip across random worlds
//    Reinforces `applyPatch(a, diff(a, b)) ≡ b` (design §2.3 invariant).
// ============================================================

describe('property: diff/apply round-trip', () => {
  // Generator for a small, valid-ish ECS entity with optional components.
  const vec3 = fc.tuple(
    fc.integer({ min: -50, max: 50 }),
    fc.integer({ min: -50, max: 50 }),
    fc.integer({ min: -50, max: 50 }),
  );

  const entityArb: fc.Arbitrary<EcsEntity> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    components: fc.record(
      {
        transform: fc.record({ pos: vec3 }),
        mesh: fc.record({ preset: fc.constantFrom('a', 'b', 'c') }),
        price: fc.record({ axp: fc.integer({ min: 0, max: 1000 }) }),
      },
      { requiredKeys: [] },
    ),
  });

  const worldArb: fc.Arbitrary<EcsWorld> = fc.record({
    ecsVersion: fc.constant('1.0'),
    plotId: fc.constant('plot_prop'),
    substrateTier: fc.constant('A' as const),
    // Unique entity ids keep array-by-index diffing well-defined.
    entities: fc
      .uniqueArray(entityArb, { maxLength: 6, selector: (e) => e.id })
      .filter((es) => es.every((e) => e.id.length > 0)),
  });

  it('applyPatch(a, diff(a, b)) deep-equals b for random worlds', () => {
    fc.assert(
      fc.property(worldArb, worldArb, (a, b) => {
        const result = applyPatch(a, diff(a, b));
        return deepEqual(result, b);
      }),
      { numRuns: 300 },
    );
  });

  it('diff(a, a) is empty for random worlds', () => {
    fc.assert(
      fc.property(worldArb, (a) => {
        return diff(a, deepClone(a)).length === 0;
      }),
      { numRuns: 100 },
    );
  });
});
