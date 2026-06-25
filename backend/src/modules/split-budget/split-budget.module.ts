import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { BudgetPool } from '../../entities/budget-pool.entity';
import { SplitPlan } from '../../entities/split-plan.entity';
import { SplitBudgetService } from './split-budget.service';
import { SplitBudgetController } from './split-budget.controller';

/**
 * SplitBudgetModule — 顿领 §9.3 §9.5 SplitPlan + BudgetPool + Audit (P1-8)
 */
@Module({
  imports: [TypeOrmModule.forFeature([SplitPlan, BudgetPool, AuditLog])],
  controllers: [SplitBudgetController],
  providers: [SplitBudgetService],
  exports: [SplitBudgetService],
})
export class SplitBudgetModule {}
