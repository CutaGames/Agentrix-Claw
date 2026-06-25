import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingPlanService } from './billing-plan.service';
import { BillingPlanController } from './billing-plan.controller';
import { PetGenQuotaModule } from '../pet-gen-quota/pet-gen-quota.module';
import { PaymentModule } from '../payment/payment.module';

/**
 * Phase 6 / V4 §5.2 — BillingPlanModule
 *
 * Subscription / plan-tier surface for Pro / Pro+. Reads tier via
 * UserPlanResolverService (PetGenQuotaModule) and creates Stripe Checkout
 * Sessions via StripeService (PaymentModule).
 */
@Module({
  imports: [ConfigModule, PetGenQuotaModule, PaymentModule],
  controllers: [BillingPlanController],
  providers: [BillingPlanService],
  exports: [BillingPlanService],
})
export class BillingPlanModule {}
