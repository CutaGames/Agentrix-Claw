import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { MapService } from './map.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { SandboxService } from './sandbox.service';
import { EcsWorldService } from './ecs-world.service';
import { IdentityResolverService } from './identity-resolver.service';
import {
  MAP_PRESENCE_STORE,
  InMemoryMapPresenceStore,
} from '../presence/map-presence.store';
import type {
  DiscoverPlotsQuery,
  ReadonlyAssetHandle,
} from '../../../../shared/types/world-creation-api';
import type { EcsWorld } from '../../../../shared/types/world-creation';

/**
 * Unit tests for MapService discovery filtering + Plot entry / load-timeout fallback
 * (Task 10.4, R1.5/R1.7).
 *
 * Covers:
 *  - discover() filters by substrateTier / category, applies sort + pagination,
 *    and back-fills page-aware popularityRank (R1.5).
 *  - enterPlot() happy path returns sessionId / ecsWorld / isolationLevel by tier,
 *    injecting read-only asset handles (R1.4).
 *  - enterPlot() load timeout raises a structured LOAD_TIMEOUT so the client can
 *    show the failure reason and fall back to the map view (R1.7).
 *
 * NOTE: viewport + presence paths (Task 10.1) are covered by map.service.spec.ts;
 * device-tier graceful-degradation paths (R13.3/13.5) live on the mobile render
 * strategy and are covered by src/services/__tests__/worldMapRenderStrategy.test.ts.
 * This spec intentionally does not duplicate either.
 */
describe('MapService (discovery + enter)', () => {
  let service: MapService;
  let plotRepo: {
    find: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
  };
  let agentAccountService: { findById: jest.Mock; findByOwner: jest.Mock };
  let sandboxService: { instantiate: jest.Mock };
  let ecsWorldService: { loadWorldAtVersion: jest.Mock };
  let identityResolver: { resolveReadonlyHandles: jest.Mock };

  const USER_A = 'user-a';

  const plotRow = (over: Partial<WorldPlot> = {}): WorldPlot =>
    ({
      id: 'plot-1',
      ownerAccountId: 'acc-1',
      substrateTier: 'B',
      ecsVersionId: 'ver-1',
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
    plotRepo = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    agentAccountService = {
      findById: jest.fn().mockResolvedValue({ id: 'acc-1', name: 'Alice' }),
      findByOwner: jest
        .fn()
        .mockResolvedValue({ items: [{ id: 'acc-1', name: 'Alice' }], total: 1 }),
    };
    sandboxService = {
      instantiate: jest.fn().mockResolvedValue({ sessionId: 'session-1' }),
    };
    ecsWorldService = {
      loadWorldAtVersion: jest.fn().mockResolvedValue({} as EcsWorld),
    };
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
    moduleRef.get(InMemoryMapPresenceStore).reset();
  });

  describe('discover (R1.5)', () => {
    it('filters by substrateTier + category and lists only map-visible plots', async () => {
      plotRepo.findAndCount.mockResolvedValue([[plotRow()], 1]);

      const query: DiscoverPlotsQuery = {
        substrateTier: 'B',
        category: 'arena',
        sort: 'popularity',
      };
      const res = await service.discover(query);

      expect(plotRepo.findAndCount).toHaveBeenCalledTimes(1);
      const args = plotRepo.findAndCount.mock.calls[0][0];
      // substrateTier filter forwarded.
      expect(args.where.substrateTier).toBe('B');
      // status filter restricted to map-visible statuses (published / listed).
      expect(args.where.status).toBeDefined();
      // category produces a (case-insensitive) title match constraint.
      expect(args.where.title).toBeDefined();
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('back-fills page-aware popularityRank across pages', async () => {
      const rows = [
        plotRow({ id: 'p1' }),
        plotRow({ id: 'p2' }),
        plotRow({ id: 'p3' }),
      ];
      plotRepo.findAndCount.mockResolvedValue([rows, 23]);

      const res = await service.discover({ page: 2, limit: 3 });

      // page 2, limit 3 → ranks continue from 4.
      expect(res.items.map((i) => i.popularityRank)).toEqual([4, 5, 6]);
      expect(res.total).toBe(23);

      const args = plotRepo.findAndCount.mock.calls[0][0];
      expect(args.skip).toBe(3);
      expect(args.take).toBe(3);
    });

    it('groups by tier (A→B→C) then recency when sort=tier', async () => {
      plotRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.discover({ sort: 'tier' });

      const order = plotRepo.findAndCount.mock.calls[0][0].order;
      expect(order.substrateTier).toBe('ASC');
      expect(order.createdAt).toBe('DESC');
    });

    it('clamps page/limit to safe bounds', async () => {
      plotRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.discover({ page: 0, limit: 9999 });

      const args = plotRepo.findAndCount.mock.calls[0][0];
      // page floored to 1 → skip 0; limit clamped to the max page size (100).
      expect(args.skip).toBe(0);
      expect(args.take).toBe(100);
    });
  });

  describe('enterPlot (R1.4)', () => {
    it('instantiates the experience and returns session + ecsWorld + isolation level', async () => {
      const world: EcsWorld = {
        rules: [{ on: 'event', do: [{ cap: 'scene.spawn' }] }],
      } as unknown as EcsWorld;
      plotRepo.findOne.mockResolvedValue(plotRow({ substrateTier: 'B' }));
      ecsWorldService.loadWorldAtVersion.mockResolvedValue(world);
      const handles: ReadonlyAssetHandle[] = [
        { assetId: 'a1', kind: 'pet', name: 'Fluffy' },
      ];
      identityResolver.resolveReadonlyHandles.mockResolvedValue(handles);

      const res = await service.enterPlot(USER_A, 'plot-1');

      expect(ecsWorldService.loadWorldAtVersion).toHaveBeenCalledWith('ver-1');
      // Tier_B → L1 isolation.
      expect(res.isolationLevel).toBe('L1');
      expect(res.sessionId).toBe('session-1');
      expect(res.ecsWorld).toBe(world);
      expect(res.readonlyAssetHandles).toEqual(handles);

      // Sandbox instantiated at the tier-derived isolation level with declared caps.
      const [plotId, isolation, grantedCaps] =
        sandboxService.instantiate.mock.calls[0];
      expect(plotId).toBe('plot-1');
      expect(isolation).toBe('L1');
      expect(grantedCaps).toContain('scene.spawn');
    });

    it('maps Tier_A to L0 isolation', async () => {
      plotRepo.findOne.mockResolvedValue(plotRow({ substrateTier: 'A' }));

      const res = await service.enterPlot(USER_A, 'plot-1');

      expect(res.isolationLevel).toBe('L0');
    });

    it('throws NotFound when the plot has no ECS_World yet', async () => {
      plotRepo.findOne.mockResolvedValue(plotRow({ ecsVersionId: null }));

      await expect(service.enterPlot(USER_A, 'plot-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFound when the plot does not exist', async () => {
      plotRepo.findOne.mockResolvedValue(null);

      await expect(service.enterPlot(USER_A, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('enterPlot load timeout (R1.7)', () => {
    it('raises a structured LOAD_TIMEOUT when loading exceeds the budget', async () => {
      // Shrink the load budget so the test runs fast.
      (service as unknown as { plotLoadTimeoutMs: number }).plotLoadTimeoutMs = 20;

      plotRepo.findOne.mockResolvedValue(plotRow());
      // loadWorldAtVersion never resolves → forces the timeout race to win.
      ecsWorldService.loadWorldAtVersion.mockImplementation(
        () => new Promise<EcsWorld>(() => {}),
      );

      const err = await service.enterPlot(USER_A, 'plot-1').then(
        () => null,
        (e) => e,
      );

      expect(err).toBeInstanceOf(RequestTimeoutException);
      const payload = (err as RequestTimeoutException).getResponse();
      expect(payload).toMatchObject({ error: 'LOAD_TIMEOUT' });
      expect((payload as { detail: string }).detail).toContain('plot-1');
      // Sandbox is never instantiated when loading times out.
      expect(sandboxService.instantiate).not.toHaveBeenCalled();
    });
  });
});
