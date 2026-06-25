import { apiClient } from './client';

export interface Coupon {
  id: string;
  merchantId: string;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom?: string;
  validUntil?: string;
  usageLimit?: number;
  usedCount: number;
  status: 'active' | 'inactive' | 'expired';
  applicableProducts?: string[];
  applicableCategories?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CouponCalculationResult {
  valid: boolean;
  coupon?: Coupon;
  discountAmount: number;
  finalAmount: number;
  error?: string;
}

export interface CreateCouponDto {
  merchantId: string;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom?: string;
  validUntil?: string;
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

export const couponApi = {
  /**
   * 创建优惠券
   */
  createCoupon: async (dto: CreateCouponDto): Promise<Coupon> => {
    return apiClient.post<Coupon>('/coupon', dto);
  },

  /**
   * 获取商户的优惠券列表
   */
  getMerchantCoupons: async (merchantId: string): Promise<Coupon[]> => {
    return apiClient.get<Coupon[]>(`/coupon/merchant/${merchantId}`);
  },

  /**
   * 查找可用优惠券
   */
  findAvailableCoupons: async (params: {
    merchantId: string;
    orderAmount: number;
    productIds?: string[];
    categoryIds?: string[];
  }): Promise<Coupon[]> => {
    const query = new URLSearchParams();
    query.set('merchantId', params.merchantId);
    query.set('orderAmount', params.orderAmount.toString());
    if (params.productIds) query.set('productIds', params.productIds.join(','));
    if (params.categoryIds) query.set('categoryIds', params.categoryIds.join(','));
    return apiClient.get<Coupon[]>(`/coupon/available?${query.toString()}`);
  },

  /**
   * 计算优惠券折扣
   */
  calculateCoupon: async (dto: ApplyCouponDto): Promise<CouponCalculationResult> => {
    return apiClient.post<CouponCalculationResult>('/coupon/calculate', dto);
  },

  /**
   * 应用优惠券
   */
  applyCoupon: async (params: {
    couponId: string;
    orderId: string;
    originalAmount: number;
    discountAmount: number;
  }): Promise<any> => {
    return apiClient.post('/coupon/apply', params);
  },
};

