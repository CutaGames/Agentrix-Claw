/**
 * 创建Agent授权DTO
 */
export interface StrategyPermissionConfig {
  strategyType: 'dca' | 'grid' | 'arbitrage' | 'market_making' | 'rebalancing';
  allowed: boolean;
  maxAmount?: number;
  maxFrequency?: number;
  frequencyPeriod?: 'hour' | 'day';
  allowedTokens?: string[];
  allowedDEXs?: string[];
  allowedCEXs?: string[];
  riskLimits?: {
    maxDrawdown?: number;
    maxLeverage?: number;
    stopLoss?: number;
    takeProfit?: number;
    maxPositionSize?: number;
  };
}

export class CreateAgentAuthorizationDto {
  agentId: string;
  userId: string;
  walletAddress: string;
  authorizationType: 'erc8004' | 'mpc' | 'api_key';
  singleLimit?: number;
  dailyLimit?: number;
  totalLimit?: number;
  expiry?: Date;
  allowedStrategies: StrategyPermissionConfig[];
  sessionId?: string; // 如果使用ERC8004，可以传入已创建的Session ID
  mpcWalletId?: string; // 如果使用MPC，可以传入MPC钱包ID
}

