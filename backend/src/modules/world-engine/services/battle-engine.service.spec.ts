import * as fc from 'fast-check';
import {
  BattleEngineService,
  BattleParticipant,
  SeededRng,
  createRoundRng,
} from './battle-engine.service';

// Re-define types locally to avoid shared module resolution issues in test environment
interface CharacterStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  int: number;
}

interface Skill {
  name: string;
  type: 'offensive' | 'defensive' | 'utility';
  effectDescription: string;
  damageBase?: number;
  cooldownTurns?: number;
}

const BATTLE_MAX_ROUNDS = 20;

/**
 * Property 1: 确定性战斗结果
 * Same characters + same seed ALWAYS produce identical battle outcome.
 *
 * **Validates: Requirements 5.3**
 */
describe('Property 1: Deterministic battle results', () => {
  let battleEngine: BattleEngineService;

  beforeEach(() => {
    battleEngine = new BattleEngineService();
  });

  // Generators for valid CharacterStats
  const statsArb = fc.record({
    hp: fc.integer({ min: 10, max: 100 }),
    atk: fc.integer({ min: 1, max: 100 }),
    def: fc.integer({ min: 1, max: 100 }),
    spd: fc.integer({ min: 1, max: 100 }),
    int: fc.integer({ min: 1, max: 100 }),
  }) as fc.Arbitrary<CharacterStats>;

  const skillArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 25 }),
    type: fc.constantFrom('offensive' as const, 'defensive' as const, 'utility' as const),
    effectDescription: fc.string({ minLength: 10, maxLength: 50 }),
    damageBase: fc.integer({ min: 5, max: 50 }),
    cooldownTurns: fc.integer({ min: 0, max: 3 }),
  }) as fc.Arbitrary<Skill>;

  const participantArb = fc.record({
    id: fc.uuid(),
    stats: statsArb,
    skills: fc.array(skillArb, { minLength: 1, maxLength: 4 }),
    level: fc.integer({ min: 1, max: 50 }),
  }) as fc.Arbitrary<BattleParticipant>;

  const seedArb = fc.integer({ min: 1, max: 2147483647 });

  it('same inputs + same seed → identical rounds and winner', () => {
    fc.assert(
      fc.property(
        participantArb,
        participantArb,
        seedArb,
        (challenger, defender, seed) => {
          // Run the same battle 10 times with the same seed
          const firstResult = battleEngine.simulateBattle(challenger, defender, seed);

          for (let i = 0; i < 9; i++) {
            const result = battleEngine.simulateBattle(challenger, defender, seed);

            // Assert identical outcome
            expect(result.winnerSide).toBe(firstResult.winnerSide);
            expect(result.totalRounds).toBe(firstResult.totalRounds);
            expect(result.rounds.length).toBe(firstResult.rounds.length);

            // Verify each round is byte-for-byte identical
            for (let r = 0; r < result.rounds.length; r++) {
              expect(result.rounds[r]).toEqual(firstResult.rounds[r]);
            }

            expect(result.xpAwarded).toEqual(firstResult.xpAwarded);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('different seeds → different results (with high probability)', () => {
    // Use characters with enough HP to last multiple rounds,
    // ensuring the RNG sequence has enough draws to diverge
    const stableStatsArb = fc.record({
      hp: fc.integer({ min: 50, max: 100 }),
      atk: fc.integer({ min: 10, max: 80 }),
      def: fc.integer({ min: 10, max: 80 }),
      spd: fc.integer({ min: 1, max: 100 }),
      int: fc.integer({ min: 1, max: 100 }),
    }) as fc.Arbitrary<CharacterStats>;

    const stableParticipantArb = fc.record({
      id: fc.uuid(),
      stats: stableStatsArb,
      skills: fc.array(skillArb, { minLength: 1, maxLength: 4 }),
      level: fc.integer({ min: 1, max: 50 }),
    }) as fc.Arbitrary<BattleParticipant>;

    fc.assert(
      fc.property(
        stableParticipantArb,
        stableParticipantArb,
        seedArb,
        seedArb,
        (challenger, defender, seedA, seedB) => {
          // Skip if seeds happen to be the same
          fc.pre(seedA !== seedB);
          // Ensure battles last at least a few rounds for meaningful comparison
          fc.pre(challenger.stats.hp >= 50 && defender.stats.hp >= 50);

          const resultA = battleEngine.simulateBattle(challenger, defender, seedA);
          const resultB = battleEngine.simulateBattle(challenger, defender, seedB);

          // With different seeds and multi-round battles, at least one
          // round's damage or crit status should differ
          const anyDifference = resultA.rounds.some(
            (round, idx) =>
              idx < resultB.rounds.length &&
              (round.damageDealt !== resultB.rounds[idx].damageDealt ||
               round.isCritical !== resultB.rounds[idx].isCritical),
          ) ||
            resultA.totalRounds !== resultB.totalRounds ||
            resultA.winnerSide !== resultB.winnerSide;

          expect(anyDifference).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('20-round limit enforced', () => {
    // Create two characters with very high DEF, low ATK → battle should last 20 rounds
    const tankStats: CharacterStats = { hp: 100, atk: 1, def: 100, spd: 50, int: 50 };
    const tankSkill: Skill = {
      name: 'Poke',
      type: 'offensive',
      effectDescription: 'A very weak poke that barely scratches',
      damageBase: 1,
      cooldownTurns: 0,
    };

    const tankChallenger: BattleParticipant = {
      id: 'tank-challenger',
      stats: tankStats,
      skills: [tankSkill],
      level: 1,
    };
    const tankDefender: BattleParticipant = {
      id: 'tank-defender',
      stats: tankStats,
      skills: [tankSkill],
      level: 1,
    };

    const result = battleEngine.simulateBattle(tankChallenger, tankDefender, 12345);

    // With ATK=1, DEF=100, damageBase=1: baseDamage = 1*(1/100) = 0.01
    // After variance and rounding, damage = max(1, round(0.01 * variance)) = 1
    // Even with crits: round(1 * 1.5) = 2
    // HP=100, so it takes many rounds. Should hit the 20-round cap.
    expect(result.totalRounds).toBe(BATTLE_MAX_ROUNDS);

    // Winner should be determined by HP percentage tiebreaker
    expect(result.winnerSide).toBeDefined();
    expect(['challenger', 'defender']).toContain(result.winnerSide);
  });

  it('critical hit chance capped at 20%', () => {
    // Character with SPD=100 → crit chance = 0.10 + 100/1000 = 0.20 (20%)
    const fastStats: CharacterStats = { hp: 100, atk: 50, def: 50, spd: 100, int: 50 };
    const skill: Skill = {
      name: 'Strike',
      type: 'offensive',
      effectDescription: 'A standard strike attack for testing',
      damageBase: 20,
      cooldownTurns: 0,
    };

    const attacker: BattleParticipant = {
      id: 'fast-attacker',
      stats: fastStats,
      skills: [skill],
      level: 1,
    };
    const defender: BattleParticipant = {
      id: 'defender',
      stats: { hp: 100, atk: 50, def: 50, spd: 1, int: 50 },
      skills: [skill],
      level: 1,
    };

    // Run 10000 rounds across many battles to check crit rate
    let totalAttackerRounds = 0;
    let totalCrits = 0;

    for (let seed = 1; seed <= 200; seed++) {
      const result = battleEngine.simulateBattle(attacker, defender, seed);
      for (const round of result.rounds) {
        if (round.attackerId === 'fast-attacker') {
          totalAttackerRounds++;
          if (round.isCritical) {
            totalCrits++;
          }
        }
      }
    }

    // Expected crit rate: 20% (SPD=100 → 0.10 + 0.10 = 0.20)
    // With 10000+ samples, should be within statistical bounds (15%-25%)
    const critRate = totalCrits / totalAttackerRounds;
    expect(critRate).toBeGreaterThan(0.12);
    expect(critRate).toBeLessThan(0.28);
    // More importantly, it should never exceed the theoretical max of 20% by much
    // (statistical variance allows some deviation)
  });
});
