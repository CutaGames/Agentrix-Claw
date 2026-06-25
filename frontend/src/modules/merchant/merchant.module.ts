import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantAutoOrderService } from './merchant-auto-order.service';
import { MerchantAICustomerService } from './merchant-ai-customer.service';
import { MerchantAutoMarketingService } from './merchant-auto-marketing.service';
import { WebhookHandlerService } from './webhook-handler.service';
import { AutoFulfillmentService } from './auto-fulfillment.service';
import { AutoRedemptionService } from './auto-redemption.service';
import { MultiChainAccountService } from './multi-chain-account.service';
import { ReconciliationService } from './reconciliation.service';
import { SettlementRulesService } from './settlement-rules.service';
import { MerchantController } from './merchant.controller';
import { NotificationModule } from '../notification/notification.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { UserModule } from '../user/user.module';
import { Payment } from '../../entities/payment.entity';
import { Product } from '../../entities/product.entity';
import { Coupon } from '../../entities/coupon.entity';
import { MarketingCampaign } from '../../entities/marketing-campaign.entity';
import { ConversationHistory } from '../../entities/conversation-history.entity';
import { Order } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Product, Coupon, MarketingCampaign, ConversationHistory, Order, User]),
    forwardRef(() => NotificationModule),
    forwardRef(() => LogisticsModule),
    forwardRef(() => UserModule),
  ],
  controllers: [MerchantController],
  providers: [
    MerchantAutoOrderService,
    MerchantAICustomerService,
    MerchantAutoMarketingService,
    WebhookHandlerService,
    AutoFulfillmentService,
    AutoRedemptionService,
    MultiChainAccountService,
    ReconciliationService,
    SettlementRulesService,
  ],
  exports: [
    MerchantAutoOrderService,
    MerchantAICustomerService,
    MerchantAutoMarketingService,
    WebhookHandlerService,
    AutoFulfillmentService,
    AutoRedemptionService,
    MultiChainAccountService,
    ReconciliationService,
    SettlementRulesService,
  ],
})
export class MerchantModule {}

