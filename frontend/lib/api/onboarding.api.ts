/**
 * 入驻流程 API
 * Onboarding API
 */

import { apiClient } from './client';

export type UserPersona = 'personal' | 'api_provider' | 'merchant' | 'expert' | 'data_provider' | 'developer';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'abandoned';

export interface OnboardingStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  isRequired: boolean;
  completedAt?: string;
  data?: Record<string, any>;
}

export interface OnboardingSession {
  id: string;
  userId: string;
  persona: UserPersona;
  status: OnboardingStatus;
  currentStep: string;
  steps: OnboardingStep[];
  
  // 创建的资源
  createdResources: {
    agentAccountId?: string;
    developerAccountId?: string;
    merchantAccountId?: string;
    expertProfileId?: string;
    datasetId?: string;
    workspaceId?: string;
  };
  
  // 进度
  progress: number; // 0-100
  
  metadata?: Record<string, any>;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface StartOnboardingRequest {
  persona: UserPersona;
  referralCode?: string;
  metadata?: Record<string, any>;
}

export interface OnboardingStepResult {
  success: boolean;
  nextStep?: string;
  createdResourceId?: string;
  message?: string;
}

// 各画像的步骤配置
export const personaSteps: Record<UserPersona, string[]> = {
  personal: ['welcome', 'connect-wallet', 'create-agent', 'explore-marketplace', 'complete'],
  api_provider: ['welcome', 'verify-identity', 'import-api', 'configure-pricing', 'publish-skill', 'complete'],
  merchant: ['welcome', 'verify-identity', 'sync-store', 'configure-ucp', 'test-order', 'complete'],
  expert: ['welcome', 'verify-identity', 'create-capability-card', 'set-pricing', 'configure-sla', 'complete'],
  data_provider: ['welcome', 'verify-identity', 'upload-dataset', 'configure-privacy', 'set-x402-pricing', 'complete'],
  developer: ['welcome', 'create-developer-account', 'create-skill', 'test-skill', 'publish-skill', 'complete'],
};

export const onboardingApi = {
  // 获取当前入驻会话
  getCurrentSession: () =>
    apiClient.get<OnboardingSession | null>('/onboarding/current'),

  // 获取草稿列表
  getDrafts: () =>
    apiClient.get<OnboardingSession[]>('/onboarding/drafts'),

  // 开始新的入驻流程
  start: (data: StartOnboardingRequest) =>
    apiClient.post<OnboardingSession>('/onboarding/start', data),

  // 恢复入驻流程
  resume: (sessionId: string) =>
    apiClient.post<OnboardingSession>(`/onboarding/${sessionId}/resume`),

  // 完成步骤
  completeStep: (sessionId: string, stepId: string, data?: Record<string, any>) =>
    apiClient.post<OnboardingStepResult>(`/onboarding/${sessionId}/steps/${stepId}/complete`, data),

  // 跳过步骤
  skipStep: (sessionId: string, stepId: string) =>
    apiClient.post<OnboardingStepResult>(`/onboarding/${sessionId}/steps/${stepId}/skip`),

  // 回到上一步
  goBack: (sessionId: string) =>
    apiClient.post<OnboardingSession>(`/onboarding/${sessionId}/back`),

  // 放弃入驻
  abandon: (sessionId: string) =>
    apiClient.post<{ success: boolean }>(`/onboarding/${sessionId}/abandon`),

  // 获取步骤详情
  getStepDetails: (sessionId: string, stepId: string) =>
    apiClient.get<OnboardingStep>(`/onboarding/${sessionId}/steps/${stepId}`),

  // 保存步骤数据（草稿）
  saveStepData: (sessionId: string, stepId: string, data: Record<string, any>) =>
    apiClient.put<OnboardingStep>(`/onboarding/${sessionId}/steps/${stepId}`, data),

  // AI 辅助生成能力描述（专家）
  generateCapabilityDescription: (expertise: string[], requirements: string[]) =>
    apiClient.post<{ description: string; suggestions: string[] }>('/onboarding/ai/capability-description', {
      expertise,
      requirements,
    }),

  // AI 辅助解析 OpenAPI（API厂商）
  parseOpenAPI: (openApiUrl: string) =>
    apiClient.post<{
      endpoints: Array<{ path: string; method: string; description: string }>;
      suggestedPricing: Record<string, number>;
    }>('/onboarding/ai/parse-openapi', { openApiUrl }),
};
