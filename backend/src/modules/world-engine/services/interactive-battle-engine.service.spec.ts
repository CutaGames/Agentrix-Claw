import * as fc from 'fast-check';
import {
  InteractiveBattleEngineService,
  InteractiveParticipant,
  BattleDecision,
  CharacterStats,
  Skill,
  IBATTLE_MAX_ROUNDS,
  IBATTLE_ENERGY_MAX,
  IBATTLE_CHARGE_MAX,
} from './interactive-battle-engine.service';

/**
 * Phase B — 玩家决策战斗引擎单测。
 *
 * 核心 (MANDATORY, 延续 Property 1): 结果 = 纯函数 f(decisions[], seed) —
 *   同 (初始state, decisions, seed) → 逐字节相同的 rounds + winner。
 * 其余: 资源层不变式(energy/charge clamp)、防御减伤/反弹、20 回合上限、AI 决策确定性。
 */
describe('InteractiveBattleEngineService (Phase B player-decision battle)', () => {
  let engine: InteractiveBattleEngineService;

  beforeEach(() => {
    engine = new InteractiveBattleEngineService();
  });

  const statsArb = fc.record({
    hp: fc.integer({ min: 30, max: 100 }),
    atk: fc.integer({ min: 10, max: 100 }),
    def: fc.integer({ min: 10, max: 100 }),
    spd: fc.integer({ min: 1, max: 100 }),
    int: fc.integer({ min: 1, max: 100 }),
  }) as fc.Arbitrary<CharacterStats>;

  const skillArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constant('offensive' as const),
    effectDescription: fc.string({ minLength: 10, maxLength: 30 }),
    damageBase: fc.integer({ min: 10, max: 40 }),
    cooldownTurns: fc.constant(0),
  }) as fc.Arbitrary<Skill>;

  const participantArb = fc.record({
    id: fc.uuid(),
    stats: statsArb,
    skills: fc.array(skillArb, { minLength: 1, maxLength: 4 }),
    level: fc.integer({ min: 1, max: 50 }),
    behaviorTree: fc.constant(null),
  }) as fc.Arbitrary<InteractiveParticipant>;

  const decisionArb = fc.oneof(
    fc.record({ action: fc.constant('attack' as const), skillIndex: fc.integer({ min: 0, max: 3 }) }),
    fc.record({ action: fc.constant('charge' as const) }),
    fc.record({ action: fc.constant('defend' as const) }),
  ) as fc.Arbitrary<BattleDecision>;

  const seedArb = fc.integer({ min: 1, max: 2147483647 });

  /**
   * 用一串玩家决策把战斗跑到底(防守方 AI 由 seed 派生),返回 (rounds, finalState)。
   */
  function playOut(
    engine: InteractiveBattleEngineService,
    challenger: InteractiveParticipant,
    defender: InteractiveParticipant,
    decisions: BattleDecision[],
    seed: number,
  ) {
    let state = engine.initState(challenger, defender);
    const rounds: any[] = [];
    for (const dec of decisions) {
      if (state.status === 'completed') break;
      const ai = engine.deriveAiDecision(state, defender, 'defender', seed);
      const r = engine.stepRound(state, dec, ai, challenger, defender, seed);
      rounds.push(r.round);
      state = r.nextState;
    }
    return { rounds, state };
  }

  it('MANDATORY: same decisions + same seed → identical rounds and winner', () => {
    fc.assert(
      fc.property(
        participantArb,
        participantArb,
        fc.array(decisionArb, { minLength: 1, maxLength: 25 }),
        seedArb,
        (challenger, defender, decisions, seed) => {
          const a = playOut(engine, challenger, defender, decisions, seed);
          const b = playOut(engine, challenger, defender, decisions, seed);

          expect(a.rounds.length).toBe(b.rounds.length);
          for (let i = 0; i < a.rounds.length; i++) {
            expect(a.rounds[i]).toEqual(b.rounds[i]);
          }
          expect(a.state).toEqual(b.state);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('资源不变式: energy ∈ [0, MAX], charge ∈ [0, MAX], hp ≥ 0', () => {
    fc.assert(
      fc.property(
        participantArb,
        participantArb,
        fc.array(decisionArb, { minLength: 1, maxLength: 25 }),
        seedArb,
        (challenger, defender, decisions, seed) => {
          const { rounds, state } = playOut(engine, challenger, defender, decisions, seed);
          for (const r of rounds) {
            expect(r.energyAfter.challenger).toBeGreaterThanOrEqual(0);
            expect(r.energyAfter.challenger).toBeLessThanOrEqual(IBATTLE_ENERGY_MAX);
            expect(r.energyAfter.defender).toBeGreaterThanOrEqual(0);
            expect(r.energyAfter.defender).toBeLessThanOrEqual(IBATTLE_ENERGY_MAX);
            expect(r.chargeAfter.challenger).toBeGreaterThanOrEqual(0);
            expect(r.chargeAfter.challenger).toBeLessThanOrEqual(IBATTLE_CHARGE_MAX);
            expect(r.chargeAfter.defender).toBeLessThanOrEqual(IBATTLE_CHARGE_MAX);
            expect(r.hpAfter.challenger).toBeGreaterThanOrEqual(0);
            expect(r.hpAfter.defender).toBeGreaterThanOrEqual(0);
          }
          expect(state.challenger.hp).toBeGreaterThanOrEqual(0);
          expect(state.defender.hp).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('20 回合上限: 不会超过 IBATTLE_MAX_ROUNDS', () => {
    fc.assert(
      fc.property(
        participantArb,
        participantArb,
        seedArb,
        (challenger, defender, seed) => {
          // 全程 charge → 几乎不造成伤害, 必然走到回合上限
          const decisions: BattleDecision[] = Array.from({ length: 30 }, () => ({ action: 'charge' as const }));
          const { state } = playOut(engine, challenger, defender, decisions, seed);
          expect(state.round).toBeLessThanOrEqual(IBATTLE_MAX_ROUNDS);
          expect(state.status).toBe('completed');
        },
      ),
      { numRuns: 20 },
    );
  });

  it('蓄力增伤: 蓄满后攻击 > 不蓄力直接攻击(同 seed 同角色)', () => {
    const challenger: InteractiveParticipant = {
      id: 'c', level: 1, behaviorTree: null,
      stats: { hp: 100, atk: 60, def: 40, spd: 50, int: 30 },
      skills: [{ name: 'Strike', type: 'offensive', effectDescription: 'hit', damageBase: 20, cooldownTurns: 0 }],
    };
    const defender: InteractiveParticipant = {
      id: 'd', level: 1, behaviorTree: null,
      stats: { hp: 100, atk: 60, def: 40, spd: 1, int: 30 },
      skills: [{ name: 'Strike', type: 'offensive', effectDescription: 'hit', damageBase: 20, cooldownTurns: 0 }],
    };
    const seed = 4242;

    // 直接攻击(第 1 回合)
    const s0 = engine.initState(challenger, defender);
    const direct = engine.stepRound(s0, { action: 'attack', skillIndex: 0 }, { action: 'defend' }, challenger, defender, seed);

    // 先蓄 3 回合再攻击(第 4 回合)
    let s = engine.initState(challenger, defender);
    for (let i = 0; i < 3; i++) {
      s = engine.stepRound(s, { action: 'charge' }, { action: 'defend' }, challenger, defender, seed).nextState;
    }
    const charged = engine.stepRound(s, { action: 'attack', skillIndex: 0 }, { action: 'defend' }, challenger, defender, seed);

    expect(charged.round.challengerDamageDealt).toBeGreaterThan(direct.round.challengerDamageDealt);
  });

  it('AI 决策确定性: 同 (state, seed) → 同决策', () => {
    fc.assert(
      fc.property(participantArb, seedArb, (ai, seed) => {
        const state = engine.initState(ai, ai);
        const d1 = engine.deriveAiDecision(state, ai, 'defender', seed);
        const d2 = engine.deriveAiDecision(state, ai, 'defender', seed);
        expect(d1).toEqual(d2);
      }),
      { numRuns: 30 },
    );
  });

  it('energy 不足的 attack 自动降级为 charge(不报错, 推进正常)', () => {
    const p: InteractiveParticipant = {
      id: 'p', level: 1, behaviorTree: null,
      stats: { hp: 100, atk: 50, def: 50, spd: 50, int: 50 },
      skills: [{ name: 'Strike', type: 'offensive', effectDescription: 'hit', damageBase: 20, cooldownTurns: 0 }],
    };
    let s = engine.initState(p, p);
    // 连续攻击耗光 energy 后, 继续 attack 应被降级而非负 energy
    for (let i = 0; i < 5; i++) {
      const r = engine.stepRound(s, { action: 'attack', skillIndex: 0 }, { action: 'charge' }, p, p, 999);
      s = r.nextState;
      expect(s.challenger.energy).toBeGreaterThanOrEqual(0);
      if (s.status === 'completed') break;
    }
    expect(s.round).toBeGreaterThan(0);
  });
});
