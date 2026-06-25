export interface PaymentRequest {
  id: string
  amount: string
  currency: string
  description: string
  merchant: string
  agent?: string
  metadata?: any
  createdAt: string
}

export interface Wallet {
  id: string
  name: string
  address: string
  chain: string
  isConnected: boolean
  balance: string
}

export interface PaymentMethod {
  id: string
  type: 'wallet' | 'passkey' | 'multisig' | 'x402' | 'stripe'
  name: string
  description: string
  icon: string
  recommendedFor: number
  limits?: {
    min: number
    max: number
  }
}

export interface PaymentResult {
  success: boolean
  transactionHash?: string
  error?: string
  timestamp: string
}
