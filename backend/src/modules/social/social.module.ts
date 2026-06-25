import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SocialPost,
  SocialComment,
  SocialLike,
  SocialFollow,
  SocialEvent,
  SocialReplyConfig,
} from '../../entities/social.entity';
import { SocialAccount } from '../../entities/social-account.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { User } from '../../entities/user.entity';
import { Skill } from '../../entities/skill.entity';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { SocialCallbackController } from './social-callback.controller';
import { OpenClawConnectionModule } from '../openclaw-connection/openclaw-connection.module';
import { ClaudeIntegrationModule } from '../ai-integration/claude/claude-integration.module';
import { AgentPresenceModule } from '../agent-presence/agent-presence.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SocialPost,
      SocialComment,
      SocialLike,
      SocialFollow,
      SocialEvent,
      SocialReplyConfig,
      SocialAccount,
      OpenClawInstance,
      User,
      Skill,
    ]),
    OpenClawConnectionModule,
    ClaudeIntegrationModule,
    AgentPresenceModule,
  ],
  providers: [SocialService],
  controllers: [SocialController, SocialCallbackController],
  exports: [SocialService],
})
export class SocialModule {}
