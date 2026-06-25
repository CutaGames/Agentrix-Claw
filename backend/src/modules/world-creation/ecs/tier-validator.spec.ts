/**
 * Property 7: Tier 约束 (Substrate_Tier schema constraints) — task 2.4, design §3.1.
 *
 * The authoring ceiling of a Plot's ECS_World is fixed by its declared
 * Substrate_Tier. {@link validateTier} enforces this structurally:
 *
 *   - Tier_A — declarative scene-graph only. Any `rules`, `logicModules`, or
 *              a `logicModuleRef` component → rejected.
 *   - Tier_B — declarative + Substrate_DSL `rules`, but NO `logicModules` and
 *              NO `logicModuleRef`; every rule action `cap` must resolve to a
 *              whitelisted World_API capability (deny-by-default).
 *   - Tier_C — declarative + DSL + sandboxed `logicModules` all permitted;
 *              rule action caps still must be whitelisted.
 *
 * The property under test: legal worlds for each tier validate (return `null`),
 * and out-of-bounds worlds (Tier_A carrying rules/modules, Tier_B carrying
 * modules, Tier_B rule action using a non-whitelisted capability) are rejected
 * with a structured `{ error: 'TIER_VIOLATION', detail }`.
 *
 * **Validates: Requirements 4.2, 4.3, 4.7**
 */

import * as fc from 'fast-check';

import { validateTier } from './tier-validator';
import {
  EcsEntity,
  EcsWorld,
  LogicModuleRef,
  SubstrateRule,
  WorldApiCapability,
} from '../../../../shared/types/world-creation';

// ============================================================
// Capability whitelist (single source of truth = the enum)
// ============================================================

const WHITELISTED_CAPS: WorldApiCapability[] = Object.values(WorldApiCapability);
const WHITELISTED_CAP_SET = new Set<string>(WHITELISTED_CAPS as unknown as string[]);

// ============================================================
// Building blocks
// ============================================================

/** A whitelisted capability value. */
const whitelistedCapArb = fc.constantFrom(...WHITELISTED_CAPS);

/** A capability string guaranteed NOT to be in the whitelist. */
const nonWhitelistedCapArb = fc
  .oneof(
    fc.constantFrom(
      'fs.read',
      'fs.write',
      'process.spawn',
      'net.raw',
      'eval.run',
      'scene.delete',
      'economy.mint',
      'state.kvv',
    ),
    fc.string({ minLength: 1, maxLength: 16 }),
  )
  .filter((s) => !WHITELISTED_CAP_SET.has(s));

/** Declarative component bag with NO logicModuleRef (Tier_A/B safe). */
const declarativeComponentsArb = fc.record(
  {
    transform: fc.record({
      pos: fc.tuple(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
      ),
    }),
    mesh: fc.record({ preset: fc.constantFrom('shelf_wood', 'floor_tile', 'register') }),
    affordance: fc.record({ tags: fc.array(fc.string({ maxLength: 6 }), { maxLength: 3 }) }),
  },
  { requiredKeys: [] },
);

/** An entity with only declarative components (never a logicModuleRef). */
const declarativeEntityArb: fc.Arbitrary<EcsEntity> = fc
  .record({ token: fc.string({ maxLength: 6 }), components: declarativeComponentsArb })
  .map((e) => ({ id: `ent_${e.token}`, components: e.components }));

const declarativeEntitiesArb = fc
  .array(declarativeEntityArb, { maxLength: 5 })
  .map((list) => list.map((e, i) => ({ id: `ent_${i}_${e.id}`, components: e.components })));

/** An entity carrying a Tier_C logicModuleRef component (illegal for A/B). */
const logicRefEntityArb: fc.Arbitrary<EcsEntity> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `lref_${s}`),
  components: fc.record({
    logicModuleRef: fc.record({
      moduleId: fc.string({ minLength: 1, maxLength: 8 }),
      entry: fc.constantFrom('tick', 'update', 'main'),
    }),
  }),
});

/** A Substrate_DSL rule whose every action maps to a whitelisted capability. */
const validRuleArb: fc.Arbitrary<SubstrateRule> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `rule_${s}`),
  on: fc.record(
    {
      event: fc.constantFrom('click', 'pickup', 'enter_zone', 'timer', 'match_end'),
      target: fc.string({ maxLength: 8 }),
    },
    { requiredKeys: ['event'] },
  ),
  do: fc.array(
    fc.record({
      cap: whitelistedCapArb,
      args: fc.dictionary(fc.string({ maxLength: 4 }), fc.string({ maxLength: 6 }), {
        maxKeys: 2,
      }),
    }),
    { minLength: 1, maxLength: 3 },
  ),
}) as unknown as fc.Arbitrary<SubstrateRule>;

/** A Tier_C logic module declaration. */
const logicModuleArb: fc.Arbitrary<LogicModuleRef> = fc.record({
  moduleId: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `mod_${s}`),
  runtime: fc.constantFrom('wasm', 'js'),
  entry: fc.constantFrom('tick', 'update'),
  capabilities: fc.array(whitelistedCapArb, { maxLength: 3 }),
  hash: fc.hexaString({ minLength: 8, maxLength: 16 }).map((h) => `sha256:${h}`),
  reviewStatus: fc.constantFrom('pending', 'scanning', 'passed', 'rejected'),
}) as unknown as fc.Arbitrary<LogicModuleRef>;

const plotIdArb = fc.string({ minLength: 1, maxLength: 12 }).map((s) => `plot_${s}`);
const ecsVersionArb = fc.constantFrom('1.0', '1.1', '2.0');

// ============================================================
// Property A: legal worlds for each tier validate (return null)
// ============================================================

describe('Property 7: Tier 约束 — legal worlds validate (Validates: Requirements 4.2, 4.3, 4.7)', () => {
  it('Tier_A: declarative-only worlds (no rules/modules/logicRef) return null', () => {
    const tierAArb: fc.Arbitrary<EcsWorld> = fc.record({
      ecsVersion: ecsVersionArb,
      plotId: plotIdArb,
      substrateTier: fc.constant('A' as const),
      entities: declarativeEntitiesArb,
    });

    fc.assert(
      fc.property(tierAArb, (world) => {
        expect(validateTier(world)).toBeNull();
      }),
    );
  });

  it('Tier_B: declarative + whitelisted-cap rules, no modules → return null', () => {
    const tierBArb: fc.Arbitrary<EcsWorld> = fc.record(
      {
        ecsVersion: ecsVersionArb,
        plotId: plotIdArb,
        substrateTier: fc.constant('B' as const),
        entities: declarativeEntitiesArb,
        rules: fc.array(validRuleArb, { maxLength: 4 }),
      },
      { requiredKeys: ['ecsVersion', 'plotId', 'substrateTier', 'entities'] },
    );

    fc.assert(
      fc.property(tierBArb, (world) => {
        expect(validateTier(world)).toBeNull();
      }),
    );
  });

  it('Tier_C: declarative + whitelisted-cap rules + logic modules → return null', () => {
    const tierCArb: fc.Arbitrary<EcsWorld> = fc.record(
      {
        ecsVersion: ecsVersionArb,
        plotId: plotIdArb,
        substrateTier: fc.constant('C' as const),
        entities: fc
          .array(fc.oneof(declarativeEntityArb, logicRefEntityArb), { maxLength: 5 })
          .map((list) => list.map((e, i) => ({ id: `ent_${i}`, components: e.components }))),
        rules: fc.array(validRuleArb, { maxLength: 3 }),
        logicModules: fc.array(logicModuleArb, { maxLength: 2 }),
      },
      { requiredKeys: ['ecsVersion', 'plotId', 'substrateTier', 'entities'] },
    );

    fc.assert(
      fc.property(tierCArb, (world) => {
        expect(validateTier(world)).toBeNull();
      }),
    );
  });
});

// ============================================================
// Property B: out-of-bounds worlds are rejected with TIER_VIOLATION
// ============================================================

describe('Property 7: Tier 约束 — out-of-bounds worlds rejected (Validates: Requirements 4.2, 4.3, 4.7)', () => {
  it('Tier_A carrying rules is rejected', () => {
    const arb: fc.Arbitrary<EcsWorld> = fc.record({
      ecsVersion: ecsVersionArb,
      plotId: plotIdArb,
      substrateTier: fc.constant('A' as const),
      entities: declarativeEntitiesArb,
      rules: fc.array(validRuleArb, { minLength: 1, maxLength: 3 }),
    });

    fc.assert(
      fc.property(arb, (world) => {
        const err = validateTier(world);
        expect(err).not.toBeNull();
        expect(err!.error).toBe('TIER_VIOLATION');
      }),
    );
  });

  it('Tier_A carrying logicModules is rejected', () => {
    const arb: fc.Arbitrary<EcsWorld> = fc.record({
      ecsVersion: ecsVersionArb,
      plotId: plotIdArb,
      substrateTier: fc.constant('A' as const),
      entities: declarativeEntitiesArb,
      logicModules: fc.array(logicModuleArb, { minLength: 1, maxLength: 3 }),
    });

    fc.assert(
      fc.property(arb, (world) => {
        const err = validateTier(world);
        expect(err).not.toBeNull();
        expect(err!.error).toBe('TIER_VIOLATION');
      }),
    );
  });

  it('Tier_A carrying a logicModuleRef component is rejected', () => {
    const arb: fc.Arbitrary<EcsWorld> = fc.record({
      ecsVersion: ecsVersionArb,
      plotId: plotIdArb,
      substrateTier: fc.constant('A' as const),
      entities: fc
        .tuple(declarativeEntitiesArb, logicRefEntityArb)
        .map(([decls, lref]) => [...decls, lref]),
    });

    fc.assert(
      fc.property(arb, (world) => {
        const err = validateTier(world);
        expect(err).not.toBeNull();
        expect(err!.error).toBe('TIER_VIOLATION');
      }),
    );
  });

  it('Tier_B carrying logicModules is rejected', () => {
    const arb: fc.Arbitrary<EcsWorld> = fc.record(
      {
        ecsVersion: ecsVersionArb,
        plotId: plotIdArb,
        substrateTier: fc.constant('B' as const),
        entities: declarativeEntitiesArb,
        rules: fc.array(validRuleArb, { maxLength: 2 }),
        logicModules: fc.array(logicModuleArb, { minLength: 1, maxLength: 3 }),
      },
      { requiredKeys: ['ecsVersion', 'plotId', 'substrateTier', 'entities', 'logicModules'] },
    );

    fc.assert(
      fc.property(arb, (world) => {
        const err = validateTier(world);
        expect(err).not.toBeNull();
        expect(err!.error).toBe('TIER_VIOLATION');
      }),
    );
  });

  it('Tier_B carrying a logicModuleRef component is rejected', () => {
    const arb: fc.Arbitrary<EcsWorld> = fc.record({
      ecsVersion: ecsVersionArb,
      plotId: plotIdArb,
      substrateTier: fc.constant('B' as const),
      entities: fc
        .tuple(declarativeEntitiesArb, logicRefEntityArb)
        .map(([decls, lref]) => [...decls, lref]),
    });

    fc.assert(
      fc.property(arb, (world) => {
        const err = validateTier(world);
        expect(err).not.toBeNull();
        expect(err!.error).toBe('TIER_VIOLATION');
      }),
    );
  });

  it('Tier_B rule action using a non-whitelisted capability is rejected', () => {
    // A rule with at least one action whose cap is NOT in the whitelist.
    const badRuleArb: fc.Arbitrary<SubstrateRule> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `rule_${s}`),
      on: fc.record({ event: fc.constantFrom('click', 'timer', 'match_end') }),
      do: fc
        .tuple(
          fc.array(
            fc.record({ cap: whitelistedCapArb, args: fc.constant({}) }),
            { maxLength: 2 },
          ),
          fc.record({ cap: nonWhitelistedCapArb, args: fc.constant({}) }),
        )
        .map(([good, bad]) => [...good, bad]),
    }) as unknown as fc.Arbitrary<SubstrateRule>;

    const arb: fc.Arbitrary<EcsWorld> = fc.record({
      ecsVersion: ecsVersionArb,
      plotId: plotIdArb,
      substrateTier: fc.constant('B' as const),
      entities: declarativeEntitiesArb,
      rules: fc.array(badRuleArb, { minLength: 1, maxLength: 3 }),
    });

    fc.assert(
      fc.property(arb, (world) => {
        const err = validateTier(world);
        expect(err).not.toBeNull();
        expect(err!.error).toBe('TIER_VIOLATION');
      }),
    );
  });
});
