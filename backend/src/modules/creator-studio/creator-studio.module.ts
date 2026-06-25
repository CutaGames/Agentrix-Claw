import { Module, forwardRef } from '@nestjs/common';
import { CreatorStudioService } from './creator-studio.service';
import { PetGenerationModule } from '../pet-generation/pet-generation.module';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';

@Module({
  imports: [
    forwardRef(() => PetGenerationModule),
    forwardRef(() => DesktopSyncModule),
  ],
  providers: [CreatorStudioService],
  exports: [CreatorStudioService],
})
export class CreatorStudioModule {}
