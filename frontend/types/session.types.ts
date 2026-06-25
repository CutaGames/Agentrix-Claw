/**
 * Session 相关类型定义
 */

export interface SessionKeyPair {
  publicKey: string; // Session Key 地址
  privateKey: string; // 加密后的私钥
}

export interface Session {
  id: string;
  sessionId: string; // bytes32 hex string
  signer: string; // Session Key 地址
  owner: string; // 主钱包地址
  singleLimit: number; // USDC amount
  dailyLimit: number; // USDC amount
  usedToday: number; // USDC amount
  expiry: Date;
  isActive: boolean;
  agentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionRequest {
  signer: string;
  singleLimit: number; // USDC amount (6 decimals)
  dailyLimit: number; // USDC amount (6 decimals)
  expiryDays: number;
  signature: string;
  agentId?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  signer: string;
  singleLimit: string;
  dailyLimit: string;
  expiry: Date;
  createdAt: Date;
}

export interface QuickPayRequest {
  sessionId: string;
  paymentId: string;
  to: string;
  amount: string; // USDC amount (6 decimals, string format)
  signature: string;
  nonce: number;
}

export interface QuickPayResponse {
  success: boolean;
  paymentId: string;
  confirmedAt: Date;
  txHash?: string;
}

export interface PreflightResult {
  recommendedRoute: 'quickpay' | 'wallet' | 'crypto-rail' | 'local-rail';
  quickPayAvailable: boolean;
  sessionLimit?: {
    singleLimit: string;
    dailyLimit: string;
    dailyRemaining: string;
  };
  walletBalance?: string;
  walletBalanceIsMock?: boolean; // 标记余额是否为 mock 值
  requiresKYC?: boolean;
  estimatedTime?: string;
  fees?: {
    gasFee?: string;
    providerFee?: string;
    total?: string;
  };
}

