import { AutoEarnTimelineService } from './auto-earn-timeline.service';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function matchWhere<T extends Record<string, any>>(row: T, where: Record<string, any>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function createMockRepo<T extends Record<string, any>>() {
  const store = new Map<string, T>();
  let sequence = 0;

  return {
    create: jest.fn((input: Partial<T>) => ({ ...input } as T)),
    save: jest.fn(async (input: T) => {
      const id = input.id ?? `row-${++sequence}`;
      const saved = deepClone({ ...input, id } as T);
      store.set(String(id), saved);
      return deepClone(saved);
    }),
    find: jest.fn(async (options?: { where?: Record<string, any>; order?: Record<string, 'ASC' | 'DESC'>; take?: number }) => {
      let rows = Array.from(store.values()).map((row) => deepClone(row));
      if (options?.where) {
        rows = rows.filter((row) => matchWhere(row, options.where!));
      }
      if (options?.order?.eventTsMs === 'DESC') {
        rows.sort((left, right) => Number(right.eventTsMs) - Number(left.eventTsMs));
      }
      if (typeof options?.take === 'number') {
        rows = rows.slice(0, options.take);
      }
      return rows;
    }),
  };
}

describe('AutoEarnTimelineService', () => {
  it('persists earnings across service instances and computes summary', async () => {
    const repo = createMockRepo<any>();
    const service = new AutoEarnTimelineService(repo as any);

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1001)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(2001)
      .mockReturnValue(3000);

    const first = await service.record('user-1', {
      source: 'skill_invoke',
      amount_cents: 1200,
      ref_id: 'skill-1',
      note: 'first',
    });
    const second = await service.record('user-1', {
      source: 'commission',
      amount_cents: 300,
      ref_id: 'trade-1',
    });

    expect(first.id).toMatch(/^earn_/);
    expect(second.id).toMatch(/^earn_/);

    const fresh = new AutoEarnTimelineService(repo as any);
    const summary = await fresh.summary('user-1');
    const timeline = await fresh.timeline('user-1');

    nowSpy.mockRestore();

    expect(summary.total_cents).toBe(1500);
    expect(summary.by_source.skill_invoke).toBe(1200);
    expect(summary.by_source.commission).toBe(300);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].id).toBe(second.id);
  });

  it('filters timeline by source and user', async () => {
    const repo = createMockRepo<any>();
    const service = new AutoEarnTimelineService(repo as any);

    await service.record('user-1', { source: 'skill_invoke', amount_cents: 200 });
    await service.record('user-1', { source: 'a2a_trade', amount_cents: 500 });
    await service.record('user-2', { source: 'skill_invoke', amount_cents: 900 });

    const fresh = new AutoEarnTimelineService(repo as any);
    const filtered = await fresh.timeline('user-1', { source: 'skill_invoke', limit: 10 });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].source).toBe('skill_invoke');
    expect(filtered[0].userId).toBe('user-1');
  });
});
