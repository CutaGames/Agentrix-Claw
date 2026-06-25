import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HqController } from './hq.controller';
import { HqService } from './hq.service';
import { RagService } from './rag.service';
import { DeveloperService } from './developer.service';
import { AppController } from '../../app.controller';
import { AppService } from '../../app.service';
import { AgentAccount } from '../../entities/agent-account.entity';
import { User } from '../../entities/user.entity';
import { Product } from '../../entities/product.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { RiskAssessment } from '../../entities/risk-assessment.entity';
import { FundPath } from '../../entities/fund-path.entity';
import { OpenAIIntegrationModule } from '../ai-integration/openai/openai-integration.module';
import { ClaudeIntegrationModule } from '../ai-integration/claude/claude-integration.module';
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';
import { GeminiIntegrationModule } from '../ai-integration/gemini/gemini-integration.module';
import { GroqIntegrationModule } from '../ai-integration/groq/groq-integration.module';
import { DeepSeekIntegrationModule } from '../ai-integration/deepseek/deepseek-integration.module';
import { ModelRouterModule } from '../ai-integration/model-router/model-router.module';
import { DatabaseConfig } from '../../config/database.config';
import { AiCapabilityModule } from '../ai-capability/ai-capability.module';
import { SearchModule } from '../search/search.module';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { CartModule } from '../cart/cart.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { PaymentModule } from '../payment/payment.module';
import { UnifiedMarketplaceModule } from '../unified-marketplace/unified-marketplace.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { SkillModule } from '../skill/skill.module';
import { AgentAccountModule } from '../agent-account/agent-account.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { CommonModule } from '../common/common.module';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),
    // 基础业务模块
    MarketplaceModule,
    SkillModule,
    AgentAccountModule,
    AuthModule,
    UserModule,
    CommonModule,
    ProductModule,
    OrderModule,
    PaymentModule,
    CommissionModule,
    AiCapabilityModule,
    SearchModule,
    // AI 集成模块 (HqService 的关键依赖)
    OpenAIIntegrationModule,
    ClaudeIntegrationModule,
    BedrockIntegrationModule,
    GeminiIntegrationModule,
    GroqIntegrationModule,
    DeepSeekIntegrationModule,
    ModelRouterModule,
    // HQ 核心仓库 (放到最后以确保注入优先级)
    TypeOrmModule.forFeature([
      AgentAccount,
      User,
      Product,
      Order,
      Payment,
      RiskAssessment,
      FundPath,
    ]),
  ],
  controllers: [AppController, HqController],
  providers: [AppService, HqService, RagService, DeveloperService],
  exports: [HqService, RagService, DeveloperService],
})
export class HqStandaloneModule {}
