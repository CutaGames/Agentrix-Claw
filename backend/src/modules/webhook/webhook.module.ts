import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookConfig } from '../../entities/webhook-config.entity';
import { WebhookEvent } from '../../entities/webhook-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookConfig, WebhookEvent]),
    HttpModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}

