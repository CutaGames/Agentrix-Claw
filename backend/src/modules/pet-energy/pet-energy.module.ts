import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';
import { PetLlmUsageEvent } from '../../entities/pet-llm-usage-event.entity';
import { PetA2ADispatch } from '../../entities/pet-a2a-dispatch.entity';
import { PetEnergyService } from './pet-energy.service';
import { PetRiskControlService } from './pet-risk-control.service';
import { AutoEarnEvaluatorService } from './auto-earn-evaluator.service';
import { PetReportService } from './pet-report.service';

/**
 * PetEnergyModule — Phase 4 BE-T4.4 / BE-T4.5 / BE-T4.6 / BE-T4.8 / BE-T4.9
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetEnergyState, PetLlmUsageEvent, PetA2ADispatch])],
  providers: [PetEnergyService, PetRiskControlService, AutoEarnEvaluatorService, PetReportService],
  exports: [PetEnergyService, PetRiskControlService, AutoEarnEvaluatorService, PetReportService],
})
export class PetEnergyModule {}
