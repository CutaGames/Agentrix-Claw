import { Module, forwardRef } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { CacheModule } from '../cache/cache.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [
    forwardRef(() => CacheModule),
    forwardRef(() => ProductModule),
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}

