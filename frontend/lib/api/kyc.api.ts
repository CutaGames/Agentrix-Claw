/**
 * KYC 认证 API
 * KYC Verification API
 */

import { apiClient } from './client';

export type KYCLevel = 'basic' | 'standard' | 'advanced' | 'enterprise';
export type KYCStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'expired';

export interface KYCDocument {
  type: string;
  url: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
  uploadedAt: string;
  verifiedAt?: string;
}

export interface KYCRecord {
  id: string;
  userId: string;
  level: KYCLevel;
  status: KYCStatus;

  // 个人信息
  personalInfo?: {
    fullName: string;
    dateOfBirth: string;
    nationality: string;
    idNumber: string;
    idType: string;
  };

  // 地址信息 (高级认证)
  addressInfo?: {
    country: string;
    state: string;
    city: string;
    street: string;
    postalCode: string;
  };

  // 企业信息 (企业认证)
  companyInfo?: {
    companyName: string;
    registrationNumber: string;
    country: string;
    legalRepresentative: string;
  };

  // 文档
  documents: KYCDocument[];

  // 审核
  reviewer?: string;
  reviewNotes?: string;
  reviewedAt?: string;

  // AML
  amlScore?: number;
  sanctionCheckResult?: 'clear' | 'flagged' | 'blocked';

  // 有效期
  validFrom?: string;
  validUntil?: string;

  createdAt: string;
  updatedAt: string;
}

export interface SubmitKYCRequest {
  level: KYCLevel;
  personalInfo: {
    fullName: string;
    dateOfBirth: string;
    nationality: string;
    idNumber: string;
    idType: string;
  };
  addressInfo?: {
    country: string;
    state: string;
    city: string;
    street: string;
    postalCode: string;
  };
  companyInfo?: {
    companyName: string;
    registrationNumber: string;
    country: string;
    legalRepresentative: string;
  };
  documents: Array<{
    type: string;
    url: string;
  }>;
}

export interface KYCLevelBenefits {
  level: KYCLevel;
  dailyTransactionLimit: number;
  withdrawalLimit: number;
  apiCallLimit: number;
  revenueShare: number;
  features: string[];
}

export const kycApi = {
  // 获取我的所有 KYC 记录
  getMy: () => apiClient.get<KYCRecord[]>('/kyc/my'),

  // 获取当前有效 KYC
  getActive: () => apiClient.get<KYCRecord | null>('/kyc/my/active'),

  // 获取当前 KYC 等级
  getCurrentLevel: () => apiClient.get<{ level: KYCLevel; expiresAt?: string }>('/kyc/my/level'),

  // 检查是否满足某级别
  checkLevel: (level: KYCLevel) =>
    apiClient.get<{ satisfied: boolean; currentLevel: KYCLevel; requiredLevel: KYCLevel }>(`/kyc/check/${level}`),

  // 获取等级权益对比
  getLevelBenefits: () =>
    apiClient.get<KYCLevelBenefits[]>('/kyc/level-benefits'),

  // 提交 KYC 申请
  submit: (data: SubmitKYCRequest) =>
    apiClient.post<KYCRecord>('/kyc/submit', data),

  // 补充材料
  addDocuments: (id: string, documents: Array<{ type: string; url: string }>) =>
    apiClient.post<KYCRecord>(`/kyc/${id}/documents`, { documents }),

  // 补充信息
  addInfo: (id: string, info: Partial<SubmitKYCRequest>) =>
    apiClient.post<KYCRecord>(`/kyc/${id}/additional-info`, info),

  // 取消申请
  cancel: (id: string) =>
    apiClient.post<KYCRecord>(`/kyc/${id}/cancel`),

  // 获取文档上传 URL
  getUploadUrl: (filename: string, contentType: string) =>
    apiClient.post<{ uploadUrl: string; documentUrl: string }>('/kyc/upload-url', { filename, contentType }),

  // 获取 KYC 详情
  getById: (id: string) =>
    apiClient.get<KYCRecord>(`/kyc/${id}`),

  // 检查是否需要续期
  checkRenewal: () =>
    apiClient.get<{ needsRenewal: boolean; expiresAt?: string; daysRemaining?: number }>('/kyc/my/check-renewal'),
};
