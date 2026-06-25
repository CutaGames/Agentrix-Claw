import * as fc from 'fast-check';
import {
  AEON_TASK_TRANSITIONS,
  isLegalTransition,
  isTerminal,
  type AeonTaskState,
} from '../task/task-state-machine';

const ALL_STATES: AeonTaskState[] = [
  'open',
  'in_progress',
  'awaiting_verify',
  'disputed',
  'completed',
  'cancelled',
  'expired',
];

/**
 * P.2 (部分) + P.4 — 状态机合法性(Property 8;R7.3/R9.3)。
 *
 * - 非法迁移恒被拒绝;
 * - 终态无出边(completed/cancelled/expired 不可再迁移);
 * - 随机迁移序列只要每步合法,最终状态一定可达且不会从终态逃逸。
 */
describe('Aeon Property 8: task state machine legality (P.2/P.4)', () => {
  const stateArb = fc.constantFrom(...ALL_STATES);

  it('terminal states have no outgoing transitions', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) {
        expect(AEON_TASK_TRANSITIONS[s]).toHaveLength(0);
        // 任何目标都非法
        for (const to of ALL_STATES) expect(isLegalTransition(s, to)).toBe(false);
      }
    }
  });

  it('illegal transitions are always rejected (not in table)', () => {
    fc.assert(
      fc.property(stateArb, stateArb, (from, to) => {
        const legal = AEON_TASK_TRANSITIONS[from].includes(to);
        expect(isLegalTransition(from, to)).toBe(legal);
      }),
    );
  });

  it('a walk that only takes legal steps can never escape a terminal state', () => {
    fc.assert(
      fc.property(fc.array(stateArb, { maxLength: 30 }), (targets) => {
        let cur: AeonTaskState = 'open';
        for (const to of targets) {
          if (isLegalTransition(cur, to)) {
            cur = to;
          }
          // 一旦进入终态,后续任何合法步都不存在 → 永远停在终态
          if (isTerminal(cur)) {
            for (const t of ALL_STATES) expect(isLegalTransition(cur, t)).toBe(false);
          }
        }
        expect(ALL_STATES).toContain(cur);
      }),
    );
  });
});
