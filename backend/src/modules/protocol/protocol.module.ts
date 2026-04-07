import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProtocolController } from './protocol.controller';
import { ProtocolService } from './protocol.service';
import { AcpBridgeService } from './acp-bridge.service';
import { Skill } from '../../entities/skill.entity';
import { AgentSession } from '../../entities/agent-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Skill, AgentSession])],
  controllers: [ProtocolController],
  providers: [ProtocolService, AcpBridgeService],
  exports: [ProtocolService, AcpBridgeService],
})
export class ProtocolModule {}
