import { VitalsBusService } from './vitals-bus.service';

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

describe('VitalsBusService', () => {
  it('persists reactions across service instances', async () => {
    const repo = createMockRepo<any>();
    const pet = {
      setEmotion: jest.fn(async (_userId: string, input: any) => ({
        emotion: input.emotion,
        emotion_intensity: input.intensity,
      })),
      toDto: jest.fn((value: any) => value),
    };

    const service = new VitalsBusService(repo as any, pet as any);
    const ingest = await service.ingest('user-1', {
      metric: 'hr',
      value: 120,
      source_surface: 'watch',
      ts: 1000,
    });

    expect(ingest.ok).toBe(true);
    expect(ingest.reaction?.emotion).toBe('concerned');
    expect(pet.setEmotion).toHaveBeenCalledWith('user-1', {
      emotion: 'concerned',
      intensity: 2,
    });

    const fresh = new VitalsBusService(repo as any, pet as any);
    const list = await fresh.list('user-1');

    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      metric: 'hr',
      value: 120,
      source_device_id: null,
      source_surface: 'watch',
      ts: 1000,
      reaction: { emotion: 'concerned', intensity: 2, reason: 'hr=120 > 100' },
    });
  });

  it('filters by user and keeps newest events first', async () => {
    const repo = createMockRepo<any>();
    const pet = {
      setEmotion: jest.fn(async (_userId: string, input: any) => input),
      toDto: jest.fn((value: any) => value),
    };

    const service = new VitalsBusService(repo as any, pet as any);
    await service.ingest('user-1', { metric: 'joy', value: 90, ts: 1000 });
    await service.ingest('user-2', { metric: 'stress', value: 85, ts: 1500 });
    await service.ingest('user-1', { metric: 'sleep', value: 88, ts: 2000 });

    const fresh = new VitalsBusService(repo as any, pet as any);
    const list = await fresh.list('user-1', 10);

    expect(list).toHaveLength(2);
    expect(list[0].metric).toBe('sleep');
    expect(list[1].metric).toBe('joy');
  });
});
