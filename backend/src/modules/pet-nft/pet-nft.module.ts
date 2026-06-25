import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetNftIntent } from '../../entities/pet-nft-intent.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetNftService } from './pet-nft.service';
import { PetNftController } from './pet-nft.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PetNftIntent, LivingPet])],
  providers: [PetNftService],
  controllers: [PetNftController],
  exports: [PetNftService],
})
export class PetNftModule {}
