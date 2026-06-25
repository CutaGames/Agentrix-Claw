/**
 * Buyer Fee Service
 * 
 * 买家服务费逻辑
 * 对于外部发现的、没有成交佣金协议的商品，自动计算平台服务费
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BuyerFeeConfig {
  // 基础服务费率 (默认2%)
  baseFeeRate: number;
  // 最低服务费
  minFee: number;
  // 最高服务费
  maxFee: number;
  // 免服务费门槛 (内部商品免费)
  internalFreeThreshold: boolean;
  // VIP用户折扣率
  vipDiscountRate: number;
}

export interface FeeCalculation {
  originalPrice: number;
  currency: string;
  serviceFee: number;
  serviceFeeRate: number;
  totalPrice: number;
  feeWaived: boolean;
  waivedReason?: string;
  breakdown: {
    baseFee: number;
    discount: number;
    finalFee: number;
  };
}

export interface ProductSource {
  type: 'internal' | 'external_ucp' | 'external_x402' | 'partner';
  url?: string;
  merchantId?: string;
  hasCommissionAgreement: boolean;
  commissionRate?: number;
}

@Injectable()
export class BuyerFeeService {
  private readonly logger = new Logger(BuyerFeeService.name);
  private readonly config: BuyerFeeConfig;

  // 合作伙伴白名单 (免服务费)
  private readonly partnerWhitelist: string[] = [];
  
  // VIP用户列表
  private readonly vipUsers: Set<string> = new Set();

  constructor(private configService: ConfigService) {
    this.config = {
      baseFeeRate: parseFloat(configService.get('BUYER_SERVICE_FEE_RATE', '0.02')),
      minFee: parseFloat(configService.get('BUYER_SERVICE_FEE_MIN', '0.10')),
      maxFee: parseFloat(configService.get('BUYER_SERVICE_FEE_MAX', '50.00')),
      internalFreeThreshold: configService.get('BUYER_SERVICE_FEE_INTERNAL_FREE', 'true') === 'true',
      vipDiscountRate: parseFloat(configService.get('BUYER_SERVICE_FEE_VIP_DISCOUNT', '0.5')),
    };

    this.logger.log(`Buyer fee config: ${JSON.stringify(this.config)}`);
  }

  /**
   * 计算买家服务费
   */
  calculateFee(
    originalPrice: number,
    currency: string,
    source: ProductSource,
    userId?: string,
  ): FeeCalculation {
    // 检查是否免服务费

    // 1. 内部商品免费
    if (source.type === 'internal' && this.config.internalFreeThreshold) {
      return this.createWaivedResult(originalPrice, currency, 'Internal product - no service fee');
    }

    // 2. 合作伙伴商品免费
    if (source.merchantId && this.partnerWhitelist.includes(source.merchantId)) {
      return this.createWaivedResult(originalPrice, currency, 'Partner merchant - no service fee');
    }

    // 3. 有佣金协议的外部商品，从佣金中扣除，不额外收取
    if (source.hasCommissionAgreement && source.commissionRate && source.commissionRate >= this.config.baseFeeRate) {
      return this.createWaivedResult(originalPrice, currency, 'Commission agreement covers service fee');
    }

    // 计算服务费
    let baseFee = originalPrice * this.config.baseFeeRate;

    // 应用最低/最高限制
    baseFee = Math.max(baseFee, this.config.minFee);
    baseFee = Math.min(baseFee, this.config.maxFee);

    // VIP折扣
    let discount = 0;
    if (userId && this.vipUsers.has(userId)) {
      discount = baseFee * this.config.vipDiscountRate;
    }

    const finalFee = baseFee - discount;
    const totalPrice = originalPrice + finalFee;

    return {
      originalPrice,
      currency,
      serviceFee: Math.round(finalFee * 100) / 100, // 保留2位小数
      serviceFeeRate: this.config.baseFeeRate,
      totalPrice: Math.round(totalPrice * 100) / 100,
      feeWaived: false,
      breakdown: {
        baseFee: Math.round(baseFee * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        finalFee: Math.round(finalFee * 100) / 100,
      },
    };
  }

  /**
   * 创建免服务费结果
   */
  private createWaivedResult(originalPrice: number, currency: string, reason: string): FeeCalculation {
    return {
      originalPrice,
      currency,
      serviceFee: 0,
      serviceFeeRate: 0,
      totalPrice: originalPrice,
      feeWaived: true,
      waivedReason: reason,
      breakdown: {
        baseFee: 0,
        discount: 0,
        finalFee: 0,
      },
    };
  }

  /**
   * 判断商品来源
   */
  determineProductSource(product: {
    merchantId?: string;
    sourceUrl?: string;
    externalSource?: string;
    commissionRate?: number;
  }): ProductSource {
    const baseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.io');
    
    // 检查是否是内部商品
    if (!product.sourceUrl || product.sourceUrl.includes('agentrix')) {
      return {
        type: 'internal',
        merchantId: product.merchantId,
        hasCommissionAgreement: true,
        commissionRate: product.commissionRate || 0.15, // 默认15%内部佣金
      };
    }

    // 检查是否是合作伙伴
    if (product.merchantId && this.partnerWhitelist.includes(product.merchantId)) {
      return {
        type: 'partner',
        url: product.sourceUrl,
        merchantId: product.merchantId,
        hasCommissionAgreement: true,
        commissionRate: product.commissionRate,
      };
    }

    // 外部UCP或X402商品
    const type = product.externalSource === 'x402' ? 'external_x402' : 'external_ucp';
    return {
      type,
      url: product.sourceUrl,
      merchantId: product.merchantId,
      hasCommissionAgreement: !!product.commissionRate && product.commissionRate > 0,
      commissionRate: product.commissionRate,
    };
  }

  /**
   * 添加合作伙伴
   */
  addPartner(merchantId: string): void {
    if (!this.partnerWhitelist.includes(merchantId)) {
      this.partnerWhitelist.push(merchantId);
      this.logger.log(`Added partner: ${merchantId}`);
    }
  }

  /**
   * 移除合作伙伴
   */
  removePartner(merchantId: string): void {
    const index = this.partnerWhitelist.indexOf(merchantId);
    if (index >= 0) {
      this.partnerWhitelist.splice(index, 1);
      this.logger.log(`Removed partner: ${merchantId}`);
    }
  }

  /**
   * 添加VIP用户
   */
  addVipUser(userId: string): void {
    this.vipUsers.add(userId);
  }

  /**
   * 移除VIP用户
   */
  removeVipUser(userId: string): void {
    this.vipUsers.delete(userId);
  }

  /**
   * 获取费用配置
   */
  getFeeConfig(): BuyerFeeConfig {
    return { ...this.config };
  }

  /**
   * 批量计算费用 (用于购物车)
   */
  calculateCartFees(
    items: Array<{
      price: number;
      currency: string;
      product: any;
    }>,
    userId?: string,
  ): {
    items: FeeCalculation[];
    totalOriginal: number;
    totalFees: number;
    totalFinal: number;
  } {
    const calculations = items.map(item => {
      const source = this.determineProductSource(item.product);
      return this.calculateFee(item.price, item.currency, source, userId);
    });

    return {
      items: calculations,
      totalOriginal: calculations.reduce((sum, c) => sum + c.originalPrice, 0),
      totalFees: calculations.reduce((sum, c) => sum + c.serviceFee, 0),
      totalFinal: calculations.reduce((sum, c) => sum + c.totalPrice, 0),
    };
  }
}
