import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DesktopDownloadEventEntity } from '../../entities/desktop-download-event.entity';

export interface IncomingDownloadIntent {
  utmSource?: string | null;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  inviteCode?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipCountry?: string | null;
  platform?: string | null;
}

@Injectable()
export class DesktopDownloadService {
  constructor(
    @InjectRepository(DesktopDownloadEventEntity)
    private readonly repo: Repository<DesktopDownloadEventEntity>,
  ) {}

  async track(intent: IncomingDownloadIntent): Promise<{ ok: true; downloadUrl: string }> {
    const userAgentHash = intent.userAgent
      ? crypto.createHash('sha256').update(intent.userAgent).digest('hex').slice(0, 64)
      : null;

    await this.repo.save(
      this.repo.create({
        utmSource: clip(intent.utmSource, 64),
        utmCampaign: clip(intent.utmCampaign, 64),
        utmMedium: clip(intent.utmMedium, 64),
        inviteCode: clip(intent.inviteCode, 32),
        referrer: clip(intent.referrer, 1000),
        userAgentHash,
        ipCountry: clip(intent.ipCountry, 8),
        platform: clip(intent.platform, 32),
      }),
    );

    return {
      ok: true as const,
      // Static URL for now; CDN-aware routing comes later.
      downloadUrl: 'https://agentrix.top/downloads/desktop/Agentrix Desktop_0.2.0_x64-setup.exe',
    };
  }
}

function clip(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}
