import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { ProductPrice } from '../../entities/product-price.entity';
import { ProductCountryPrice } from '../../entities/product-country-price.entity';
import { ProductRegionPrice } from '../../entities/product-region-price.entity';
import { TaxRate } from '../../entities/tax-rate.entity';
import { TaxService } from '../tax/tax.service';

export interface ProductPriceResult {
  amount: number;
  currency: string;
  taxIncluded: boolean;
  taxRate: number;
  taxAmount: number;
  basePrice: number;
  priceDifference: number;
  reason: string;
}

export interface TotalPriceResult {
  basePrice: number;
  taxAmount: number;
  taxRate: number;
  totalPrice: number;
  currency: string;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductPrice)
    private productPriceRepository: Repository<ProductPrice>,
    @InjectRepository(ProductCountryPrice)
    private productCountryPriceRepository: Repository<ProductCountryPrice>,
    @InjectRepository(ProductRegionPrice)
    private productRegionPriceRepository: Repository<ProductRegionPrice>,
    private taxService: TaxService,
  ) {}

  /**
   * 获取产品价格（根据国家）
   */
  async getProductPriceForCountry(
    productId: string,
    countryCode: string,
    regionCode?: string,
  ): Promise<ProductPriceResult> {
    // 1. 获取产品基础价格
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['prices', 'countryPrices', 'regionPrices'],
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    // 2. 获取基础价格
    const basePrice = product.prices?.[0] || {
      basePrice: product.price,
      baseCurrency: 'USD', // 默认使用USD，实际应该从产品配置或metadata获取
    };

    // 3. 优先检查区域价格
    if (regionCode) {
      const regionPrice = product.regionPrices?.find(
        (p) => p.regionCode === regionCode,
      );
      if (regionPrice) {
        const tax = await this.taxService.calculateTax(
          regionPrice.price,
          countryCode,
          regionCode,
        );
        return {
          amount: regionPrice.price,
          currency: regionPrice.currency,
          taxIncluded: regionPrice.taxIncluded,
          taxRate: tax.rate,
          taxAmount: tax.amount,
          basePrice: basePrice.basePrice,
          priceDifference: regionPrice.price - basePrice.basePrice,
          reason: regionPrice.reason || 'Regional pricing',
        };
      }
    }

    // 4. 检查国家价格
    const countryPrice = product.countryPrices?.find(
      (p) => p.countryCode === countryCode,
    );
    if (countryPrice) {
      const tax = await this.taxService.calculateTax(
        countryPrice.price,
        countryCode,
        regionCode,
      );
      return {
        amount: countryPrice.price,
        currency: countryPrice.currency,
        taxIncluded: countryPrice.taxIncluded,
        taxRate: tax.rate,
        taxAmount: tax.amount,
        basePrice: basePrice.basePrice,
        priceDifference: countryPrice.price - basePrice.basePrice,
        reason: countryPrice.reason || 'Country-specific pricing',
      };
    }

    // 5. 使用基础价格
    const tax = await this.taxService.calculateTax(
      basePrice.basePrice,
      countryCode,
      regionCode,
    );
    return {
      amount: basePrice.basePrice,
      currency: basePrice.baseCurrency,
      taxIncluded: true,
      taxRate: tax.rate,
      taxAmount: tax.amount,
      basePrice: basePrice.basePrice,
      priceDifference: 0,
      reason: 'Base price',
    };
  }

  /**
   * 计算总价（包含税费）
   */
  async getTotalPrice(
    productId: string,
    countryCode: string,
    regionCode?: string,
  ): Promise<TotalPriceResult> {
    const priceResult = await this.getProductPriceForCountry(
      productId,
      countryCode,
      regionCode,
    );

    const totalPrice = priceResult.taxIncluded
      ? priceResult.amount
      : priceResult.amount + priceResult.taxAmount;

    return {
      basePrice: priceResult.basePrice,
      taxAmount: priceResult.taxAmount,
      taxRate: priceResult.taxRate,
      totalPrice,
      currency: priceResult.currency,
    };
  }

  /**
   * 货币转换（简化版，实际应该调用汇率API）
   */
  async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    // TODO: 实现真实的货币转换逻辑
    // 这里使用简化的固定汇率（实际应该调用汇率API）
    const exchangeRates: Record<string, number> = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.73,
      CNY: 7.2,
      JPY: 150.0,
    };

    const fromRate = exchangeRates[fromCurrency] || 1.0;
    const toRate = exchangeRates[toCurrency] || 1.0;

    return (amount / fromRate) * toRate;
  }
}

