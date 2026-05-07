import { PlanRunnerService } from './plan-runner.service';

type StoredPlan = {
  id?: string;
  externalId: string;
  userId: string;
  title: string;
  intent: string;
  steps: Array<{
    id: string;
    kind: string;
    description: string;
    args?: Record<string, unknown>;
    status: 'pending' | 'running' | 'done' | 'failed';
    result?: string;
  }>;
  approvalId?: string | null;
  status:
    | 'draft'
    | 'awaiting_approval'
    | 'approved'
    | 'denied'
    | 'running'
    | 'done'
    | 'failed';
  createdAtMs: string;
  startedAtMs?: string | null;
  finishedAtMs?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const createMockPlanRepository = () => {
  const store = new Map<string, StoredPlan>();
  let sequence = 0;

  const repository = {
    create: jest.fn((data: Partial<StoredPlan>) => ({ ...data } as StoredPlan)),
    save: jest.fn(async (entity: Partial<StoredPlan>) => {
      const id = entity.id ?? `plan-${++sequence}`;
      const existing = store.get(id);
      const now = new Date();
      const merged: StoredPlan = {
        ...(existing as StoredPlan),
        ...(entity as StoredPlan),
        id,
        createdAt: existing?.createdAt ?? entity.createdAt ?? now,
        updatedAt: now,
      };
      // deep-clone steps to mimic real persistence boundary
      merged.steps = JSON.parse(JSON.stringify(merged.steps ?? []));
      store.set(id, merged);
      return merged;
    }),
    find: jest.fn(
      async (options?: {
        where?: Partial<StoredPlan>;
        order?: { createdAtMs?: 'ASC' | 'DESC' };
      }) => {
        let items = [...store.values()];
        if (options?.where) {
          items = items.filter((item) =>
            Object.entries(options.where ?? {}).every(
              ([key, value]) => (item as any)[key] === value,
            ),
          );
        }
        if (options?.order?.createdAtMs === 'DESC') {
          items.sort(
            (left, right) => Number(right.createdAtMs) - Number(left.createdAtMs),
          );
        }
        return items.map((item) => ({
          ...item,
          steps: JSON.parse(JSON.stringify(item.steps ?? [])),
        }));
      },
    ),
    findOne: jest.fn(async (options?: { where?: Partial<StoredPlan> }) => {
      const items = await repository.find(options);
      return items[0] ?? null;
    }),
  };

  return repository;
};

const createApprovalsStub = (initialStatus: 'pending' | 'approved' = 'pending') => {
  let counter = 0;
  const approvals = new Map<string, { id: string; status: 'pending' | 'approved' }>();
  return {
    create: jest.fn(async () => {
      const id = `approval-${++counter}`;
      const record = { id, status: initialStatus };
      approvals.set(id, record);
      return record;
    }),
    get: jest.fn(async (id: string) => approvals.get(id) ?? null),
    setStatus(id: string, status: 'pending' | 'approved') {
      const record = approvals.get(id);
      if (record) record.status = status;
    },
  };
};

const flush = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

const createToolsStub = (
  registered: Record<string, (input: any) => Promise<{ success: boolean; data?: any; error?: string }>> = {},
) => ({
  get: jest.fn((name: string) => (registered[name] ? { name } : undefined)),
  execute: jest.fn(async (name: string, input: any) => {
    const fn = registered[name];
    if (!fn) return { success: false, error: `tool not found: ${name}` };
    return fn(input);
  }),
});

describe('PlanRunnerService', () => {
  it('persists plans across service instances and runs them after approval', async () => {
    const planRepo = createMockPlanRepository();
    const approvals = createApprovalsStub('pending');

    const submitter = new PlanRunnerService(planRepo as any, approvals as any, createToolsStub() as any);
    const submitted = await submitter.submit('user-1', {
      title: 'Send weekly digest',
      intent: 'Email summary to subscribers',
      steps: [
        { kind: 'compose', description: 'draft email' },
        { kind: 'send', description: 'send via mail provider' },
      ],
      initiator_surface: 'mobile',
    });

    expect(submitted.status).toBe('awaiting_approval');
    expect(submitted.approvalId).toBeDefined();

    // Simulate approval being granted out-of-band, then a fresh service instance
    // reacts to it (proves state survives the service-instance boundary).
    approvals.setStatus(submitted.approvalId!, 'approved');
    const runner = new PlanRunnerService(planRepo as any, approvals as any, createToolsStub() as any);
    await runner.onApprovalApproved(submitted.approvalId!);
    await flush();

    const finalPlan = await runner.get(submitted.id, 'user-1');
    expect(finalPlan.status).toBe('done');
    expect(finalPlan.steps).toHaveLength(2);
    expect(finalPlan.steps.every((step) => step.status === 'done')).toBe(true);
    expect(finalPlan.steps[0].result).toContain('compose');
    expect(finalPlan.startedAt).toBeDefined();
    expect(finalPlan.finishedAt).toBeDefined();
  });

  it('lists plans for the owning user only and filters by status', async () => {
    const planRepo = createMockPlanRepository();
    const approvals = createApprovalsStub('approved');
    const service = new PlanRunnerService(planRepo as any, approvals as any, createToolsStub() as any);

    const planA = await service.submit('user-1', {
      title: 'Touch up notes',
      intent: 'organize notes',
      steps: [{ kind: 'organize', description: 'sort recent entries' }],
      initiator_surface: 'desktop',
    });
    await service.submit('user-2', {
      title: 'Other user plan',
      intent: 'do something else',
      steps: [{ kind: 'noop', description: 'noop' }],
      initiator_surface: 'web',
    });
    await flush();

    const fresh = new PlanRunnerService(planRepo as any, approvals as any, createToolsStub() as any);
    const ownerPlans = await fresh.list('user-1');
    expect(ownerPlans).toHaveLength(1);
    expect(ownerPlans[0].id).toBe(planA.id);

    const doneOnly = await fresh.list('user-1', 'done');
    expect(doneOnly.map((p) => p.id)).toContain(planA.id);

    const otherStatus = await fresh.list('user-1', 'awaiting_approval');
    expect(otherStatus).toHaveLength(0);
  });

  it('executes real tools via tool: prefix and emits artifact + done events', async () => {
    const planRepo = createMockPlanRepository();
    const approvals = createApprovalsStub('approved');
    const tools = createToolsStub({
      sandbox_shell_exec: async (input: any) => ({
        success: true,
        data: { stdout: `ran:${input.cmd}`, exitCode: 0 },
      }),
    });
    const service = new PlanRunnerService(planRepo as any, approvals as any, tools as any);

    const events: any[] = [];
    const planPromise = service.submit('user-1', {
      title: 'sandbox demo',
      intent: 'use real tool',
      steps: [
        {
          kind: 'tool:sandbox_shell_exec',
          description: 'echo hello',
          args: { instanceId: 'fake', cmd: 'echo hello' },
        },
      ],
      initiator_surface: 'web',
    });
    const submitted = await planPromise;
    const unsub = service.subscribe(submitted.id, (e) => events.push(e));
    await flush();
    unsub();

    const final = await service.get(submitted.id, 'user-1');
    expect(final.status).toBe('done');
    expect(final.steps[0].status).toBe('done');
    expect(final.steps[0].artifacts?.[0].kind).toBe('json');
    expect(final.steps[0].artifacts?.[0].content).toContain('ran:echo hello');
    expect(tools.execute).toHaveBeenCalledWith(
      'sandbox_shell_exec',
      expect.objectContaining({ cmd: 'echo hello' }),
      expect.any(Object),
    );
    // We may or may not catch plan.started depending on subscribe timing,
    // but artifact + step.done + plan.done must appear.
    const types = events.map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(['plan.step.artifact', 'plan.step.done', 'plan.done']),
    );
  });

  it('marks step failed and remaining as skipped when a tool errors out', async () => {
    const planRepo = createMockPlanRepository();
    const approvals = createApprovalsStub('approved');
    const tools = createToolsStub({
      bad_tool: async () => ({ success: false, error: 'boom' }),
      good_tool: async () => ({ success: true, data: 'ok' }),
    });
    const service = new PlanRunnerService(planRepo as any, approvals as any, tools as any);

    const submitted = await service.submit('user-1', {
      title: 'failure path',
      intent: 'one good one bad',
      steps: [
        { kind: 'tool:bad_tool', description: 'will fail' },
        { kind: 'tool:good_tool', description: 'should be skipped' },
      ],
      initiator_surface: 'web',
    });
    await flush();

    const final = await service.get(submitted.id, 'user-1');
    expect(final.status).toBe('failed');
    expect(final.steps[0].status).toBe('failed');
    expect(final.steps[0].error).toContain('boom');
    expect(final.steps[1].status).toBe('skipped');
    expect(tools.execute).toHaveBeenCalledTimes(1); // good_tool never invoked
  });
});
