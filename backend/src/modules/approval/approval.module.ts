import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalRequest } from '../../entities/approval-request.entity';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

/**
 * ApprovalModule — 顿领 §5.2 4 级风险审批路由
 */
@Module({
  imports: [TypeOrmModule.forFeature([ApprovalRequest])],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
