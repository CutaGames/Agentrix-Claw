import { Injectable } from '@nestjs/common';

// ============================================================
// Types and constants (mirrored from shared/types/world-engine)
// These are defined here to avoid cross-package import issues
// during testing. The canonical source is shared/types/world-engine.ts
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

export interface BattleRound {
  roundNumber: number;
  attackerId: string;
  skillUsed: string;
  damageDealt: number;
  isCritical: boolean;
  hpRemaining: { challenger: number; defender: number };
}

/** Maximum rounds before HP-percentage tiebreaker */
export const BATTLE_MAX_ROUNDS = 20;

/** Base critical hit chance (10%) */
export const CRIT_BASE_CHANCE = 0.10;

/** SPD divisor for crit chance calculation */
export const CRIT_SPD_DIVISOR = 1000;

// ============================================================
// Seeded PRNG — Mulberry32
// Deterministic 32-bit PRNG. Given the same seed it always
// produces the same sequence of pseudo-random floats in [0, 1).
// ============================================================

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Ensure the seed is a 32-bit integer
    this.state = seed | 0;
  }

  /** Advance state and return a float in [0, 1). */
  next(): number {
    // Mulberry32 algorithm
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/**
 * Create a seeded RNG for a specific round.
 * Combines the battle seed with the round number to produce
 * a unique but deterministic sub-seed per round.
 */
export function createRoundRng(seed: number, roundNumber: number): SeededRng {
  // Mix seed and round number to get a unique per-round seed
  const roundSeed = (seed ^ (roundNumber * 2654435761)) | 0;
  return new SeededRng(roundSeed);
}

// ============================================================
// Battle participant representation
// ============================================================

export interface BattleParticipant {
  id: string;
  stats: CharacterStats;
  skills: Skill[];
  level: number;
}

export interface BattleResult {
  rounds: BattleRound[];
  winnerSide: 'challenger' | 'defender';
  totalRounds: number;
  xpAwarded: { challenger: number; defender: number };
}

export interface DamageResult {
  damage: number;
  isCritical: boolean;
}

// ============================================================
// BattleEngineService
// ============================================================

@Injectable()
export class BattleEngineService {
  /**
   * Calculate damage for a single attack.
   *
   * Formula:
   *   baseDamage = skill.damageBase * (attacker.atk / defender.def)
   *   variance = 0.85 + rng.next() * 0.30
   *   damage = round(baseDamage * variance)
   *   critChance = 0.10 + (attacker.spd / 1000)  // caps at 20% when SPD=100
   *   isCritical = rng.next() < critChance
   *   if (isCritical) damage = round(damage * 1.5)
   *   return { damage: max(1, damage), isCritical }
   */
  calculateDamage(
    attacker: CharacterStats,
    defender: CharacterStats,
    skill: Skill,
    seed: number,
    roundNumber: number,
  ): DamageResult {
    const rng = createRoundRng(seed, roundNumber);

    const damageBase = skill.damageBase ?? 10;
    const baseDamage = damageBase * (attacker.atk / defender.def);
    const variance = 0.85 + rng.next() * 0.30;
    let damage = Math.round(baseDamage * variance);

    // Critical hit: base 10% + SPD bonus (caps at 20% when SPD=100)
    const critChance = CRIT_BASE_CHANCE + (attacker.spd / CRIT_SPD_DIVISOR);
    const isCritical = rng.next() < critChance;
    if (isCritical) {
      damage = Math.round(damage * 1.5);
    }

    return { damage: Math.max(1, damage), isCritical };
  }

  /**
   * Determine turn order based on SPD.
   * Higher SPD goes first. Tie → seeded random decides.
   *
   * Returns ['challenger', 'defender'] or ['defender', 'challenger'].
   */
  determineTurnOrder(
    challengerStats: CharacterStats,
    defenderStats: CharacterStats,
    seed: number,
  ): ['challenger' | 'defender', 'challenger' | 'defender'] {
    if (challengerStats.spd > defenderStats.spd) {
      return ['challenger', 'defender'];
    }
    if (defenderStats.spd > challengerStats.spd) {
      return ['defender', 'challenger'];
    }
    // Tie: use seeded random
    const rng = new SeededRng(seed);
    return rng.next() > 0.5
      ? ['challenger', 'defender']
      : ['defender', 'challenger'];
  }

  /**
   * Simulate a full battle between two characters.
   *
   * Turn-based loop, max 20 rounds.
   * Each round: determine attacker (alternating based on turn order),
   * pick skill (cycle through skills), calculate damage, reduce HP.
   * End when HP ≤ 0 or round 20.
   * If round 20: winner = higher remaining HP percentage.
   */
  simulateBattle(
    challenger: BattleParticipant,
    defender: BattleParticipant,
    seed: number,
  ): BattleResult {
    const turnOrder = this.determineTurnOrder(
      challenger.stats,
      defender.stats,
      seed,
    );

    let challengerHp = challenger.stats.hp;
    let defenderHp = defender.stats.hp;
    const rounds: BattleRound[] = [];

    for (let round = 1; round <= BATTLE_MAX_ROUNDS; round++) {
      // Determine who attacks this round (alternating based on turn order)
      const attackerSide = turnOrder[(round - 1) % 2];
      const currentAttacker = attackerSide === 'challenger' ? challenger : defender;
      const currentDefender = attackerSide === 'challenger' ? defender : challenger;

      // Pick skill: cycle through available skills
      const skillIndex = (round - 1) % currentAttacker.skills.length;
      const skill = currentAttacker.skills[skillIndex];

      // Calculate damage using the deterministic formula
      const { damage, isCritical } = this.calculateDamage(
        currentAttacker.stats,
        currentDefender.stats,
        skill,
        seed,
        round,
      );

      // Apply damage
      if (attackerSide === 'challenger') {
        defenderHp -= damage;
      } else {
        challengerHp -= damage;
      }

      // Clamp HP to 0 minimum for display
      const roundResult: BattleRound = {
        roundNumber: round,
        attackerId: currentAttacker.id,
        skillUsed: skill.name,
        damageDealt: damage,
        isCritical,
        hpRemaining: {
          challenger: Math.max(0, challengerHp),
          defender: Math.max(0, defenderHp),
        },
      };
      rounds.push(roundResult);

      // Check if battle is over
      if (challengerHp <= 0 || defenderHp <= 0) {
        break;
      }
    }

    // Determine winner
    let winnerSide: 'challenger' | 'defender';
    if (challengerHp <= 0 && defenderHp <= 0) {
      // Both KO'd in same round (shouldn't happen with alternating turns, but handle it)
      winnerSide = 'defender'; // defender wins ties
    } else if (challengerHp <= 0) {
      winnerSide = 'defender';
    } else if (defenderHp <= 0) {
      winnerSide = 'challenger';
    } else {
      // Round 20 reached: HP percentage tiebreaker
      const challengerPct = challengerHp / challenger.stats.hp;
      const defenderPct = defenderHp / defender.stats.hp;
      winnerSide = challengerPct >= defenderPct ? 'challenger' : 'defender';
    }

    // Calculate XP awards
    const xpAwarded = this.calculateXpAwards(
      challenger.level,
      defender.level,
      winnerSide,
    );

    return {
      rounds,
      winnerSide,
      totalRounds: rounds.length,
      xpAwarded,
    };
  }

  /**
   * Calculate XP awards for both participants.
   * Winner: 30-100 XP, Loser: 10-40 XP, scaled by level difference.
   *
   * Level difference scaling:
   * - If winner beat a higher-level opponent, they get more XP.
   * - If winner beat a lower-level opponent, they get less XP.
   */
  calculateXpAwards(
    challengerLevel: number,
    defenderLevel: number,
    winnerSide: 'challenger' | 'defender',
  ): { challenger: number; defender: number } {
    const winnerLevel = winnerSide === 'challenger' ? challengerLevel : defenderLevel;
    const loserLevel = winnerSide === 'challenger' ? defenderLevel : challengerLevel;

    // Level difference: positive means opponent was higher level
    const levelDiff = loserLevel - winnerLevel;

    // Winner XP: base 65, scaled by level diff, clamped to [30, 100]
    const winnerBaseXp = 65;
    const winnerXp = Math.max(30, Math.min(100, Math.round(winnerBaseXp + levelDiff * 7)));

    // Loser XP: base 25, scaled by level diff, clamped to [10, 40]
    const loserLevelDiff = winnerLevel - loserLevel;
    const loserBaseXp = 25;
    const loserXp = Math.max(10, Math.min(40, Math.round(loserBaseXp + loserLevelDiff * 3)));

    return {
      challenger: winnerSide === 'challenger' ? winnerXp : loserXp,
      defender: winnerSide === 'defender' ? winnerXp : loserXp,
    };
  }
}
