import { BadRequestException } from '@nestjs/common';
import { A2AMatchingService } from './a2a-matching.service';

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
      if (options?.where) {
        rows = rows.filter((row) => matchWhere(row, options.where!));
      }
      if (options?.order?.createdAtMs === 'DESC') {
        rows.sort((left, right) => Number(right.createdAtMs || 0) - Number(left.createdAtMs || 0));
      }
      return rows;
    }),
    findOne: jest.fn(async (options: { where: Record<string, any> }) => {
      const rows = Array.from(store.values()).filter((row) => matchWhere(row, options.where));
      return rows[0] ? deepClone(rows[0]) : null;
    }),
  };
}

describe('A2AMatchingService', () => {
  it('persists task, bids, trades, and settlement across service instances', async () => {
    const taskRepo = createMockRepo<any>();
    const bidRepo = createMockRepo<any>();
    const tradeRepo = createMockRepo<any>();
    const service = new A2AMatchingService(taskRepo as any, bidRepo as any, tradeRepo as any);

    const task = await service.postTask('buyer-1', {
      title: 'Need market research',
      budget_cents: 1500,
      skill_tags: ['research'],
    });
    const bid = await service.bid('seller-1', task.id, {
      price_cents: 1200,
      eta_minutes: 45,
      note: 'can deliver today',
    });
    const trade = await service.acceptBid('buyer-1', task.id, bid.id);
    await service.deliver('seller-1', trade.id);
    await service.settle('buyer-1', trade.id);

    const fresh = new A2AMatchingService(taskRepo as any, bidRepo as any, tradeRepo as any);
    const storedTask = await fresh.getTask(task.id);
    const bids = await fresh.listBids(task.id);
    const trades = await fresh.listTrades('buyer-1');
    const stats = await fresh.stats();

    expect(storedTask.status).toBe('settled');
    expect(storedTask.matched_bid_id).toBe(bid.id);
    expect(bids[0].status).toBe('accepted');
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe('settled');
    expect(stats.total_tasks).toBe(1);
    expect(stats.total_bids).toBe(1);
    expect(stats.total_trades).toBe(1);
    expect(stats.gmv_cents).toBe(1200);
  });

  it('rejects bidding on your own task', async () => {
    const taskRepo = createMockRepo<any>();
    const bidRepo = createMockRepo<any>();
    const tradeRepo = createMockRepo<any>();
    const service = new A2AMatchingService(taskRepo as any, bidRepo as any, tradeRepo as any);

    const task = await service.postTask('buyer-1', {
      title: 'Need copywriting',
      budget_cents: 800,
    });

    await expect(
      service.bid('buyer-1', task.id, {
        price_cents: 500,
        eta_minutes: 30,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
