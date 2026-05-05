import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoSignRequestEntity } from '../../entities/co-sign-request.entity';
import { PrivacyFenceAuditEntity } from '../../entities/privacy-fence-audit.entity';
import { PrivacyFenceGrantEntity } from '../../entities/privacy-fence-grant.entity';
import { PrivacyFenceItemEntity } from '../../entities/privacy-fence-item.entity';
import { PrivacyFenceService } from './privacy-fence.service';
import { CoSignService } from './co-sign.service';
import { PrivacyFenceController } from './privacy-fence.controller';

/** PrivacyFenceModule — 顿领 §13 隐私围栏 + L3 多端协签 (P3-7) */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PrivacyFenceItemEntity,
      PrivacyFenceGrantEntity,
      PrivacyFenceAuditEntity,
      CoSignRequestEntity,
    ]),
  ],
  controllers: [PrivacyFenceController],
  providers: [PrivacyFenceService, CoSignService],
  exports: [PrivacyFenceService, CoSignService],
})
export class PrivacyFenceModule {}
