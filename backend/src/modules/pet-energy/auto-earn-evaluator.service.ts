import { Injectable, Logger } from '@nestjs/common';

/**
 * AutoEarnEvaluator — BE-T4.4 / BE-T4.7 quality scorer.
 *
 * Scores a candidate task (0..1) along 4 dimensions:
 *  - reward: $/effort ratio
 *  - skillFit: requested skills vs pet skills overlap
 *  - reputation: requester reputation (0..1)
 *  - antifraud: -1 to 1 inverse penalty for blacklisted/anomaly signals
 *
 * Default acceptance threshold = 0.6. Calibrated against the §6.3 SC-T4
 * baseline targeting ≥80% accuracy on 50-task self-test.
 */
export interface TaskCandidate {
  id: string;
  rewardCents: number;
  estEffortMinutes: number;
  requiredSkills: string[];
  requesterReputation: number; // 0..1
  flagged?: boolean;
  source?: string;
}

export interface PetCapabilities {
  skills: string[];
  /** Pet's per-minute cost (cents) — used to gate negative-margin tasks. */
  costPerMinuteCents: number;
}

export interface EvaluatorScore {
  total: number;
  reward: number;
  skillFit: number;
  reputation: number;
  antifraud: number;
  accept: boolean;
  reason: string;
}

export const ACCEPTANCE_THRESHOLD = 0.6;

@Injectable()
export class AutoEarnEvaluatorService {
  private readonly logger = new Logger(AutoEarnEvaluatorService.name);

  score(candidate: TaskCandidate, pet: PetCapabilities): EvaluatorScore {
    if (candidate.flagged) {
      return this.reject('flagged_by_antifraud', candidate, pet);
    }
    if (candidate.estEffortMinutes <= 0 || candidate.rewardCents < 0) {
      return this.reject('invalid_inputs', candidate, pet);
    }

    // Reward score: net margin per minute mapped to 0..1 with diminishing return.
    const grossPerMinute = candidate.rewardCents / candidate.estEffortMinutes;
    const netPerMinute = grossPerMinute - pet.costPerMinuteCents;
    const reward = sigmoid01(netPerMinute / 10); // $0.10/min net → ~0.5

    // Skill fit: jaccard-like overlap.
    const have = new Set(pet.skills);
    const need = candidate.requiredSkills;
    let hits = 0;
    for (const s of need) if (have.has(s)) hits++;
    const skillFit = need.length === 0 ? 0.7 : hits / need.length;

    const reputation = clamp01(candidate.requesterReputation);

    const antifraud = candidate.flagged ? -1 : 1;

    // Hard gate: must have at least 50% skill fit AND non-negative net.
    if (skillFit < 0.5 || netPerMinute < 0) {
      return {
        total: 0,
        reward, skillFit, reputation, antifraud,
        accept: false,
        reason: skillFit < 0.5 ? 'skill_mismatch' : 'negative_margin',
      };
    }

    // Weighted blend.
    const total =
      0.35 * reward +
      0.35 * skillFit +
      0.20 * reputation +
      0.10 * (antifraud > 0 ? 1 : 0);

    return {
      total,
      reward, skillFit, reputation, antifraud,
      accept: total >= ACCEPTANCE_THRESHOLD,
      reason: total >= ACCEPTANCE_THRESHOLD ? 'accept' : 'below_threshold',
    };
  }

  private reject(reason: string, _c: TaskCandidate, _p: PetCapabilities): EvaluatorScore {
    return {
      total: 0,
      reward: 0,
      skillFit: 0,
      reputation: 0,
      antifraud: -1,
      accept: false,
      reason,
    };
  }
}

function sigmoid01(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
