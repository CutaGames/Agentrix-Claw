import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetProactiveEvent } from '../../entities/pet-proactive-event.entity';
import { PetProactivePref } from '../../entities/pet-proactive-pref.entity';
import { PetDiaryEntry } from '../../entities/pet-diary-entry.entity';
import { PetCompanionEngineService } from './pet-companion-engine.service';
import { PetCompanionEngineController } from './pet-companion-engine.controller';
import { PetGreetController } from './pet-greet.controller';
import { PetGreetService } from './pet-greet.service';
import { MoodDiaryPushService } from './mood-diary-push.service';
import { LivingPetModule } from '../living-pet/living-pet.module';
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * Pet Phase 6 — S2 主动陪伴
 *
 * 提供 Cron-driven 主动事件生成 + WS 推送 + 用户偏好 + 历史。
 * ScheduleModule 已在 AppModule.forRoot()，本模块只声明 @Cron。
 *
 * P-9 wave 6 — 加 PetGreetController/Service 提供 /v1/pet/greet
 * Voice_Greet 入口(Bedrock + fallback templates)。
 *
 * P-9 wave 13 — 加 MoodDiaryPushService 每小时 cron(19-21 push window)
 * 把今日 pet_diary 推送给用户。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LivingPet, PetProactiveEvent, PetProactivePref, PetDiaryEntry]),
    forwardRef(() => LivingPetModule),
    BedrockIntegrationModule,
    NotificationModule,
  ],
  controllers: [PetCompanionEngineController, PetGreetController],
  providers: [PetCompanionEngineService, PetGreetService, MoodDiaryPushService],
  exports: [PetCompanionEngineService, PetGreetService],
})
export class PetCompanionEngineModule {}
