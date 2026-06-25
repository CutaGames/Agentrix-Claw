import { apiClient } from './client'

export interface MarketplaceAsset {
  id: string
  type: 'token' | 'pair' | 'nft' | 'rwa' | 'launchpad'
  name: string
  symbol?: string
  chain?: string
  address?: string
  pair?: string
  imageUrl?: string
  priceUsd?: string
  liquidityUsd?: string
  volume24hUsd?: string
  change24hPercent?: string
  metadata?: Record<string, any>
}

export interface GetMarketplaceAssetsParams {
  type?: string
  chain?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface MarketplaceAssetsResponse {
  items: MarketplaceAsset[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface SwapRequest {
  fromAssetId: string
  toAssetId: string
  amount: string
  slippage?: number
  userWallet?: string
}

export interface SwapResponse {
  status: 'pending' | 'completed' | 'failed'
  transactionHash?: string
  amountOut?: string
  route?: any
  error?: string
}

export const marketplaceApi = {
  getAssets: async (params: GetMarketplaceAssetsParams = {}) => {
    const searchParams = new URLSearchParams()
    if (params.type) searchParams.set('type', params.type)
    if (params.chain) searchParams.set('chain', params.chain)
    if (params.search) searchParams.set('search', params.search)
    if (params.page) searchParams.set('page', params.page.toString())
    if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString())
    const query = searchParams.toString()
    const url = query ? `/marketplace/assets?${query}` : '/marketplace/assets'
    return apiClient.get<MarketplaceAssetsResponse>(url)
  },

  searchAssets: async (params: {
    query?: string
    type?: string
    chain?: string
    priceMin?: number
    priceMax?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params.query) searchParams.set('query', params.query)
    if (params.type) searchParams.set('type', params.type)
    if (params.chain) searchParams.set('chain', params.chain)
    if (params.priceMin) searchParams.set('priceMin', params.priceMin.toString())
    if (params.priceMax) searchParams.set('priceMax', params.priceMax.toString())
    const query = searchParams.toString()
    return apiClient.get<MarketplaceAsset[]>(`/marketplace/assets/search?${query}`)
  },

  getRecommendedAssets: async (limit: number = 10) => {
    return apiClient.get<MarketplaceAsset[]>(`/marketplace/assets/recommend?limit=${limit}`)
  },

  executeSwap: async (request: SwapRequest) => {
    return apiClient.post<SwapResponse>('/marketplace/swap', request)
  },

  purchaseNFT: async (nftId: string, price: string) => {
    return apiClient.post<SwapResponse>('/marketplace/nft/purchase', { nftId, price })
  },

  ingestAssets: async (sources?: string[]) => {
    return apiClient.post<{ success: boolean; result: any[] }>('/marketplace/ingest', { sources })
  },
}

