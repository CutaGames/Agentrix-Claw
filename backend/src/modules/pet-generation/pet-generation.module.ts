import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PetGenerationTask } from '../../entities/pet-generation-task.entity';
import { PetGenerationService } from './pet-generation.service';
import { PetGenerationController } from './pet-generation.controller';
import { PetBreedController } from './pet-breed.controller';
import { PetAssetProxyController } from './pet-asset-proxy.controller';
import { MeshyProvider } from './meshy.provider';
import { Hunyuan3DProvider } from './hunyuan3d.provider';
import { VrmAutoRigProvider } from './vrm-auto-rig.provider';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';
import { PetSkinModule } from '../pet-skin/pet-skin.module';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage } from '../../entities/agent-message.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PetGenerationTask, AgentSession, AgentMessage]),
    AiProviderModule,
    DesktopSyncModule,
    PetSkinModule,
  ],
  controllers: [PetGenerationController, PetBreedController, PetAssetProxyController],
  providers: [PetGenerationService, MeshyProvider, Hunyuan3DProvider, VrmAutoRigProvider],
  exports: [PetGenerationService, MeshyProvider, Hunyuan3DProvider, VrmAutoRigProvider],
})
export class PetGenerationModule {}
