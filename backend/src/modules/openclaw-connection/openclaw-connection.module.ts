import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { UserAgent } from '../../entities/user-agent.entity';
import { OpenClawConnectionService } from './openclaw-connection.service';
import { OpenClawConnectionController } from './openclaw-connection.controller';
import { TelegramBotService } from './telegram-bot.service';
import { LocalRelayGateway } from './local-relay.gateway';
import { VoiceModule } from '../voice/voice.module';
import { ClaudeIntegrationModule } from '../ai-integration/claude/claude-integration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenClawInstance, AgentAccount, UserAgent]),
    forwardRef(() => VoiceModule),
    ClaudeIntegrationModule,
  ],
  providers: [OpenClawConnectionService, TelegramBotService, LocalRelayGateway],
  controllers: [OpenClawConnectionController],
  exports: [OpenClawConnectionService, TelegramBotService],
})
export class OpenClawConnectionModule {}
