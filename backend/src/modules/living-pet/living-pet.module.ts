import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { LivingPetService } from './living-pet.service';
import { LivingPetController } from './living-pet.controller';
import { PetPublicController } from './pet-public.controller';
import { PetSoulTemplateModule } from '../pet-soul-template/pet-soul-template.module';
import { PetSkinModule } from '../pet-skin/pet-skin.module';
import { PetGenQuotaModule } from '../pet-gen-quota/pet-gen-quota.module';

/**
 * LivingPetModule — 顿领 §3.4 主宠状态机 + Phase 1 灵魂×皮肤分层
 *
 * - 1 user = 1 LivingPet（unique）
 * - 6 基础表情 + 4 P3 扩展
 * - 自动衰减 + 亲密度 + 引擎切换契约（§3.8）
 * - Phase 1：灵魂切换（switchSoul）+ 皮肤激活（activateSkin）
 * - 通过 desktopSyncEventBus 经 PresenceGateway 广播到 user 房间
 */
@Module({
  imports: [TypeOrmModule.forFeature([LivingPet]), PetSoulTemplateModule, PetSkinModule, PetGenQuotaModule],
  controllers: [LivingPetController, PetPublicController],
  providers: [LivingPetService],
  exports: [LivingPetService],
})
export class LivingPetModule {}
