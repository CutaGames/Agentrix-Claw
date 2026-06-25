/**
 * Phase 2 Cross-Module E2E Tests
 *
 * Covers (from PRD_PET_PHASED_TEST_PLAN §5.3):
 *   E2E-2.1  3 free generations → 4th must trigger overage paywall
 *   E2E-2.4  Generation failure → quota auto-refund (reserved released, used unchanged)
 *   E2E-2.5  NSFW prompt → moderation immediately denies, quota NOT consumed
 *
 * Implementation strategy: in-process test driver that wires
 * PetGenQuotaService + ModerationService + PetOverageBillingService together
 * with in-memory mock repositories. This is a TRUE end-to-end of the
 * Phase 2 W1+W3 contracts without any external dependencies (Stripe / Replicate
 * are simulated by direct service calls that mimic webhook/predictor effects).
 */

import { ModerationService } from '../moderation/moderation.service';
import { PetGenQuotaService } from '../pet-gen-quota/pet-gen-quota.service';
import { PetOverageBillingService } from '../pet-gen-quota/pet-overage-billing.service';
import { PetGenQuota } from '../../entities/pet-gen-quota.entity';
import { ModerationLog } from '../../entities/moderation-log.entity';

// ── In-memory PetGenQuota repo ────────────────────────────────────────────
function makeQuotaRepo() {
  const rows = new Map<string, PetGenQuota>();
  let seq = 0;
  return {
    rows,
    create: (p: Partial<PetGenQuota>) =>
      ({
        id: `q-${++seq}`,
        userId: '',
        period: '',
        plan: 'free' as const,
        included: 3,
        used: 0,
        overageUsed: 0,
        reserved: 0,
        overageUnitPriceUsd: '0.50' as any,
        updatedAt: new Date(),
        ...(p as any),
      } as PetGenQuota),
    save: async (r: PetGenQuota) => {
      rows.set(r.id, r);
      return r;
    },
    findOne: async (opts: any) => {
      if (opts.where?.id) return rows.get(opts.where.id) ?? null;
      if (opts.where?.userId && opts.where?.period) {
        for (const v of rows.values()) {
          if (v.userId === opts.where.userId && v.period === opts.where.period) return v;
        }
      }
      return null;
    },
  } as any;
}

// ── In-memory ModerationLog repo ──────────────────────────────────────────
function makeLogRepo() {
  const logs: any[] = [];
  return {
    logs,
    create: (p: any) => ({ id: `log-${logs.length}`, ...p }),
    save: async (r: any) => { logs.push(r); return r; },
  } as any;
}

const USER = 'e2e-user-phase2';

describe('Phase 2 cross-module E2E', () => {
  let quotaRepo: ReturnType<typeof makeQuotaRepo>;
  let logRepo: ReturnType<typeof makeLogRepo>;
  let quota: PetGenQuotaService;
  let moderation: ModerationService;
  let billing: PetOverageBillingService;

  beforeEach(() => {
    quotaRepo = makeQuotaRepo();
    logRepo = makeLogRepo();
    quota = new PetGenQuotaService(quotaRepo);
    moderation = new ModerationService(logRepo);
    billing = new PetOverageBillingService(quota);
  });

  /**
   * E2E-2.1 — Free user: first 3 generations succeed within included quota,
   *           4th attempt returns mode='overage' so the UI can show the paywall.
   */
  describe('E2E-2.1: Free 3 included → 4th overage', () => {
    it('reserves+confirms 3 included and the 4th is overage', async () => {
      // Generations 1-3
      for (let i = 1; i <= 3; i++) {
        const reservation = await quota.tryReserve(USER, 'free');
        expect(reservation.mode).toBe('included');
        expect(reservation.remainingIncluded).toBe(3 - i); // post-reserve
        await quota.confirm(reservation.quotaId, 'included');
      }
      // After 3 successful, account state
      const after3 = await quota.get(USER);
      expect(after3?.used).toBe(3);
      expect(after3?.reserved).toBe(0);
      expect(after3?.overageUsed).toBe(0);

      // Generation 4
      const fourth = await quota.tryReserve(USER, 'free');
      expect(fourth.mode).toBe('overage');
      expect(fourth.overageUnitPriceUsd).toBe(0.5);
      expect(fourth.remainingIncluded).toBe(0);

      // Simulate Stripe webhook firing for the overage charge
      const webhookOut = await billing.handlePaymentIntentSucceeded({
        paymentIntentId: 'pi_overage_001',
        amount: 0.5,
        metadata: { purpose: 'pet_overage', quotaId: fourth.quotaId },
      });
      expect(webhookOut.handled).toBe(true);

      const after4 = await quota.get(USER);
      expect(after4?.used).toBe(3);
      expect(after4?.overageUsed).toBe(1);
      expect(after4?.reserved).toBe(0);
    });
  });

  /**
   * E2E-2.4 — Provider fails: refund() releases the reserved slot without
   *           bumping `used`. User can retry within their original 3.
   */
  describe('E2E-2.4: failure → quota auto-refund', () => {
    it('refund releases reserved without consuming included', async () => {
      const r1 = await quota.tryReserve(USER, 'free');
      expect(r1.mode).toBe('included');
      // Simulate provider failure
      await quota.refund(r1.quotaId);

      const after = await quota.get(USER);
      expect(after?.used).toBe(0);
      expect(after?.reserved).toBe(0);
      expect(after?.overageUsed).toBe(0);

      // Subsequent reservation should still see all 3 included available
      const r2 = await quota.tryReserve(USER, 'free');
      expect(r2.mode).toBe('included');
      expect(r2.remainingIncluded).toBe(2);
    });
  });

  /**
   * E2E-2.5 — NSFW prompt blocked at moderation, BEFORE any quota reservation.
   *           Verify: deny decision + log written + quota untouched.
   */
  describe('E2E-2.5: NSFW prompt → instant deny, quota untouched', () => {
    it('checkPrompt denies a NSFW prompt and quota stays at 0/0/0', async () => {
      const result = await moderation.checkPrompt({
        userId: USER,
        prompt: 'pornographic anime girl in nude pose',
        refId: null,
      });
      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('nsfw_keyword');

      // Moderation log written
      expect(logRepo.logs.length).toBe(1);
      expect(logRepo.logs[0].kind).toBe('prompt');
      expect(logRepo.logs[0].decision).toBe('deny');

      // Quota untouched (caller should NOT have called tryReserve)
      const q = await quota.get(USER);
      expect(q).toBeNull();
    });

    it('safe prompt allows + caller proceeds with reservation', async () => {
      const result = await moderation.checkPrompt({
        userId: USER,
        prompt: 'a cute orange tabby kitten with big eyes',
        refId: null,
      });
      expect(result.decision).toBe('allow');

      // Caller proceeds with quota
      const r = await quota.tryReserve(USER, 'free');
      expect(r.mode).toBe('included');
      expect(r.remainingIncluded).toBe(2);
    });
  });

  /**
   * Composite check — 3 successes + 1 NSFW (denied without quota) + 1 overage.
   * Verifies the modules don't conflict on shared user state.
   */
  describe('composite — 3 ok + 1 nsfw + 1 overage', () => {
    it('aggregate state matches expectation', async () => {
      for (let i = 0; i < 3; i++) {
        const m = await moderation.checkPrompt({ userId: USER, prompt: `cute robot dog #${i}`, refId: null });
        expect(m.decision).toBe('allow');
        const r = await quota.tryReserve(USER, 'free');
        await quota.confirm(r.quotaId, 'included');
      }
      // NSFW attempt — moderation rejects, no quota change
      const nsfw = await moderation.checkPrompt({ userId: USER, prompt: 'rape scene depiction', refId: null });
      expect(nsfw.decision).toBe('deny');

      // Overage
      const r4 = await quota.tryReserve(USER, 'free');
      expect(r4.mode).toBe('overage');
      await billing.handlePaymentIntentSucceeded({
        paymentIntentId: 'pi_x', amount: 0.5,
        metadata: { purpose: 'pet_overage', quotaId: r4.quotaId },
      });

      const final = await quota.get(USER);
      expect(final).toMatchObject({ used: 3, overageUsed: 1, reserved: 0 });
      // 4 prompt logs total (3 allow + 1 deny)
      expect(logRepo.logs.filter((l) => l.kind === 'prompt')).toHaveLength(4);
    });
  });
});
