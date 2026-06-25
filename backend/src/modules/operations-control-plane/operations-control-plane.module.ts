import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentLaneEvent } from '../../entities/agent-lane-event.entity';
import { AgentLaneJob } from '../../entities/agent-lane-job.entity';
import { AgentRepairJob } from '../../entities/agent-repair-job.entity';
import {
  DesktopApproval,
  DesktopCommand,
  DesktopDevicePresence,
  DesktopSession,
  DesktopTask,
} from '../../entities/desktop-sync.entity';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';
import { ToolControlPlaneModule } from '../tool-control-plane/tool-control-plane.module';
import { OperationsControlPlaneController } from './operations-control-plane.controller';
import { OperationsControlPlaneService } from './operations-control-plane.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentLaneJob,
      AgentLaneEvent,
      AgentRepairJob,
      DesktopDevicePresence,
      DesktopSession,
      DesktopTask,
      DesktopApproval,
      DesktopCommand,
    ]),
    DesktopSyncModule,
    ToolControlPlaneModule,
  ],
  controllers: [OperationsControlPlaneController],
  providers: [OperationsControlPlaneService],
  exports: [OperationsControlPlaneService],
})
export class OperationsControlPlaneModule {}