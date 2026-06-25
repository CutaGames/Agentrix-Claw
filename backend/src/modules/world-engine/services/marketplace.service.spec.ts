import * as fc from 'fast-check';
import { Repository } from 'typeorm';
import { MarketplaceService } from './marketplace.service';
import { AgentQuotaService } from './agent-quota.service';
import { WorldAsset } from '../entities/world-asset.entity';

/**
 * Property 4: 资产所有权完整性
 * At any point, a WorldAsset has exactly one owner_id.
 * No "ownerless" or "dual-owner" state during transactions.
 *
 * **Validates: Requirements 8.3, 8.4**
 *
 * This test verifies:
 * 1. After any purchase (success or failure), every asset has exactly one owner
 * 2. Concurrent purchases of the same asset never result in dual-ownership
 * 3. Failed transactions leave ownership unchanged (rollback correctness)
 * 4. The @VersionColumn optimistic lock prevents stale writes
 *
 * Isolation note: MarketplaceService keeps listing/reservation/idempotency state in
 * instance maps, so every fast-check *iteration* rebuilds a pristine service via
 * createTestAsset()/buildService(). Without that, reused (shrunk) ids leak state
 * across iterations and cause spurious "already listed" / "not found" failures.
 */
describe('Property 4: Asset ownership integrity (资产所有权完整性)', () => {
  let marketplaceService: MarketplaceService;
  let mockWorldAssetRepo: Partial<Repository<WorldAsset>>;
  let mockAgentQuotaService: Partial<AgentQuotaService>;

  // Track all assets and their ownership state
  let assetStore: Map<string, WorldAsset>;

  // Track version numbers for optimistic locking simulation
  let versionStore: Map<string, number>;

  // Optional hook fired at Phase-2 transaction entry to simulate a concurrent write
  // that lands AFTER the Phase-1 reservation snapshot but BEFORE commit.
  let preCommitHook: (() => void) | null;

  function buildService(): void {
    assetStore = new Map();
    versionStore = new Map();
    preCommitHook = null;

    // The real constructor starts a setInterval reservation-cleanup loop. Across the
    // many service instances this harness builds (one per fast-check iteration), those
    // timers would accumulate as open handles. Neutralize it.
    jest
      .spyOn(MarketplaceService.prototype as any, 'startReservationCleanup')
      .mockImplementation(() => undefined);

    mockAgentQuotaService = {
      checkAgentQuota: jest.fn().mockResolvedValue({ current: 0, max: 10, available: true }),
    };

    mockWorldAssetRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        const id = where.id;
        const asset = assetStore.get(id);
        return Promise.resolve(asset || null);
      }),
      count: jest.fn().mockResolvedValue(10),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: any) => {
          if (preCommitHook) {
            preCommitHook();
          }
          const entityManager = {
            findOne: jest.fn().mockImplementation((_entity: any, opts: any) => {
              const id = opts.where.id;
              const asset = assetStore.get(id);
              return Promise.resolve(asset ? { ...asset } : null);
            }),
            save: jest.fn().mockImplementation((_entity: any, data: any) => {
              const id = data.id;
              const currentVersion = versionStore.get(id) || 0;

              // Optimistic lock check: if version doesn't match, throw
              if (data.version !== undefined && data.version !== currentVersion) {
                throw new Error('Optimistic lock version mismatch');
              }

              const existing = assetStore.get(id);
              if (existing) {
                existing.ownerId = data.ownerId;
                existing.source = data.source || existing.source;
                existing.version = currentVersion + 1;
                versionStore.set(id, existing.version);
                assetStore.set(id, existing);
              }

              return Promise.resolve(data);
            }),
          };
          return cb(entityManager);
        }),
      } as any,
    };

    marketplaceService = new MarketplaceService(
      mockWorldAssetRepo as Repository<WorldAsset>,
      mockAgentQuotaService as AgentQuotaService,
    );
  }

  beforeEach(() => {
    buildService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Generators ────────────────────────────────────────────────────────

  const userIdArb = fc.uuid();
  const assetIdArb = fc.uuid();
  // Price valid for BOTH currencies: USD allows 0.01–999,999.99, AXP allows 1–10,000,000.
  // The intersection (≥1, ≤999,999.99) keeps every generated price valid regardless of
  // which currency a property picks, so listing creation never rejects on range.
  const priceArb = fc.double({ min: 1, max: 999_999.99, noNaN: true });
  const currencyArb = fc.constantFrom('USD' as const, 'AXP' as const);

  /**
   * Rebuild a pristine service + stores, then create a test WorldAsset.
   * Called at the start of every property iteration to guarantee full isolation.
   */
  function createTestAsset(id: string, ownerId: string): WorldAsset {
    buildService();
    const asset: WorldAsset = {
      id,
      ownerId,
      originalCreatorId: ownerId,
      name: 'Test Asset',
      category: 'character',
      scanMode: 'quick',
      meshUrl: 'test.glb',
      styledMeshUrl: 'test-styled.glb',
      portraitUrl: null,
      styleType: 'cartoon',
      semanticDescription: {},
      stats: { hp: 50, atk: 30, def: 20, spd: 40, int: 25 },
      skills: [],
      personalityTraits: ['brave'],
      backstory: null,
      behaviorTree: {},
      level: 1,
      xp: 0,
      unlockedSkillSlots: 0,
      battleWins: 0,
      battleLosses: 0,
      boundAgentId: null,
      source: 'scanned',
      generationStatus: 'complete',
      sourceImagesMetadata: null,
      abilitySnapshot: null,
      linkedSoulId: null,
      sourceAgentAccountId: null,
      worldState: null,
      lastTickAt: null,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assetStore.set(id, asset);
    versionStore.set(id, 0);
    return asset;
  }

  // ─── Property Tests ────────────────────────────────────────────────────

  it('P4.1: Every asset has exactly one owner after any purchase attempt', async () => {
    await fc.assert(
      fc.asyncProperty(
        assetIdArb,
        userIdArb,
        userIdArb,
        priceArb,
        currencyArb,
        async (assetId, sellerId, buyerId, price, currency) => {
          fc.pre(sellerId !== buyerId);

          createTestAsset(assetId, sellerId);

          const { listingId } = await marketplaceService.createListing(
            assetId,
            price,
            currency,
            sellerId,
          );

          await marketplaceService.purchaseAsset(listingId, buyerId);

          // INVARIANT: Asset must have exactly one owner (never null, never dual)
          const asset = assetStore.get(assetId);
          expect(asset).toBeDefined();
          expect(asset!.ownerId).toBeDefined();
          expect(asset!.ownerId).not.toBeNull();
          expect(typeof asset!.ownerId).toBe('string');
          expect(asset!.ownerId.length).toBeGreaterThan(0);

          // Owner must be either the original seller OR the buyer (no third party)
          expect([sellerId, buyerId]).toContain(asset!.ownerId);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('P4.2: Concurrent purchases of the same asset — only one buyer wins', async () => {
    await fc.assert(
      fc.asyncProperty(
        assetIdArb,
        userIdArb,
        fc.array(userIdArb, { minLength: 2, maxLength: 5 }),
        priceArb,
        async (assetId, sellerId, buyerIds, price) => {
          const uniqueBuyers = [...new Set(buyerIds.filter((b) => b !== sellerId))];
          fc.pre(uniqueBuyers.length >= 2);

          createTestAsset(assetId, sellerId);

          const { listingId } = await marketplaceService.createListing(
            assetId,
            price,
            'USD',
            sellerId,
          );

          const results = await Promise.allSettled(
            uniqueBuyers.map((buyerId) =>
              marketplaceService.purchaseAsset(listingId, buyerId),
            ),
          );

          const successes = results.filter(
            (r) =>
              r.status === 'fulfilled' &&
              (r.value as any).status === 'completed',
          );

          // INVARIANT: At most ONE buyer succeeds
          expect(successes.length).toBeLessThanOrEqual(1);

          // INVARIANT: Asset still has exactly one owner
          const asset = assetStore.get(assetId);
          expect(asset).toBeDefined();
          expect(asset!.ownerId).toBeDefined();
          expect(asset!.ownerId).not.toBeNull();

          if (successes.length === 1) {
            expect(uniqueBuyers).toContain(asset!.ownerId);
          } else {
            expect(asset!.ownerId).toBe(sellerId);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('P4.3: Failed transaction leaves ownership unchanged (rollback correctness)', async () => {
    await fc.assert(
      fc.asyncProperty(
        assetIdArb,
        userIdArb,
        userIdArb,
        priceArb,
        async (assetId, sellerId, buyerId, price) => {
          fc.pre(sellerId !== buyerId);

          createTestAsset(assetId, sellerId);

          const { listingId } = await marketplaceService.createListing(
            assetId,
            price,
            'USD',
            sellerId,
          );

          const asset = assetStore.get(assetId)!;
          const originalOwner = asset.ownerId;
          const originalVersion = asset.version;

          // Simulate a CONCURRENT modification that lands AFTER Phase-1 reservation
          // (which snapshots the current version) but BEFORE Phase-2 commit. This is
          // the only ordering that exercises the optimistic-lock rollback: the commit
          // re-reads version and finds it bumped relative to the reservation snapshot.
          preCommitHook = () => {
            versionStore.set(assetId, originalVersion + 1);
            asset.version = originalVersion + 1;
            assetStore.set(assetId, asset);
          };

          const result = await marketplaceService.purchaseAsset(listingId, buyerId);

          // INVARIANT: On failure, ownership is unchanged
          const postAsset = assetStore.get(assetId)!;
          expect(postAsset.ownerId).toBe(originalOwner);
          expect(result.status).toBe('failed');
        },
      ),
      { numRuns: 30 },
    );
  });

  it('P4.4: Idempotent purchase — same paymentId never creates dual ownership', async () => {
    await fc.assert(
      fc.asyncProperty(
        assetIdArb,
        userIdArb,
        userIdArb,
        priceArb,
        fc.uuid(), // paymentId
        async (assetId, sellerId, buyerId, price, paymentId) => {
          fc.pre(sellerId !== buyerId);

          createTestAsset(assetId, sellerId);

          const { listingId } = await marketplaceService.createListing(
            assetId,
            price,
            'USD',
            sellerId,
          );

          // Submit the same purchase multiple times with the same paymentId.
          // The Phase-1 idempotency guarantee covers retries (sequential replays):
          // the cached result is returned without re-transferring ownership.
          // (Truly-concurrent same-payment dedup needs a distributed lock and is
          // deferred to Phase 2 per design §10 — not asserted here.)
          const first = await marketplaceService.purchaseAsset(listingId, buyerId, paymentId);
          const second = await marketplaceService.purchaseAsset(listingId, buyerId, paymentId);
          const third = await marketplaceService.purchaseAsset(listingId, buyerId, paymentId);
          const results = [first, second, third];

          // INVARIANT: all replays share the same status AND transactionId (idempotent)
          const statuses = results.map((r) => r.status);
          const transactionIds = results.map((r) => r.transactionId);
          expect(new Set(statuses).size).toBe(1);
          expect(new Set(transactionIds).size).toBe(1);

          // Asset has exactly one owner
          const asset = assetStore.get(assetId)!;
          expect(asset.ownerId).toBeDefined();
          expect(asset.ownerId).not.toBeNull();
          expect([sellerId, buyerId]).toContain(asset.ownerId);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('P4.5: No ownerless state — ownerId is never null or empty string', async () => {
    await fc.assert(
      fc.asyncProperty(
        assetIdArb,
        userIdArb,
        userIdArb,
        priceArb,
        fc.boolean(), // whether purchase succeeds
        async (assetId, sellerId, buyerId, price, _shouldSucceed) => {
          fc.pre(sellerId !== buyerId);

          createTestAsset(assetId, sellerId);

          const { listingId } = await marketplaceService.createListing(
            assetId,
            price,
            'USD',
            sellerId,
          );

          try {
            await marketplaceService.purchaseAsset(listingId, buyerId);
          } catch {
            // Ignore errors — we're checking the invariant regardless
          }

          // INVARIANT: ownerId is never null, undefined, or empty
          const asset = assetStore.get(assetId)!;
          expect(asset.ownerId).toBeDefined();
          expect(asset.ownerId).not.toBeNull();
          expect(asset.ownerId).not.toBe('');
          expect(typeof asset.ownerId).toBe('string');
        },
      ),
      { numRuns: 50 },
    );
  });
});
