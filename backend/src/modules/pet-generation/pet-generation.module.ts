import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PetGenerationTask } from '../../entities/pet-generation-task.entity';
import { PetGenerationService } from './pet-generation.service';
import { PetGenerationController } from './pet-generation.controller';
import { MeshyProvider } from './meshy.provider';
import { Hunyuan3DProvider } from './hunyuan3d.provider';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage } from '../../entities/agent-message.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PetGenerationTask, AgentSession, AgentMessage]),
    AiProviderModule,
    DesktopSyncModule,
  ],
  controllers: [PetGenerationController],
  providers: [PetGenerationService, MeshyProvider, Hunyuan3DProvider],
  exports: [PetGenerationService, MeshyProvider, Hunyuan3DProvider],
})
export class PetGenerationModule {}
