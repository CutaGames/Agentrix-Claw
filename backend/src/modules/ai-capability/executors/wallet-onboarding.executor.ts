import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { MPCWalletService } from '../../mpc-wallet/mpc-wallet.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';

/**
 * 钱包开通能力执行器 (Wallet Onboarding Skill)
 * 为用户静默创建 MPC 托管钱包
 * 
 * 使用场景：
 * - 新用户首次在 AI 对话中触发支付流程时，自动创建钱包
 * - 用户主动请求创建新钱包用于资产隔离
 */
@Injectable()
export class WalletOnboardingExecutor implements ICapabilityExecutor {
  readonly name = 'WalletOnboardingExecutor';
  private readonly logger = new Logger(WalletOnboardingExecutor.name);

  constructor(
    private readonly mpcWalletService: MPCWalletService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async execute(
    params: Record<string, any>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const userId = context.userId;
    const capabilityId = context.capabilityId || params.capabilityId;

    this.logger.log(`WalletOnboardingExecutor called: capabilityId=${capabilityId}, userId=${userId}`);

    try {
      switch (capabilityId) {
        case 'wallet_onboarding':
        case 'create_wallet':
          return await this.createWallet(params, userId);
        case 'get_wallet_info':
          return await this.getWalletInfo(userId);
        case 'check_wallet_status':
          return await this.checkWalletStatus(userId);
        default:
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的钱包能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`WalletOnboardingExecutor failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: `钱包操作失败: ${error.message}`,
      };
    }
  }

  /**
   * 创建 MPC 托管钱包
   * 静默创建，用户无需理解私钥或助记词
   */
  private async createWallet(
    params: Record<string, any>,
    userId?: string,
  ): Promise<ExecutionResult> {
    if (!userId) {
      return {
        success: false,
        error: 'USER_NOT_AUTHENTICATED',
        message: '创建钱包需要登录。请先通过"登录 Agentrix"完成身份验证。',
        data: {
          nextAction: 'authenticate',
          hint: '需要先登录才能创建钱包',
        },
      };
    }

    try {
      // 检查用户是否已有钱包
      const existingWallet = await this.checkExistingWallet(userId);
      if (existingWallet) {
        return {
          success: true,
          data: {
            walletAddress: existingWallet.address,
            chain: existingWallet.chain,
            isNew: false,
          },
          message: `您已有钱包地址：${existingWallet.address}。无需重复创建。`,
        };
      }

      // 生成安全的随机密码（用于加密钱包分片）
      const password = this.generateSecurePassword();

      // 创建 MPC 钱包
      const result = await this.mpcWalletService.generateMPCWallet(userId, password);

      this.logger.log(`MPC wallet created for user ${userId}: ${result.walletAddress}`);

      return {
        success: true,
        data: {
          walletAddress: result.walletAddress,
          chain: 'BSC',
          currency: 'USDC',
          isNew: true,
          // 注意：不返回敏感的分片信息给 AI
          securityNote: '您的钱包已使用 MPC 技术安全创建，私钥由多方共同保管。',
        },
        message: `🎉 钱包创建成功！您的地址是 ${result.walletAddress}。现在您可以进行充值或接收资产了。`,
      };
    } catch (error: any) {
      this.logger.error(`Wallet creation failed: ${error.message}`);

      if (error.message?.includes('already has an active')) {
        return {
          success: false,
          error: 'WALLET_EXISTS',
          message: '您已经有一个活跃的钱包。如需创建新钱包，请先停用现有钱包。',
        };
      }

      return {
        success: false,
        error: 'WALLET_CREATION_FAILED',
        message: `钱包创建失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取钱包信息
   */
  private async getWalletInfo(userId?: string): Promise<ExecutionResult> {
    if (!userId) {
      return {
        success: false,
        error: 'USER_NOT_AUTHENTICATED',
        message: '请先登录以查看钱包信息。',
      };
    }

    try {
      const wallet = await this.mpcWalletService.getMPCWallet(userId);
      
      return {
        success: true,
        data: {
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          currency: wallet.currency,
          isActive: wallet.isActive,
          createdAt: wallet.createdAt,
        },
        message: `您的钱包地址是 ${wallet.walletAddress}，位于 ${wallet.chain} 链上。`,
      };
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return {
          success: false,
          error: 'NO_WALLET',
          message: '您还没有钱包。说"帮我创建一个钱包"即可开通。',
          data: {
            nextAction: 'wallet_onboarding',
          },
        };
      }
      throw error;
    }
  }

  /**
   * 检查钱包状态
   */
  private async checkWalletStatus(userId?: string): Promise<ExecutionResult> {
    if (!userId) {
      return {
        success: true,
        data: {
          hasWallet: false,
          isAuthenticated: false,
        },
        message: '您尚未登录。登录后可以查看或创建钱包。',
      };
    }

    try {
      const wallet = await this.mpcWalletService.getMPCWallet(userId);
      return {
        success: true,
        data: {
          hasWallet: true,
          isAuthenticated: true,
          walletAddress: wallet.walletAddress,
          isActive: wallet.isActive,
        },
        message: wallet.isActive 
          ? `您的钱包已激活：${wallet.walletAddress}` 
          : '您的钱包当前未激活。',
      };
    } catch (error: any) {
      return {
        success: true,
        data: {
          hasWallet: false,
          isAuthenticated: true,
        },
        message: '您已登录但尚未创建钱包。说"帮我创建钱包"即可开通。',
      };
    }
  }

  /**
   * 检查用户是否已有钱包
   */
  private async checkExistingWallet(userId: string): Promise<{ address: string; chain: string } | null> {
    try {
      const wallet = await this.mpcWalletService.getMPCWallet(userId);
      return {
        address: wallet.walletAddress,
        chain: wallet.chain,
      };
    } catch {
      return null;
    }
  }

  /**
   * 生成安全的随机密码
   */
  private generateSecurePassword(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
}
