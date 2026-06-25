import { BadRequestException } from '@nestjs/common';
import { PrivacyFenceService } from './privacy-fence.service';

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
      if (options?.where) rows = rows.filter((row) => matchWhere(row, options.where!));
      if (options?.order?.tsMs === 'DESC') rows.sort((left, right) => Number(right.tsMs) - Number(left.tsMs));
      if (typeof options?.take === 'number') rows = rows.slice(0, options.take);
      return rows;
    }),
    findOne: jest.fn(async (options: { where: Record<string, any> }) => {
      const row = Array.from(store.values()).find((item) => matchWhere(item, options.where));
      return row ? deepClone(row) : null;
    }),
  };
}

describe('PrivacyFenceService', () => {
  it('persists items, grants, and audit logs across service instances', async () => {
    const itemRepo = createMockRepo<any>();
    const grantRepo = createMockRepo<any>();
    const auditRepo = createMockRepo<any>();
    const service = new PrivacyFenceService(itemRepo as any, grantRepo as any, auditRepo as any);

    const item = await service.write('user-1', {
      category: 'health',
      text: 'resting HR improved',
      family_partition: 'family-1',
    });
    const grant = await service.grant('user-1', {
      item_id: item.id,
      grantee_user_id: 'user-2',
    });

    const fresh = new PrivacyFenceService(itemRepo as any, grantRepo as any, auditRepo as any);
    const read = await fresh.read('user-2', item.id);
    const audit = await fresh.recentAudit(10);

    expect(grant.itemId).toBe(item.id);
    expect(read.text).toBe('resting HR improved');
    expect(audit.length).toBeGreaterThanOrEqual(3);
    expect(audit.some((entry) => entry.action === 'read_granted')).toBe(true);
  });

  it('blocks reads after revoking a grant', async () => {
    const itemRepo = createMockRepo<any>();
    const grantRepo = createMockRepo<any>();
    const auditRepo = createMockRepo<any>();
    const service = new PrivacyFenceService(itemRepo as any, grantRepo as any, auditRepo as any);

    const item = await service.write('user-1', { category: 'financial', text: 'budget note' });
    const grant = await service.grant('user-1', { item_id: item.id, grantee_user_id: 'user-2' });
    await service.revokeGrant('user-1', grant.id);

    const fresh = new PrivacyFenceService(itemRepo as any, grantRepo as any, auditRepo as any);
    await expect(fresh.read('user-2', item.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});
