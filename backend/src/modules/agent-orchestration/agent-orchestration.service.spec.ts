import { AgentOrchestrationService } from './agent-orchestration.service';

describe('AgentOrchestrationService', () => {
  const createService = () => {
    const agentAccountRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'agent-dev', ownerId: 'user-1', name: 'dev', preferredModel: 'claude-haiku-4-5' },
        { id: 'agent-qa', ownerId: 'user-1', name: 'qa-ops', preferredModel: 'claude-haiku-4-5' },
        { id: 'agent-ceo', ownerId: 'user-1', name: 'ceo', preferredModel: 'claude-sonnet-4' },
      ]),
      findOne: jest.fn(async ({ where }: any) => {
        const accounts = [
          { id: 'agent-dev', ownerId: 'user-1', name: 'dev', preferredModel: 'claude-haiku-4-5' },
          { id: 'agent-qa', ownerId: 'user-1', name: 'qa-ops', preferredModel: 'claude-haiku-4-5' },
          { id: 'agent-ceo', ownerId: 'user-1', name: 'ceo', preferredModel: 'claude-sonnet-4' },
        ];
        return accounts.find(a => a.id === where.id && a.ownerId === where.ownerId) || null;
      }),
    };
    const instanceRepo = {
      findOne: jest.fn(async ({ where }: any) => ({
        id: `instance-${where.agentAccountId}`,
        agentAccountId: where.agentAccountId,
        userId: where.userId,
      })),
    };
    const agentContextService = {
      buildContext: jest.fn(async () => ({
        systemPrompt: 'system prompt',
        cacheBreakpoints: [],
        memoryTokenEstimate: 0,
        layerSummary: [],
      })),
    };

    const service = new AgentOrchestrationService(
      agentAccountRepo as any,
      instanceRepo as any,
      agentContextService as any,
    );

    return { service, agentContextService };
  };

  it('executes worker lanes concurrently and preserves result order', async () => {
    const { service } = createService();
    const startedAtByRole: Record<string, number> = {};

    jest.spyOn(service as any, 'executeSubAgentTask').mockImplementation(async (_userId: string, worker: any) => {
      startedAtByRole[worker.role] = Date.now();
      await new Promise(resolve => setTimeout(resolve, 120));
      return {
        output: JSON.stringify({ summary: `${worker.role} done` }),
        usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.01 },
      };
    });

    const startedAt = Date.now();
    const result = await service.coordinate('user-1', {
      task: 'ship parallel lanes',
      maxParallelWorkers: 3,
      workers: [
        { role: 'dev', task: 'implement backend scheduler' },
        { role: 'qa-ops', task: 'validate tests and build' },
        { role: 'ceo', task: 'merge architecture decisions' },
      ],
    });
    const durationMs = Date.now() - startedAt;

    expect(durationMs).toBeLessThan(260);
    expect(Math.max(...Object.values(startedAtByRole)) - Math.min(...Object.values(startedAtByRole))).toBeLessThan(80);
    expect(result.workers.map(w => w.role)).toEqual(['dev', 'qa-ops', 'ceo']);
    expect(result.workers.every(w => w.status === 'completed')).toBe(true);
    expect(result.parallelism).toEqual(expect.objectContaining({
      requestedWorkers: 3,
      maxParallelWorkers: 3,
      completed: 3,
      failed: 0,
      timedOut: 0,
    }));
  });

  it('decomposes a task when no explicit workers are supplied', async () => {
    const { service, agentContextService } = createService();

    const result = await service.coordinate('user-1', {
      task: 'design parallel agent orchestration architecture',
      workers: [],
      maxParallelWorkers: 4,
    });

    expect(result.workers.length).toBeGreaterThanOrEqual(3);
    expect(result.workers.map(w => w.role)).toContain('ceo');
    expect(result.workers.map(w => w.role)).toContain('dev');
    expect(result.workers.map(w => w.role)).toContain('qa-ops');
    expect(agentContextService.buildContext).toHaveBeenCalledTimes(result.workers.length);
    expect(result.coordinatorSummary).toContain('Parallel coordination finished');
  });

  it('marks lanes as timeout without failing sibling lanes', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'executeSubAgentTask').mockImplementation(async (_userId: string, worker: any) => {
      if (worker.role === 'qa-ops') {
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      return {
        output: JSON.stringify({ summary: `${worker.role} done` }),
        usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.01 },
      };
    });

    const result = await service.coordinate('user-1', {
      task: 'timeout handling',
      timeoutMs: 20,
      maxParallelWorkers: 2,
      workers: [
        { role: 'dev', task: 'fast lane' },
        { role: 'qa-ops', task: 'slow lane' },
      ],
    });

    expect(result.workers.find(w => w.role === 'dev')?.status).toBe('completed');
    expect(result.workers.find(w => w.role === 'qa-ops')?.status).toBe('timeout');
    expect(result.parallelism.completed).toBe(1);
    expect(result.parallelism.timedOut).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 90));
  });
});