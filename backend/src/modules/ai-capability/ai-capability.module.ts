import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../entities/product.entity';
import { User } from '../../entities/user.entity';
import { StrategyGraph } from '../trading/entities/strategy-graph.entity';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { PaymentModule } from '../payment/payment.module';
import { SearchModule } from '../search/search.module';
import { AutoEarnModule } from '../auto-earn/auto-earn.module';
import { AgentAuthorizationModule } from '../agent-authorization/agent-authorization.module';
import { TradingModule } from '../trading/trading.module';
import { LiquidityModule } from '../liquidity/liquidity.module';
import { MPCWalletModule } from '../mpc-wallet/mpc-wallet.module';

// Adapters
import { OpenAIAdapter } from './adapters/openai.adapter';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { GroqAdapter } from './adapters/groq.adapter';
import { AdapterFactory } from './adapters/adapter.factory';

// Services
import { PlatformRegistryService } from './services/platform-registry.service';
import { CapabilityRegistryService } from './services/capability-registry.service';
import { CapabilityExecutorService } from './services/capability-executor.service';

// Executors
import { BuyItemExecutor } from './executors/buy-item.executor';
import { BookServiceExecutor } from './executors/book-service.executor';
import { MintNFTExecutor } from './executors/mint-nft.executor';
import { SearchProductsExecutor } from './executors/search-products.executor';
import { PriceComparisonExecutor } from './executors/price-comparison.executor';
import { AirdropExecutor } from './executors/airdrop.executor';
import { AutoEarnExecutor } from './executors/auto-earn.executor';
import { AgentAuthExecutor } from './executors/agent-auth.executor';
import { AtomicSettlementExecutor } from './executors/atomic-settlement.executor';
import { BestExecutionExecutor } from './executors/best-execution.executor';
import { IntentStrategyExecutor } from './executors/intent-strategy.executor';
import { OnrampExecutor } from './executors/onramp.executor';
import { WalletOnboardingExecutor } from './executors/wallet-onboarding.executor';

// Controller
import { AiCapabilityController } from './ai-capability.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, User, StrategyGraph]),
    forwardRef(() => ProductModule),
    forwardRef(() => OrderModule),
    forwardRef(() => PaymentModule),
    forwardRef(() => SearchModule),
    forwardRef(() => AutoEarnModule),
    forwardRef(() => AgentAuthorizationModule),
    forwardRef(() => TradingModule),
    forwardRef(() => LiquidityModule),
    forwardRef(() => MPCWalletModule),
  ],
  controllers: [AiCapabilityController],
  providers: [
    // Adapters
    OpenAIAdapter,
    ClaudeAdapter,
    GeminiAdapter,
    GroqAdapter,
    AdapterFactory,
    // Services
    PlatformRegistryService,
    CapabilityRegistryService,
    CapabilityExecutorService,
    // Executors
    BuyItemExecutor,
    BookServiceExecutor,
    MintNFTExecutor,
    SearchProductsExecutor,
    PriceComparisonExecutor,
    AirdropExecutor,
    AutoEarnExecutor,
    // Phase2功能执行器
    AgentAuthExecutor,
    AtomicSettlementExecutor,
    BestExecutionExecutor,
    IntentStrategyExecutor,
    // X402 基础设施技能执行器
    OnrampExecutor,
    WalletOnboardingExecutor,
  ],
  exports: [
    CapabilityRegistryService,
    CapabilityExecutorService,
    GroqAdapter, // 导出给GroqIntegrationModule使用
  ],
})
export class AiCapabilityModule {}


