/**
 * Relayer 相关接口定义
 */

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

export interface QueuedPayment {
  request: QuickPayRequest;
  timestamp: number;
  retryCount: number;
}

export interface QueueStatus {
  queueLength: number;
  oldestPayment: Date | null;
  isProcessing: boolean;
}

export interface SessionInfo {
  signer: string;
  owner: string;
  singleLimit: string; // BigNumber string
  dailyLimit: string; // BigNumber string
  usedToday: string; // BigNumber string
  expiry: string; // BigNumber string (timestamp)
  lastResetDate: string; // BigNumber string (days since epoch)
  isActive: boolean;
}

