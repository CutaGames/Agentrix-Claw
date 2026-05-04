import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { PlanRunnerService } from './plan-runner.service';
import { PlanRunnerController } from './plan-runner.controller';

/**
 * PlanRunnerModule — 顿领 §5.4 Plan-Approval 闭环 (P1-4)
 *
 *   submit → approval → run （任一端审批通过即可执行）
 */
@Module({
  imports: [ApprovalModule],
  controllers: [PlanRunnerController],
  providers: [PlanRunnerService],
  exports: [PlanRunnerService],
})
export class PlanRunnerModule {}
