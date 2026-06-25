import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoEarnEventEntity } from '../../entities/auto-earn-event.entity';
import { AutoEarnTimelineService } from './auto-earn-timeline.service';
import { AutoEarnTimelineController } from './auto-earn-timeline.controller';

/** AutoEarnTimelineModule — 顿领 §9.4 (P2-2) */
@Module({
  imports: [TypeOrmModule.forFeature([AutoEarnEventEntity])],
  controllers: [AutoEarnTimelineController],
  providers: [AutoEarnTimelineService],
  exports: [AutoEarnTimelineService],
})
export class AutoEarnTimelineModule {}
