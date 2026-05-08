import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { LivingPetService } from './living-pet.service';
import { LivingPetController } from './living-pet.controller';
import { PetPublicController } from './pet-public.controller';
import { PetSocialController } from './pet-social.controller';
import { PetSocialService } from './pet-social.service';
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
    TypeOrmModule.forFeature([LivingPet]),
    PetSoulTemplateModule,
    PetSkinModule,
    PetGenQuotaModule,
    MarketplacePetModule,
    PetAchievementModule,
    PetEnergyModule,
    forwardRef(() => PetCompanionEngineModule),
  ],
  controllers: [LivingPetController, PetPublicController, PetSocialController],
  providers: [LivingPetService, PetSocialService],
  exports: [LivingPetService, PetSocialService],
})
export class LivingPetModule {}
