/**
 * Mobile Analytics Controller — Sprint M-P2-2.
 *
 *   POST /api/v1/mobile/analytics  body: { events: [...] }
 *
 * Same shape as `desktop-analytics.controller.ts`. Events are gated
 * by a server-side allow-list (see `desktop-analytics.service.ts`)
 * and persisted to the same `agentrix_desktop.analytics_events`
 * table. Mobile and desktop events are differentiated by their
 * event-name prefix (`mobile_*` vs `desktop_*`).
 *
 * Schema reuse rationale: the table is already partitioned by
 * eventName + reportedAt; query cost is identical. Splitting into
 * a separate `agentrix_mobile.*` schema would force every dashboard
 * query to UNION ALL across two tables.
 *
 * The mobile client only POSTs after the user has explicitly opted
 * in via Settings → Privacy. See `src/services/crashReport.ts` and
 * `mmkv` key `agentrix_telemetry_opt_in`.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { DesktopAnalyticsService, IncomingAnalyticsEvent } from './desktop-analytics.service';

interface MobileBatchAnalyticsDto {
  events: IncomingAnalyticsEvent[];
}

@Public()
@Controller('v1/mobile')
export class MobileAnalyticsController {
  constructor(private readonly service: DesktopAnalyticsService) {}

  @Post('analytics')
  @HttpCode(202)
  async ingest(
    @Body() body: MobileBatchAnalyticsDto,
  ): Promise<{ accepted: number; rejected: number }> {
    const events = Array.isArray(body?.events) ? body.events : [];
    return this.service.ingest(events);
  }
}
