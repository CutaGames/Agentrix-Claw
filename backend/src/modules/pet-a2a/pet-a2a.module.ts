import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetA2ADispatch } from '../../entities/pet-a2a-dispatch.entity';
import { PetA2ADispatchService } from './pet-a2a-dispatch.service';
import { PetEnergyModule } from '../pet-energy/pet-energy.module';

/**
 * PetA2AModule — Phase 4 BE-T4.7 — pet as task issuer.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetA2ADispatch]), PetEnergyModule],
  providers: [PetA2ADispatchService],
  exports: [PetA2ADispatchService],
})
export class PetA2AModule {}
