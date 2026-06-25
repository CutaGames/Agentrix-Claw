import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesktopCrashRecordEntity } from '../../entities/desktop-crash-record.entity';
import { DesktopAnalyticsEventEntity } from '../../entities/desktop-analytics-event.entity';
import { DesktopDownloadEventEntity } from '../../entities/desktop-download-event.entity';
import { DesktopCrashController } from './desktop-crash.controller';
import { DesktopCrashService } from './desktop-crash.service';
import { DesktopAnalyticsController } from './desktop-analytics.controller';
import { DesktopAnalyticsService } from './desktop-analytics.service';
import { DesktopDownloadController } from './desktop-download.controller';
import { DesktopDownloadService } from './desktop-download.service';
import { MobileAnalyticsController } from './mobile-analytics.controller';

/**
 * DesktopLifecycleModule — crash + analytics + download tracking for the
 * desktop client.
 *
 * Endpoints:
 *   POST /api/v1/desktop/crashes
 *   POST /api/v1/desktop/analytics
 *   POST /api/v1/desktop/download/track
 *
 * Update endpoint (`/api/v1/desktop/update/:target/:arch/:current_version`)
 * lives in the existing `DesktopUpdateModule` which has been extended to
 * read from the same `agentrix_desktop.releases` table.
 *
 * @see .kiro/specs/desktop-go-live/design.md
 * @see .kiro/specs/desktop-ga-internal-beta/design.md §2
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DesktopCrashRecordEntity,
      DesktopAnalyticsEventEntity,
      DesktopDownloadEventEntity,
    ]),
  ],
  controllers: [
    DesktopCrashController,
    DesktopAnalyticsController,
    DesktopDownloadController,
    MobileAnalyticsController,
  ],
  providers: [DesktopCrashService, DesktopAnalyticsService, DesktopDownloadService],
  exports: [DesktopCrashService, DesktopAnalyticsService, DesktopDownloadService],
})
export class DesktopLifecycleModule {}
