import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { LivingPetService } from './living-pet.service';
import { LivingPetController } from './living-pet.controller';
import { PetPublicController } from './pet-public.controller';
import { PetSoulTemplateModule } from '../pet-soul-template/pet-soul-template.module';
import { PetSkinModule } from '../pet-skin/pet-skin.module';
import { PetGenQuotaModule } from '../pet-gen-quota/pet-gen-quota.module';
import { MarketplacePetModule } from '../marketplace-pet/marketplace-pet.module';
import { PetAchievementModule } from '../pet-achievement/pet-achievement.module';

/**
 * LivingPetModule
 */
@Module({
  imports: [TypeOrmModule.forFeature([LivingPet]), PetSoulTemplateModule, PetSkinModule, PetGenQuotaModule, MarketplacePetModule, PetAchievementModule],
  controllers: [LivingPetController, PetPublicController],
  providers: [LivingPetService],
  exports: [LivingPetService],
})
export class LivingPetModule {}
