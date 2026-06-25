import { ConflictException } from '@nestjs/common';
import { MemoryService } from './memory.service';

describe('MemoryService graph and session search helpers', () => {
  const buildService = () => {
    const user = {
      id: 'user-1',
      metadata: {
        sessionSummaries: [
          { sessionId: 's1', summary: 'Implemented durable lanes and repair approval', source: 'desktop', timestamp: new Date('2026-04-01') },
          { sessionId: 's2', summary: 'Discussed pricing and growth copy', source: 'web', timestamp: new Date('2026-04-02') },
        ],
      },
      updatedAt: new Date('2026-04-03T00:00:00.000Z'),
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn(async (value: any) => value),
    };
    return { service: new MemoryService(repo as any), repo, user };
  };

  it('searches session summaries with source isolation', async () => {
    const { service } = buildService();
    const results = await service.searchSessionSummaries('user-1', 'durable repair', { source: 'desktop' });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({ sessionId: 's1', score: 2 }));
  });

  it('prevents stale session summary overwrites', async () => {
    const { service } = buildService();
    await expect(service.saveSessionSummaryIfFresh(
      'user-1',
      's3',
      'new summary',
      '2026-04-02T00:00:00.000Z',
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates memory graph edges without a repository fallback', async () => {
    const { service } = buildService();
    const edge = await service.addMemoryEdge({
      userId: 'user-1',
      sourceKind: 'task',
      sourceId: 'task-1',
      targetKind: 'symbol',
      targetId: 'AgentOrchestrationService',
      relationship: 'touched_symbol',
    });

    expect(edge).toEqual(expect.objectContaining({
      sourceKind: 'task',
      targetKind: 'symbol',
      relationship: 'touched_symbol',
    }));
  });
});