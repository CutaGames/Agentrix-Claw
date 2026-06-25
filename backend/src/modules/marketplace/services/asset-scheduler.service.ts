import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AssetIngestorService } from './asset-ingestor.service';

@Injectable()
export class AssetSchedulerService {
  private readonly logger = new Logger(AssetSchedulerService.name);

  constructor(private readonly assetIngestorService: AssetIngestorService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleCron() {
    this.logger.log('Starting scheduled asset ingestion');
    await this.assetIngestorService.refreshSources();
  }
}

