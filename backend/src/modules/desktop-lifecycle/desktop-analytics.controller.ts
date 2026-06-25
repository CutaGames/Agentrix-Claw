import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DesktopAnalyticsService, IncomingAnalyticsEvent } from './desktop-analytics.service';

interface BatchAnalyticsDto {
  events: IncomingAnalyticsEvent[];
}

@Controller('desktop')
export class DesktopAnalyticsController {
  constructor(private readonly service: DesktopAnalyticsService) {}

  /**
   * POST /api/v1/desktop/analytics
   *
   * Batch upload of telemetry events. The desktop client only POSTs when
   * the user has explicitly opted in via SettingsPanel toggle.
   */
  @Post('analytics')
  @HttpCode(202)
  async ingest(@Body() body: BatchAnalyticsDto): Promise<{ accepted: number; rejected: number }> {
    const events = Array.isArray(body?.events) ? body.events : [];
    return this.service.ingest(events);
  }
}
