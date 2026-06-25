/**
 * Session 相关接口定义
 */

export interface CreateSessionDto {
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

export interface SessionResponse {
  id: string;
  sessionId: string;
  signer: string;
  singleLimit: number;
  dailyLimit: number;
  usedToday: number;
  expiry: Date;
  isActive: boolean;
  agentId?: string;
  createdAt: Date;
}

