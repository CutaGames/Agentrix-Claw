import { apiClient } from './client'

export interface TokenLaunchRequest {
  name: string
  symbol: string
  totalSupply: string
  decimals: number
  chain: 'ethereum' | 'solana' | 'bsc' | 'polygon' | 'base'
  distribution?: {
    team: number
    investors: number
    public: number
    reserve: number
  }
  lockup?: {
    team?: {
      amount: number
      releaseSchedule: Array<{
        date: string
        amount: number
      }>
    }
    investors?: {
      amount: number
      releaseSchedule: Array<{
        date: string
        amount: number
      }>
    }
  }
  presale?: {
    price: number
    amount: number
    startDate: string
    endDate: string
    whitelist?: string[]
    minPurchase?: number
    maxPurchase?: number
  }
  publicSale?: {
    price: number
    startDate: string
  }
}

export interface TokenLaunchResponse {
  tokenId: string
  contractAddress: string
  transactionHash: string
  productId: string
  status: 'deploying' | 'deployed' | 'failed'
  presaleContractAddress?: string
}

export interface TokenStatus {
  status: 'deploying' | 'deployed' | 'failed'
  contractAddress?: string
  transactionHash?: string
  deployedAt?: Date
  error?: string
  stats?: {
    totalSupply: string
    sold: string
    remaining: string
    totalRaised: string
  }
}

export interface TokenBuyRequest {
  amount: number
  paymentMethod: 'usdc' | 'usdt' | 'wallet'
  walletAddress?: string
}

export interface TokenBuyResponse {
  transactionHash: string
  purchased: number
  payment: number
  tokenReceived: number
}

export interface TokenSaleInfo {
  price: number
  available: number
  sold: number
  totalSupply: number
  isActive: boolean
  seller: string
}

export const tokenApi = {
  /**
   * 发行代币
   */
  launch: async (data: TokenLaunchRequest): Promise<TokenLaunchResponse> => {
    return apiClient.post('/tokens/launch', data)
  },

  /**
   * 查询代币状态
   */
  getStatus: async (tokenId: string): Promise<TokenStatus> => {
    return apiClient.get(`/tokens/${tokenId}/status`)
  },

  /**
   * 购买代币
   */
  buy: async (tokenId: string, data: TokenBuyRequest): Promise<TokenBuyResponse> => {
    return apiClient.post(`/tokens/${tokenId}/buy`, data)
  },

  /**
   * 查询代币销售信息
   */
  getSaleInfo: async (tokenId: string): Promise<TokenSaleInfo> => {
    return apiClient.get(`/tokens/${tokenId}/sale`)
  },

  /**
   * 更新代币价格
   */
  updatePrice: async (tokenId: string, price: number): Promise<{ success: boolean; newPrice: number }> => {
    return apiClient.put(`/tokens/${tokenId}/price`, { price })
  },
}

