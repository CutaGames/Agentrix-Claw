import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetAchievement } from '../../entities/pet-achievement.entity';
import { PetAchievementService } from './pet-achievement.service';
import { PetAchievementController } from './pet-achievement.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PetAchievement])],
  controllers: [PetAchievementController],
  providers: [PetAchievementService],
  exports: [PetAchievementService],
})
export class PetAchievementModule {}
