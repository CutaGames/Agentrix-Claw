import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../../entities/product.entity';
import { Order } from '../../../entities/order.entity';
import { OpenAIIntegrationService } from './openai-integration.service';
import { OpenAIIntegrationController } from './openai-integration.controller';
import { MarketplaceGPTsController } from './marketplace-gpts.controller';
import { AiPluginController } from './ai-plugin.controller';
import { AiCapabilityModule } from '../../ai-capability/ai-capability.module';
import { SearchModule } from '../../search/search.module';
import { ProductModule } from '../../product/product.module';
import { OrderModule } from '../../order/order.module';
import { CartModule } from '../../cart/cart.module';
import { LogisticsModule } from '../../logistics/logistics.module';
import { PaymentModule } from '../../payment/payment.module';
import { ApiKeyModule } from '../../api-key/api-key.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Order]),
    forwardRef(() => AiCapabilityModule),
    forwardRef(() => SearchModule),
    forwardRef(() => ProductModule),
    forwardRef(() => OrderModule),
    forwardRef(() => CartModule),
    forwardRef(() => LogisticsModule),
    forwardRef(() => PaymentModule),
    forwardRef(() => ApiKeyModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [OpenAIIntegrationController, MarketplaceGPTsController, AiPluginController],
  providers: [OpenAIIntegrationService],
  exports: [OpenAIIntegrationService],
})
export class OpenAIIntegrationModule {}

