import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationLog } from '../../entities/moderation-log.entity';
import { ModerationService } from './moderation.service';

/**
 * ModerationModule — Phase 2 W1 内容审核（骨架）
 * 暂不暴露 controller；由 PetCreatorService / MarketplaceUploadService 内部调用。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ModerationLog])],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
