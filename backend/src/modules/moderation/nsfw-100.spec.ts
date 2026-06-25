import { ModerationService } from './moderation.service';
import { NSFW_PROMPT_FIXTURES, NSFW_FIXTURE_STATS } from './fixtures/nsfw-100-prompts';

/**
 * BE-T2.6 — 100-prompt NSFW classification matrix.
 * Required: 100% precision (every fixture's expectedDecision matches).
 */
describe('ModerationService — 100-prompt fixture (BE-T2.6)', () => {
  it('fixture has exactly 100 cases (60 deny + 40 allow)', () => {
    expect(NSFW_FIXTURE_STATS.total).toBe(100);
    expect(NSFW_FIXTURE_STATS.deny).toBe(60);
    expect(NSFW_FIXTURE_STATS.allow).toBe(40);
  });

  describe.each(NSFW_PROMPT_FIXTURES)('$id ($category) "$prompt"', (tc) => {
    it(`→ ${tc.expectedDecision}`, () => {
      const result = ModerationService.checkPromptSync(tc.prompt);
      expect(result.decision).toBe(tc.expectedDecision);
      if (tc.expectedDecision === 'deny') {
        expect(result.reason).toBe('nsfw_keyword');
        expect(result.score).toBeGreaterThan(0);
      } else {
        expect(result.reason).toBeNull();
      }
    });
  });

  it('aggregate precision = 100% on the fixture set', () => {
    let correct = 0;
    const errors: Array<{ id: string; expected: string; actual: string; prompt: string }> = [];
    for (const tc of NSFW_PROMPT_FIXTURES) {
      const r = ModerationService.checkPromptSync(tc.prompt);
      if (r.decision === tc.expectedDecision) {
        correct++;
      } else {
        errors.push({ id: tc.id, expected: tc.expectedDecision, actual: r.decision, prompt: tc.prompt });
      }
    }
    if (errors.length > 0) {
      // Print first 5 errors for diagnostics
      // eslint-disable-next-line no-console
      console.error('NSFW fixture mismatches:', errors.slice(0, 5));
    }
    expect(correct).toBe(100);
  });
});
