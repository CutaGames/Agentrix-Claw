import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { LandEconomyService } from './land-economy.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { PlotListing } from '../entities/plot-listing.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { AxpService } from '../../axp/axp.service';
import type { AcquirePlotRequest } from '../../../../shared/types/world-creation-api';

/**
 * Unit tests for LandEconomyService.acquirePlot (Task 8.1, R2.2/R2.3/R2.7).
 *
 * Focus: the optimistic-lock conditional UPDATE single-winner semantics that
 * Property 5 (Task 8.2) drives. The acquire flips ownership only when
 * `version = expectedVersion` AND `ownerAccountId IS NULL`; the affected-row
 * count decides win (1) vs taken (0).
 */
describe('LandEconomyService.acquirePlot', () => {
  let service: LandEconomyService;
  let plotRepo: { update: jest.Mock; findOne: jest.Mock };
  let agentAccountService: { findByOwner: jest.Mock };

  const OWNER_ACCOUNT_ID = 'acc-owner-1';
  const USER_ID = 'user-1';

  const baseReq: AcquirePlotRequest = {
    plotId: 'plot-1',
    substrateTier: 'B',
    expectedVersion: 5,
  };

  const acquiredPlot: WorldPlot = {
    id: 'plot-1',
    ownerAccountId: OWNER_ACCOUNT_ID,
    substrateTier: 'B',
    ecsVersionId: null,
    mapX: 3,
    mapY: 7,
    status: 'draft',
    title: null,
    boundAgentId: null,
    version: 6,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:01.000Z'),
  } as WorldPlot;

  beforeEach(async () => {
    plotRepo = { update: jest.fn(), findOne: jest.fn() };
    agentAccountService = {
      findByOwner: jest
        .fn()
        .mockResolvedValue({ items: [{ id: OWNER_ACCOUNT_ID }], total: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandEconomyService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: getRepositoryToken(PlotListing), useValue: {} },
        { provide: AgentAccountService, useValue: agentAccountService },
        { provide: AxpService, useValue: { spend: jest.fn(), earn: jest.fn() } },
      ],
    }).compile();

    service = module.get(LandEconomyService);
  });

  it('acquires an available plot when the conditional UPDATE affects exactly one row', async () => {
    plotRepo.update.mockResolvedValue({ affected: 1, raw: [] });
    plotRepo.findOne.mockResolvedValue(acquiredPlot);

    const res = await service.acquirePlot(USER_ID, baseReq);

    expect(res.acquired).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.plot).toMatchObject({
      plotId: 'plot-1',
      ownerAccountId: OWNER_ACCOUNT_ID,
      substrateTier: 'B',
      version: 6,
    });

    // WHERE criteria enforces optimistic lock + unowned (single-winner).
    const [criteria, partial] = plotRepo.update.mock.calls[0];
    expect(criteria).toEqual({
      id: 'plot-1',
      version: 5,
      ownerAccountId: IsNull(),
    });
    expect(partial.ownerAccountId).toBe(OWNER_ACCOUNT_ID);
    expect(partial.substrateTier).toBe('B');
    expect(partial.status).toBe('draft');
  });

  it('returns PLOT_TAKEN when the UPDATE affects zero rows and the plot still exists', async () => {
    plotRepo.update.mockResolvedValue({ affected: 0, raw: [] });
    plotRepo.findOne.mockResolvedValue({
      ...acquiredPlot,
      ownerAccountId: 'someone-else',
      version: 6,
    });

    const res = await service.acquirePlot(USER_ID, baseReq);

    expect(res.acquired).toBe(false);
    expect(res.plot).toBeUndefined();
    expect(res.error?.error).toBe('PLOT_TAKEN');
    expect(res.error?.detail).toContain('plot-1');
  });

  it('throws NotFound when the plot does not exist', async () => {
    plotRepo.update.mockResolvedValue({ affected: 0, raw: [] });
    plotRepo.findOne.mockResolvedValue(null);

    await expect(service.acquirePlot(USER_ID, baseReq)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects acquire when the user has no AgentAccount', async () => {
    agentAccountService.findByOwner.mockResolvedValue({ items: [], total: 0 });

    await expect(service.acquirePlot(USER_ID, baseReq)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(plotRepo.update).not.toHaveBeenCalled();
  });

  it('validates required request fields', async () => {
    await expect(
      service.acquirePlot('', baseReq),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.acquirePlot(USER_ID, { ...baseReq, plotId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.acquirePlot(USER_ID, {
        ...baseReq,
        expectedVersion: undefined as unknown as number,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guarantees a single winner across concurrent acquires (only one UPDATE affects a row)', async () => {
    // Simulate two concurrent acquires racing for the same version=5 row:
    // the first conditional UPDATE flips ownership (affected=1), the second
    // sees the row already owned / version bumped (affected=0).
    let rowOwned = false;
    plotRepo.update.mockImplementation(async () => {
      if (rowOwned) return { affected: 0, raw: [] };
      rowOwned = true;
      return { affected: 1, raw: [] };
    });
    plotRepo.findOne.mockImplementation(async () =>
      rowOwned ? acquiredPlot : null,
    );

    const [a, b] = await Promise.all([
      service.acquirePlot('user-a', baseReq),
      service.acquirePlot('user-b', baseReq),
    ]);

    const winners = [a, b].filter((r) => r.acquired);
    const losers = [a, b].filter((r) => !r.acquired);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].error?.error).toBe('PLOT_TAKEN');
  });
});
