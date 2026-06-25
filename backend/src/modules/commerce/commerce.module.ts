import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceService } from './commerce.service';
import { CommerceController } from './commerce.controller';
import { CommercePublishService } from './commerce-publish.service';
import { SplitPlanService } from './split-plan.service';
import { BudgetPoolService } from './budget-pool.service';
import { BlockchainService } from './blockchain.service';
import { UsagePatternService } from './usage-pattern.service';
import { SplitPlan } from '../../entities/split-plan.entity';
import { BudgetPool } from '../../entities/budget-pool.entity';
import { Milestone } from '../../entities/milestone.entity';
import { CommerceOrder } from '../../entities/commerce-order.entity';
import { CommerceSettlement } from '../../entities/commerce-settlement.entity';
import { CommerceLedgerEntry } from '../../entities/commerce-ledger.entity';
import { Skill } from '../../entities/skill.entity';
import { PaymentModule } from '../payment/payment.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SplitPlan, 
      BudgetPool, 
      Milestone,
      CommerceOrder,
      CommerceSettlement,
      CommerceLedgerEntry,
      Skill,
    ]),
    forwardRef(() => PaymentModule),
    CacheModule,
  ],
  providers: [CommerceService, CommercePublishService, SplitPlanService, BudgetPoolService, BlockchainService, UsagePatternService],
  controllers: [CommerceController],
  exports: [CommerceService, CommercePublishService, SplitPlanService, BudgetPoolService, BlockchainService, UsagePatternService],
})
export class CommerceModule {}
