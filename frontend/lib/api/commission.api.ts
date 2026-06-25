import { apiClient } from './client';

export interface CommissionInfo {
  id: string;
  paymentId: string;
  payeeId: string;
  payeeType: 'agent' | 'merchant';
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface SettlementInfo {
  id: string;
  payeeId: string;
  payeeType: 'agent' | 'merchant';
  amount: number;
  currency: string;
  settlementDate: string;
  status: string;
  transactionHash?: string;
  createdAt: string;
}

export const commissionApi = {
  /**
   * 获取分润记录
   */
  getCommissions: async (): Promise<CommissionInfo[]> => {
    return apiClient.get<CommissionInfo[]>('/commissions');
  },

  /**
   * 获取结算记录
   */
  getSettlements: async (): Promise<SettlementInfo[]> => {
    return apiClient.get<SettlementInfo[]>('/commissions/settlements');
  },

  /**
   * 执行结算
   */
  executeSettlement: async (dto: {
    payeeType: 'agent' | 'merchant';
    currency?: string;
  }): Promise<SettlementInfo> => {
    return apiClient.post<SettlementInfo>('/commissions/settle', dto);
  },
};

