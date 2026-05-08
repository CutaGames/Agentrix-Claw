import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { PetActiveSkin } from '../../entities/pet-active-skin.entity';
import { Order } from '../../entities/order.entity';
import { PetSkinService } from './pet-skin.service';
import { PetSkinController } from './pet-skin.controller';
import { MarketplacePetModule } from '../marketplace-pet/marketplace-pet.module';
import { PetGenQuotaModule } from '../pet-gen-quota/pet-gen-quota.module';

/**
 * PetSkinModule — 用户皮肤资产 + 激活指针
 *
 * Phase 1 W2：仅基本 CRUD + activate。
 * Phase 2-3：与 PetCreator / Marketplace 集成（自动注册新皮肤）。
 * V4 §3.2：接入 RoyaltySplitter（付费安装 + 祖先链拆分预览）。
 * Pet Phase 6 P0 (2026-05-08)：加入服务器权威 tier gating + paid Order 验证。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PetSkin, PetActiveSkin, Order]),
    forwardRef(() => MarketplacePetModule),
    PetGenQuotaModule,
  ],
  controllers: [PetSkinController],
  providers: [PetSkinService],
  exports: [PetSkinService],
})
export class PetSkinModule {}
