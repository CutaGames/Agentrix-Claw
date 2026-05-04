import { Module } from '@nestjs/common';
import { PrivacyFenceService } from './privacy-fence.service';
import { CoSignService } from './co-sign.service';
import { PrivacyFenceController } from './privacy-fence.controller';

/** PrivacyFenceModule — 顿领 §13 隐私围栏 + L3 多端协签 (P3-7) */
@Module({
  controllers: [PrivacyFenceController],
  providers: [PrivacyFenceService, CoSignService],
  exports: [PrivacyFenceService, CoSignService],
})
export class PrivacyFenceModule {}
