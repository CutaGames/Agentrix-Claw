/** T15 / W7 · Lifecycle state machine, monotonic counter, revoked veto (Property 13). */
import {
  applyLifecycleTransition,
  canOperate,
  isOperable,
  isRetired,
  LIFECYCLE_STATES,
  type LifecycleSnapshot,
} from '../v1_1/lifecycle';

const base: LifecycleSnapshot = { state: 'manufactured', lifecycleCounter: 0 };
const tx = (to: any, expectedCounter: number) => ({ to, expectedCounter, actor: 'ceremony', occurredAt: '2026-07-16T00:00:00Z' });

describe('Soul Core L1 v1.1 lifecycle (T15)', () => {
  it('walks the happy path manufactured→factory→user_activated with monotonic counter + digests', () => {
    const r1 = applyLifecycleTransition(base, tx('factory_personalized', 0));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.snapshot.lifecycleCounter).toBe(1);
    expect(r1.snapshot.lastTransitionDigest).toMatch(/^[0-9a-f]{64}$/);
    const r2 = applyLifecycleTransition(r1.snapshot, tx('user_activated', 1));
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.snapshot.lifecycleCounter).toBe(2);
  });

  it('rejects illegal transitions (fail-closed)', () => {
    expect(applyLifecycleTransition(base, tx('user_activated', 0))).toMatchObject({
      ok: false,
      reason: 'lifecycle-invalid-transition',
    });
  });

  it('enforces monotonic counter (anti-rollback): stale expectedCounter rejected', () => {
    const active: LifecycleSnapshot = { state: 'user_activated', lifecycleCounter: 5 };
    expect(applyLifecycleTransition(active, tx('frozen', 4))).toMatchObject({
      ok: false,
      reason: 'lifecycle-counter-not-monotonic',
    });
  });

  it('freeze → unfreeze and freeze → recovery_pending → retired', () => {
    const snap: LifecycleSnapshot = { state: 'user_activated', lifecycleCounter: 2 };
    const frozen = applyLifecycleTransition(snap, tx('frozen', 2));
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) return;
    expect(applyLifecycleTransition(frozen.snapshot, tx('user_activated', 3)).ok).toBe(true);
    const rec = applyLifecycleTransition(frozen.snapshot, tx('recovery_pending', 3));
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(applyLifecycleTransition(rec.snapshot, tx('retired', 4)).ok).toBe(true);
  });

  it('retired is terminal and irreversible', () => {
    const retired: LifecycleSnapshot = { state: 'retired', lifecycleCounter: 9 };
    expect(isRetired('retired')).toBe(true);
    expect(applyLifecycleTransition(retired, tx('user_activated', 9))).toMatchObject({ ok: false, reason: 'card-retired' });
    expect(canOperate('retired', false).allowed).toBe(false);
  });

  it('external revoked vetoes any non-retired local state (Property 13)', () => {
    const active: LifecycleSnapshot = { state: 'user_activated', lifecycleCounter: 2 };
    expect(isOperable('user_activated', true)).toBe(false);
    expect(isOperable('user_activated', false)).toBe(true);
    expect(canOperate('user_activated', true).reason).toBe('card-revoked');
    expect(applyLifecycleTransition(active, tx('frozen', 2), true)).toMatchObject({ ok: false, reason: 'card-revoked' });
  });

  it('exposes exactly the 6 canonical states', () => {
    expect(LIFECYCLE_STATES).toHaveLength(6);
  });
});
