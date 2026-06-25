/**
 * Property 6: Battle_Engine 确定性 (deterministic combat) — fast-check.
 *
 * 不可协商正确性不变量 (design §11.1, Correctness Property 6)：
 *   相同 seed + 相同输入 ⇒ 相同结果事件流，可重放。
 *
 * `battle.start` 必须用已落地的 v5 确定性 Battle_Engine (Mulberry32 PRNG, 20 回合
 * 上限) 演算战斗，绝不在本平台重写战斗逻辑 (R5.4)。本测试用**真实 v5**
 * {@link BattleEngineService} 经 {@link BattleBridge} 驱动，对任意随机合法 fighter
 * (各 ≥1 技能、有限 stats) 与任意整数 seed 断言两条性质：
 *
 *   1. **可重放 (determinism)**: 同 seed + 同输入两次调用 `bridge.start` 返回
 *      deep-equal 的完整事件流 (rounds / winnerSide / totalRounds / xpAwarded)。
 *   2. **复用,不重造 (no rewrite)**: 桥返回的事件流与直接调用
 *      `engine.simulateBattle(a, b, seed)` 完全一致 —— 桥只转发,不改算。
 *
 * **Validates: Requirements 16.3**
 */

import * as fc from 'fast-check';

import { BattleBridge, type BattleStartArgs } from './battle-bridge';
import { WorldApiCapability } from '../../../../shared/types/world-creation';
import {
  BattleEngineService,
  type BattleParticipant,
  type Skill,
} from '../../world-engine/services/battle-engine.service';

// ============================================================
// Generators — random legal fighters with finite stats + ≥1 skill
// ============================================================

const GRANTED = [WorldApiCapability.BattleStart];

/** A single skill with finite, well-formed fields. */
const arbSkill: fc.Arbitrary<Skill> = fc.record(
  {
    name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,15}$/),
    type: fc.constantFrom('offensive', 'defensive', 'utility') as fc.Arbitrary<
      Skill['type']
    >,
    effectDescription: fc.string({ maxLength: 24 }),
    // Optional — exercise both "present" and "absent" (engine defaults to 10).
    damageBase: fc.option(fc.integer({ min: 1, max: 80 }), { nil: undefined }),
    cooldownTurns: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
  },
  { requiredKeys: ['name', 'type', 'effectDescription'] },
);

/**
 * A legal fighter: finite positive stats (def ≥ 1 so the atk/def ratio stays
 * finite) and at least one skill (the determinism precondition the bridge
 * enforces — empty skills would make skill selection undefined).
 */
const arbFighter = (id: string): fc.Arbitrary<BattleParticipant> =>
  fc.record({
    id: fc.constant(id),
    level: fc.integer({ min: 1, max: 60 }),
    stats: fc.record({
      hp: fc.integer({ min: 1, max: 500 }),
      atk: fc.integer({ min: 1, max: 250 }),
      def: fc.integer({ min: 1, max: 250 }),
      spd: fc.integer({ min: 0, max: 100 }),
      int: fc.integer({ min: 0, max: 100 }),
    }),
    skills: fc.array(arbSkill, { minLength: 1, maxLength: 4 }),
  });

/** Arbitrary battle.start args: two random fighters + any integer seed. */
const arbArgs: fc.Arbitrary<BattleStartArgs> = fc.record({
  fighterA: arbFighter('challenger'),
  fighterB: arbFighter('defender'),
  // Any integer seed — the engine maps it to a 32-bit state (seed | 0).
  seed: fc.integer(),
});

// ============================================================
// Property 6 — deterministic, replayable event stream
// ============================================================

describe('Property 6: Battle_Engine 确定性 — battle.start via v5 BattleEngineService', () => {
  it('same seed + inputs ⇒ identical replayable event stream, matching the v5 engine directly', () => {
    fc.assert(
      fc.property(arbArgs, (args) => {
        // Fresh engine + bridge per case: determinism must be a property of the
        // (inputs, seed), not of any accumulated engine state.
        const engine = new BattleEngineService();
        const bridge = new BattleBridge(engine);

        const r1 = bridge.start(args, GRANTED, 'pbt-sess');
        const r2 = bridge.start(args, GRANTED, 'pbt-sess');

        // Both invocations must be authorized + valid (legal fighters + int seed).
        expect('ok' in r1 && r1.ok).toBe(true);
        expect('ok' in r2 && r2.ok).toBe(true);
        if (!('ok' in r1 && r1.ok) || !('ok' in r2 && r2.ok)) return;

        // (1) Replayability: identical full event stream for the same seed+inputs.
        expect(r2.result).toEqual(r1.result);

        // A real battle always produces at least one round of events.
        expect(r1.result.rounds.length).toBeGreaterThan(0);
        expect(r1.result.totalRounds).toBe(r1.result.rounds.length);

        // (2) No rewrite: the bridge returns exactly what the v5 engine computed.
        const direct = engine.simulateBattle(args.fighterA, args.fighterB, args.seed);
        expect(r1.result).toEqual(direct);
      }),
      { numRuns: 500 },
    );
  });
});
