import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { PetActiveSkin } from '../../entities/pet-active-skin.entity';
import { PetSkinService } from './pet-skin.service';
import { PetSkinController } from './pet-skin.controller';

/**
 * PetSkinModule — 用户皮肤资产 + 激活指针
 *
 * Phase 1 W2：仅基本 CRUD + activate。
 * Phase 2-3：与 PetCreator / Marketplace 集成（自动注册新皮肤）。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetSkin, PetActiveSkin])],
  controllers: [PetSkinController],
  providers: [PetSkinService],
  exports: [PetSkinService],
})
export class PetSkinModule {}
