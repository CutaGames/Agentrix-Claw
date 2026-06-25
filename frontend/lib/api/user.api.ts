import { apiClient } from './client';

export interface UserProfile {
  id: string;
  agentrixId: string;
  email?: string;
  role: string;
  kycLevel: string;
  kycStatus: string;
  avatarUrl?: string;
  nickname?: string;
  bio?: string;
  createdAt: string;
}

export interface UpdateUserDto {
  email?: string;
  nickname?: string;
  bio?: string;
  metadata?: Record<string, any>;
}

export const userApi = {
  /**
   * 获取用户信息
   */
  getProfile: async (): Promise<UserProfile> => {
    const result = await apiClient.get<UserProfile>('/users/profile');
    if (result === null) {
      throw new Error('无法获取用户信息，请稍后重试');
    }
    return result;
  },

  /**
   * 更新用户信息
   */
  updateProfile: async (dto: UpdateUserDto): Promise<UserProfile> => {
    const result = await apiClient.put<UserProfile>('/users/profile', dto);
    if (result === null) {
      throw new Error('无法更新用户信息，请稍后重试');
    }
    return result;
  },

  /**
   * 上传头像
   */
  uploadAvatar: async (file: File): Promise<{ avatarUrl: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const result = await apiClient.post<{ avatarUrl: string }>('/users/avatar', formData);
    if (result === null) {
      throw new Error('无法上传头像，请稍后重试');
    }
    return result;
  },

  /**
   * 获取头像URL
   */
  getAvatar: async (): Promise<{ avatarUrl: string | null }> => {
    const result = await apiClient.get<{ avatarUrl: string | null }>('/users/avatar');
    if (result === null) {
      throw new Error('无法获取头像，请稍后重试');
    }
    return result;
  },

  /**
   * 通用文件上传
   */
  uploadFile: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const result = await apiClient.post<{ url: string }>('/upload/image', formData);
    if (result === null) {
      throw new Error('无法上传文件，请稍后重试');
    }
    return result;
  },
};

/**
 * 商户信息接口
 */
export interface MerchantProfile {
  businessName?: string;
  businessLicense?: string;
  businessDescription?: string;
  contactInfo?: {
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  businessInfo?: {
    registrationDate?: string;
    registrationCountry?: string;
    taxId?: string;
    industry?: string;
  };
  documents?: Array<{
    type: 'license' | 'certificate' | 'other';
    url: string;
    uploadedAt: string;
  }>;
}

/**
 * 商户信息API
 */
export const merchantApi = {
  /**
   * 获取商户信息
   */
  getProfile: async (): Promise<MerchantProfile> => {
    const result = await apiClient.get<MerchantProfile>('/merchant/profile');
    if (result === null) {
      throw new Error('无法获取商户信息，请稍后重试');
    }
    return result;
  },

  /**
   * 更新商户信息
   */
  updateProfile: async (dto: Partial<MerchantProfile>): Promise<MerchantProfile> => {
    const result = await apiClient.post<MerchantProfile>('/merchant/profile', dto);
    if (result === null) {
      throw new Error('无法更新商户信息，请稍后重试');
    }
    return result;
  },
};

