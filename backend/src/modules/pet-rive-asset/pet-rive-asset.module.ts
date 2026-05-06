import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetRiveAsset } from '../../entities/pet-rive-asset.entity';
import { PetRiveAssetService } from './pet-rive-asset.service';
import { PetRiveAssetController } from './pet-rive-asset.controller';

/**
 * PetRiveAssetModule — Phase 2 W1 Rive 资产清单（骨架）
 * Phase 2 W2-W3 接入：MarketplaceUpload / 自动 rig 管线 / CDN 预热
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetRiveAsset])],
  controllers: [PetRiveAssetController],
  providers: [PetRiveAssetService],
  exports: [PetRiveAssetService],
})
export class PetRiveAssetModule {}
