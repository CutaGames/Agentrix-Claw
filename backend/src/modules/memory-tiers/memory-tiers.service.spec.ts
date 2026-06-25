import { MemoryTiersService } from './memory-tiers.service';

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
    delete: jest.fn(async (criteria: string | string[]) => {
      const ids = Array.isArray(criteria) ? criteria : [criteria];
      let affected = 0;
      for (const id of ids) {
        if (store.delete(String(id))) affected += 1;
      }
      return { affected };
    }),
  };
}

describe('MemoryTiersService', () => {
  it('persists keyed memories across service instances', async () => {
    const repo = createMockRepo<any>();
    const service = new MemoryTiersService(repo as any);

    const upserted = await service.upsert('user-1', {
      tier: 'semantic',
      key: 'prefs.color',
      text: 'likes teal accents',
      tags: ['prefs', 'color'],
      agent_id: 'agent-1',
      metadata: { source: 'profile' },
    });

    expect(upserted.id).toBe('user-1:semantic:prefs.color');

    const fresh = new MemoryTiersService(repo as any);
    const found = await fresh.get('user-1', upserted.id);
    const list = await fresh.list('user-1', 'semantic');
    const search = await fresh.search('user-1', 'teal');

    expect(found).toEqual({
      memory_id: 'user-1:semantic:prefs.color',
      tier: 'semantic',
      key: 'prefs.color',
      text: 'likes teal accents',
      tags: ['prefs', 'color'],
      agent_id: 'agent-1',
      ts: expect.any(Number),
      expires_at: null,
      metadata: { source: 'profile' },
    });
    expect(list).toHaveLength(1);
    expect(search).toHaveLength(1);
  });

  it('garbage collects expired working memories', async () => {
    const repo = createMockRepo<any>();
    const service = new MemoryTiersService(repo as any);
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValueOnce(1000);
    const memory = await service.upsert('user-1', {
      tier: 'working',
      text: 'temporary note',
      ttl_ms: 50,
    });

    nowSpy.mockReturnValue(2000);
    const fresh = new MemoryTiersService(repo as any);
    const stats = await fresh.stats('user-1');
    const found = await fresh.get('user-1', memory.id);

    nowSpy.mockRestore();

    expect(stats.working).toBe(0);
    expect(found).toBeNull();
  });
});
