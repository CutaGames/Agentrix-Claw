import { apiClient } from './client';

export interface QRCodeInfo {
  id: string;
  qrId: string;
  qrCodeUrl: string;
  payUrl: string;
  type: string;
  amount?: number;
  currency?: string;
  description?: string;
  status: string;
  expiresAt?: string;
  createdAt: string;
}

export interface GenerateQRCodeOptions {
  type: 'fixed_amount' | 'customer_payment' | 'merchant_static' | 'dynamic';
  amount?: number;
  currency?: string;
  description?: string;
  merchantId?: string;
  metadata?: Record<string, any>;
}

export interface MerchantReceiveQROptions {
  merchantId?: string;
  defaultAmount?: number;
  currency?: string;
  description?: string;
}

export const qrPaymentApi = {
  /**
   * 生成支付二维码
   */
  generateQRCode: async (options: GenerateQRCodeOptions): Promise<QRCodeInfo> => {
    return apiClient.post<QRCodeInfo>('/qr/generate', options);
  },

  /**
   * 获取二维码信息
   */
  getQRCodeInfo: async (qrId: string): Promise<QRCodeInfo> => {
    return apiClient.get<QRCodeInfo>(`/qr/${qrId}`);
  },

  /**
   * 获取二维码支付状态
   */
  getQRCodeStatus: async (qrId: string): Promise<{ status: string; paid?: boolean }> => {
    return apiClient.get<{ status: string; paid?: boolean }>(`/qr/${qrId}/status`);
  },

  /**
   * 生成商户收款二维码/链接
   */
  generateMerchantReceiveQR: async (options: MerchantReceiveQROptions): Promise<QRCodeInfo> => {
    return apiClient.post<QRCodeInfo>('/qr/merchant/receive', options);
  },

  /**
   * 处理扫码支付
   */
  processQRPayment: async (qrId: string, payload: { amount?: number; paymentMethod?: string }): Promise<any> => {
    return apiClient.post<any>(`/qr/${qrId}/process`, payload);
  },
};
