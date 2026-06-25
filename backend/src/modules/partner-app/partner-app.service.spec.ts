import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PartnerAppService } from './partner-app.service';
import { PartnerApp } from '../../entities/partner-app.entity';
import { PartnerAppUsage } from '../../entities/partner-app-usage.entity';

/**
 * Phase 6 M5 — partner-app unit tests.
 */

function makeAppRepo() {
  const store = new Map<string, PartnerApp>();
  let seq = 0;
  return {
    store,
    create(p: Partial<PartnerApp>) { return { ...p } as PartnerApp; },
    async save(row: PartnerApp) {
      if (!row.id) row.id = `app-${++seq}`;
      if (!row.createdAt) row.createdAt = new Date();
      row.updatedAt = new Date();
      store.set(row.id, { ...row });
      return store.get(row.id)!;
    },
    async findOne({ where }: { where: any }) {
      for (const r of store.values()) {
        let m = true;
        for (const k of Object.keys(where)) if ((r as any)[k] !== where[k]) { m = false; break; }
        if (m) return r;
      }
      return undefined;
    },
    async find({ where, order }: { where: any; order?: any }) {
      const out: PartnerApp[] = [];
      for (const r of store.values()) {
        let m = true;
        for (const k of Object.keys(where)) if ((r as any)[k] !== where[k]) { m = false; break; }
        if (m) out.push(r);
      }
      if (order?.createdAt === 'DESC') out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return out;
    },
  };
}

function makeUsageRepo() {
  const store = new Map<string, PartnerAppUsage>();
  let seq = 0;
  return {
    store,
    create(p: Partial<PartnerAppUsage>) { return { ...p } as PartnerAppUsage; },
    async save(row: PartnerAppUsage) {
      if (!row.id) row.id = `u-${++seq}`;
      if (!row.createdAt) row.createdAt = new Date();
      row.updatedAt = new Date();
      store.set(row.id, { ...row });
      return store.get(row.id)!;
    },
    async findOne({ where }: { where: any }) {
      for (const r of store.values()) {
        let m = true;
        for (const k of Object.keys(where)) if ((r as any)[k] !== where[k]) { m = false; break; }
        if (m) return r;
      }
      return undefined;
    },
    async find({ where, order }: { where: any; order?: any }) {
      const out: PartnerAppUsage[] = [];
      for (const r of store.values()) {
        let m = true;
        for (const k of Object.keys(where)) if ((r as any)[k] !== where[k]) { m = false; break; }
        if (m) out.push(r);
      }
      if (order?.day === 'ASC') out.sort((a, b) => a.day.localeCompare(b.day));
      return out;
    },
    createQueryBuilder() {
      const filters: any = {};
      const qb: any = {
        select() { return qb; },
        where(_sql: string, p: any) { Object.assign(filters, p); return qb; },
        async getRawOne() {
          let total = 0;
          const prefix = String(filters.p ?? '').replace('%', '');
          for (const r of store.values()) {
            if (r.partnerAppId === filters.id && r.day.startsWith(prefix)) {
              total += Number(r.costUsd);
            }
          }
          return { total: total.toFixed(4) };
        },
      };
      return qb;
    },
  };
}

describe('PartnerAppService — Phase 6 M5', () => {
  let service: PartnerAppService;
  const OWNER = 'owner-1';
  const OTHER = 'owner-2';

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerAppService,
        { provide: getRepositoryToken(PartnerApp), useValue: makeAppRepo() },
        { provide: getRepositoryToken(PartnerAppUsage), useValue: makeUsageRepo() },
      ],
    }).compile();
    service = mod.get(PartnerAppService);
  });

  it('registers app and returns api key once', async () => {
    const { app, apiKey } = await service.register(OWNER, {
      name: 'Mihoyo Genshin', slug: 'mihoyo-genshin',
    });
    expect(app.slug).toBe('mihoyo-genshin');
    expect(app.status).toBe('active');
    expect(apiKey).toMatch(/^agx_[A-Za-z0-9_-]{30,}$/);
    expect(app.apiKeyHash).not.toBe(apiKey);
  });

  it('rejects duplicate slug', async () => {
    await service.register(OWNER, { name: 'A', slug: 'dupe' });
    await expect(service.register(OWNER, { name: 'B', slug: 'dupe' })).rejects.toThrow(/slug/);
  });

  it('rejects invalid slug + bad scope', async () => {
    await expect(service.register(OWNER, { name: 'A', slug: '_bad' })).rejects.toThrow(/slug/);
    await expect(
      service.register(OWNER, { name: 'A', slug: 'okok', scopes: ['evil' as any] }),
    ).rejects.toThrow(/scope/);
  });

  it('authenticates by raw key, fails on wrong key + non-active', async () => {
    const { app, apiKey } = await service.register(OWNER, { name: 'A', slug: 'svcs-a' });
    const back = await service.authenticate(apiKey);
    expect(back.id).toBe(app.id);
    await expect(service.authenticate('agx_' + 'x'.repeat(30))).rejects.toThrow(/recognized/);
    await service.setStatus(app.id, OWNER, 'suspended');
    await expect(service.authenticate(apiKey)).rejects.toThrow(/suspended/);
  });

  it('rotateKey changes hash, old key fails, new key works', async () => {
    const { app, apiKey: old } = await service.register(OWNER, { name: 'A', slug: 'rot-a' });
    const { apiKey: fresh } = await service.rotateKey(app.id, OWNER);
    expect(fresh).not.toBe(old);
    await expect(service.authenticate(old)).rejects.toThrow();
    const back = await service.authenticate(fresh);
    expect(back.id).toBe(app.id);
  });

  it('refuses cross-owner mutation', async () => {
    const { app } = await service.register(OWNER, { name: 'A', slug: 'cross-a' });
    await expect(service.getOwn(app.id, OTHER)).rejects.toThrow(/not your/);
  });

  it('records calls with per_call billing and accumulates cost', async () => {
    const { app } = await service.register(OWNER, {
      name: 'A', slug: 'rec-a', billingMode: 'per_call', perCallUsd: 0.01, monthlyCapUsd: 100,
    });
    const u1 = await service.recordCall(app.id);
    expect(u1.calls).toBe(1);
    expect(Number(u1.costUsd)).toBeCloseTo(0.01, 4);
    const u2 = await service.recordCall(app.id);
    expect(u2.calls).toBe(2);
    expect(Number(u2.costUsd)).toBeCloseTo(0.02, 4);
  });

  it('enforces monthlyCapUsd', async () => {
    const { app } = await service.register(OWNER, {
      name: 'A', slug: 'cap-a', billingMode: 'per_call', perCallUsd: 1, monthlyCapUsd: 2,
    });
    await service.recordCall(app.id);
    await service.recordCall(app.id);
    await expect(service.recordCall(app.id)).rejects.toThrow(/monthly_cap_exceeded/);
  });

  it('updateBilling normalizes amounts', async () => {
    const { app } = await service.register(OWNER, { name: 'A', slug: 'bill-a' });
    const updated = await service.updateBilling(app.id, OWNER, {
      billingMode: 'flat', monthlyFlatUsd: 49.5, perCallUsd: 0,
    });
    expect(updated.billingMode).toBe('flat');
    expect(updated.monthlyFlatUsd).toBe('49.50');
  });
});
