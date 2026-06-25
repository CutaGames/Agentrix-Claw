import { apiClient } from './client';

export interface MPCWallet {
  id: string;
  walletAddress: string;
  chain: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateMPCWalletDto {
  password: string;
}

export interface CreateMPCWalletResponse {
  walletAddress: string;
  encryptedShardA: string;
  encryptedShardC: string;
  message: string;
}

export interface RecoverWalletDto {
  encryptedShardA: string;
  encryptedShardC: string;
  password: string;
}

export const mpcWalletApi = {
  /**
   * 创建MPC钱包
   */
  async createWallet(dto: CreateMPCWalletDto): Promise<CreateMPCWalletResponse> {
    const response = await apiClient.post<CreateMPCWalletResponse>(
      '/mpc-wallet/create',
      dto,
    );
    return response;
  },

  /**
   * 获取我的MPC钱包
   */
  async getMyWallet(): Promise<MPCWallet> {
    const response = await apiClient.get<MPCWallet>('/mpc-wallet/my-wallet');
    return response;
  },

  /**
   * 恢复钱包
   */
  async recoverWallet(dto: RecoverWalletDto): Promise<{
    success: boolean;
    walletAddress: string;
    message: string;
  }> {
    const response = await apiClient.post<{
      success: boolean;
      walletAddress: string;
      message: string;
    }>('/mpc-wallet/recover', dto);
    if (response === null) {
      throw new Error('无法恢复钱包，请稍后重试');
    }
    return response;
  },
};

