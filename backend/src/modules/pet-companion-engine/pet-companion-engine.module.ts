import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetProactiveEvent } from '../../entities/pet-proactive-event.entity';
import { PetProactivePref } from '../../entities/pet-proactive-pref.entity';
import { PetCompanionEngineService } from './pet-companion-engine.service';
import { PetCompanionEngineController } from './pet-companion-engine.controller';
import { LivingPetModule } from '../living-pet/living-pet.module';

/**
 * Pet Phase 6 — S2 主动陪伴
 *
 * 提供 Cron-driven 主动事件生成 + WS 推送 + 用户偏好 + 历史。
 * ScheduleModule 已在 AppModule.forRoot()，本模块只声明 @Cron。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LivingPet, PetProactiveEvent, PetProactivePref]),
    forwardRef(() => LivingPetModule),
  ],
  controllers: [PetCompanionEngineController],
  providers: [PetCompanionEngineService],
  exports: [PetCompanionEngineService],
})
export class PetCompanionEngineModule {}
