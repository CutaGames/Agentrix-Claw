import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { Skill } from '../../entities/skill.entity';
import { SkillModule } from '../skill/skill.module';
import { OpenClawBridgeService } from './openclaw-bridge.service';
import { OpenClawBridgeController } from './openclaw-bridge.controller';
import { OpenClawSkillHubService } from './openclaw-skill-hub.service';

@Module({
  imports: [TypeOrmModule.forFeature([OpenClawInstance, Skill]), forwardRef(() => SkillModule)],
  controllers: [OpenClawBridgeController],
  providers: [OpenClawBridgeService, OpenClawSkillHubService],
  exports: [OpenClawBridgeService, OpenClawSkillHubService],
})
export class OpenClawBridgeModule {}
