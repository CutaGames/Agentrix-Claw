import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetMinigameScore } from '../../entities/pet-minigame-score.entity';
import { PetMinigameService } from './pet-minigame.service';
import { PetMinigameController } from './pet-minigame.controller';
import { LivingPetModule } from '../living-pet/living-pet.module';
import { PetAchievementModule } from '../pet-achievement/pet-achievement.module';
import { PetEnergyModule } from '../pet-energy/pet-energy.module';
import { PetSkinModule } from '../pet-skin/pet-skin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PetMinigameScore]),
    LivingPetModule,
    PetAchievementModule,
    PetEnergyModule,
    PetSkinModule,
  ],
  controllers: [PetMinigameController],
  providers: [PetMinigameService],
  exports: [PetMinigameService],
})
export class PetMinigameModule {}
