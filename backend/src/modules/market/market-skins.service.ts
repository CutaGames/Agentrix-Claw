import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';

export interface MarketSkinsQuery {
  sort?: 'featured' | 'newest' | 'popular';
  clan?: string;
  limit?: number;
  cursor?: string;
}

export interface SkinListItemDto {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  url: string;
  format: string;
  clan: string | null;
  source: string;
  creatorUsername: string;
  creatorUserId: string | null;
  likeCount: number;
  viewCount: number;
  remixCount: number;
  listingId: string | null;
  listingMode: string | null;
  priceUsd: number | null;
  startingBidUsd: number | null;
  currentBidUsd: number | null;
  auctionEndsAt: string | null;
  axpAccepted: boolean;
  axpDiscountPercent: number;
  featured: boolean;
  createdAt: string;
  parentSkinId: string | null;
}

export interface MarketSkinsResponse {
  items: SkinListItemDto[];
  total: number;
  nextCursor: string | null;
}

@Injectable()
export class MarketSkinsService {
  constructor(
    @InjectRepository(PetSkin)
    private readonly petSkinRepo: Repository<PetSkin>,
    @InjectRepository(MarketplacePetListing)
    private readonly listingRepo: Repository<MarketplacePetListing>,
  ) {}

  async findSkins(query: MarketSkinsQuery): Promise<MarketSkinsResponse> {
    const limit = Math.min(Math.max(query.limit || 24, 1), 100);
    const sort = query.sort || 'featured';

    // Base query: only public + approved skins
    const qb = this.petSkinRepo
      .createQueryBuilder('skin')
      .leftJoinAndMapOne(
        'skin._listing',
        MarketplacePetListing,
        'listing',
        'listing.petSkinId = skin.id AND listing.status = :listingStatus',
        { listingStatus: 'active' },
      )
      .leftJoin('users', 'creator', 'creator.id = skin.ownerUserId')
      .addSelect('creator.nickname', 'creatorNickname')
      .where('skin.visibility = :visibility', { visibility: 'public' })
      .andWhere('skin.moderationStatus = :moderationStatus', {
        moderationStatus: 'approved',
      });

    // Clan filter
    if (query.clan) {
      qb.andWhere('skin.clan = :clan', { clan: query.clan });
    }

    // Get total count (before pagination)
    const total = await qb.getCount();

    // Cursor-based pagination (using createdAt + id)
    if (query.cursor) {
      const decoded = this.decodeCursor(query.cursor);
      if (decoded) {
        qb.andWhere(
          '(skin.createdAt < :cursorDate OR (skin.createdAt = :cursorDate AND skin.id < :cursorId))',
          { cursorDate: decoded.createdAt, cursorId: decoded.id },
        );
      }
    }

    // Sort logic
    this.applySorting(qb, sort);

    qb.limit(limit + 1); // fetch one extra to determine nextCursor

    const rawAndEntities = await qb.getRawAndEntities();
    const skins = rawAndEntities.entities;
    const rawRows = rawAndEntities.raw;

    // Determine if there's a next page
    const hasMore = skins.length > limit;
    const resultSkins = hasMore ? skins.slice(0, limit) : skins;
    const resultRaw = hasMore ? rawRows.slice(0, limit) : rawRows;

    // Build next cursor
    let nextCursor: string | null = null;
    if (hasMore && resultSkins.length > 0) {
      const lastSkin = resultSkins[resultSkins.length - 1];
      nextCursor = this.encodeCursor(lastSkin.createdAt, lastSkin.id);
    }

    // Map to DTOs
    const items = resultSkins.map((skin, idx) => {
      const raw = resultRaw[idx];
      const listing = (skin as any)._listing as MarketplacePetListing | null;
      const creatorNickname = raw?.creatorNickname || null;

      return this.toDto(skin, listing, creatorNickname);
    });

    return { items, total, nextCursor };
  }

  private applySorting(
    qb: SelectQueryBuilder<PetSkin>,
    sort: 'featured' | 'newest' | 'popular',
  ): void {
    switch (sort) {
      case 'featured':
        qb.orderBy('skin.featured', 'DESC')
          .addOrderBy('skin.createdAt', 'DESC')
          .addOrderBy('skin.id', 'DESC');
        break;
      case 'newest':
        qb.orderBy('skin.createdAt', 'DESC')
          .addOrderBy('skin.id', 'DESC');
        break;
      case 'popular':
        qb.orderBy('skin.viewCount', 'DESC')
          .addOrderBy('skin.createdAt', 'DESC')
          .addOrderBy('skin.id', 'DESC');
        break;
    }
  }

  private toDto(
    skin: PetSkin,
    listing: MarketplacePetListing | null,
    creatorNickname: string | null,
  ): SkinListItemDto {
    return {
      id: skin.id,
      displayName: skin.displayName,
      thumbnailUrl: skin.thumbnailUrl,
      url: skin.url,
      format: skin.format,
      clan: skin.clan,
      source: skin.source,
      creatorUsername: creatorNickname || 'Anonymous',
      creatorUserId: skin.ownerUserId,
      likeCount: skin.likeCount,
      viewCount: skin.viewCount,
      remixCount: skin.remixCount,
      listingId: listing?.id || null,
      listingMode: listing?.mode || null,
      priceUsd: listing?.priceUsd ? parseFloat(listing.priceUsd) : null,
      startingBidUsd: listing?.startingBidUsd
        ? parseFloat(listing.startingBidUsd)
        : null,
      currentBidUsd: null, // Will be populated via subquery if needed
      auctionEndsAt: listing?.auctionEndsAt
        ? listing.auctionEndsAt.toISOString()
        : null,
      axpAccepted: false, // TODO: integrate AXP acceptance flag when available
      axpDiscountPercent: 0,
      featured: skin.featured,
      createdAt: skin.createdAt.toISOString(),
      parentSkinId: skin.parentSkinId,
    };
  }

  private encodeCursor(createdAt: Date, id: string): string {
    const payload = JSON.stringify({ createdAt: createdAt.toISOString(), id });
    return Buffer.from(payload).toString('base64url');
  }

  private decodeCursor(
    cursor: string,
  ): { createdAt: string; id: string } | null {
    try {
      const payload = Buffer.from(cursor, 'base64url').toString('utf-8');
      const parsed = JSON.parse(payload);
      if (parsed.createdAt && parsed.id) {
        return { createdAt: parsed.createdAt, id: parsed.id };
      }
      return null;
    } catch {
      return null;
    }
  }
}
