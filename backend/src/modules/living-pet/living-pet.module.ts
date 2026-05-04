import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { LivingPetService } from './living-pet.service';
import { LivingPetController } from './living-pet.controller';

/**
 * LivingPetModule — 顿领 §3.4 主宠状态机
 *
 * - 1 user = 1 LivingPet（unique）
 * - 6 基础表情 + 4 P3 扩展
 * - 自动衰减 + 亲密度 + 引擎切换契约（§3.8）
 * - 通过 desktopSyncEventBus 经 PresenceGateway 广播到 user 房间
 */
@Module({
  imports: [TypeOrmModule.forFeature([LivingPet])],
  controllers: [LivingPetController],
  providers: [LivingPetService],
  exports: [LivingPetService],
})
export class LivingPetModule {}
