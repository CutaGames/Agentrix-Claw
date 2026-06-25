import { BadRequestException } from '@nestjs/common';
import {
  CreationStateMachine,
  CREATION_STATE_TRANSITIONS,
  DISCOVERABLE_STATUSES,
  INVALID_CREATION_TRANSITION,
  InvalidCreationTransitionError,
  assertCreationTransition,
  getAllowedCreationTransitions,
  isDiscoverableStatus,
  isValidCreationTransition,
  type CreationTransitionErrorBody,
} from './creation-state-machine';
import type { CreationStatus } from '../../../shared/types/creation';

/**
 * Unit tests for the Creation lifecycle state machine (world-creation-feed task 1.2).
 *
 * Validates:
 *  - 需求 1.4 six-state lifecycle and its legal transitions.
 *  - 需求 3.1 审核前置:进入 published/listed 必先经 under_review。
 *  - 需求 3.4 违规即移出:任意非终态 → suspended;suspended 为终态;
 *    且仅 published/listed 对发现面可见(Property 4)。
 *
 * Pure logic — no DB, no Nest TestingModule needed.
 */

const ALL_STATUSES: CreationStatus[] = [
  'draft',
  'under_review',
  'published',
  'listed',
  'unpublished',
  'suspended',
];

describe('Creation state machine (task 1.2)', () => {
  // ============================================================
  // Valid transitions allowed (需求 1.4 / 3.1 / 3.4)
  // ============================================================
  describe('valid transitions', () => {
    const VALID: [CreationStatus, CreationStatus][] = [
      ['draft', 'under_review'],
      ['draft', 'suspended'],
      ['under_review', 'published'],
      ['under_review', 'listed'],
      ['under_review', 'draft'], // 审核未过回到草稿,内容不丢失(需求 3.3)
      ['under_review', 'suspended'],
      ['published', 'listed'],
      ['published', 'unpublished'],
      ['published', 'suspended'],
      ['listed', 'published'],
      ['listed', 'unpublished'],
      ['listed', 'suspended'],
      ['unpublished', 'under_review'],
      ['unpublished', 'published'], // 重新发布(需求允许下架后再发布)
      ['unpublished', 'listed'],
      ['unpublished', 'suspended'],
    ];

    it.each(VALID)('allows %s → %s', (from, to) => {
      expect(isValidCreationTransition(from, to)).toBe(true);
      expect(() => assertCreationTransition(from, to)).not.toThrow();
    });
  });

  // ============================================================
  // Invalid transitions rejected
  // ============================================================
  describe('invalid transitions', () => {
    it('rejects same-state self-loops', () => {
      for (const s of ALL_STATUSES) {
        expect(isValidCreationTransition(s, s)).toBe(false);
      }
    });

    it('rejects draft → published (bypasses review — 审核前置, 需求 3.1)', () => {
      expect(isValidCreationTransition('draft', 'published')).toBe(false);
      expect(isValidCreationTransition('draft', 'listed')).toBe(false);
    });

    it('rejects draft → unpublished (never published)', () => {
      expect(isValidCreationTransition('draft', 'unpublished')).toBe(false);
    });

    it('treats suspended as terminal (no outgoing transitions, 需求 3.4)', () => {
      expect(CREATION_STATE_TRANSITIONS.suspended).toEqual([]);
      for (const to of ALL_STATUSES) {
        expect(isValidCreationTransition('suspended', to)).toBe(false);
      }
    });

    // Exhaustively assert every pair not in the table is rejected.
    it('rejects every transition absent from the legal table', () => {
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) {
          const expected = CREATION_STATE_TRANSITIONS[from].includes(to);
          expect(isValidCreationTransition(from, to)).toBe(expected);
        }
      }
    });
  });

  // ============================================================
  // 审核前置 invariant — only via under_review can you reach published/listed
  // ============================================================
  describe('审核前置 invariant (需求 3.1)', () => {
    it('only under_review and the published↔listed/unpublished re-publish paths reach published/listed', () => {
      const predecessorsOfPublishedOrListed = ALL_STATUSES.filter((from) =>
        CREATION_STATE_TRANSITIONS[from].some(
          (to) => to === 'published' || to === 'listed',
        ),
      ).sort();
      // draft must NOT be a direct predecessor (must pass through review).
      expect(predecessorsOfPublishedOrListed).not.toContain('draft');
      expect(predecessorsOfPublishedOrListed).toEqual(
        ['listed', 'published', 'under_review', 'unpublished'].sort(),
      );
    });
  });

  // ============================================================
  // Discoverability (Property 4)
  // ============================================================
  describe('discoverability (Property 4)', () => {
    it('only published and listed are discoverable', () => {
      expect(isDiscoverableStatus('published')).toBe(true);
      expect(isDiscoverableStatus('listed')).toBe(true);
      expect(DISCOVERABLE_STATUSES).toEqual(new Set(['published', 'listed']));
    });

    it('draft / under_review / unpublished / suspended are not discoverable', () => {
      expect(isDiscoverableStatus('draft')).toBe(false);
      expect(isDiscoverableStatus('under_review')).toBe(false);
      expect(isDiscoverableStatus('unpublished')).toBe(false);
      expect(isDiscoverableStatus('suspended')).toBe(false);
    });
  });

  // ============================================================
  // Structured error on invalid transition
  // ============================================================
  describe('structured error', () => {
    it('throws InvalidCreationTransitionError (BadRequestException) with structured body', () => {
      let caught: InvalidCreationTransitionError | undefined;
      try {
        assertCreationTransition('draft', 'published');
      } catch (e) {
        caught = e as InvalidCreationTransitionError;
      }
      expect(caught).toBeInstanceOf(InvalidCreationTransitionError);
      expect(caught).toBeInstanceOf(BadRequestException);

      const body = caught!.getResponse() as CreationTransitionErrorBody;
      expect(body.code).toBe(INVALID_CREATION_TRANSITION);
      expect(body.from).toBe('draft');
      expect(body.to).toBe('published');
      expect(body.allowed).toEqual(['under_review', 'suspended']);
    });
  });

  // ============================================================
  // Helpers
  // ============================================================
  describe('getAllowedCreationTransitions', () => {
    it('returns the legal successors for a state', () => {
      expect(getAllowedCreationTransitions('published')).toEqual([
        'listed',
        'unpublished',
        'suspended',
      ]);
      expect(getAllowedCreationTransitions('suspended')).toEqual([]);
    });
  });

  // ============================================================
  // Injectable service wrapper delegates to pure functions
  // ============================================================
  describe('CreationStateMachine service', () => {
    const sm = new CreationStateMachine();

    it('canTransition mirrors isValidCreationTransition', () => {
      expect(sm.canTransition('draft', 'under_review')).toBe(true);
      expect(sm.canTransition('draft', 'published')).toBe(false);
    });

    it('allowedTransitions mirrors getAllowedCreationTransitions', () => {
      expect(sm.allowedTransitions('listed')).toEqual([
        'published',
        'unpublished',
        'suspended',
      ]);
    });

    it('assertTransition throws on invalid', () => {
      expect(() => sm.assertTransition('suspended', 'published')).toThrow(
        InvalidCreationTransitionError,
      );
      expect(() => sm.assertTransition('draft', 'under_review')).not.toThrow();
    });

    it('isDiscoverable mirrors isDiscoverableStatus', () => {
      expect(sm.isDiscoverable('published')).toBe(true);
      expect(sm.isDiscoverable('draft')).toBe(false);
    });
  });
});
