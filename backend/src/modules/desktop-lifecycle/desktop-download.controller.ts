import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DesktopDownloadService, IncomingDownloadIntent } from './desktop-download.service';

interface TrackDownloadDto {
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  inviteCode?: string;
  referrer?: string;
  platform?: string;
}

/**
 * Public endpoint — no auth required.
 *
 * @see .kiro/specs/desktop-ga-internal-beta/requirements.md US-G3-1
 */
@Controller('desktop')
export class DesktopDownloadController {
  constructor(private readonly service: DesktopDownloadService) {}

  @Post('download/track')
  @HttpCode(202)
  async track(
    @Body() body: TrackDownloadDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('cf-ipcountry') cfCountry: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Req() req: Request,
  ): Promise<{ ok: true; downloadUrl: string }> {
    const intent: IncomingDownloadIntent = {
      utmSource: body?.utmSource,
      utmCampaign: body?.utmCampaign,
      utmMedium: body?.utmMedium,
      inviteCode: body?.inviteCode,
      referrer: body?.referrer || referer || null,
      userAgent: userAgent || null,
      // Cloudflare provides the country in `cf-ipcountry`; falls back to null.
      ipCountry: cfCountry || (req.headers['x-vercel-ip-country'] as string) || null,
      platform: body?.platform || null,
    };
    return this.service.track(intent);
  }
}
