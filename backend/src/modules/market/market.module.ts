import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { SkillListingEntity } from '../../entities/skill-listing.entity';
import { MerchantTask } from '../../entities/merchant-task.entity';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { MarketSkinsController } from './market-skins.controller';
import { MarketSkinsService } from './market-skins.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

/**
 * MarketModule — Marketplace Ecosystem 统一市场 API。
 *
 * 提供：
 *  - GET /api/v1/market/skins   (皮肤浏览)
 *  - GET /api/v1/market/search  (跨表统一搜索)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PetSkin,
      SkillListingEntity,
      MerchantTask,
      MarketplacePetListing,
    ]),
  ],
  controllers: [MarketSkinsController, MarketController],
  providers: [MarketSkinsService, MarketService],
  exports: [MarketSkinsService, MarketService],
})
export class MarketModule {}
