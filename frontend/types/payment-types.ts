/**
 * 支付相关类型定义
 */

export interface PaymentRoutingInfo {
  recommendedMethod: string
  channels: PaymentChannel[]
  reason: string
  requiresKYC?: boolean
  crossBorderRoute?: {
    fiatToCrypto: boolean
    cryptoToFiat: boolean
    recommendedProvider?: string
  }
  priceComparison?: {
    cryptoPrice?: number
    stripePrice?: number
    fiatToCryptoPrice?: number
    fiatToCryptoProvider?: string
  }
  // V3.0新增：总手续费和汇率信息
  totalFeeRate?: number // 总手续费比例（用于前端显示）
  exchangeRate?: {
    from: string // 源货币
    to: string // 目标货币
    rate: number // 汇率
  } // 汇率信息（如果涉及转换）
}

export interface PaymentChannel {
  method: string
  priority: number
  minAmount: number
  maxAmount: number
  cost: number
  speed: number
  available: boolean
  kycRequired?: boolean
  crossBorder?: boolean
  supportedCurrencies?: string[]
}

export interface ExchangeQuote {
  provider: {
    id: string
    name: string
  }
  fromAmount: number
  fromCurrency: string
  toAmount: number
  toCurrency: string
  exchangeRate: number
  fee: number
  totalCost: number
  lockExpiresAt: string | Date
  estimatedTime: number
}

export interface X402Authorization {
  id: string
  userId: string
  isActive: boolean
  singleLimit: number
  dailyLimit: number
  usedToday: number
  expiresAt: string | Date
  createdAt: string | Date
}

export interface AgentPaymentInfo {
  id: string
  agentId: string
  userId: string
  amount: number
  currency: string
  merchantId: string
  status: string
  repaymentMethod: 'offline' | 'system' | 'crypto'
  repaid?: boolean
  repaidAt?: string
  createdAt: string
}

export interface EscrowInfo {
  escrowId: string
  config: {
    paymentId: string
    merchantId: string
    userId: string
    amount: number
    currency: string
    commissionRate?: number
    autoReleaseDays?: number
  }
  status: 'pending' | 'funded' | 'confirmed' | 'disputed' | 'released' | 'refunded'
  transactionHash?: string
  createdAt: Date
  confirmedAt?: Date
  releasedAt?: Date
}

