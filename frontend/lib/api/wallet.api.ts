import { apiClient } from './client'

export interface WalletConnection {
  id: string
  walletAddress: string
  walletType: string
  chain: string
  chainId?: string
  isDefault: boolean
  connectedAt: string
  lastUsedAt: string
}

export const walletApi = {
  list: async (): Promise<WalletConnection[]> => {
    const result = await apiClient.get<WalletConnection[]>('/auth/wallet/connections')
    return result ?? []
  },

  bind: async (dto: {
    walletAddress: string
    walletType: string
    chain: string
    chainId?: string
    message: string
    signature: string
  }): Promise<{ wallet: WalletConnection['id'] }> => {
    const result = await apiClient.post<{ wallet: WalletConnection['id'] }>('/auth/wallet/bind', dto)
    if (result === null) {
      throw new Error('无法绑定钱包，请稍后重试')
    }
    return result
  },

  remove: async (walletId: string): Promise<{ message: string }> => {
    const result = await apiClient.delete<{ message: string }>(`/auth/wallet/connections/${walletId}`)
    if (result === null) {
      throw new Error('无法移除钱包，请稍后重试')
    }
    return result
  },

  setDefault: async (walletId: string): Promise<WalletConnection> => {
    const result = await apiClient.post<WalletConnection>(`/auth/wallet/connections/${walletId}/default`, {})
    if (result === null) {
      throw new Error('无法设置默认钱包，请稍后重试')
    }
    return result
  },
}

