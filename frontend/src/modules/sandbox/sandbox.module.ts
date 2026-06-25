import { Module, forwardRef } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { PaymentModule } from '../payment/payment.module';
import { OrderModule } from '../order/order.module';
import { ProductModule } from '../product/product.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    forwardRef(() => PaymentModule),
    forwardRef(() => OrderModule),
    forwardRef(() => ProductModule),
    forwardRef(() => SearchModule),
  ],
  controllers: [SandboxController],
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}

