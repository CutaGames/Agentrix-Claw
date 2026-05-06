import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetSovereignProfile } from '../../entities/pet-sovereign-profile.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetSovereignService } from './pet-sovereign.service';
import { PetSovereignController } from './pet-sovereign.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PetSovereignProfile, LivingPet])],
  providers: [PetSovereignService],
  controllers: [PetSovereignController],
  exports: [PetSovereignService],
})
export class PetSovereignModule {}
