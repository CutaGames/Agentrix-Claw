import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, CouponType, CouponStatus } from '../../entities/coupon.entity';
import { CouponUsage } from '../../entities/coupon-usage.entity';

export interface CreateCouponDto {
  merchantId: string;
  code: string;
  name: string;
  description?: string;
  type: CouponType;
  value: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom?: Date;
  validUntil?: Date;
  usageLimit?: number;
  applicableProducts?: string[];
  applicableCategories?: string[];
  metadata?: Record<string, any>;
}

export interface ApplyCouponDto {
  couponCode: string;
  orderAmount: number;
  productIds?: string[];
  categoryIds?: string[];
}

export interface CouponCalculationResult {
  valid: boolean;
  coupon?: Coupon;
  discountAmount: number;
  finalAmount: number;
  error?: string;
}

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
  ) {}

  /**
   * 创建优惠券
   */
  async createCoupon(dto: CreateCouponDto): Promise<Coupon> {
    // 检查优惠券代码是否已存在
    const existing = await this.couponRepository.findOne({
      where: {
        merchantId: dto.merchantId,
        code: dto.code.toUpperCase(),
      },
    });

    if (existing) {
      throw new BadRequestException('优惠券代码已存在');
    }

    const coupon = this.couponRepository.create({
      ...dto,
      code: dto.code.toUpperCase(),
      status: CouponStatus.ACTIVE,
    });

    return this.couponRepository.save(coupon);
  }

  /**
   * 获取商户的所有优惠券
   */
  async getMerchantCoupons(merchantId: string): Promise<Coupon[]> {
    return this.couponRepository.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 根据代码查找优惠券
   */
  async findCouponByCode(code: string, merchantId?: string): Promise<Coupon | null> {
    const query: any = {
      code: code.toUpperCase(),
      status: CouponStatus.ACTIVE,
    };

    if (merchantId) {
      query.merchantId = merchantId;
    }

    return this.couponRepository.findOne({ where: query });
  }

  /**
   * 计算优惠券折扣
   */
  async calculateCouponDiscount(dto: ApplyCouponDto): Promise<CouponCalculationResult> {
    const coupon = await this.findCouponByCode(dto.couponCode);

    if (!coupon) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: dto.orderAmount,
        error: '优惠券不存在或已失效',
      };
    }

    // 检查有效期
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: dto.orderAmount,
        error: '优惠券尚未生效',
      };
    }

    if (coupon.validUntil && now > coupon.validUntil) {
      // 更新状态为已过期
      coupon.status = CouponStatus.EXPIRED;
      await this.couponRepository.save(coupon);

      return {
        valid: false,
        discountAmount: 0,
        finalAmount: dto.orderAmount,
        error: '优惠券已过期',
      };
    }

    // 检查使用次数限制
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: dto.orderAmount,
        error: '优惠券使用次数已达上限',
      };
    }

    // 检查最低购买金额
    if (coupon.minPurchaseAmount && dto.orderAmount < coupon.minPurchaseAmount) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: dto.orderAmount,
        error: `订单金额需达到 ${coupon.minPurchaseAmount} 才能使用此优惠券`,
      };
    }

    // 检查适用商品/分类
    if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
      if (!dto.productIds || !dto.productIds.some(id => coupon.applicableProducts!.includes(id))) {
        return {
          valid: false,
          discountAmount: 0,
          finalAmount: dto.orderAmount,
          error: '此优惠券不适用于当前商品',
        };
      }
    }

    if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
      if (!dto.categoryIds || !dto.categoryIds.some(id => coupon.applicableCategories!.includes(id))) {
        return {
          valid: false,
          discountAmount: 0,
          finalAmount: dto.orderAmount,
          error: '此优惠券不适用于当前分类',
        };
      }
    }

    // 计算折扣金额
    let discountAmount = 0;

    if (coupon.type === CouponType.PERCENTAGE) {
      discountAmount = dto.orderAmount * (coupon.value / 100);
      // 如果有最大折扣金额限制
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else if (coupon.type === CouponType.FIXED) {
      discountAmount = coupon.value;
      // 折扣金额不能超过订单金额
      if (discountAmount > dto.orderAmount) {
        discountAmount = dto.orderAmount;
      }
    } else if (coupon.type === CouponType.FREE_SHIPPING) {
      // 免运费：假设运费为订单金额的5%（实际应从订单中获取）
      discountAmount = dto.orderAmount * 0.05;
    }

    const finalAmount = Math.max(0, dto.orderAmount - discountAmount);

    return {
      valid: true,
      coupon,
      discountAmount,
      finalAmount,
    };
  }

  /**
   * 应用优惠券（记录使用）
   */
  async applyCoupon(
    couponId: string,
    orderId: string,
    userId: string,
    originalAmount: number,
    discountAmount: number,
  ): Promise<CouponUsage> {
    const coupon = await this.couponRepository.findOne({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException('优惠券不存在');
    }

    // 检查是否已使用过
    const existingUsage = await this.couponUsageRepository.findOne({
      where: { couponId, orderId },
    });

    if (existingUsage) {
      return existingUsage;
    }

    // 创建使用记录
    const usage = this.couponUsageRepository.create({
      couponId,
      orderId,
      userId,
      discountAmount,
      originalAmount,
      finalAmount: originalAmount - discountAmount,
    });

    const savedUsage = await this.couponUsageRepository.save(usage);

    // 更新优惠券使用次数
    coupon.usedCount += 1;
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      coupon.status = CouponStatus.INACTIVE;
    }
    await this.couponRepository.save(coupon);

    this.logger.log(`优惠券已使用: ${coupon.code} for order ${orderId}`);

    return savedUsage;
  }

  /**
   * 自动查找可用优惠券
   */
  async findAvailableCoupons(
    merchantId: string,
    orderAmount: number,
    productIds?: string[],
    categoryIds?: string[],
  ): Promise<Coupon[]> {
    const now = new Date();

    const query = this.couponRepository
      .createQueryBuilder('coupon')
      .where('coupon.merchant_id = :merchantId', { merchantId })
      .andWhere('coupon.status = :status', { status: CouponStatus.ACTIVE })
      .andWhere('(coupon.valid_from IS NULL OR coupon.valid_from <= :now)', { now })
      .andWhere('(coupon.valid_until IS NULL OR coupon.valid_until >= :now)', { now })
      .andWhere('(coupon.usage_limit = 0 OR coupon.used_count < coupon.usage_limit)')
      .andWhere('(coupon.min_purchase_amount IS NULL OR coupon.min_purchase_amount <= :orderAmount)', {
        orderAmount,
      });

    // 如果指定了商品，检查适用商品
    if (productIds && productIds.length > 0) {
      query.andWhere(
        '(coupon.applicable_products IS NULL OR coupon.applicable_products = :emptyArray OR coupon.applicable_products && :productIds)',
        {
          emptyArray: [],
          productIds,
        },
      );
    }

    // 如果指定了分类，检查适用分类
    if (categoryIds && categoryIds.length > 0) {
      query.andWhere(
        '(coupon.applicable_categories IS NULL OR coupon.applicable_categories = :emptyArray OR coupon.applicable_categories && :categoryIds)',
        {
          emptyArray: [],
          categoryIds,
        },
      );
    }

    return query.getMany();
  }
}

