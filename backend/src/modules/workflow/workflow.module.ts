import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from '../../entities/workflow.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowController, WorkflowWebhookController } from './workflow.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Workflow])],
  providers: [WorkflowService],
  controllers: [WorkflowController, WorkflowWebhookController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
