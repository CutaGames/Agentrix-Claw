import { apiClient } from './client';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  agentrixId?: string;
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    agentrixId: string;
    email: string;
    roles: string[];
  };
  wallet?: {
    id: string;
    walletAddress: string;
    walletType: string;
    chain: string;
    isDefault: boolean;
  };
}

export interface WalletLoginDto {
  walletAddress: string;
  walletType: string;
  chain: string;
  message: string;
  signature: string;
  chainId?: string;
}

export interface WalletNonceResponse {
  nonce: string;
  message: string;
  expiresAt?: number;
}

export const authApi = {
  /**
   * 用户注册
   */
  register: async (dto: RegisterDto): Promise<AuthResponse> => {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/register', dto);
      // 注册成功后自动登录
      if (response.access_token) {
        apiClient.setToken(response.access_token);
      }
      return response;
    } catch (error: any) {
      // 如果用户已存在，尝试登录
      if (error.message?.includes('already exists') || error.message?.includes('已存在')) {
        return authApi.login({
          email: dto.email,
          password: dto.password,
        });
      }
      throw error;
    }
  },

  /**
   * 用户登录
   */
  login: async (dto: LoginDto): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', dto);
    // 保存token
    apiClient.setToken(response.access_token);
    return response;
  },

  /**
   * 用户登出
   */
  logout: () => {
    apiClient.clearToken();
  },

  /**
   * 钱包登录
   */
  walletLogin: async (dto: WalletLoginDto): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/wallet/login', dto);
    // 保存token
    apiClient.setToken(response.access_token);
    return response;
  },

  /**
   * 获取钱包登录 nonce / challenge
   */
  getWalletNonce: async (walletAddress: string): Promise<WalletNonceResponse> => {
    return apiClient.get<WalletNonceResponse>(`/auth/wallet/nonce?address=${encodeURIComponent(walletAddress)}`);
  },
};

