import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { Product } from '../../entities/product.entity';
import { ProductPrice } from '../../entities/product-price.entity';
import { ProductCountryPrice } from '../../entities/product-country-price.entity';
import { ProductRegionPrice } from '../../entities/product-region-price.entity';
import { TaxModule } from '../tax/tax.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductPrice,
      ProductCountryPrice,
      ProductRegionPrice,
    ]),
    TaxModule,
  ],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule {}

