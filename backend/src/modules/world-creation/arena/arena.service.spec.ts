import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArenaService } from './arena.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';

/**
 * Unit tests for ArenaService — Battle Arena 发布与分享 (Task 12.4, R16.6/R11.5).
 *
 * Covers:
 *  - publish sets status → 'published' (→ discoverable via MapService.discover).
 *  - share_code emitted matches v5 dungeon format (6–12 alphanumeric uppercase).
 *  - idempotent re-publish reuses the existing share_code.
 *  - owner gating (non-owner rejected) and no-ECS_World rejection.
 *  - generatePlotShareCode is deterministic given a collision-free repo.
 */
describe('ArenaService (publish + share_code)', () => {
  let service: ArenaService;
  let plotRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let agentAccountService: { findByOwner: jest.Mock };

  const OWNER_USER = 'user-owner';
  const OWNER_ACC = 'acc-owner';

  const plotRow = (over: Partial<WorldPlot> = {}): WorldPlot =>
    ({
      id: 'plot-1',
      ownerAccountId: OWNER_ACC,
      substrateTier: 'B',
      ecsVersionId: 'ecs-v1',
      mapX: 3,
      mapY: 4,
      status: 'draft',
      title: 'My Arena',
      boundAgentId: null,
      shareCode: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as WorldPlot;

  beforeEach(async () => {
    plotRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (p: WorldPlot) => p),
    };
    agentAccountService = {
      findByOwner: jest
        .fn()
        .mockResolvedValue({ items: [{ id: OWNER_ACC, name: 'Owner' }], total: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArenaService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: AgentAccountService, useValue: agentAccountService },
      ],
    }).compile();

    service = module.get(ArenaService);
  });

  it('publishes the arena: status → published + emits a share_code', async () => {
    const plot = plotRow();
    plotRepo.findOne.mockImplementation(async ({ where }: any) => {
      if (where.id) return plot;
      if (where.shareCode) return null; // no collision
      return null;
    });

    const res = await service.publishArena('plot-1', OWNER_USER);

    expect(res.published).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.shareCode).toBeDefined();
    // v5 dungeon share_code format: 6–12 alphanumeric chars.
    expect(res.shareCode).toMatch(/^[0-9A-Z]{6,12}$/);
    // Persisted as published with the share code (→ MapService.discover visible).
    const saved = plotRepo.save.mock.calls[0][0] as WorldPlot;
    expect(saved.status).toBe('published');
    expect(saved.shareCode).toBe(res.shareCode);
  });

  it('is idempotent: re-publishing an already published plot reuses the share_code', async () => {
    const plot = plotRow({ status: 'published', shareCode: 'ABCDEF12' });
    plotRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.id ? plot : null,
    );

    const res = await service.publishArena('plot-1', OWNER_USER);

    expect(res.published).toBe(true);
    expect(res.shareCode).toBe('ABCDEF12');
    // No write needed — already published with a code.
    expect(plotRepo.save).not.toHaveBeenCalled();
  });

  it('rejects publish from a non-owner', async () => {
    const plot = plotRow();
    plotRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.id ? plot : null,
    );
    agentAccountService.findByOwner.mockResolvedValue({ items: [], total: 0 });

    await expect(service.publishArena('plot-1', 'someone-else')).rejects.toThrow(
      ForbiddenException,
    );
    expect(plotRepo.save).not.toHaveBeenCalled();
  });

  it('rejects publish when the plot has no ECS_World', async () => {
    const plot = plotRow({ ecsVersionId: null });
    plotRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.id ? plot : null,
    );

    const res = await service.publishArena('plot-1', OWNER_USER);

    expect(res.published).toBe(false);
    expect(res.error?.error).toBe('SCHEMA_INVALID');
    expect(plotRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFound for an unknown plot', async () => {
    plotRepo.findOne.mockResolvedValue(null);
    await expect(service.publishArena('nope', OWNER_USER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('generatePlotShareCode: deterministic SHA-256-derived code (no collision)', async () => {
    plotRepo.findOne.mockResolvedValue(null); // never collides
    const a = await service.generatePlotShareCode('plot-xyz');
    const b = await service.generatePlotShareCode('plot-xyz');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9A-Z]{6,12}$/);
  });

  it('generatePlotShareCode: retries with hash offset on collision', async () => {
    let calls = 0;
    plotRepo.findOne.mockImplementation(async ({ where }: any) => {
      if (where.shareCode) {
        calls++;
        return calls === 1 ? ({ id: 'other' } as WorldPlot) : null;
      }
      return null;
    });
    const code = await service.generatePlotShareCode('plot-xyz');
    expect(code).toMatch(/^[0-9A-Z]{6,12}$/);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
