import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetGenQuota } from '../../entities/pet-gen-quota.entity';
import { Payment } from '../../entities/payment.entity';
import { PetGenQuotaService } from './pet-gen-quota.service';
import { PetGenQuotaController } from './pet-gen-quota.controller';
import { PetGenQuotaSchedulerService } from './pet-gen-quota.scheduler';
import { PetOverageBillingService } from './pet-overage-billing.service';
import { UserPlanResolverService } from './user-plan-resolver.service';

/**
 * PetGenQuotaModule — Phase 2 W1→W3:
 *  - W1 账本 (PetGenQuotaService + Controller)
 *  - W2 月度 cron (Scheduler)
 *  - W3 Stripe overage bridge (PetOverageBillingService)
 *  - W3 plan-tier resolver (UserPlanResolverService) — reads payments to derive tier
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetGenQuota, Payment])],
  controllers: [PetGenQuotaController],
  providers: [
    PetGenQuotaService,
    PetGenQuotaSchedulerService,
    PetOverageBillingService,
    UserPlanResolverService,
  ],
  exports: [PetGenQuotaService, PetOverageBillingService, UserPlanResolverService],
})
export class PetGenQuotaModule {}
