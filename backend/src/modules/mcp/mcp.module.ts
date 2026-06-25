import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { OidcController } from './oidc.controller';
import { OAuthController } from './oauth.controller';
import { GuestCheckoutService } from './guest-checkout.service';
import { GuestCheckoutController } from './guest-checkout.controller';
import { AgentWalletService } from './agent-wallet.service';
import { McpAuthContextService } from './mcp-auth-context.service';
import { StructuredResponseService } from './structured-response.service';
// Agent 生态标准化支付服务
import { AgentPaymentSkillService } from './agent-payment-skill.service';
import { NaturalLanguageIntentService } from './natural-language-intent.service';
import { IntentConfirmationService } from './intent-confirmation.service';
import { McpOAuthService } from './mcp-oauth.service';
import { McpOAuthController } from './mcp-oauth.controller';
import { SkillModule } from '../skill/skill.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { ProductModule } from '../product/product.module';
import { PaymentModule } from '../payment/payment.module';
import { AgentAuthorizationModule } from '../agent-authorization/agent-authorization.module';
import { AutoEarnModule } from '../auto-earn/auto-earn.module';
import { WalletModule } from '../wallet/wallet.module';
import { UCPModule } from '../ucp/ucp.module';
import { CommerceModule } from '../commerce/commerce.module';
import { A2AModule } from '../a2a/a2a.module';
import { User } from '../../entities/user.entity';
import { Payment } from '../../entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Payment]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'agentrix-secret'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
    SkillModule,
    MarketplaceModule,
    forwardRef(() => ProductModule),
    PaymentModule,
    AgentAuthorizationModule,
    AutoEarnModule,
    WalletModule,
    forwardRef(() => UCPModule),
    forwardRef(() => CommerceModule),
    forwardRef(() => A2AModule),
  ],
  controllers: [McpController, OidcController, OAuthController, GuestCheckoutController, McpOAuthController],
  providers: [
    McpService,
    GuestCheckoutService,
    AgentWalletService,
    McpAuthContextService,
    StructuredResponseService,
    // Agent 生态标准化支付服务
    AgentPaymentSkillService,
    NaturalLanguageIntentService,
    IntentConfirmationService,
    McpOAuthService,
  ],
  exports: [
    McpService,
    GuestCheckoutService,
    AgentWalletService,
    McpAuthContextService,
    StructuredResponseService,
    // 导出供其他模块使用
    AgentPaymentSkillService,
    NaturalLanguageIntentService,
    IntentConfirmationService,
    McpOAuthService,
  ],
})
export class McpModule {}
