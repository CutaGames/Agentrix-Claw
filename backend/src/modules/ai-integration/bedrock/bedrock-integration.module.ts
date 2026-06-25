import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BedrockIntegrationService } from './bedrock-integration.service';

@Module({
  imports: [ConfigModule],
  providers: [BedrockIntegrationService],
  exports: [BedrockIntegrationService],
})
export class BedrockIntegrationModule {}
