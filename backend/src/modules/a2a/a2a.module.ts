/**
 * A2A (Agent-to-Agent) Module
 * 
 * Handles agent-to-agent task delegation, reputation tracking,
 * quality assessment, and webhook callbacks.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { A2ATask } from '../../entities/a2a-task.entity';
import { AgentReputation } from '../../entities/agent-reputation.entity';
import { AP2MandateEntity } from '../../entities/ap2-mandate.entity';
import { A2AService } from './a2a.service';
import { A2AController } from './a2a.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      A2ATask,
      AgentReputation,
      AP2MandateEntity,
    ]),
    forwardRef(() => NotificationModule),
  ],
  controllers: [A2AController],
  providers: [A2AService],
  exports: [A2AService],
})
export class A2AModule {}
