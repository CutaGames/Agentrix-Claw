import { Module } from '@nestjs/common';
import { DEXIntegrationService } from './dex/dex-integration.service';
import { LaunchpadIntegrationService } from './launchpad/launchpad-integration.service';
import { AIIntegrationService } from './ai/ai-integration.service';

/**
 * 集成服务模块
 * 提供DEX、Launchpad、AI等外部服务的集成接口
 */
@Module({
  providers: [DEXIntegrationService, LaunchpadIntegrationService, AIIntegrationService],
  exports: [DEXIntegrationService, LaunchpadIntegrationService, AIIntegrationService],
})
export class IntegrationsModule {}

