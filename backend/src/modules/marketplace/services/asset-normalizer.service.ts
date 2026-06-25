import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MarketplaceAsset,
  MarketplaceAssetStatus,
} from '../../../entities/marketplace-asset.entity';
import { NormalizedAsset } from '../interfaces';

@Injectable()
export class AssetNormalizerService {
  private readonly logger = new Logger(AssetNormalizerService.name);

  constructor(
    @InjectRepository(MarketplaceAsset)
    private readonly marketplaceAssetRepository: Repository<MarketplaceAsset>,
  ) {}

  async upsertAssets(assets: NormalizedAsset[], sourceCode: string) {
    if (!assets.length) {
      return { created: 0, updated: 0 };
    }

    let created = 0;
    let updated = 0;
    for (const asset of assets) {
      const existing = await this.marketplaceAssetRepository.findOne({
        where: [
          asset.address
            ? { chain: asset.chain, address: asset.address }
            : undefined,
          asset.externalId ? { externalId: asset.externalId } : undefined,
        ].filter(Boolean),
      });

      if (existing) {
        await this.marketplaceAssetRepository.update(existing.id, {
          name: asset.name || existing.name,
          symbol: asset.symbol || existing.symbol,
          chain: asset.chain || existing.chain,
          address: asset.address || existing.address,
          pair: asset.pair || existing.pair,
          imageUrl: asset.imageUrl || existing.imageUrl,
          priceUsd: this.toNumeric(asset.priceUsd),
          liquidityUsd: this.toNumeric(asset.liquidityUsd),
          volume24hUsd: this.toNumeric(asset.volume24hUsd),
          change24hPercent: this.toNumeric(asset.change24hPercent),
          source: sourceCode,
          lastIngestedAt: new Date(),
          metadata: {
            ...(existing.metadata || {}),
            ...(asset.metadata || {}),
          },
        });
        updated += 1;
      } else {
        await this.marketplaceAssetRepository.save(
          this.marketplaceAssetRepository.create({
            type: asset.type,
            name: asset.name,
            symbol: asset.symbol,
            chain: asset.chain,
            address: asset.address,
            pair: asset.pair,
            source: sourceCode,
            externalId: asset.externalId,
            imageUrl: asset.imageUrl,
            priceUsd: this.toNumeric(asset.priceUsd),
            liquidityUsd: this.toNumeric(asset.liquidityUsd),
            volume24hUsd: this.toNumeric(asset.volume24hUsd),
            change24hPercent: this.toNumeric(asset.change24hPercent),
            status: MarketplaceAssetStatus.ACTIVE,
            metadata: asset.metadata,
            lastIngestedAt: new Date(),
          }),
        );
        created += 1;
      }
    }

    this.logger.log(
      `Normalized ${assets.length} assets from ${sourceCode}. Created ${created}, updated ${updated}`,
    );

    return { created, updated };
  }

  private toNumeric(value?: number): string | undefined {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return undefined;
    }
    return value.toString();
  }
}

