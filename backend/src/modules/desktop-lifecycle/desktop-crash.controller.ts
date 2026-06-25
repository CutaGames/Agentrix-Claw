import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DesktopCrashService, IncomingCrash } from './desktop-crash.service';

@Controller('desktop')
export class DesktopCrashController {
  constructor(private readonly service: DesktopCrashService) {}

  /**
   * POST /api/v1/desktop/crashes
   *
   * Crash reports are sent regardless of telemetry opt-in (they only carry
   * a hashed device id + sanitized stack), but rate-limited and deduped
   * server-side.
   */
  @Post('crashes')
  @HttpCode(202)
  async report(@Body() body: BatchCrashDto): Promise<{ accepted: number; deduped: number }> {
    let accepted = 0;
    let deduped = 0;
    const items = Array.isArray(body?.items) ? body.items : [];
    for (const item of items.slice(0, 50)) {
      if (!isValidCrash(item)) continue;
      const r = await this.service.record(item);
      if (r.deduped) deduped += 1;
      else accepted += 1;
    }
    return { accepted, deduped };
  }
}

interface BatchCrashDto {
  items: IncomingCrash[];
}

function isValidCrash(c: any): c is IncomingCrash {
  return (
    !!c &&
    typeof c.deviceId === 'string' &&
    c.deviceId.length > 0 &&
    typeof c.appVersion === 'string' &&
    typeof c.type === 'string' &&
    typeof c.message === 'string' &&
    typeof c.occurredAt === 'number' &&
    Number.isFinite(c.occurredAt)
  );
}
