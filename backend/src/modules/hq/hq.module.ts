import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HqController } from './hq.controller';
import { HqService } from './hq.service';
import { HqGateway } from './hq.gateway';
import { HqWatchdogService } from './hq-watchdog.service';
import { RagService } from './rag.service';
import { DeveloperService } from './developer.service';
import { AgentAccount } from '../../entities/agent-account.entity';
// Engine Room Entities
import { User } from '../../entities/user.entity';
import { Product } from '../../entities/product.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { RiskAssessment } from '../../entities/risk-assessment.entity';
import { FundPath } from '../../entities/fund-path.entity';
import { GeminiIntegrationModule } from '../ai-integration/gemini/gemini-integration.module';
import { OpenAIIntegrationModule } from '../ai-integration/openai/openai-integration.module';
import { ClaudeIntegrationModule } from '../ai-integration/claude/claude-integration.module';
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';
import { ModelRouterModule } from '../ai-integration/model-router/model-router.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentAccount,
      User,
      Product,
      Order,
      Payment,
      RiskAssessment,
      FundPath,
    ]),
    GeminiIntegrationModule,
    OpenAIIntegrationModule,
    ClaudeIntegrationModule,
    BedrockIntegrationModule,
    ModelRouterModule,
  ],
  controllers: [HqController],
  providers: [HqService, HqGateway, HqWatchdogService, RagService, DeveloperService],
  exports: [HqService, HqGateway, HqWatchdogService, RagService, DeveloperService],
})
export class HqModule {}
