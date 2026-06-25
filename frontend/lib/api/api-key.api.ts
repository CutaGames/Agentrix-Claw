import { apiClient } from './client'

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  status: 'active' | 'revoked' | 'expired'
  mode: 'sandbox' | 'production'
  scopes: string[]
  lastUsedAt?: string
  usageCount: number
  expiresAt?: string
  createdAt: string
}

export interface CreateApiKeyRequest {
  name: string
  expiresInDays?: number
  scopes?: string[]
  mode?: 'sandbox' | 'production'
}

export interface CreateApiKeyResponse {
  id: string
  apiKey: string
  name: string
  keyPrefix: string
  mode: 'sandbox' | 'production'
  scopes: string[]
  expiresAt?: string
  createdAt: string
}

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export const apiKeyApi = {
  list: async (): Promise<ApiKey[]> => {
    const result = await apiClient.get<ApiResponse<ApiKey[]>>('/api-keys')
    return result?.data ?? []
  },

  create: async (dto: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    const result = await apiClient.post<ApiResponse<CreateApiKeyResponse>>('/api-keys', dto)
    if (!result?.data) {
      throw new Error('创建 API Key 失败')
    }
    return result.data
  },

  revoke: async (id: string): Promise<void> => {
    await apiClient.delete(`/api-keys/${id}/revoke`)
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api-keys/${id}`)
  },
}
