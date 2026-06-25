import { apiClient } from './client'

export interface NFTCollectionRequest {
  name: string
  description?: string
  chain: 'ethereum' | 'solana' | 'bsc' | 'polygon' | 'base'
  standard: 'ERC-721' | 'ERC-1155' | 'SPL-NFT'
  royalty: number
  royaltyRecipients?: Array<{
    address: string
    percentage: number
  }>
  image?: string
}

export interface NFTCollectionResponse {
  collectionId: string
  contractAddress: string
  transactionHash: string
  status: 'deploying' | 'deployed' | 'failed'
}

export interface NFTMintItem {
  name: string
  description?: string
  image: string | File
  attributes?: Array<{
    trait_type: string
    value: string | number
  }>
  price?: number
  currency?: string
}

export interface NFTMintRequest {
  items: NFTMintItem[]
  uploadTo: 'ipfs' | 'arweave'
  autoList?: boolean
}

export interface NFTMintResponse {
  minted: number
  failed: number
  nfts: Array<{
    tokenId: string
    productId: string
    metadataURI: string
    status: 'minting' | 'minted' | 'failed'
    transactionHash?: string
    error?: string
  }>
}

export interface NFTMintStatus {
  total: number
  minted: number
  failed: number
  nfts: Array<{
    tokenId: string
    status: 'minting' | 'minted' | 'failed'
    transactionHash?: string
    metadataURI?: string
    error?: string
  }>
}

export interface NFTBuyRequest {
  paymentMethod: 'usdc' | 'usdt' | 'wallet'
  walletAddress?: string
}

export interface NFTBuyResponse {
  transactionHash: string
  nftId: string
  payment: number
  royalty: number
  sellerAmount: number
}

export interface NFTSaleInfo {
  price: number
  isListed: boolean
  owner: string
  creator: string
  royalty: number
  salesHistory?: Array<{
    buyer: string
    price: number
    timestamp: Date
  }>
}

export const nftApi = {
  /**
   * 创建 NFT 集合
   */
  createCollection: async (data: NFTCollectionRequest): Promise<NFTCollectionResponse> => {
    return apiClient.post('/nfts/collections', data)
  },

  /**
   * 批量 Mint NFT
   */
  mint: async (collectionId: string, data: NFTMintRequest): Promise<NFTMintResponse> => {
    const formData = new FormData()
    
    // 处理文件上传
    data.items.forEach((item, index) => {
      if (item.image instanceof File) {
        formData.append(`files`, item.image)
      } else {
        formData.append(`items[${index}][image]`, item.image)
      }
      formData.append(`items[${index}][name]`, item.name)
      if (item.description) {
        formData.append(`items[${index}][description]`, item.description)
      }
      if (item.price) {
        formData.append(`items[${index}][price]`, item.price.toString())
      }
      if (item.currency) {
        formData.append(`items[${index}][currency]`, item.currency)
      }
      if (item.attributes) {
        formData.append(`items[${index}][attributes]`, JSON.stringify(item.attributes))
      }
    })
    
    formData.append('uploadTo', data.uploadTo)
    if (data.autoList !== undefined) {
      formData.append('autoList', data.autoList.toString())
    }

    return apiClient.post(`/nfts/collections/${collectionId}/mint`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  /**
   * 查询 Mint 状态
   */
  getMintStatus: async (collectionId: string): Promise<NFTMintStatus> => {
    return apiClient.get(`/nfts/collections/${collectionId}/mint-status`)
  },

  /**
   * 购买 NFT
   */
  buy: async (nftId: string, data: NFTBuyRequest): Promise<NFTBuyResponse> => {
    return apiClient.post(`/nfts/${nftId}/buy`, data)
  },

  /**
   * 上架 NFT
   */
  list: async (nftId: string, price: number, currency?: string): Promise<{ success: boolean; listedPrice: number }> => {
    return apiClient.post(`/nfts/${nftId}/list`, { price, currency })
  },

  /**
   * 下架 NFT
   */
  delist: async (nftId: string): Promise<{ success: boolean }> => {
    return apiClient.post(`/nfts/${nftId}/delist`)
  },

  /**
   * 查询 NFT 销售信息
   */
  getSaleInfo: async (nftId: string): Promise<NFTSaleInfo> => {
    return apiClient.get(`/nfts/${nftId}/sale`)
  },

  /**
   * 更新 NFT 价格
   */
  updatePrice: async (nftId: string, price: number, currency?: string): Promise<{ success: boolean; newPrice: number }> => {
    return apiClient.put(`/nfts/${nftId}/price`, { price, currency })
  },
}

