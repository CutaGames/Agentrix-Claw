import { Module } from '@nestjs/common';
import { AutoEarnTimelineService } from './auto-earn-timeline.service';
import { AutoEarnTimelineController } from './auto-earn-timeline.controller';

/** AutoEarnTimelineModule — 顿领 §9.4 (P2-2) */
@Module({
  controllers: [AutoEarnTimelineController],
  providers: [AutoEarnTimelineService],
  exports: [AutoEarnTimelineService],
})
export class AutoEarnTimelineModule {}
