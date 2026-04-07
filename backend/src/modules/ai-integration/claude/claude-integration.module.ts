import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Product } from '../../../entities/product.entity';
import { Order } from '../../../entities/order.entity';
import { ClaudeIntegrationService } from './claude-integration.service';
import { ClaudeIntegrationController } from './claude-integration.controller';
import { AiCapabilityModule } from '../../ai-capability/ai-capability.module';
import { SearchModule } from '../../search/search.module';
import { ProductModule } from '../../product/product.module';
import { OrderModule } from '../../order/order.module';
import { CartModule } from '../../cart/cart.module';
import { LogisticsModule } from '../../logistics/logistics.module';
import { PaymentModule } from '../../payment/payment.module';
import { ModelRouterModule } from '../model-router/model-router.module';
import { BedrockIntegrationModule } from '../bedrock/bedrock-integration.module';
import { AiProviderModule } from '../../ai-provider/ai-provider.module';
import { OpenClawProxyModule } from '../../openclaw-proxy/openclaw-proxy.module';
import { AgentContextModule } from '../../agent-context/agent-context.module';
import { AgentIntelligenceModule } from '../../agent-intelligence/agent-intelligence.module';
import { QueryEngineModule } from '../../query-engine/query-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Order]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET', 'default-secret'),
      }),
    }),
    forwardRef(() => AiCapabilityModule),
    forwardRef(() => SearchModule),
    forwardRef(() => ProductModule),
    forwardRef(() => OrderModule),
    forwardRef(() => CartModule),
    forwardRef(() => LogisticsModule),
    forwardRef(() => PaymentModule),
    forwardRef(() => OpenClawProxyModule),
    ModelRouterModule,
    BedrockIntegrationModule,
    AiProviderModule,
    AgentContextModule,
    AgentIntelligenceModule,
    forwardRef(() => QueryEngineModule),
  ],
  controllers: [ClaudeIntegrationController],
  providers: [ClaudeIntegrationService],
  exports: [ClaudeIntegrationService],
})
export class ClaudeIntegrationModule {}

