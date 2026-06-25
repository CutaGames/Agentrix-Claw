import { SplitBudgetService } from './split-budget.service';

type StoredEntity = {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: any;
};

const createMockRepository = <T extends StoredEntity>(prefix: string) => {
  const store = new Map<string, T>();
  let sequence = 0;

  const repository = {
    create: jest.fn((data: Partial<T>) => ({ ...data } as T)),
    save: jest.fn(async (entity: Partial<T>) => {
      const id = entity.id ?? `${prefix}-${++sequence}`;
      const existing = store.get(id);
      const now = new Date();
      const saved = {
        ...existing,
        ...entity,
        id,
        createdAt: existing?.createdAt ?? entity.createdAt ?? now,
        updatedAt: now,
      } as T;
      store.set(id, saved);
      return saved;
    }),
    find: jest.fn(async (options?: { where?: Partial<T>; order?: { createdAt?: 'ASC' | 'DESC' }; take?: number }) => {
      let items = [...store.values()];
      if (options?.where) {
        items = items.filter((item) =>
          Object.entries(options.where ?? {}).every(([key, value]) => item[key] === value),
        );
      }
      if (options?.order?.createdAt === 'DESC') {
        items.sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0));
      }
      if (typeof options?.take === 'number') {
        items = items.slice(0, options.take);
      }
      return items;
    }),
    findOne: jest.fn(async (options?: { where?: Partial<T> }) => {
      const items = await repository.find(options);
      return items[0] ?? null;
    }),
  };

  return repository;
};

const createService = (repositories?: {
  splitPlanRepository?: ReturnType<typeof createMockRepository>;
  budgetPoolRepository?: ReturnType<typeof createMockRepository>;
  auditLogRepository?: ReturnType<typeof createMockRepository>;
}) => {
  const splitPlanRepository = repositories?.splitPlanRepository ?? createMockRepository('split');
  const budgetPoolRepository = repositories?.budgetPoolRepository ?? createMockRepository('pool');
  const auditLogRepository = repositories?.auditLogRepository ?? createMockRepository('audit');

  return {
    service: new SplitBudgetService(
      splitPlanRepository as any,
      budgetPoolRepository as any,
      auditLogRepository as any,
    ),
    splitPlanRepository,
    budgetPoolRepository,
    auditLogRepository,
  };
};

describe('SplitBudgetService', () => {
  it('persists split plans across service instances and previews settlements from stored payees', async () => {
    const repositories = createService();

    const created = await repositories.service.createSplit('user-1', {
      name: 'Creator revenue',
      payees: [
        { payee_kind: 'user', payee_id: 'user-payee', bps: 7000, label: 'User' },
        { payee_kind: 'team', payee_id: 'team-payee', bps: 3000, label: 'Team' },
      ],
    });

    const freshService = new SplitBudgetService(
      repositories.splitPlanRepository as any,
      repositories.budgetPoolRepository as any,
      repositories.auditLogRepository as any,
    );

    const listed = await freshService.listSplits('user-1');
    const preview = await freshService.previewSettlement('user-1', created.id, 1001);
    const audit = await freshService.listAudit('user-1');

    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(
      expect.objectContaining({
        id: created.id,
        ownerId: 'user-1',
        payees: expect.arrayContaining([
          expect.objectContaining({ payee_id: 'user-payee', bps: 7000 }),
          expect.objectContaining({ payee_id: 'team-payee', bps: 3000 }),
        ]),
      }),
    );
    expect(preview.splits).toEqual([
      expect.objectContaining({ payee_id: 'user-payee', amount_cents: 700 }),
      expect.objectContaining({ payee_id: 'team-payee', amount_cents: 301 }),
    ]);
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['split.create', 'split.preview']),
    );
  });

  it('persists budget pools and spending history across service instances', async () => {
    const repositories = createService();

    const created = await repositories.service.createPool('user-2', {
      name: 'Automation budget',
      monthlyLimitCents: 5000,
      agentIds: ['agent-1', 'agent-2'],
    });

    const freshService = new SplitBudgetService(
      repositories.splitPlanRepository as any,
      repositories.budgetPoolRepository as any,
      repositories.auditLogRepository as any,
    );

    const spent = await freshService.spend('user-2', created.id, 1200, 'workflow run');
    const reloaded = await freshService.getPool('user-2', created.id);
    const audit = await freshService.listAudit('user-2');

    expect(spent).toEqual(
      expect.objectContaining({
        id: created.id,
        spentCents: 1200,
        last_spend_cents: 1200,
      }),
    );
    expect(reloaded).toEqual(
      expect.objectContaining({
        id: created.id,
        monthlyLimitCents: 5000,
        spentCents: 1200,
        agentIds: ['agent-1', 'agent-2'],
      }),
    );
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['budget.create', 'budget.spend']),
    );
  });
});