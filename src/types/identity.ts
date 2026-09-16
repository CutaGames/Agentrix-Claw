// 身份类型定义

export type IdentityType = 'personal' | 'merchant' | 'developer';

export interface IdentityStatus {
  type: IdentityType;
  activated: boolean;
  pending: boolean; // 审核中
  activatedAt?: string;
}

export interface UserIdentities {
  personal: IdentityStatus;
  merchant: IdentityStatus;
  developer: IdentityStatus;
}

export interface User {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  walletAddress?: string;
  identities: UserIdentities;
  createdAt: string;
}

// 资产相关
export interface Asset {
  symbol: string;
  name: string;
  balance: number | string;
  usdValue: number | string;
  change24h: number | string;
  chain: string;
  icon?: string;
}

export interface AssetSummary {
  totalUsdValue: number;
  change24h: number;
  change24hPercent: number;
  assets: Asset[];
  // Aliases for API compatibility
  totalBalance?: string;
}

// 空投相关
export interface Airdrop {
  id: string;
  name: string;
  protocol: string;
  estimatedValue: number;
  status: 'available' | 'claimed' | 'expired';
  expiresAt?: string;
  claimUrl?: string;
  requirements?: string[];
  icon?: string;
}

// AutoEarn 相关
export interface AutoEarnStrategy {
  id: string;
  name: string;
  apy: number;
  risk: 'low' | 'medium' | 'high';
  minDeposit: number;
  token: string;
  protocol: string;
  deposited: number;
  earned: number;
  status: 'active' | 'paused';
}

export interface AutoEarnSummary {
  totalDeposited: number;
  totalEarned: number;
  todayEarned: number;
  activeStrategies: number;
  // Aliases for API compatibility
  totalEarnings?: string;
  pendingRewards?: string;
}

// 商户相关
export interface SplitPlan {
  id: string;
  name: string;
  type: 'fixed' | 'percentage';
  rate: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Settlement {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed';
  orderId: string;
  createdAt: string;
}

export interface MerchantSummary {
  todayRevenue: number | string;
  pendingSettlement: number | string;
  availableBalance: number | string;
  recentOrders: number;
  // Aliases for API compatibility
  totalRevenue?: string;
  activePlans?: number;
}

// 开发者相关
export interface BudgetPool {
  id: string;
  name: string;
  totalBudget: number;
  funded: number;
  released: number;
  status: 'active' | 'completed' | 'cancelled';
  milestoneCount: number;
}

export interface Milestone {
  id: string;
  poolId: string;
  name: string;
  amount: number;
  status: 'pending' | 'submitted' | 'approved' | 'released';
  dueDate?: string;
}

export interface DeveloperOrder {
  id: string;
  title: string;
  budget: number | string;
  status: 'available' | 'in-progress' | 'completed';
  deadline?: string;
  description?: string;
  skills?: string[];
}

export interface DeveloperSummary {
  pendingSettlement: number;
  availableBalance: number;
  weekEarned: number;
  activePools: number;
  pendingMilestones: number;
  // Aliases for API compatibility
  totalEarnings?: string;
  activeProjects?: number;
  pendingPayment?: string;
  completedTasks?: number;
}
