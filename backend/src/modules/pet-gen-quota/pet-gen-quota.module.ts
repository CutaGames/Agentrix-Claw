import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetGenQuota } from '../../entities/pet-gen-quota.entity';
import { PetGenQuotaService } from './pet-gen-quota.service';
import { PetGenQuotaController } from './pet-gen-quota.controller';
import { PetGenQuotaSchedulerService } from './pet-gen-quota.scheduler';

/**
 * PetGenQuotaModule — Phase 2 W1 配额账本 + W2 月度 cron
 * Phase 2 W3 接入：StripeBillingService / PetCreatorService.consume()
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetGenQuota])],
  controllers: [PetGenQuotaController],
  providers: [PetGenQuotaService, PetGenQuotaSchedulerService],
  exports: [PetGenQuotaService],
})
export class PetGenQuotaModule {}
