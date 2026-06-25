import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetBreedingEgg } from '../../entities/pet-breeding-egg.entity';
import { PetBreedingService } from './pet-breeding.service';
import { PetBreedingController } from './pet-breeding.controller';
import { MarketplacePetModule } from '../marketplace-pet/marketplace-pet.module';
import { PetSkinModule } from '../pet-skin/pet-skin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PetBreedingEgg]),
    forwardRef(() => MarketplacePetModule),
    PetSkinModule,
  ],
  controllers: [PetBreedingController],
  providers: [PetBreedingService],
  exports: [PetBreedingService],
})
export class PetBreedingModule {}
