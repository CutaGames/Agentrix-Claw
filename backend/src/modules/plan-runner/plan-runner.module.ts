import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalModule } from '../approval/approval.module';
import { ToolRegistryModule } from '../tool-registry/tool-registry.module';
import { Plan } from '../../entities/plan.entity';
import { PlanRunnerService } from './plan-runner.service';
import { PlanRunnerController } from './plan-runner.controller';

/**
 * PlanRunnerModule — 顿领 §5.4 Plan-Approval 闭环 (P1-4)
 *
 *   submit → approval → run （任一端审批通过即可执行）
 *   v3 持久化：plans 表（PlanEntity）。
 *   M1+：步骤通过 ToolRegistry 执行真实工具，事件流通过 SSE 推给前端。
 */
@Module({
  imports: [ApprovalModule, ToolRegistryModule, TypeOrmModule.forFeature([Plan])],
  controllers: [PlanRunnerController],
  providers: [PlanRunnerService],
  exports: [PlanRunnerService],
})
export class PlanRunnerModule {}
