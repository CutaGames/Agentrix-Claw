import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetA2ADispatch } from '../../entities/pet-a2a-dispatch.entity';
import { PetA2ADispatchService } from './pet-a2a-dispatch.service';
import { PetA2AController } from './pet-a2a.controller';
import { PetEnergyModule } from '../pet-energy/pet-energy.module';

/**
 * PetA2AModule — Phase 4 BE-T4.7 / BE-7.4 — pet as task issuer.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetA2ADispatch]), PetEnergyModule],
  controllers: [PetA2AController],
  providers: [PetA2ADispatchService],
  exports: [PetA2ADispatchService],
})
export class PetA2AModule {}
