import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProtocolController } from './protocol.controller';
import { ProtocolService } from './protocol.service';
import { AcpBridgeService } from './acp-bridge.service';
import { Skill } from '../../entities/skill.entity';
import { AgentSession } from '../../entities/agent-session.entity';
import { SkillModule } from '../skill/skill.module';

@Module({
  imports: [TypeOrmModule.forFeature([Skill, AgentSession]), SkillModule],
  controllers: [ProtocolController],
  providers: [ProtocolService, AcpBridgeService],
  exports: [ProtocolService, AcpBridgeService],
})
export class ProtocolModule {}
