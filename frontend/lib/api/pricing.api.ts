import { apiClient } from './client';

export interface ProductPrice {
  amount: number;
  currency: string;
  taxIncluded: boolean;
  taxRate: number;
  taxAmount: number;
  basePrice: number;
  priceDifference: number;
  reason: string;
}

export interface TotalPrice {
  basePrice: number;
  taxAmount: number;
  taxRate: number;
  totalPrice: number;
  currency: string;
}

export interface CurrencyConversion {
  amount: number;
  currency: string;
}

export const pricingApi = {
  /**
   * 获取产品价格（根据国家）
   */
  getProductPrice: async (
    productId: string,
    countryCode: string,
    regionCode?: string,
  ): Promise<ProductPrice> => {
    const params = new URLSearchParams({
      country: countryCode,
      ...(regionCode && { region: regionCode }),
    });
    return apiClient.get<ProductPrice>(
      `/api/v2/pricing/products/${productId}/price?${params}`,
    );
  },

  /**
   * 获取产品总价（包含税费）
   */
  getTotalPrice: async (
    productId: string,
    countryCode: string,
    regionCode?: string,
  ): Promise<TotalPrice> => {
    const params = new URLSearchParams({
      country: countryCode,
      ...(regionCode && { region: regionCode }),
    });
    return apiClient.get<TotalPrice>(
      `/api/v2/pricing/products/${productId}/total?${params}`,
    );
  },

  /**
   * 货币转换
   */
  convertCurrency: async (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<CurrencyConversion> => {
    const result = await apiClient.post<{ amount: number; currency: string }>(
      '/api/v2/pricing/convert',
      {
        amount,
        fromCurrency,
        toCurrency,
      },
    );
    return {
      amount: result.amount,
      currency: result.currency,
    };
  },
};

