export type SplitPlanStatus = 'draft' | 'active' | 'archived';
export type ProductType = 'physical' | 'service' | 'virtual' | 'nft' | 'skill' | 'agent_task';

export interface SplitRule {
  role: string;
  customRoleName?: string;
  shareBps: number;
  recipient?: string;
  source?: 'gross' | 'net';
  active?: boolean;
}

export interface FeeConfig {
  onrampFeeBps: number;
  offrampFeeBps: number;
  splitFeeBps: number;
  minSplitFee: number;
}

export interface SplitPlan {
  id: string;
  name: string;
  description?: string;
  productType: ProductType;
  status: SplitPlanStatus;
  rules: SplitRule[];
  feeConfig: FeeConfig;
  version: number;
  isSystemTemplate?: boolean;
  usageCount?: number;
  createdAt: string;
}

export interface AllocationPreview {
  grossAmount: number;
  currency: string;
  platformFee?: number;
  netAmount?: number;
  allocations: Array<{
    role: string;
    recipientId: string;
    shareBps: number;
    amount: number;
  }>;
  feeBreakdown?: {
    splitFee: number;
    onrampFee: number;
    offrampFee: number;
  };
}

export interface BudgetPool {
  id: string;
  name: string;
  description?: string;
  totalBudget: number;
  funded: number;
  currency: string;
  status: string;
  startDate?: string;
  endDate?: string;
}

export interface Settlement {
  id: string;
  orderId?: string;
  totalAmount: number;
  currency: string;
  status: string;
  createdAt: string;
}
