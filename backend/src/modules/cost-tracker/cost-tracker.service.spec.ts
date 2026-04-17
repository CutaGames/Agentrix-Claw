import { CostTrackerService } from './cost-tracker.service';

describe('CostTrackerService', () => {
  describe('without persistence (no costRepo)', () => {
    let service: CostTrackerService;

    beforeEach(() => {
      service = new CostTrackerService();
    });

    it('calculates Claude Sonnet 4 cost', () => {
      // 1M in @ $3 + 500k out @ $15 = $3 + $7.5 = $10.5
      const cost = service.calculateCost('claude-sonnet-4-20250514', 1_000_000, 500_000);
      expect(cost).toBeCloseTo(10.5, 5);
    });

    it('calculates GPT-4o cost', () => {
      // 100k in @ $2.5 + 100k out @ $10 = 0.25 + 1 = 1.25
      const cost = service.calculateCost('gpt-4o', 100_000, 100_000);
      expect(cost).toBeCloseTo(1.25, 5);
    });

    it('uses fallback pricing for unknown models', () => {
      const cost = service.calculateCost('totally-made-up-model', 1_000_000, 1_000_000);
      // Fallback: $3 in + $15 out per million
      expect(cost).toBeCloseTo(18, 5);
    });

    it('includes cache read/write costs when supported', () => {
      // Sonnet 4: cache read $0.3/M, cache write $3.75/M
      const cost = service.calculateCost(
        'claude-sonnet-4-20250514',
        0,
        0,
        1_000_000, // cache read
        1_000_000, // cache write
      );
      expect(cost).toBeCloseTo(0.3 + 3.75, 5);
    });

    it('records session cost and accumulates totals', () => {
      service.recordCost('sess-1', 'gpt-4o', 100_000, 100_000);
      service.recordCost('sess-1', 'gpt-4o', 50_000, 50_000);
      const total = service.getSessionTotal('sess-1');
      // Two calls of $1.25 → no, 100k+100k → 1.25, 50k+50k → 0.625
      expect(total).toBeCloseTo(1.25 + 0.625, 5);
      expect(service.getSessionRecords('sess-1')).toHaveLength(2);
    });

    it('returns zero from getUserCostInRange when no repo is bound', async () => {
      const result = await service.getUserCostInRange('u1', new Date(0), new Date());
      expect(result).toEqual({
        totalUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        callCount: 0,
      });
    });
  });

  describe('with mocked costRepo', () => {
    it('persists a row when recordCost is called with context', async () => {
      const saved: any[] = [];
      const repo: any = {
        create: jest.fn((data: any) => ({ ...data })),
        save: jest.fn((entity: any) => {
          saved.push(entity);
          return Promise.resolve(entity);
        }),
        createQueryBuilder: jest.fn(),
      };
      const service = new CostTrackerService(repo);
      service.recordCost('sess-2', 'gpt-4o', 1000, 1000, 0, 0, {
        userId: 'user-x',
        instanceId: 'inst-y',
        provider: 'openai',
        routingReason: 'TEST',
      });
      // Allow microtask queue to flush the fire-and-forget save
      await new Promise((r) => setImmediate(r));
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(saved[0]).toMatchObject({
        userId: 'user-x',
        sessionId: 'sess-2',
        instanceId: 'inst-y',
        provider: 'openai',
        routingReason: 'TEST',
        model: 'gpt-4o',
      });
    });

    it('aggregates getUserCostInRange via query builder', async () => {
      const repo: any = {
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({
            total_usd: '12.5',
            total_in: '1000',
            total_out: '500',
            calls: '7',
          }),
        })),
      };
      const service = new CostTrackerService(repo);
      const result = await service.getUserCostInRange(
        'user-z',
        new Date('2026-01-01'),
        new Date('2026-02-01'),
      );
      expect(result).toEqual({
        totalUsd: 12.5,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        callCount: 7,
      });
    });

    it('does not throw when repo.save rejects', async () => {
      const repo: any = {
        create: jest.fn((d: any) => d),
        save: jest.fn().mockRejectedValue(new Error('db down')),
        createQueryBuilder: jest.fn(),
      };
      const service = new CostTrackerService(repo);
      expect(() => service.recordCost('sess-3', 'gpt-4o', 100, 100)).not.toThrow();
      // Allow promise rejection to be caught by the .catch in the service
      await new Promise((r) => setImmediate(r));
      expect(repo.save).toHaveBeenCalled();
    });
  });
});
