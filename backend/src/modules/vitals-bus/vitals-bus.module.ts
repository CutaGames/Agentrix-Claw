import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VitalEventEntity } from '../../entities/vital-event.entity';
import { LivingPetModule } from '../living-pet/living-pet.module';
import { VitalsBusService } from './vitals-bus.service';
import { VitalsBusController } from './vitals-bus.controller';

/**
 * VitalsBusModule — 顿领 §3.4.2 + §6.1
 *
 * 任意端 → 总线 → Living Agent 反应器 → 主宠情绪
 */
@Module({
  imports: [LivingPetModule, TypeOrmModule.forFeature([VitalEventEntity])],
  controllers: [VitalsBusController],
  providers: [VitalsBusService],
  exports: [VitalsBusService],
})
export class VitalsBusModule {}
