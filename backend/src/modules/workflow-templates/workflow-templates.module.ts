import { Module } from '@nestjs/common';
import { WorkflowTemplatesService } from './workflow-templates.service';
import { WorkflowTemplatesController } from './workflow-templates.controller';

/** WorkflowTemplatesModule — 顿领 §10.3 联合工作流模板 (P2-8 part 2) */
@Module({
  controllers: [WorkflowTemplatesController],
  providers: [WorkflowTemplatesService],
  exports: [WorkflowTemplatesService],
})
export class WorkflowTemplatesModule {}
