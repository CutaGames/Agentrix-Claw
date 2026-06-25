import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DirectMessage } from '../../entities/direct-message.entity';
import { AgentSpace, AgentSpaceMessage } from '../../entities/agent-space.entity';
import { MessagingService } from './messaging.service';
import { AgentSpaceService } from './agent-space.service';
import { MessagingController } from './messaging.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DirectMessage, AgentSpace, AgentSpaceMessage])],
  providers: [MessagingService, AgentSpaceService],
  controllers: [MessagingController],
  exports: [MessagingService, AgentSpaceService],
})
export class MessagingModule {}
