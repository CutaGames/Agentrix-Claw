import { BadRequestException } from '@nestjs/common';
import { SkillListingsService } from './skill-listings.service';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function matchWhere<T extends Record<string, any>>(row: T, where: Record<string, any>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function createMockRepo<T extends Record<string, any>>() {
  const store = new Map<string, T>();

  return {
    create: jest.fn((input: Partial<T>) => ({ ...input } as T)),
    save: jest.fn(async (input: T) => {
      const saved = deepClone(input);
      store.set(String(saved.id), saved);
      return deepClone(saved);
    }),
    find: jest.fn(async (options?: { where?: Record<string, any>; order?: Record<string, 'ASC' | 'DESC'>; take?: number }) => {
      let rows = Array.from(store.values()).map((row) => deepClone(row));
      if (options?.where) {
        rows = rows.filter((row) => matchWhere(row, options.where!));
      }
      if (options?.order?.tsMs === 'DESC') {
        rows.sort((left, right) => Number(right.tsMs) - Number(left.tsMs));
      }
      if (typeof options?.take === 'number') {
        rows = rows.slice(0, options.take);
      }
      return rows;
    }),
    findOne: jest.fn(async (options: { where: Record<string, any> }) => {
      const rows = Array.from(store.values()).filter((row) => matchWhere(row, options.where));
      return rows[0] ? deepClone(rows[0]) : null;
    }),
  };
}

describe('SkillListingsService', () => {
  it('persists listing review, install, invoke, and earnings across service instances', async () => {
    const listingRepo = createMockRepo<any>();
    const invokeRepo = createMockRepo<any>();
    const service = new SkillListingsService(listingRepo as any, invokeRepo as any);

    const listing = await service.createListing('dev-1', {
      name: 'Smart Summarizer',
      slug: 'smart-summarizer',
      price_cents: 500,
      revenue_split_bps: 2000,
      category: 'productivity',
    });

    await service.submitForReview('dev-1', listing.id);
    await service.reviewListing(listing.id, { approve: true, note: 'looks good' });
    await service.install('user-2', listing.id);
    const invoke = await service.invoke('user-2', listing.id);

    expect(invoke.platform_share_cents).toBe(100);
    expect(invoke.developer_share_cents).toBe(400);

    const fresh = new SkillListingsService(listingRepo as any, invokeRepo as any);
    const stored = await fresh.get(listing.id);
    const earnings = await fresh.developerEarnings('dev-1');
    const recent = await fresh.recentInvokes(listing.id);

    expect(stored.status).toBe('approved');
    expect(stored.install_count).toBe(1);
    expect(stored.invoke_count).toBe(1);
    expect(earnings.total_revenue_cents).toBe(500);
    expect(earnings.developer_revenue_cents).toBe(400);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(invoke.id);
  });

  it('rejects duplicate slugs across service instances', async () => {
    const listingRepo = createMockRepo<any>();
    const invokeRepo = createMockRepo<any>();
    const service = new SkillListingsService(listingRepo as any, invokeRepo as any);

    await service.createListing('dev-1', {
      name: 'One',
      slug: 'dup-slug',
      price_cents: 100,
    });

    const fresh = new SkillListingsService(listingRepo as any, invokeRepo as any);
    await expect(
      fresh.createListing('dev-2', {
        name: 'Two',
        slug: 'dup-slug',
        price_cents: 200,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
