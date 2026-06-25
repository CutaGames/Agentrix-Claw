import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MarketplaceAsset,
  MarketplaceAssetStatus,
  MarketplaceAssetType,
} from '../../entities/marketplace-asset.entity';

interface GetAssetsOptions {
  type?: string;
  chain?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(MarketplaceAsset)
    private readonly marketplaceAssetRepository: Repository<MarketplaceAsset>,
  ) {}

  async getAssets(options: GetAssetsOptions) {
    const page = Math.max(options.page || 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize || 20, 1), 100);

    const qb = this.marketplaceAssetRepository
      .createQueryBuilder('asset')
      .where('asset.status = :status', { status: MarketplaceAssetStatus.ACTIVE });

    if (options.type && options.type in MarketplaceAssetType) {
      qb.andWhere('asset.type = :type', { type: options.type });
    }

    if (options.chain) {
      qb.andWhere('asset.chain = :chain', { chain: options.chain });
    }

    if (options.search) {
      qb.andWhere(
        '(asset.name ILIKE :search OR asset.symbol ILIKE :search OR asset.chain ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    qb.orderBy('asset.featured', 'DESC')
      .addOrderBy('asset.liquidityUsd', 'DESC', 'NULLS LAST')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 搜索资产（支持语义搜索）
   */
  async searchAssets(
    query: string,
    filters?: {
      type?: MarketplaceAssetType;
      chain?: string;
      priceMin?: number;
      priceMax?: number;
    },
  ) {
    const qb = this.marketplaceAssetRepository
      .createQueryBuilder('asset')
      .where('asset.status = :status', { status: MarketplaceAssetStatus.ACTIVE });

    if (query) {
      qb.andWhere(
        '(asset.name ILIKE :query OR asset.symbol ILIKE :query OR asset.description ILIKE :query)',
        { query: `%${query}%` },
      );
    }

    if (filters?.type) {
      qb.andWhere('asset.type = :type', { type: filters.type });
    }

    if (filters?.chain) {
      qb.andWhere('asset.chain = :chain', { chain: filters.chain });
    }

    if (filters?.priceMin) {
      qb.andWhere('CAST(asset.priceUsd AS DECIMAL) >= :priceMin', { priceMin: filters.priceMin });
    }

    if (filters?.priceMax) {
      qb.andWhere('CAST(asset.priceUsd AS DECIMAL) <= :priceMax', { priceMax: filters.priceMax });
    }

    qb.orderBy('asset.liquidityUsd', 'DESC', 'NULLS LAST')
      .addOrderBy('asset.volume24hUsd', 'DESC', 'NULLS LAST')
      .limit(50);

    return qb.getMany();
  }

  /**
   * 获取推荐资产
   */
  async getRecommendedAssets(
    userId?: string,
    limit: number = 10,
  ): Promise<MarketplaceAsset[]> {
    const qb = this.marketplaceAssetRepository
      .createQueryBuilder('asset')
      .where('asset.status = :status', { status: MarketplaceAssetStatus.ACTIVE })
      .orderBy('asset.featured', 'DESC')
      .addOrderBy('asset.liquidityUsd', 'DESC', 'NULLS LAST')
      .addOrderBy('asset.volume24hUsd', 'DESC', 'NULLS LAST')
      .limit(limit);

    return qb.getMany();
  }
}

