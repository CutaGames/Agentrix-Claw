import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesktopCrashRecordEntity } from '../../entities/desktop-crash-record.entity';
import { DesktopAnalyticsEventEntity } from '../../entities/desktop-analytics-event.entity';
import { DesktopDownloadEventEntity } from '../../entities/desktop-download-event.entity';
import { DesktopAdminController } from './desktop-admin.controller';
import { DesktopAdminService } from './desktop-admin.service';

/**
 * DesktopAdminModule — admin-only aggregated dashboard for Sprint G-3.
 *
 * Endpoint: GET /api/v1/admin/desktop/dashboard?days=7
 *
 * @see .kiro/specs/desktop-ga-internal-beta/design.md §3
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DesktopCrashRecordEntity,
      DesktopAnalyticsEventEntity,
      DesktopDownloadEventEntity,
    ]),
  ],
  controllers: [DesktopAdminController],
  providers: [DesktopAdminService],
  exports: [DesktopAdminService],
})
export class DesktopAdminModule {}
