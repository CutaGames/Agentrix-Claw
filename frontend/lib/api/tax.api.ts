import { apiClient } from './client';

export interface TaxRate {
  id: string;
  countryCode: string;
  regionCode?: string;
  taxType: string;
  rate: number;
  effectiveDate: string;
  endDate?: string;
}

export interface TaxCalculation {
  rate: number;
  amount: number;
  taxType: string;
}

export interface TaxReport {
  merchantId: string;
  startDate: string;
  endDate: string;
  totalTax: number;
  breakdown: Array<{
    countryCode: string;
    taxAmount: number;
    taxType: string;
    transactionCount: number;
  }>;
}

export const taxApi = {
  /**
   * 获取税费率
   */
  getTaxRate: async (
    countryCode: string,
    regionCode?: string,
    taxType?: string,
  ): Promise<TaxRate> => {
    const params = new URLSearchParams({
      ...(regionCode && { region: regionCode }),
      ...(taxType && { type: taxType }),
    });
    return apiClient.get<TaxRate>(`/api/v2/tax/rates/${countryCode}?${params}`);
  },

  /**
   * 计算税费
   */
  calculateTax: async (
    amount: number,
    countryCode: string,
    regionCode?: string,
  ): Promise<TaxCalculation> => {
    return apiClient.post<TaxCalculation>('/api/v2/tax/calculate', {
      amount,
      countryCode,
      regionCode,
    });
  },

  /**
   * 获取税费报表
   */
  getTaxReport: async (
    merchantId: string,
    startDate: string,
    endDate: string,
  ): Promise<TaxReport> => {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });
    return apiClient.get<TaxReport>(
      `/api/v2/tax/reports/${merchantId}?${params}`,
    );
  },
};

