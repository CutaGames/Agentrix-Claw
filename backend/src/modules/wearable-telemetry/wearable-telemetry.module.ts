import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WearableTelemetryController } from './wearable-telemetry.controller';
import { WearableTelemetryService } from './wearable-telemetry.service';
import {
  WearableTelemetrySample,
  WearableAutomationRule,
  WearableTriggerEvent,
} from '../../entities/wearable-telemetry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WearableTelemetrySample,
      WearableAutomationRule,
      WearableTriggerEvent,
    ]),
  ],
  controllers: [WearableTelemetryController],
  providers: [WearableTelemetryService],
  exports: [WearableTelemetryService],
})
export class WearableTelemetryModule {}
