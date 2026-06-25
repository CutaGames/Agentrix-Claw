import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetDiaryEntry } from '../../entities/pet-diary-entry.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { PetArenaLadderSnapshot } from '../../entities/pet-arena-ladder-snapshot.entity';
import { LivingPetService } from './living-pet.service';
import { LivingPetController } from './living-pet.controller';
import { PetPublicController } from './pet-public.controller';
import { PetSocialController } from './pet-social.controller';
import { PetSocialService } from './pet-social.service';
import { PetDiaryController } from './pet-diary.controller';
import { PetDiaryService } from './pet-diary.service';
import { PetAccountController } from './pet-account.controller';
import { PetSoulTemplateModule } from '../pet-soul-template/pet-soul-template.module';
import { PetSkinModule } from '../pet-skin/pet-skin.module';
import { PetGenQuotaModule } from '../pet-gen-quota/pet-gen-quota.module';
import { MarketplacePetModule } from '../marketplace-pet/marketplace-pet.module';
import { PetAchievementModule } from '../pet-achievement/pet-achievement.module';
import { PetEnergyModule } from '../pet-energy/pet-energy.module';
import { PetCompanionEngineModule } from '../pet-companion-engine/pet-companion-engine.module';

/**
 * LivingPetModule
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LivingPet, PetDiaryEntry, AgentAccount, PetArenaLadderSnapshot]),
    PetSoulTemplateModule,
    PetSkinModule,
    PetGenQuotaModule,
    MarketplacePetModule,
    PetAchievementModule,
    PetEnergyModule,
    forwardRef(() => PetCompanionEngineModule),
  ],
  controllers: [
    LivingPetController,
    PetPublicController,
    PetSocialController,
    PetDiaryController,
    PetAccountController,
  ],
  providers: [LivingPetService, PetSocialService, PetDiaryService],
  exports: [LivingPetService, PetSocialService, PetDiaryService],
})
export class LivingPetModule {}
