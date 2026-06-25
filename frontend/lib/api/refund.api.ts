import { apiClient } from './client'

export interface Refund {
  id: string
  paymentId: string
  amount: number
  currency: string
  status: 'pending' | 'approved' | 'completed' | 'rejected'
  reason: string
  requestedBy: string
  createdAt: string
  processedAt?: string
  processedBy?: string
}

export interface CreateRefundRequest {
  paymentId: string
  amount?: number
  reason: string
}

export const refundApi = {
  create: async (dto: CreateRefundRequest): Promise<Refund> => {
    const result = await apiClient.post<Refund>('/refunds', dto)
    if (!result) {
      throw new Error('创建退款请求失败')
    }
    return result
  },

  get: async (refundId: string): Promise<Refund | null> => {
    return apiClient.get<Refund>(`/refunds/${refundId}`)
  },

  getByPayment: async (paymentId: string): Promise<Refund[]> => {
    const result = await apiClient.get<Refund[]>(`/refunds/payment/${paymentId}`)
    return result ?? []
  },
}
