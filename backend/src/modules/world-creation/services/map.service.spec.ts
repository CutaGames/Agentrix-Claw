import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { MapService } from './map.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { SandboxService } from './sandbox.service';
import { EcsWorldService } from './ecs-world.service';
import { IdentityResolverService } from './identity-resolver.service';
import {
  MAP_PRESENCE_STORE,
  MAP_PRESENCE_TTL_MS,
  InMemoryMapPresenceStore,
} from '../presence/map-presence.store';
import { MAP_PRESENCE_REFRESH_MS } from '../../../../shared/types/world-creation';
import type { GetMapViewportQuery } from '../../../../shared/types/world-creation-api';

/**
 * Unit tests for MapService viewport + lightweight presence (Task 10.1, R1.1/R1.2/R1.6).
 *
 * Covers:
 *  - getViewport queries visible plots within the viewport box and maps owner display names.
 *  - presence write (updateSelfPresence) / read (getPresence) round-trip excludes self.
 *  - refreshMs surfaces MAP_PRESENCE_REFRESH_MS (≤2s budget, R1.2).
 *  - presence TTL expiry removes stale users.
 */
describe('MapService (viewport + presence)', () => {
  let service: MapService;
  let store: InMemoryMapPresenceStore;
  let plotRepo: { find: jest.Mock };
  let agentAccountService: { findById: jest.Mock; findByOwner: jest.Mock };
  let sandboxService: { instantiate: jest.Mock };
  let ecsWorldService: { loadWorldAtVersion: jest.Mock };
  let identityResolver: { resolveReadonlyHandles: jest.Mock };

  const USER_A = 'user-a';
  const USER_B = 'user-b';

  const viewport: GetMapViewportQuery = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  const plotRow = (over: Partial<WorldPlot> = {}): WorldPlot =>
    ({
      id: 'plot-1',
      ownerAccountId: 'acc-1',
      substrateTier: 'B',
      ecsVersionId: null,
      mapX: 3,
      mapY: 4,
      status: 'published',
      title: 'My Arena',
      boundAgentId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as WorldPlot;

  beforeEach(async () => {
    plotRepo = { find: jest.fn().mockResolvedValue([]) };
    agentAccountService = {
      findById: jest.fn().mockResolvedValue({ id: 'acc-1', name: 'Alice' }),
      findByOwner: jest
        .fn()
        .mockResolvedValue({ items: [{ id: 'acc-1', name: 'Alice' }], total: 1 }),
    };
    sandboxService = {
      instantiate: jest.fn().mockResolvedValue({ sessionId: 'session-1' }),
    };
    ecsWorldService = { loadWorldAtVersion: jest.fn().mockResolvedValue({}) };
    identityResolver = {
      resolveReadonlyHandles: jest.fn().mockResolvedValue([]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MapService,
        InMemoryMapPresenceStore,
        { provide: MAP_PRESENCE_STORE, useExisting: InMemoryMapPresenceStore },
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: AgentAccountService, useValue: agentAccountService },
        { provide: SandboxService, useValue: sandboxService },
        { provide: EcsWorldService, useValue: ecsWorldService },
        { provide: IdentityResolverService, useValue: identityResolver },
      ],
    }).compile();

    service = moduleRef.get(MapService);
    store = moduleRef.get(InMemoryMapPresenceStore);
    store.reset();
  });

  describe('getViewport', () => {
    it('returns visible plots within the viewport with owner display names', async () => {
      plotRepo.find.mockResolvedValue([plotRow()]);

      const res = await service.getViewport(USER_A, viewport);

      expect(plotRepo.find).toHaveBeenCalledTimes(1);
      const whereArg = plotRepo.find.mock.calls[0][0].where;
      // status filter restricted to map-visible statuses.
      expect(whereArg.status).toBeDefined();
      expect(res.plots).toHaveLength(1);
      expect(res.plots[0]).toMatchObject({
        plotId: 'plot-1',
        title: 'My Arena',
        ownerDisplayName: 'Alice',
        substrateTier: 'B',
        mapX: 3,
        mapY: 4,
        status: 'published',
      });
    });

    it('labels unowned plots as Unowned and resolves self position to viewport center on first visit', async () => {
      plotRepo.find.mockResolvedValue([plotRow({ ownerAccountId: null })]);

      const res = await service.getViewport(USER_A, viewport);

      expect(res.plots[0].ownerDisplayName).toBe('Unowned');
      // No prior presence → default to viewport center.
      expect(res.self.position).toEqual({ x: 5, y: 5 });
    });

    it('rejects a viewport with non-finite bounds', async () => {
      await expect(
        service.getViewport(USER_A, { minX: 0, minY: 0, maxX: NaN, maxY: 10 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks the caller present so others can see them', async () => {
      await service.getViewport(USER_A, viewport);
      const others = await service.getPresence(USER_B);
      expect(others.entries.map((e) => e.userId)).toContain(USER_A);
    });
  });

  describe('presence', () => {
    it('writes own light state and reads others, excluding self', async () => {
      await service.updateSelfPresence(USER_A, { x: 1, y: 2 }, 'plot-1');
      await service.updateSelfPresence(USER_B, { x: 8, y: 9 }, null);

      const forA = await service.getPresence(USER_A);
      expect(forA.entries).toHaveLength(1);
      expect(forA.entries[0]).toMatchObject({
        userId: USER_B,
        position: { x: 8, y: 9 },
        inPlotId: null,
      });
      expect(forA.refreshMs).toBe(MAP_PRESENCE_REFRESH_MS);

      const forB = await service.getPresence(USER_B);
      expect(forB.entries[0]).toMatchObject({
        userId: USER_A,
        position: { x: 1, y: 2 },
        inPlotId: 'plot-1',
      });
    });

    it('rejects an invalid position', async () => {
      await expect(
        service.updateSelfPresence(USER_A, { x: 1, y: Infinity }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateSelfPresence('', { x: 1, y: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('expires stale presence after the TTL elapses', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      try {
        nowSpy.mockReturnValue(1_000_000);
        await service.updateSelfPresence(USER_A, { x: 1, y: 1 });

        // Advance beyond the presence TTL.
        nowSpy.mockReturnValue(1_000_000 + MAP_PRESENCE_TTL_MS + 1);
        const res = await service.getPresence(USER_B);
        expect(res.entries).toHaveLength(0);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });
});
