import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentController } from './payment.controller';
import { ProviderWebhookController } from './provider-webhook.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripePaymentController } from './stripe-payment.controller';
import { StripeConnectController } from './stripe-connect.controller';
import { CryptoPaymentController } from './crypto-payment.controller';
import { PayIntentController } from './pay-intent.controller';
import { QuickPayGrantController } from './quick-pay-grant.controller';
import { RefundController } from './refund.controller';
import { QrPaymentController } from './qr-payment.controller';
import { AmlScanController } from './aml-scan.controller';
import { StablecoinPaymentController } from './stablecoin-payment.controller';
import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeProviderService } from './stripe-provider.service';
import { StripeSettlementSchedulerService } from './stripe-settlement-scheduler.service';
import { StripeConnectService } from './stripe-connect.service';
import { X402Service } from './x402.service';
import { SmartRouterService } from './smart-router.service';
import { FiatToCryptoService } from './fiat-to-crypto.service';
import { EscrowService } from './escrow.service';
import { RefundService } from './refund.service';
import { X402AuthorizationService } from './x402-authorization.service';
import { AgentPaymentService } from './agent-payment.service';
import { CryptoPaymentService } from './crypto-payment.service';
import { QrPaymentService } from './qr-payment.service';
import { AmlScanService } from './aml-scan.service';
import { StablecoinPaymentService } from './stablecoin-payment.service';
import { Payment } from '../../entities/payment.entity';
import { User } from '../../entities/user.entity';
import { AutoPayGrant } from '../../entities/auto-pay-grant.entity';
import { PayIntent } from '../../entities/pay-intent.entity';
import { QuickPayGrant } from '../../entities/quick-pay-grant.entity';
import { Order } from '../../entities/order.entity';
import { StripeSettlement } from '../../entities/stripe-settlement.entity';
import { Escrow } from '../../entities/escrow.entity';
import { Refund } from '../../entities/refund.entity';
import { CommissionModule } from '../commission/commission.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import { PayIntentService } from './pay-intent.service';
import { QuickPayGrantService } from './quick-pay-grant.service';
import { PayIntentSchedulerService } from './pay-intent-scheduler.service';
import { PaymentAggregatorService } from './payment-aggregator.service';
import { EscrowSchedulerService } from './escrow-scheduler.service';
import { WithdrawalController } from './withdrawal.controller';
import { WithdrawalService } from './withdrawal.service';
import { AuditProofService } from '../commission/audit-proof.service';
import { Withdrawal } from '../../entities/withdrawal.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { ProviderIntegrationService } from './provider-integration.service';
import { ProviderPaymentFlowService } from './provider-payment-flow.service';
import { MockProviderService } from './mock-provider.service';
import { TransakProviderService } from './transak-provider.service';
// import { OSLProviderService } from './osl-provider.service'; // 已注销 - 不再使用OSL支付
import { TransakWebhookController } from './transak-webhook.controller';
import { ProviderManagerService } from './provider-manager.service';
import { ReferralModule } from '../referral/referral.module';
import { PricingModule } from '../pricing/pricing.module';
import { TaxModule } from '../tax/tax.module';
import { WebhookModule } from '../webhook/webhook.module';
import { RelayerModule } from '../relayer/relayer.module';
import { UserAgentModule } from '../user-agent/user-agent.module';
import { SessionModule } from '../session/session.module';
import { AgentAuthorizationModule } from '../agent-authorization/agent-authorization.module';
import { FeeEstimationService } from './fee-estimation.service';
import { RiskAssessmentService } from './risk-assessment.service';
import { RiskAssessment } from '../../entities/risk-assessment.entity';
import { PreflightCheckService } from './preflight-check.service';
import { PreflightCheckController } from './preflight-check.controller';
import { CryptoRailService } from './crypto-rail.service';
import { WalletConnection } from '../../entities/wallet-connection.entity';
import { AgentSession } from '../../entities/agent-session.entity';
import { OffRampCommissionService } from './off-ramp-commission.service';
import { OnRampCommissionService } from './on-ramp-commission.service';
import { BuyerFeeService } from './buyer-fee.service';
import { Commission } from '../../entities/commission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment, 
      User, 
      AutoPayGrant, 
      PayIntent, 
      QuickPayGrant, 
      Order, 
      Withdrawal, 
      RiskAssessment, 
      WalletConnection, 
      AgentSession, 
      StripeSettlement,
      Escrow,
      Refund,
      Commission,
    ]),
    ScheduleModule.forRoot(),
    forwardRef(() => CommissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => ReferralModule),
    forwardRef(() => RelayerModule),
    forwardRef(() => UserAgentModule),
    forwardRef(() => SessionModule),
    forwardRef(() => AgentAuthorizationModule),
    PricingModule,
    TaxModule,
    WebhookModule,
    AuthModule,
    ApiKeyModule,
  ],
  controllers: [
    PaymentController,
    ProviderWebhookController,
    StripeWebhookController,
    StripePaymentController,
    StripeConnectController,
    CryptoPaymentController,
    PayIntentController,
    QuickPayGrantController,
    RefundController,
    WithdrawalController,
    PreflightCheckController,
    TransakWebhookController,
    QrPaymentController,
    AmlScanController,
    StablecoinPaymentController,
  ],
  providers: [
    PaymentService,
    StripeService,
    StripeWebhookService,
    StripeProviderService,
    StripeSettlementSchedulerService,
    StripeConnectService,
    X402Service,
    SmartRouterService,
    FiatToCryptoService,
    EscrowService,
    RefundService,
    X402AuthorizationService,
    AgentPaymentService,
    CryptoPaymentService,
    QrPaymentService,
    AmlScanService,
    PayIntentService,
    QuickPayGrantService,
    PayIntentSchedulerService,
    EscrowSchedulerService,
    PaymentAggregatorService,
    WithdrawalService,
    ExchangeRateService,
    ProviderIntegrationService,
    ProviderPaymentFlowService,
    FeeEstimationService,
    RiskAssessmentService,
    PreflightCheckService,
    CryptoRailService,
    MockProviderService,
    TransakProviderService,
    // OSLProviderService, // 已注销
    ProviderManagerService,
    OffRampCommissionService,
    OnRampCommissionService,
    BuyerFeeService,
    StablecoinPaymentService,
  ],
  exports: [
    PaymentService,
    SmartRouterService,
    FiatToCryptoService,
    EscrowService,
    RefundService,
    PayIntentService,
    QuickPayGrantService,
    PaymentAggregatorService,
    ExchangeRateService,
    FeeEstimationService,
    RiskAssessmentService,
    PreflightCheckService,
    CryptoRailService,
    ProviderManagerService,
    OffRampCommissionService,
    TransakProviderService,
    AgentPaymentService,
    X402AuthorizationService,
    QrPaymentService,
    AmlScanService,
    BuyerFeeService,
    StripeService,
    StripeProviderService,
    StripeWebhookService,
    StripeSettlementSchedulerService,
    StripeConnectService,
    StablecoinPaymentService,
    TypeOrmModule,
  ],
})
export class PaymentModule {}

