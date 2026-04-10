import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VideoGenerationTask } from '../../entities/video-generation-task.entity';
import { VideoGenerationService } from './video-generation.service';
import { FalVideoGenerationProvider } from './fal-video-generation.provider';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage } from '../../entities/agent-message.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([VideoGenerationTask, AgentSession, AgentMessage]),
    AiProviderModule,
    DesktopSyncModule,
  ],
  providers: [VideoGenerationService, FalVideoGenerationProvider],
  exports: [VideoGenerationService],
})
export class VideoGenerationModule {}