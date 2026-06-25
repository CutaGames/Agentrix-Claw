import { UserPlanResolverService } from './user-plan-resolver.service';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

function makeRepo(payments: Array<Partial<Payment> & { metadata?: any }>) {
  return {
    findOne: jest.fn(async ({ where }: any) => {
      const filtered = payments.filter((p) => p.userId === where.userId && p.status === where.status);
      return filtered.sort((a, b) => (b.createdAt as any) - (a.createdAt as any))[0] ?? null;
    }),
    find: jest.fn(async ({ where, take }: any) => {
      // Honor the MoreThan(cutoff) filter informally — tests pass cutoff via createdAt.
      const cutoff: Date | undefined = where.createdAt?._value;
      let result = payments.filter((p) => p.userId === where.userId && p.status === where.status);
      if (cutoff) result = result.filter((p) => (p.createdAt as Date) > cutoff);
      result = result.sort((a, b) => (b.createdAt as any) - (a.createdAt as any));
      return result.slice(0, take ?? 20);
    }),
  } as any;
}

const NOW = Date.now();
const day = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000);

const proPay = (userId: string, sku = 'pro_monthly', daysAgo = 5): Partial<Payment> => ({
  userId, status: PaymentStatus.COMPLETED,
  createdAt: day(daysAgo) as any,
  metadata: { planSku: sku },
});

describe('UserPlanResolverService (Phase 2 W3 plan tier)', () => {
  it('returns free when user has no payments', async () => {
    const svc = new UserPlanResolverService(makeRepo([]));
    expect(await svc.getPlan('u1')).toBe('free');
  });

  it('returns free when userId blank', async () => {
    const svc = new UserPlanResolverService(makeRepo([]));
    expect(await svc.getPlan('')).toBe('free');
  });

  it('returns pro for recent pro_monthly payment', async () => {
    const svc = new UserPlanResolverService(makeRepo([proPay('u1', 'pro_monthly', 3)]));
    expect(await svc.getPlan('u1')).toBe('pro');
  });

  it('returns pro_plus for recent pro_plus_yearly', async () => {
    const svc = new UserPlanResolverService(makeRepo([proPay('u1', 'pro_plus_yearly', 10)]));
    expect(await svc.getPlan('u1')).toBe('pro_plus');
  });

  it('returns enterprise for any enterprise sku ever', async () => {
    const svc = new UserPlanResolverService(makeRepo([proPay('u1', 'enterprise_annual', 365)]));
    expect(await svc.getPlan('u1')).toBe('enterprise');
  });

  it('returns free when plan payment is older than 32-day window', async () => {
    const svc = new UserPlanResolverService(makeRepo([proPay('u1', 'pro_monthly', 60)]));
    expect(await svc.getPlan('u1')).toBe('free');
  });

  it('falls back to free on repository exception', async () => {
    const repo: any = { findOne: jest.fn().mockRejectedValue(new Error('db down')) };
    const svc = new UserPlanResolverService(repo);
    expect(await svc.getPlan('u1')).toBe('free');
  });

  it('uses skuId metadata as fallback when planSku not set', async () => {
    const repo = makeRepo([{
      userId: 'u1', status: PaymentStatus.COMPLETED, createdAt: day(2) as any,
      metadata: { skuId: 'PRO_PLUS_MONTHLY' },
    }]);
    const svc = new UserPlanResolverService(repo);
    expect(await svc.getPlan('u1')).toBe('pro_plus');
  });
});
