import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationLog } from '../../entities/moderation-log.entity';
import { ModerationService } from './moderation.service';
import { ReplicateClipProvider } from './replicate-clip.provider';

/**
 * ModerationModule — Phase 2 W1 + W3。
 * W3 新增 ReplicateClipProvider（CLIP NSFW classifier）。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ModerationLog]), ConfigModule],
  providers: [ModerationService, ReplicateClipProvider],
  exports: [ModerationService, ReplicateClipProvider],
})
export class ModerationModule {}
