import { apiClient } from './client'

export interface PaymentHistoryItem {
  id: string
  orderId: string
  amount: string
  currency: string
  method: string
  type: 'fiat' | 'crypto' | 'provider'
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  transactionHash?: string
  provider?: string
  createdAt: string
  updatedAt: string
  error?: string
  metadata?: Record<string, any>
}

export interface PaymentHistoryQuery {
  page?: number
  limit?: number
  status?: 'pending' | 'completed' | 'failed' | 'cancelled'
  type?: 'fiat' | 'crypto' | 'provider'
  startDate?: string
  endDate?: string
}

export interface PaymentHistoryResponse {
  items: PaymentHistoryItem[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export const paymentHistoryApi = {
  /**
   * 获取支付历史记录
   */
  getHistory: async (query?: PaymentHistoryQuery): Promise<PaymentHistoryResponse> => {
    const params = new URLSearchParams()
    if (query?.page) params.append('page', query.page.toString())
    if (query?.limit) params.append('limit', query.limit.toString())
    if (query?.status) params.append('status', query.status)
    if (query?.type) params.append('type', query.type)
    if (query?.startDate) params.append('startDate', query.startDate)
    if (query?.endDate) params.append('endDate', query.endDate)

    const result = await apiClient.get<PaymentHistoryResponse>(`/payments/history?${params}`)
    if (result === null) {
      throw new Error('无法获取支付历史，请稍后重试')
    }
    return result
  },

  /**
   * 获取单条支付记录详情
   */
  getPaymentDetail: async (paymentId: string): Promise<PaymentHistoryItem> => {
    const result = await apiClient.get<PaymentHistoryItem>(`/payments/history/${paymentId}`)
    if (result === null) {
      throw new Error('无法获取支付详情，请稍后重试')
    }
    return result
  },

  /**
   * 保存支付记录（用于前端临时存储，实际应该由后端保存）
   */
  savePayment: async (payment: Omit<PaymentHistoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentHistoryItem> => {
    const result = await apiClient.post<PaymentHistoryItem>('/payments/history', payment)
    if (result === null) {
      throw new Error('无法保存支付记录，请稍后重试')
    }
    return result
  },
}

