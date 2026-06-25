import { AutoEarnEvaluatorService, ACCEPTANCE_THRESHOLD } from './auto-earn-evaluator.service';

/**
 * BE-T4.4 — evaluator accuracy ≥80% on 50-task self-test.
 */
describe('AutoEarnEvaluatorService', () => {
  const evaluator = new AutoEarnEvaluatorService();

  const pet = { skills: ['copywriting', 'translation', 'research'], costPerMinuteCents: 2 };

  it('accepts a high-margin well-matched task', () => {
    const s = evaluator.score(
      {
        id: 't1',
        rewardCents: 5000,
        estEffortMinutes: 30,
        requiredSkills: ['copywriting', 'research'],
        requesterReputation: 0.9,
      },
      pet,
    );
    expect(s.accept).toBe(true);
    expect(s.total).toBeGreaterThanOrEqual(ACCEPTANCE_THRESHOLD);
  });

  it('rejects a flagged task immediately', () => {
    const s = evaluator.score(
      {
        id: 'fraud',
        rewardCents: 99999,
        estEffortMinutes: 10,
        requiredSkills: ['copywriting'],
        requesterReputation: 0.99,
        flagged: true,
      },
      pet,
    );
    expect(s.accept).toBe(false);
    expect(s.reason).toBe('flagged_by_antifraud');
  });

  it('rejects negative-margin task (BE-T4.5 budget gate)', () => {
    const s = evaluator.score(
      {
        id: 'lowpay',
        rewardCents: 30, // 30 cents
        estEffortMinutes: 60, // → 0.5 c/min < pet cost 2 c/min
        requiredSkills: ['copywriting'],
        requesterReputation: 0.9,
      },
      pet,
    );
    expect(s.accept).toBe(false);
    expect(s.reason).toBe('negative_margin');
  });

  it('rejects skill mismatch', () => {
    const s = evaluator.score(
      {
        id: 'wrong',
        rewardCents: 5000,
        estEffortMinutes: 30,
        requiredSkills: ['quantum_compute', 'rocket_science'],
        requesterReputation: 0.9,
      },
      pet,
    );
    expect(s.accept).toBe(false);
    expect(s.reason).toBe('skill_mismatch');
  });

  it('reward signal increases with $/min', () => {
    const low = evaluator.score(
      { id: 'a', rewardCents: 100, estEffortMinutes: 30, requiredSkills: ['copywriting'], requesterReputation: 0.5 },
      pet,
    );
    const high = evaluator.score(
      { id: 'b', rewardCents: 5000, estEffortMinutes: 30, requiredSkills: ['copywriting'], requesterReputation: 0.5 },
      pet,
    );
    expect(high.reward).toBeGreaterThan(low.reward);
  });

  describe('50-task self-test ≥80% accuracy', () => {
    // Construct 50 tasks with a known label (accept/reject by construction)
    // and check that evaluator agrees on ≥40/50.
    const samples: Array<{ task: any; expected: boolean }> = [];
    // 25 clearly-good tasks
    for (let i = 0; i < 25; i++) {
      samples.push({
        task: {
          id: `g${i}`,
          rewardCents: 4000 + i * 100,
          estEffortMinutes: 20,
          requiredSkills: ['copywriting', 'research'],
          requesterReputation: 0.85,
        },
        expected: true,
      });
    }
    // 25 clearly-bad tasks (mix of: flagged, mismatched skills, negative margin)
    for (let i = 0; i < 25; i++) {
      const m = i % 3;
      if (m === 0) {
        samples.push({
          task: {
            id: `b${i}`,
            rewardCents: 100,
            estEffortMinutes: 100, // 1 c/min < pet cost 2 c/min
            requiredSkills: ['copywriting'],
            requesterReputation: 0.5,
          },
          expected: false,
        });
      } else if (m === 1) {
        samples.push({
          task: {
            id: `b${i}`,
            rewardCents: 9000,
            estEffortMinutes: 30,
            requiredSkills: ['cad_design', '3d_print'],
            requesterReputation: 0.5,
          },
          expected: false,
        });
      } else {
        samples.push({
          task: {
            id: `b${i}`,
            rewardCents: 5000,
            estEffortMinutes: 30,
            requiredSkills: ['copywriting'],
            requesterReputation: 0.9,
            flagged: true,
          },
          expected: false,
        });
      }
    }

    it('agrees on at least 80% of labels', () => {
      let correct = 0;
      for (const s of samples) {
        const r = evaluator.score(s.task, pet);
        if (r.accept === s.expected) correct++;
      }
      const accuracy = correct / samples.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });
  });
});
