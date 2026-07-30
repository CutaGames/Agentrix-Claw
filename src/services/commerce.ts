import { apiFetch } from './api';
import {
  SplitPlan,
  BudgetPool,
  AllocationPreview,
  Settlement,
} from '../types/commerce';

export const commerceApi = {
  getSplitPlans: () => apiFetch<SplitPlan[]>('/commerce/split-plans'),
  createSplitPlan: (body: Partial<SplitPlan>) => apiFetch<SplitPlan>('/commerce/split-plans', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  previewAllocation: (body: any) => apiFetch<AllocationPreview>('/commerce/split-plans/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  getBudgetPools: () => apiFetch<BudgetPool[]>('/commerce/budget-pools'),
  createBudgetPool: (body: Partial<BudgetPool>) => apiFetch<BudgetPool>('/commerce/budget-pools', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  getSettlements: () => apiFetch<Settlement[]>('/commerce/settlements'),
};
