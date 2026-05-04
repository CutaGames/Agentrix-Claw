import { Module } from '@nestjs/common';
import { SplitBudgetService } from './split-budget.service';
import { SplitBudgetController } from './split-budget.controller';

/**
 * SplitBudgetModule — 顿领 §9.3 §9.5 SplitPlan + BudgetPool + Audit (P1-8)
 */
@Module({
  controllers: [SplitBudgetController],
  providers: [SplitBudgetService],
  exports: [SplitBudgetService],
})
export class SplitBudgetModule {}
