import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeepSeekIntegrationService } from './deepseek-integration.service';

@Module({
  imports: [ConfigModule],
  providers: [DeepSeekIntegrationService],
  exports: [DeepSeekIntegrationService],
})
export class DeepSeekIntegrationModule {}
