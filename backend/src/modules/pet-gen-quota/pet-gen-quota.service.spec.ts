import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PetGenQuotaService } from './pet-gen-quota.service';
import { PetGenQuota } from '../../entities/pet-gen-quota.entity';

/**
 * BE-T2.1 / 2.2 / 2.4 — Phase 2 W1 配额账本骨架测试。
 */
describe('PetGenQuotaService (Phase 2 W1)', () => {
  let service: PetGenQuotaService;
  const store = new Map<string, PetGenQuota>();

  const repo = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id) return store.get(where.id) || null;
      for (const r of store.values()) {
        if (r.userId === where.userId && r.period === where.period) return r;
      }
      return null;
    }),
    create: jest.fn((p: Partial<PetGenQuota>) => ({
      id: `q-${store.size + 1}`,
      ...p,
    } as PetGenQuota)),
    save: jest.fn(async (p: PetGenQuota) => {
      const row = { ...p, updatedAt: new Date() } as PetGenQuota;
      store.set(row.id, row);
      return row;
    }),
  };

  beforeEach(async () => {
    store.clear();
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PetGenQuotaService,
        { provide: getRepositoryToken(PetGenQuota), useValue: repo },
      ],
    }).compile();
    service = mod.get(PetGenQuotaService);
  });

  it('currentPeriod returns YYYY-MM (UTC)', () => {
    const p = PetGenQuotaService.currentPeriod(new Date(Date.UTC(2026, 4, 6)));
    expect(p).toBe('2026-05');
  });

  it('getOrCreate creates a free row with included=3, used=0', async () => {
    const r = await service.getOrCreate('u1');
    expect(r.userId).toBe('u1');
    expect(r.plan).toBe('free');
    expect(r.included).toBe(3);
    expect(r.used).toBe(0);
    expect(r.reserved).toBe(0);
  });

  it('getOrCreate is idempotent for same period', async () => {
    const a = await service.getOrCreate('u1');
    const b = await service.getOrCreate('u1');
    expect(a.id).toBe(b.id);
  });

  it('getOrCreate respects plan-tier defaults (pro=20)', async () => {
    const r = await service.getOrCreate('u-pro', 'pro');
    expect(r.included).toBe(20);
  });

  it('BE-T2.4: free plan triggers overage on the 4th reserve', async () => {
    const a = await service.tryReserve('u1');
    expect(a.mode).toBe('included');
    const b = await service.tryReserve('u1');
    expect(b.mode).toBe('included');
    const c = await service.tryReserve('u1');
    expect(c.mode).toBe('included');
    const d = await service.tryReserve('u1');
    expect(d.mode).toBe('overage');
  });

  it('BE-T2.1: confirm(included) increments used, releases reserved', async () => {
    const r = await service.tryReserve('u1');
    const confirmed = await service.confirm(r.quotaId, 'included');
    expect(confirmed.used).toBe(1);
    expect(confirmed.reserved).toBe(0);
    expect(confirmed.overageUsed).toBe(0);
  });

  it('BE-T2.1: confirm(overage) increments overageUsed, not used', async () => {
    // burn through included quota
    await service.tryReserve('u1').then((r) => service.confirm(r.quotaId, 'included'));
    await service.tryReserve('u1').then((r) => service.confirm(r.quotaId, 'included'));
    await service.tryReserve('u1').then((r) => service.confirm(r.quotaId, 'included'));
    const r4 = await service.tryReserve('u1');
    expect(r4.mode).toBe('overage');
    const confirmed = await service.confirm(r4.quotaId, 'overage');
    expect(confirmed.used).toBe(3);
    expect(confirmed.overageUsed).toBe(1);
    expect(confirmed.reserved).toBe(0);
  });

  it('BE-T2.2: refund releases reserved without affecting used', async () => {
    const r = await service.tryReserve('u1');
    const refunded = await service.refund(r.quotaId);
    expect(refunded.used).toBe(0);
    expect(refunded.reserved).toBe(0);
    expect(refunded.overageUsed).toBe(0);
  });

  it('refund of unknown quotaId throws', async () => {
    await expect(service.refund('does-not-exist')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirm without reservation throws', async () => {
    const r = await service.getOrCreate('u1');
    await expect(service.confirm(r.id, 'included')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enterprise plan tryReserve throws (must use enterprise quota module)', async () => {
    await expect(service.tryReserve('u-ent', 'enterprise')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pro_plus has unlimited included (-1) and never enters overage', async () => {
    const r = await service.tryReserve('u-pro+', 'pro_plus');
    expect(r.mode).toBe('included');
    expect(r.remainingIncluded).toBe(-1);
  });

  it('toDto exposes safe fields', async () => {
    const r = await service.getOrCreate('u1');
    const dto = service.toDto(r);
    expect(dto).toMatchObject({
      user_id: 'u1',
      plan: 'free',
      included: 3,
      used: 0,
      reserved: 0,
      overage_used: 0,
      overage_unit_price_usd: 0.5,
      remaining_included: 3,
    });
  });
});
