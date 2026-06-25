import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import * as fc from 'fast-check';
import { LandEconomyService } from './land-economy.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { PlotListing } from '../entities/plot-listing.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { AxpService } from '../../axp/axp.service';
import type {
  AcquirePlotRequest,
  AcquirePlotResponse,
} from '../../../../shared/types/world-creation-api';
import type { SubstrateTier } from '../../../../shared/types/world-creation';

/**
 * Property-based test for LandEconomyService.acquirePlot — Task 8.2.
 *
 * **Property 5: 乐观锁单赢家 (optimistic-lock single winner)** — when N users
 * concurrently acquire the same available Plot (same version row), exactly one
 * succeeds (acquired=true) and every other caller receives PLOT_TAKEN.
 * **Validates: Requirements 2.3**
 *
 * Strategy: drive the real service against an in-memory model of a single-row
 * conditional UPDATE. The plotRepo.update mock atomically (synchronously, within
 * one JS tick — no await before the check-and-set) flips ownerAccountId only when
 * the row is still unowned AND its version matches the caller's expectedVersion,
 * exactly mirroring the production
 *   `UPDATE world_plots SET owner=…, version=version+1
 *      WHERE id=? AND version=? AND owner_account_id IS NULL`.
 * The first matching call wins (affected=1, owner set, version→N+1); all later
 * calls miss (affected=0) because the row is now owned and the version bumped.
 */
describe('LandEconomyService.acquirePlot — Property 5 (optimistic-lock single winner)', () => {
  const PLOT_ID = 'plot-pbt';

  /**
   * Build a service whose plotRepo is backed by a single mutable in-memory row,
   * with update() modelling the atomic conditional UPDATE.
   */
  async function buildService(initialVersion: number): Promise<LandEconomyService> {
    // The single shared plot row (starts unowned).
    const row: WorldPlot = {
      id: PLOT_ID,
      ownerAccountId: null,
      substrateTier: 'A',
      ecsVersionId: null,
      mapX: 1,
      mapY: 1,
      status: 'unclaimed',
      title: null,
      boundAgentId: null,
      version: initialVersion,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as WorldPlot;

    const plotRepo = {
      // Atomic single-row conditional UPDATE: check-and-set with no await before
      // the mutation, so concurrent callers cannot interleave mid-update.
      update: jest.fn(async (criteria: any, partial: any) => {
        const versionMatches =
          typeof criteria.version === 'number'
            ? row.version === criteria.version
            : true;
        // criteria.ownerAccountId is IsNull() → row must currently be unowned.
        const requiresUnowned = criteria.ownerAccountId !== undefined;
        const isUnowned = row.ownerAccountId == null;

        if (criteria.id === row.id && versionMatches && (!requiresUnowned || isUnowned)) {
          row.ownerAccountId = partial.ownerAccountId;
          row.substrateTier = partial.substrateTier;
          row.status = partial.status;
          row.version = row.version + 1; // mirror `version + 1`
          return { affected: 1, raw: [], generatedMaps: [] };
        }
        return { affected: 0, raw: [], generatedMaps: [] };
      }),
      findOne: jest.fn(async () => ({ ...row })),
    };

    // Each distinct userId resolves to its own AgentAccount id.
    const agentAccountService = {
      findByOwner: jest.fn(async (userId: string) => ({
        items: [{ id: `acc-${userId}` }],
        total: 1,
      })),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LandEconomyService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: getRepositoryToken(PlotListing), useValue: {} },
        { provide: AgentAccountService, useValue: agentAccountService },
        { provide: AxpService, useValue: {} },
      ],
    }).compile();

    return moduleRef.get(LandEconomyService);
  }

  it('commits ownership to exactly one of N concurrent acquirers; the rest get PLOT_TAKEN', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.constantFrom<SubstrateTier>('A', 'B', 'C'),
        async (n, initialVersion, tier) => {
          const service = await buildService(initialVersion);

          const req: AcquirePlotRequest = {
            plotId: PLOT_ID,
            substrateTier: tier,
            expectedVersion: initialVersion,
          };

          // N users race to acquire the same available Plot at the same version.
          const results: AcquirePlotResponse[] = await Promise.all(
            Array.from({ length: n }, (_, i) =>
              service.acquirePlot(`user-${i}`, req),
            ),
          );

          const winners = results.filter((r) => r.acquired);
          const losers = results.filter((r) => !r.acquired);

          // Exactly one winner.
          expect(winners).toHaveLength(1);
          // Winner carries the bound plot at the bumped version, no error.
          expect(winners[0].plot).toBeDefined();
          expect(winners[0].error).toBeUndefined();
          expect(winners[0].plot!.version).toBe(initialVersion + 1);
          expect(winners[0].plot!.substrateTier).toBe(tier);

          // Everyone else is told the plot is taken.
          expect(losers).toHaveLength(n - 1);
          for (const loser of losers) {
            expect(loser.plot).toBeUndefined();
            expect(loser.error?.error).toBe('PLOT_TAKEN');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
