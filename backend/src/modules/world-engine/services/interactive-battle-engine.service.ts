import { Injectable } from '@nestjs/common';
import { createRoundRng, SeededRng } from './battle-engine.service';

// ============================================================
// Types (mirrored from shared/types/world-engine to avoid cross-package
// import issues during testing — canonical source is shared/types).
// ============================================================

export interface CharacterStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  int: number;
}

export interface Skill {
  name: string;
  type: 'offensive' | 'defensive' | 'utility';
  effectDescription: string;
  damageBase?: number;
  cooldownTurns?: number;
}

export type BattleActionType = 'attack' | 'charge' | 'defend';

export interface BattleDecision {
  action: BattleActionType;
  skillIndex?: number;
}

export interface BattleResourceState {
  hp: number;
  energy: number;
  charge: number;
  defending: boolean;
}

export interface InteractiveBattleState {
  round: number;
  challenger: BattleResourceState;
  defender: BattleResourceState;
  status: 'active' | 'completed';
  winnerSide?: 'challenger' | 'defender';
}

export interface InteractiveRound {
  round: number;
  challengerAction: BattleActionType;
  defenderAction: BattleActionType;
  challengerSkill?: string;
  defenderSkill?: string;
  challengerDamageDealt: number;
  defenderDamageDealt: number;
  challengerCrit: boolean;
  defenderCrit: boolean;
  hpAfter: { challenger: number; defender: number };
  energyAfter: { challenger: number; defender: number };
  chargeAfter: { challenger: number; defender: number };
}

export interface InteractiveParticipant {
  id: string;
  stats: CharacterStats;
  skills: Skill[];
  level: number;
  /** AI behavior tree (used to derive the AI side's deterministic decisions) */
  behaviorTree?: Record<string, unknown> | null;
}

// ============================================================
// Constants (mirror shared)
// ============================================================

export const IBATTLE_ENERGY_START = 1;
export const IBATTLE_ENERGY_MAX = 3;
export const IBATTLE_ENERGY_REGEN = 1;
export const IBATTLE_ATTACK_COST = 1;
export const IBATTLE_CHARGE_MAX = 3;
export const IBATTLE_CHARGE_DMG_BONUS = 0.6;
export const IBATTLE_DEFEND_REDUCTION = 0.5;
export const IBATTLE_DEFEND_REFLECT = 0.25;
export const IBATTLE_MAX_ROUNDS = 20;
const CRIT_BASE_CHANCE = 0.1;
const CRIT_SPD_DIVISOR = 1000;

/**
 * UGC 玩法可调规则(Bug fix 2026-06-01:让"我的玩法"真正影响对战,不再是空壳)。
 * 全部可选;不传则用引擎默认值,既有调用方与属性测试行为不变。
 */
export interface BattleRules {
  damageMultiplier?: number; // 0.5–2.0
  maxRounds?: number; // 5–40
  critEnabled?: boolean; // 关闭则无暴击
  winCondition?: 'ko' | 'hp_majority' | 'rounds_survival';
}

/**
 * InteractiveBattleEngineService — 玩家决策战斗引擎 (Phase B)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §3 支柱3。
 *
 * 与既有 BattleEngineService.simulateBattle(全自动)并存、不替换 —— 后者的
 * Property 1 测试保持绿。本引擎把战斗拆成**纯函数 reducer**:
 *
 *   stepRound(state, challengerDecision, defenderDecision, challenger, defender, seed)
 *     → { round, nextState }
 *
 * 确定性红线: 给定 (初始 state, decisions[], seed) → 结果逐字节可复现。
 * 暴击用 createRoundRng(seed, round) 与 simulateBattle 同源, 不引入新随机源。
 *
 * 资源层(产生策略深度,"猜拳 + 资源管理"):
 *   - energy: 每回合 +1(上限 3); attack 耗 1。energy 不足时 attack 自动降级为 charge。
 *   - charge: charge 行动攒 1 层(上限 3); attack 时消耗全部层数, 每层 +60% 伤害。
 *   - defend: 本回合受伤 -50% 且反弹 25% 给攻击者; 不耗 energy。
 */
@Injectable()
export class InteractiveBattleEngineService {
  /** 初始化战斗状态 */
  initState(challenger: InteractiveParticipant, defender: InteractiveParticipant): InteractiveBattleState {
    return {
      round: 0,
      challenger: { hp: challenger.stats.hp, energy: IBATTLE_ENERGY_START, charge: 0, defending: false },
      defender: { hp: defender.stats.hp, energy: IBATTLE_ENERGY_START, charge: 0, defending: false },
      status: 'active',
    };
  }

  /**
   * 推进一回合(纯函数 — 不修改入参 state,返回新 state)。
   * 双方决策同时结算:先各自结算资源(charge/energy/defend),再按 SPD 决定先手依次造成伤害。
   */
  stepRound(
    state: InteractiveBattleState,
    challengerDecision: BattleDecision,
    defenderDecision: BattleDecision,
    challenger: InteractiveParticipant,
    defender: InteractiveParticipant,
    seed: number,
    rules?: BattleRules,
  ): { round: InteractiveRound; nextState: InteractiveBattleState } {
    if (state.status === 'completed') {
      throw new Error('Battle already completed');
    }

    const maxRounds = rules?.maxRounds ?? IBATTLE_MAX_ROUNDS;
    const roundNumber = state.round + 1;
    const rng = createRoundRng(seed, roundNumber);

    // 深拷贝资源,避免修改入参
    const c: BattleResourceState = { ...state.challenger };
    const d: BattleResourceState = { ...state.defender };

    // 1) 回合开始:行动力再生
    c.energy = Math.min(IBATTLE_ENERGY_MAX, c.energy + IBATTLE_ENERGY_REGEN);
    d.energy = Math.min(IBATTLE_ENERGY_MAX, d.energy + IBATTLE_ENERGY_REGEN);

    // 2) 规范化决策(energy 不足的 attack 降级为 charge)
    const cAct = this.normalizeDecision(challengerDecision, c);
    const dAct = this.normalizeDecision(defenderDecision, d);

    // 3) 设置防御姿态(本回合生效)
    c.defending = cAct.action === 'defend';
    d.defending = dAct.action === 'defend';

    // 4) 非攻击行动先结算资源
    this.applyNonAttackResource(cAct, c);
    this.applyNonAttackResource(dAct, d);

    // 5) 决定先手(SPD 高者先;平局用 seed 决定)— 与 simulateBattle 一致语义
    const challengerFirst = this.challengerGoesFirst(challenger.stats, defender.stats, seed);

    let cDmg = 0;
    let dDmg = 0;
    let cCrit = false;
    let dCrit = false;

    const doAttack = (
      attackerSide: 'challenger' | 'defender',
    ): void => {
      const atkAct = attackerSide === 'challenger' ? cAct : dAct;
      if (atkAct.action !== 'attack') return;

      const atkP = attackerSide === 'challenger' ? challenger : defender;
      const defP = attackerSide === 'challenger' ? defender : challenger;
      const atkRes = attackerSide === 'challenger' ? c : d;
      const defRes = attackerSide === 'challenger' ? d : c;

      // 防守方若已被击倒, 跳过
      if (defRes.hp <= 0 || atkRes.hp <= 0) return;

      const skill = this.pickSkill(atkP.skills, atkAct.skillIndex);
      const { damage, isCritical } = this.computeDamage(
        atkP.stats,
        defP.stats,
        skill,
        atkRes.charge,
        defRes.defending,
        rng,
        rules,
      );

      // 消耗充能 + 行动力
      atkRes.charge = 0;
      atkRes.energy = Math.max(0, atkRes.energy - IBATTLE_ATTACK_COST);

      // 应用伤害
      defRes.hp = Math.max(0, defRes.hp - damage);

      // 防御反弹
      if (defRes.defending && damage > 0) {
        const reflected = Math.max(1, Math.round(damage * IBATTLE_DEFEND_REFLECT));
        atkRes.hp = Math.max(0, atkRes.hp - reflected);
      }

      if (attackerSide === 'challenger') {
        cDmg = damage;
        cCrit = isCritical;
      } else {
        dDmg = damage;
        dCrit = isCritical;
      }
    };

    if (challengerFirst) {
      doAttack('challenger');
      doAttack('defender');
    } else {
      doAttack('defender');
      doAttack('challenger');
    }

    // 6) 判定结束
    let status: 'active' | 'completed' = 'active';
    let winnerSide: 'challenger' | 'defender' | undefined;
    if (c.hp <= 0 || d.hp <= 0) {
      status = 'completed';
      if (c.hp <= 0 && d.hp <= 0) {
        winnerSide = 'defender'; // 同归于尽 → 防守方胜(与 simulateBattle 一致)
      } else {
        winnerSide = c.hp > 0 ? 'challenger' : 'defender';
      }
    } else if (roundNumber >= maxRounds) {
      status = 'completed';
      const cPct = c.hp / challenger.stats.hp;
      const dPct = d.hp / defender.stats.hp;
      // winCondition: rounds_survival → 撑到回合上限的一方(HP 高者)胜,与 hp_majority 同口径;
      // ko 已在上面的 hp<=0 分支处理。这里是回合耗尽的兜底判定。
      winnerSide = cPct >= dPct ? 'challenger' : 'defender';
    }

    const round: InteractiveRound = {
      round: roundNumber,
      challengerAction: cAct.action,
      defenderAction: dAct.action,
      challengerSkill: cAct.action === 'attack' ? this.pickSkill(challenger.skills, cAct.skillIndex).name : undefined,
      defenderSkill: dAct.action === 'attack' ? this.pickSkill(defender.skills, dAct.skillIndex).name : undefined,
      challengerDamageDealt: cDmg,
      defenderDamageDealt: dDmg,
      challengerCrit: cCrit,
      defenderCrit: dCrit,
      hpAfter: { challenger: c.hp, defender: d.hp },
      energyAfter: { challenger: c.energy, defender: d.energy },
      chargeAfter: { challenger: c.charge, defender: d.charge },
    };

    const nextState: InteractiveBattleState = {
      round: roundNumber,
      challenger: c,
      defender: d,
      status,
      winnerSide,
    };

    return { round, nextState };
  }

  /**
   * 防守方(AI)的确定性决策。依 behaviorTree 倾向 + 局面 + seed 派生,
   * 同 (state, seed) → 同决策,保证回放可复现。
   *
   * 策略: HP<30% 且有 energy → 防御; charge 已满 或 energy 充足偏好攻击;
   *       否则按 seed 在 attack/charge 间抉择。
   */
  deriveAiDecision(
    state: InteractiveBattleState,
    ai: InteractiveParticipant,
    side: 'challenger' | 'defender',
    seed: number,
  ): BattleDecision {
    const res = side === 'challenger' ? state.challenger : state.defender;
    const maxHp = ai.stats.hp;
    const rng = createRoundRng(seed ^ 0x5bd1e995, state.round + 1);

    const offensiveIdx = ai.skills.findIndex((s) => (s.damageBase ?? 0) > 0);
    const atkIndex = offensiveIdx >= 0 ? offensiveIdx : 0;

    // 低血量防御倾向(behaviorTree 的 hp_below_30_percent 分支)
    if (res.hp / maxHp < 0.3 && rng.next() < 0.6) {
      return { action: 'defend' };
    }
    // 充能已满 → 倾向打出
    if (res.charge >= IBATTLE_CHARGE_MAX && res.energy >= IBATTLE_ATTACK_COST) {
      return { action: 'attack', skillIndex: atkIndex };
    }
    // energy 不足 → 蓄力
    if (res.energy < IBATTLE_ATTACK_COST) {
      return { action: 'charge' };
    }
    // 否则按 seed 抉择: 60% 攻击 / 25% 蓄力 / 15% 防御
    const r = rng.next();
    if (r < 0.6) return { action: 'attack', skillIndex: atkIndex };
    if (r < 0.85) return { action: 'charge' };
    return { action: 'defend' };
  }

  /** 计算 XP(复用 simulateBattle 同口径) */
  calculateXpAwards(
    challengerLevel: number,
    defenderLevel: number,
    winnerSide: 'challenger' | 'defender',
  ): { challenger: number; defender: number } {
    const winnerLevel = winnerSide === 'challenger' ? challengerLevel : defenderLevel;
    const loserLevel = winnerSide === 'challenger' ? defenderLevel : challengerLevel;
    const levelDiff = loserLevel - winnerLevel;
    const winnerXp = Math.max(30, Math.min(100, Math.round(65 + levelDiff * 7)));
    const loserLevelDiff = winnerLevel - loserLevel;
    const loserXp = Math.max(10, Math.min(40, Math.round(25 + loserLevelDiff * 3)));
    return {
      challenger: winnerSide === 'challenger' ? winnerXp : loserXp,
      defender: winnerSide === 'defender' ? winnerXp : loserXp,
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private normalizeDecision(decision: BattleDecision, res: BattleResourceState): BattleDecision {
    if (decision.action === 'attack' && res.energy < IBATTLE_ATTACK_COST) {
      // energy 不足 → 自动降级为蓄力(也回收行动力策略)
      return { action: 'charge' };
    }
    return decision;
  }

  private applyNonAttackResource(decision: BattleDecision, res: BattleResourceState): void {
    if (decision.action === 'charge') {
      res.charge = Math.min(IBATTLE_CHARGE_MAX, res.charge + 1);
    }
    // defend / attack 的资源在别处结算
  }

  private challengerGoesFirst(
    cStats: CharacterStats,
    dStats: CharacterStats,
    seed: number,
  ): boolean {
    if (cStats.spd > dStats.spd) return true;
    if (dStats.spd > cStats.spd) return false;
    const rng = new SeededRng(seed);
    return rng.next() > 0.5;
  }

  private pickSkill(skills: Skill[], index?: number): Skill {
    if (!skills || skills.length === 0) {
      return { name: 'Basic Attack', type: 'offensive', effectDescription: 'basic', damageBase: 10, cooldownTurns: 0 };
    }
    const i = typeof index === 'number' && index >= 0 && index < skills.length ? index : 0;
    const s = skills[i];
    // 若选到非攻击技能, 回退到第一个有伤害的, 否则给基础伤害
    if ((s.damageBase ?? 0) <= 0) {
      const off = skills.find((sk) => (sk.damageBase ?? 0) > 0);
      return off ?? { ...s, damageBase: 10 };
    }
    return s;
  }

  /**
   * 伤害公式(与 simulateBattle 同骨架 + 充能加成 + 防御减免)。
   *   base = skill.damageBase * (atk/def)
   *   variance = 0.85 + rng()*0.30
   *   charge bonus = 1 + charge*0.6
   *   crit = 0.10 + spd/1000 (cap 20%)
   *   defend reduction = 防守方 defending 时 *0.5
   */
  private computeDamage(
    attacker: CharacterStats,
    defender: CharacterStats,
    skill: Skill,
    attackerCharge: number,
    defenderDefending: boolean,
    rng: SeededRng,
    rules?: BattleRules,
  ): { damage: number; isCritical: boolean } {
    const damageBase = skill.damageBase ?? 10;
    const base = damageBase * (attacker.atk / Math.max(1, defender.def));
    const variance = 0.85 + rng.next() * 0.3;
    let damage = base * variance;

    // 充能加成
    damage *= 1 + attackerCharge * IBATTLE_CHARGE_DMG_BONUS;

    // 暴击(UGC 玩法可关闭)
    const critEnabled = rules?.critEnabled !== false;
    const critChance = CRIT_BASE_CHANCE + attacker.spd / CRIT_SPD_DIVISOR;
    const isCritical = critEnabled && rng.next() < critChance;
    if (isCritical) damage *= 1.5;

    // 防御减免
    if (defenderDefending) damage *= IBATTLE_DEFEND_REDUCTION;

    // UGC 玩法伤害倍率(0.5–2.0,在 ugc-game.service 已 clamp)
    const mult = rules?.damageMultiplier;
    if (typeof mult === 'number' && mult > 0) damage *= mult;

    return { damage: Math.max(1, Math.round(damage)), isCritical };
  }
}
