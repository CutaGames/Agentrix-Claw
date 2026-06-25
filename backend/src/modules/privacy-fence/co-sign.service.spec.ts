import { BadRequestException } from '@nestjs/common';
import { CoSignService } from './co-sign.service';

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
    find: jest.fn(async (options?: { where?: Record<string, any>; order?: Record<string, 'ASC' | 'DESC'> }) => {
      let rows = Array.from(store.values()).map((row) => deepClone(row));
      if (options?.where) rows = rows.filter((row) => matchWhere(row, options.where!));
      if (options?.order?.createdAtMs === 'DESC') rows.sort((left, right) => Number(right.createdAtMs) - Number(left.createdAtMs));
      return rows;
    }),
    findOne: jest.fn(async (options: { where: Record<string, any> }) => {
      const row = Array.from(store.values()).find((item) => matchWhere(item, options.where));
      return row ? deepClone(row) : null;
    }),
  };
}

describe('CoSignService', () => {
  it('persists approvals across service instances', async () => {
    const repo = createMockRepo<any>();
    const service = new CoSignService(repo as any);

    const request = await service.create('user-1', {
      action_kind: 'transfer',
      resource: 'wallet:main',
      amount_cents: 1000,
      required_surfaces: ['mobile', 'desktop'],
    });
    await service.sign('user-1', request.id, { surface: 'mobile' });

    const fresh = new CoSignService(repo as any);
    const approved = await fresh.sign('user-1', request.id, { surface: 'desktop' });
    const listed = await fresh.list('user-1', 'approved');

    expect(approved.status).toBe('approved');
    expect(approved.signatures).toHaveLength(2);
    expect(listed).toHaveLength(1);
  });

  it('rejects duplicate surface signatures', async () => {
    const repo = createMockRepo<any>();
    const service = new CoSignService(repo as any);

    const request = await service.create('user-1', {
      action_kind: 'deploy',
      resource: 'release/42',
      amount_cents: 500,
      required_surfaces: ['desktop'],
      required_signatures: 1,
    });
    await service.sign('user-1', request.id, { surface: 'desktop' });

    const fresh = new CoSignService(repo as any);
    await expect(fresh.sign('user-1', request.id, { surface: 'desktop' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
