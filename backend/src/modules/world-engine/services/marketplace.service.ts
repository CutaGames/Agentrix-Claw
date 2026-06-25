import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorldAsset } from '../entities/world-asset.entity';
import { AgentQuotaService } from './agent-quota.service';
import { SoulLinkageService } from './soul-linkage.service';

/**
 * Marketplace listing record tracked in-memory (Phase 1).
 * In production, this would be a DB table.
 */
export interface MarketplaceListing {
  listingId: string;
  assetId: string;
  sellerId: string;
  price: number;
  currency: 'USD' | 'AXP';
  status: 'active' | 'reserved' | 'sold' | 'cancelled';
  createdAt: Date;
}

/**
 * Reservation record for Phase 1 of the two-phase commit.
 */
interface ListingReservation {
  reservationId: string;
  listingId: string;
  buyerId: string;
  assetId: string;
  expiresAt: Date;
  /** Snapshot of asset state for rollback truth */
  pendingTransferState: {
    boundAgentId: string | null;
    xp: number;
    battleWins: number;
    battleLosses: number;
    version: number;
  };
}

/**
 * Idempotency record to prevent double-charge on retries.
 */
interface IdempotencyRecord {
  paymentId: string;
  result: { transactionId: string; status: string };
  createdAt: Date;
}

/**
 * Price suggestion factors returned by getSuggestedPrice.
 */
export interface PriceFactors {
  categoryRarity: number;
  battleRecord: { wins: number; losses: number; winRate: number };
  skillUniqueness: number;
  medianPrice30d: number;
}

/**
 * MarketplaceService — World Asset marketplace with two-phase ownership transfer.
 *
 * Implements:
 * - createListing: validate creator, price range, create listing
 * - purchaseAsset: two-phase commit (reserve → commit) per design §10
 * - getSuggestedPrice: AI-based price suggestion
 * - browseListings: filtered/sorted/paginated listing browse
 * - checkBattleProven: "Battle-Proven" notification trigger (R8.5)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  /** In-memory listings store (Phase 1) */
  private readonly listings = new Map<string, MarketplaceListing>();

  /** In-memory reservations store (Phase 1) */
  private readonly reservations = new Map<string, ListingReservation>();

  /** Idempotency records to prevent double-charge */
  private readonly idempotencyRecords = new Map<string, IdempotencyRecord>();

  /** Track assets flagged as "Battle-Proven" (shown once per asset) */
  private readonly battleProvenNotified = new Set<string>();

  /** Reservation timeout: 30 seconds */
  private readonly RESERVATION_TIMEOUT_MS = 30_000;

  /** Price range constraints */
  private readonly PRICE_RANGE = {
    USD: { min: 0.01, max: 999_999.99 },
    AXP: { min: 1, max: 10_000_000 },
  };

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    private readonly agentQuotaService: AgentQuotaService,
    // Phase C: optional — when present, a sold asset's soul link is removed on transfer.
    // Optional so existing unit tests that construct the service with 2 args still work.
    @Optional() private readonly soulLinkage?: SoulLinkageService,
  ) {
    // Start background cleanup for expired reservations
    this.startReservationCleanup();
  }

  /**
   * Create a marketplace listing for a World Asset.
   *
   * Validates:
   * - User is the original creator (asset.originalCreatorId === userId)
   * - Price is within allowed range (0.01–999,999.99 USD or 1–10,000,000 AXP)
   * - Asset is not already listed
   *
   * @param assetId - The World Asset to list
   * @param price - Asking price
   * @param currency - 'USD' or 'AXP'
   * @param userId - The user creating the listing
   * @returns { listingId }
   *
   * Requirements: 8.1, 8.2
   */
  async createListing(
    assetId: string,
    price: number,
    currency: 'USD' | 'AXP',
    userId: string,
  ): Promise<{ listingId: string }> {
    // Load the asset
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found`);
    }

    // R8.2: Only the original creator may list the asset for initial sale
    if (asset.originalCreatorId !== userId) {
      throw new ForbiddenException(
        'Only the original creator may list this asset for initial sale',
      );
    }

    // Validate price range
    const range = this.PRICE_RANGE[currency];
    if (price < range.min || price > range.max) {
      throw new BadRequestException(
        `Price must be between ${range.min} and ${range.max} ${currency}`,
      );
    }

    // Check if asset already has an active listing
    const existingListing = this.findActiveListingByAssetId(assetId);
    if (existingListing) {
      throw new ConflictException(
        `Asset ${assetId} already has an active listing (${existingListing.listingId})`,
      );
    }

    // Create listing record
    const listingId = uuidv4();
    const listing: MarketplaceListing = {
      listingId,
      assetId,
      sellerId: userId,
      price,
      currency,
      status: 'active',
      createdAt: new Date(),
    };

    this.listings.set(listingId, listing);
    this.logger.log(
      `Listing created: ${listingId} for asset ${assetId} at ${price} ${currency}`,
    );

    return { listingId };
  }

  /**
   * Purchase a World Asset from the marketplace using two-phase commit (design §10).
   *
   * Phase 1 — Reserve (≤30s):
   *   - Validate listing exists and is active
   *   - Check buyer's workspace maxAgents quota (if asset has boundAgentId)
   *   - Set asset to "reserved" state
   *   - Start 30s timer
   *
   * Phase 2 — Commit (single DB transaction):
   *   - worldAsset.ownerId = buyerId
   *   - Transfer bound Agent ownership
   *   - Mark listing as sold
   *   - Use optimistic lock (@VersionColumn) — version mismatch → ROLLBACK
   *
   * Failure paths:
   *   - Quota check fails → release reservation, return error
   *   - Transaction fails → ROLLBACK, release reservation
   *   - 30s timeout → background cleanup releases reservation
   *
   * Idempotency: dedupe by paymentId
   *
   * @param listingId - The listing to purchase
   * @param buyerId - The buyer's user ID
   * @param paymentId - Optional idempotency key (generated if not provided)
   * @returns { transactionId, status: 'completed'|'failed' }
   *
   * Requirements: 8.3, 8.4, 8.7
   */
  async purchaseAsset(
    listingId: string,
    buyerId: string,
    paymentId?: string,
  ): Promise<{ transactionId: string; status: 'completed' | 'failed'; error?: string }> {
    // Generate paymentId for idempotency if not provided
    const effectivePaymentId = paymentId || uuidv4();

    // Check idempotency — if we've already processed this paymentId, return cached result
    const existingRecord = this.idempotencyRecords.get(effectivePaymentId);
    if (existingRecord) {
      this.logger.log(`Idempotent replay for paymentId=${effectivePaymentId}`);
      return existingRecord.result as { transactionId: string; status: 'completed' | 'failed' };
    }

    const transactionId = uuidv4();

    // ─── Phase 1: Reserve ───────────────────────────────────────────────
    const listing = this.listings.get(listingId);
    if (!listing) {
      throw new NotFoundException(`Listing ${listingId} not found`);
    }

    if (listing.status !== 'active') {
      throw new ConflictException(
        `Listing ${listingId} is not available (status: ${listing.status})`,
      );
    }

    // Prevent self-purchase
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Cannot purchase your own listing');
    }

    // Load the asset
    const asset = await this.worldAssetRepo.findOne({ where: { id: listing.assetId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${listing.assetId} no longer exists`);
    }

    // R8.7: Check buyer's Agent slot quota if asset has a bound agent
    if (asset.boundAgentId) {
      const quota = await this.agentQuotaService.checkAgentQuota(buyerId);
      if (!quota.available) {
        const failResult = { transactionId, status: 'failed' as const, error: 
          `Buyer has reached Agent slot quota (${quota.current}/${quota.max}). ` +
          'Upgrade subscription or unbind an existing Agent to receive the bound Agent.' };
        this.cacheIdempotencyResult(effectivePaymentId, failResult);
        return failResult;
      }
    }

    // Set listing to reserved state
    listing.status = 'reserved';

    // Create reservation record with snapshot for rollback
    const reservation: ListingReservation = {
      reservationId: uuidv4(),
      listingId,
      buyerId,
      assetId: listing.assetId,
      expiresAt: new Date(Date.now() + this.RESERVATION_TIMEOUT_MS),
      pendingTransferState: {
        boundAgentId: asset.boundAgentId,
        xp: asset.xp,
        battleWins: asset.battleWins,
        battleLosses: asset.battleLosses,
        version: asset.version,
      },
    };
    this.reservations.set(reservation.reservationId, reservation);

    this.logger.log(
      `Phase 1 complete: reservation=${reservation.reservationId} for listing=${listingId}`,
    );

    // ─── Phase 2: Commit (single DB transaction) ────────────────────────
    try {
      await this.worldAssetRepo.manager.transaction(async (entityManager) => {
        // Re-load asset within transaction with optimistic lock check
        const txAsset = await entityManager.findOne(WorldAsset, {
          where: { id: listing.assetId },
        });

        if (!txAsset) {
          throw new NotFoundException('Asset no longer exists');
        }

        // Optimistic lock: check version matches the snapshot
        if (txAsset.version !== reservation.pendingTransferState.version) {
          throw new ConflictException(
            'Asset was modified concurrently (version mismatch). Transaction rolled back.',
          );
        }

        // Transfer ownership
        txAsset.ownerId = buyerId;

        // Transfer bound Agent ownership (Phase 1: just update the reference)
        // In production, this would also update the agents table
        if (txAsset.boundAgentId) {
          // The agent ownership transfer is tracked via the asset's ownerId change
          // Actual agent table update would happen here in production
          this.logger.log(
            `Transferring bound agent ${txAsset.boundAgentId} to buyer ${buyerId}`,
          );
        }

        // Mark source as purchased for the buyer
        txAsset.source = 'purchased';

        // Save with version increment (TypeORM handles @VersionColumn automatically)
        await entityManager.save(WorldAsset, txAsset);
      });

      // Mark listing as sold
      listing.status = 'sold';

      // Remove reservation
      this.reservations.delete(reservation.reservationId);

      // Phase C: 灵魂不可转让 — 资产易主后解除其与原主主宠的化身链接(best-effort)
      if (this.soulLinkage) {
        try {
          await this.soulLinkage.unlinkOnTransfer(listing.assetId);
        } catch (e) {
          this.logger.warn(`unlinkOnTransfer failed for ${listing.assetId}: ${(e as Error).message}`);
        }
      }

      this.logger.log(
        `Phase 2 complete: asset ${listing.assetId} transferred to ${buyerId}`,
      );

      const successResult = { transactionId, status: 'completed' as const };
      this.cacheIdempotencyResult(effectivePaymentId, successResult);
      return successResult;
    } catch (error) {
      // ─── Failure path: ROLLBACK ─────────────────────────────────────
      this.logger.error(
        `Purchase failed for listing ${listingId}: ${error.message}`,
      );

      // Release reservation
      listing.status = 'active';
      this.reservations.delete(reservation.reservationId);

      const failResult = {
        transactionId,
        status: 'failed' as const,
        error: error.message || 'Transaction failed',
      };
      this.cacheIdempotencyResult(effectivePaymentId, failResult);
      return failResult;
    }
  }

  /**
   * Get AI-suggested price for a World Asset.
   *
   * Calculates based on:
   * - Category rarity (% of marketplace assets sharing the same category)
   * - Battle record (win count and win rate)
   * - Skill uniqueness (number of assets sharing identical skills)
   * - 30-day median sale price of comparable assets
   *
   * Phase 1: simplified formula using battle wins/losses ratio + category distribution.
   *
   * @param assetId - The asset to price
   * @returns { suggestedPrice, factors }
   *
   * Requirements: 8.6
   */
  async getSuggestedPrice(
    assetId: string,
  ): Promise<{ suggestedPrice: number; currency: string; factors: PriceFactors }> {
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found`);
    }

    // Calculate category rarity (lower count = rarer = higher price)
    const categoryCount = await this.worldAssetRepo.count({
      where: { category: asset.category },
    });
    const totalAssets = await this.worldAssetRepo.count();
    const categoryRarity = totalAssets > 0
      ? 1 - (categoryCount / totalAssets)
      : 0.5;

    // Battle record factor
    const totalBattles = asset.battleWins + asset.battleLosses;
    const winRate = totalBattles > 0
      ? asset.battleWins / totalBattles
      : 0;
    const battleRecord = {
      wins: asset.battleWins,
      losses: asset.battleLosses,
      winRate,
    };

    // Skill uniqueness (Phase 1: simplified — count of skills as proxy)
    const skillCount = Array.isArray(asset.skills) ? asset.skills.length : 0;
    const skillUniqueness = Math.min(skillCount / 8, 1); // max 8 skills = 1.0

    // 30-day median (Phase 1: use average of sold listings in memory)
    const medianPrice30d = this.calculateMedianSoldPrice(asset.category);

    // Suggested price formula (Phase 1):
    // Base: 10 USD
    // + category rarity bonus (0-50 USD)
    // + battle record bonus (win rate * battles * 0.5, max 100 USD)
    // + skill uniqueness bonus (0-30 USD)
    // + median adjustment (if median exists, weight toward it)
    const basePrice = 10;
    const rarityBonus = categoryRarity * 50;
    const battleBonus = Math.min(winRate * totalBattles * 0.5, 100);
    const skillBonus = skillUniqueness * 30;

    let suggestedPrice: number;
    if (medianPrice30d > 0) {
      // Weight 60% formula, 40% median
      const formulaPrice = basePrice + rarityBonus + battleBonus + skillBonus;
      suggestedPrice = formulaPrice * 0.6 + medianPrice30d * 0.4;
    } else {
      suggestedPrice = basePrice + rarityBonus + battleBonus + skillBonus;
    }

    // Round to 2 decimal places
    suggestedPrice = Math.round(suggestedPrice * 100) / 100;

    // Clamp to valid range
    suggestedPrice = Math.max(0.01, Math.min(suggestedPrice, 999_999.99));

    const factors: PriceFactors = {
      categoryRarity,
      battleRecord,
      skillUniqueness,
      medianPrice30d,
    };

    return { suggestedPrice, currency: 'USD', factors };
  }

  /**
   * Browse marketplace listings with filters and pagination.
   *
   * @param filters - Optional filters for category, price range, sort, pagination
   * @returns Paginated listing results
   *
   * Requirements: 8.1
   */
  async browseListings(filters: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: (MarketplaceListing & { asset?: WorldAsset })[]; total: number }> {
    const { category, minPrice, maxPrice, sort, page = 1, limit = 20 } = filters;

    // Get all active listings
    let activeListings = Array.from(this.listings.values()).filter(
      (l) => l.status === 'active',
    );

    // Apply price filters
    if (minPrice !== undefined) {
      activeListings = activeListings.filter((l) => l.price >= minPrice);
    }
    if (maxPrice !== undefined) {
      activeListings = activeListings.filter((l) => l.price <= maxPrice);
    }

    // Load assets for category filtering and enrichment
    const assetIds = activeListings.map((l) => l.assetId);
    let assets: WorldAsset[] = [];
    if (assetIds.length > 0) {
      assets = await this.worldAssetRepo
        .createQueryBuilder('asset')
        .where('asset.id IN (:...ids)', { ids: assetIds })
        .getMany();
    }

    const assetMap = new Map(assets.map((a) => [a.id, a]));

    // Apply category filter
    if (category) {
      activeListings = activeListings.filter((l) => {
        const asset = assetMap.get(l.assetId);
        return asset && asset.category === category;
      });
    }

    // Apply sorting
    switch (sort) {
      case 'price_asc':
        activeListings.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        activeListings.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        activeListings.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
        break;
      default:
        // Default: newest first
        activeListings.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
    }

    // Pagination
    const total = activeListings.length;
    const offset = (page - 1) * limit;
    const paginatedListings = activeListings.slice(offset, offset + limit);

    // Enrich with asset data
    const items = paginatedListings.map((listing) => ({
      ...listing,
      asset: assetMap.get(listing.assetId),
    }));

    return { items, total };
  }

  /**
   * Check if a World Asset qualifies as "Battle-Proven" (R8.5).
   *
   * Criteria: >10 battles with >70% win rate.
   * If qualified and not previously notified, flags it for notification.
   *
   * @param assetId - The asset to check
   * @returns Whether the asset is battle-proven and notification should be shown
   *
   * Requirements: 8.5
   */
  async checkBattleProven(assetId: string): Promise<{
    isBattleProven: boolean;
    shouldNotify: boolean;
  }> {
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });
    if (!asset) {
      return { isBattleProven: false, shouldNotify: false };
    }

    const totalBattles = asset.battleWins + asset.battleLosses;
    const winRate = totalBattles > 0 ? asset.battleWins / totalBattles : 0;

    const isBattleProven = totalBattles > 10 && winRate > 0.7;

    // Only notify once per asset
    const shouldNotify = isBattleProven && !this.battleProvenNotified.has(assetId);

    if (shouldNotify) {
      this.battleProvenNotified.add(assetId);
      this.logger.log(
        `Asset ${assetId} flagged as Battle-Proven: ${asset.battleWins}W/${asset.battleLosses}L (${(winRate * 100).toFixed(1)}%)`,
      );
    }

    return { isBattleProven, shouldNotify };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * Find an active listing by asset ID.
   */
  private findActiveListingByAssetId(assetId: string): MarketplaceListing | undefined {
    return Array.from(this.listings.values()).find(
      (l) => l.assetId === assetId && l.status === 'active',
    );
  }

  /**
   * Calculate median sold price for a category (Phase 1: from in-memory listings).
   */
  private calculateMedianSoldPrice(category: string): number {
    const soldListings = Array.from(this.listings.values()).filter(
      (l) => l.status === 'sold',
    );

    if (soldListings.length === 0) {
      return 0;
    }

    // Phase 1: use all sold listings regardless of category (simplified)
    const prices = soldListings.map((l) => l.price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);

    if (prices.length % 2 === 0) {
      return (prices[mid - 1] + prices[mid]) / 2;
    }
    return prices[mid];
  }

  /**
   * Cache an idempotency result for deduplication.
   */
  private cacheIdempotencyResult(
    paymentId: string,
    result: { transactionId: string; status: string },
  ): void {
    this.idempotencyRecords.set(paymentId, {
      paymentId,
      result,
      createdAt: new Date(),
    });
  }

  /**
   * Background cleanup for expired reservations.
   * Runs every 10 seconds to release reservations that exceeded the 30s window.
   */
  private startReservationCleanup(): void {
    setInterval(() => {
      const now = new Date();
      for (const [id, reservation] of this.reservations.entries()) {
        if (reservation.expiresAt <= now) {
          // Release the reservation
          const listing = this.listings.get(reservation.listingId);
          if (listing && listing.status === 'reserved') {
            listing.status = 'active';
            this.logger.warn(
              `Reservation ${id} expired — releasing listing ${reservation.listingId}`,
            );
          }
          this.reservations.delete(id);
        }
      }

      // Clean up old idempotency records (older than 1 hour)
      const oneHourAgo = new Date(now.getTime() - 3_600_000);
      for (const [paymentId, record] of this.idempotencyRecords.entries()) {
        if (record.createdAt < oneHourAgo) {
          this.idempotencyRecords.delete(paymentId);
        }
      }
    }, 10_000).unref(); // unref so it doesn't prevent process exit
  }
}
