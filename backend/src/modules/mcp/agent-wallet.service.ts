/**
 * Agent Wallet Service
 * 
 * 在 Agent 对话中支持钱包相关操作：
 * 1. 创建 MPC 钱包 + 注册 AX ID
 * 2. Agent 授权（QuickPay / X402）
 * 3. 充值（Stripe / Google Pay / Apple Pay）
 * 4. 余额查询
 * 5. 支付执行
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

export interface AgentWalletSession {
  id: string;
  
  // 用户身份（可以是游客或已注册用户）
  userId?: string;
  axId?: string;  // Agentrix ID
  email?: string;
  
  // MPC 钱包
  walletAddress?: string;
  walletCreated: boolean;
  
  // 授权状态
  quickPayAuthorized: boolean;
  x402Authorized: boolean;
  authorizationLimits?: {
    singleLimit: number;
    dailyLimit: number;
    expiresAt?: Date;
  };
  
  // 余额（缓存）
  balance?: {
    usdc: number;
    eth: number;
    lastUpdated: Date;
  };
  
  // 待处理的充值
  pendingTopUp?: {
    amount: number;
    currency: string;
    method: 'stripe' | 'google_pay' | 'apple_pay' | 'crypto';
    checkoutUrl?: string;
    expiresAt: Date;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWalletResult {
  success: boolean;
  walletAddress?: string;
  axId?: string;
  message: string;
  nextStep?: 'backup_shard' | 'verify_email' | 'set_authorization';
  backupCode?: string; // 简化的备份码（用于恢复）
}

export interface TopUpResult {
  success: boolean;
  checkoutUrl?: string;
  amount?: number;
  currency?: string;
  message: string;
  paymentMethods?: string[];
}

export interface AuthorizationResult {
  success: boolean;
  authorizationType?: 'quickpay' | 'x402';
  limits?: {
    singleLimit: number;
    dailyLimit: number;
  };
  message: string;
  setupUrl?: string;
}

@Injectable()
export class AgentWalletService {
  private readonly logger = new Logger(AgentWalletService.name);
  
  // 内存存储（生产环境应使用 Redis）
  private sessions: Map<string, AgentWalletSession> = new Map();
  
  // 外部会话映射（ChatGPT conversation -> AgentWallet session）
  private externalMapping: Map<string, string> = new Map();

  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * 获取或创建 Agent 钱包会话
   */
  getOrCreateSession(externalSessionId?: string): AgentWalletSession {
    // 复用现有会话
    if (externalSessionId) {
      const existingId = this.externalMapping.get(externalSessionId);
      if (existingId) {
        const session = this.sessions.get(existingId);
        if (session) return session;
      }
    }

    // 创建新会话
    const sessionId = `aws_${uuidv4()}`;
    const session: AgentWalletSession = {
      id: sessionId,
      walletCreated: false,
      quickPayAuthorized: false,
      x402Authorized: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    if (externalSessionId) {
      this.externalMapping.set(externalSessionId, sessionId);
    }

    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): AgentWalletSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 更新会话
   */
  updateSession(sessionId: string, updates: Partial<AgentWalletSession>): AgentWalletSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    Object.assign(session, updates, { updatedAt: new Date() });
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * 在对话中创建 MPC 钱包 + AX ID
   * 简化流程：生成钱包 → 生成 AX ID → 返回备份码
   */
  async createWalletInChat(
    sessionId: string,
    email?: string,
  ): Promise<CreateWalletResult> {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, message: '会话不存在，请重新开始' };
    }

    // 检查是否已有钱包
    if (session.walletCreated && session.walletAddress) {
      return {
        success: true,
        walletAddress: session.walletAddress,
        axId: session.axId,
        message: `您已有 Agentrix 钱包：${session.walletAddress.substring(0, 10)}...`,
      };
    }

    // 需要邮箱
    if (!email && !session.email) {
      return {
        success: false,
        message: '创建钱包需要您的邮箱地址，用于账户恢复和通知。请提供您的邮箱。',
        nextStep: 'verify_email',
      };
    }

    try {
      // 生成钱包地址（简化实现，实际应调用 MPCWalletService）
      const walletAddress = `0x${uuidv4().replace(/-/g, '').substring(0, 40)}`;
      
      // 生成 AX ID
      const axId = `AX${Date.now().toString(36).toUpperCase()}`;
      
      // 生成简化备份码（12个单词的助记词简化版）
      const backupCode = this.generateBackupCode();

      // 更新会话
      this.updateSession(sessionId, {
        email: email || session.email,
        walletAddress,
        axId,
        walletCreated: true,
      });

      this.logger.log(`Created wallet for session ${sessionId}: ${walletAddress}, AX ID: ${axId}`);

      return {
        success: true,
        walletAddress,
        axId,
        backupCode,
        nextStep: 'backup_shard',
        message: `🎉 钱包创建成功！\n\n` +
          `📍 钱包地址: ${walletAddress.substring(0, 10)}...${walletAddress.substring(36)}\n` +
          `🆔 AX ID: ${axId}\n\n` +
          `⚠️ 重要：请保存以下备份码，这是恢复钱包的唯一方式：\n\n` +
          `🔐 备份码: ${backupCode}\n\n` +
          `请回复「已保存」确认您已安全保存备份码。`,
      };

    } catch (error: any) {
      this.logger.error(`Failed to create wallet: ${error.message}`);
      return { success: false, message: `创建钱包失败: ${error.message}` };
    }
  }

  /**
   * 设置支付授权（QuickPay / X402）
   */
  async setupAuthorization(
    sessionId: string,
    type: 'quickpay' | 'x402' | 'both',
    limits?: { singleLimit?: number; dailyLimit?: number },
  ): Promise<AuthorizationResult> {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, message: '会话不存在' };
    }

    // 检查是否有钱包
    if (!session.walletCreated) {
      return {
        success: false,
        message: '请先创建钱包后再设置支付授权。回复「创建钱包」开始。',
      };
    }

    const singleLimit = limits?.singleLimit || 100;
    const dailyLimit = limits?.dailyLimit || 500;
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://agentrix.top';

    // 如果用户已登录，可以直接设置授权
    if (session.userId) {
      // 更新会话
      this.updateSession(sessionId, {
        quickPayAuthorized: type === 'quickpay' || type === 'both',
        x402Authorized: type === 'x402' || type === 'both',
        authorizationLimits: {
          singleLimit,
          dailyLimit,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天
        },
      });

      return {
        success: true,
        authorizationType: type === 'both' ? 'quickpay' : type,
        limits: { singleLimit, dailyLimit },
        message: `✅ 支付授权已设置！\n\n` +
          `📊 单笔限额: ¥${singleLimit}\n` +
          `📅 每日限额: ¥${dailyLimit}\n` +
          `⏰ 有效期: 30天\n\n` +
          `现在您可以直接在对话中完成支付，无需每次确认。`,
      };
    }

    // 未登录用户需要跳转设置
    return {
      success: true,
      authorizationType: type === 'both' ? 'quickpay' : type,
      setupUrl: `${frontendUrl}/app/quickpay/setup?sessionId=${sessionId}&single=${singleLimit}&daily=${dailyLimit}`,
      message: `设置支付授权需要验证您的身份。\n\n` +
        `👉 点击链接完成设置: ${frontendUrl}/app/quickpay/setup\n\n` +
        `设置后，您可以在对话中直接完成支付，无需每次确认。\n\n` +
        `建议限额：\n` +
        `• 单笔: ¥${singleLimit}\n` +
        `• 每日: ¥${dailyLimit}`,
    };
  }

  /**
   * 充值（法币转加密货币）
   */
  async topUp(
    sessionId: string,
    amount: number,
    currency: string = 'CNY',
    method?: 'stripe' | 'google_pay' | 'apple_pay' | 'crypto',
  ): Promise<TopUpResult> {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, message: '会话不存在' };
    }

    // 检查是否有钱包
    if (!session.walletCreated) {
      return {
        success: false,
        message: '请先创建钱包后再充值。回复「创建钱包」开始。',
      };
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://agentrix.top';

    // 支持的充值方式
    const paymentMethods = ['stripe', 'google_pay', 'apple_pay', 'alipay', 'wechat_pay'];

    // 生成充值链接
    const checkoutUrl = `${frontendUrl}/topup?` + new URLSearchParams({
      sessionId,
      amount: amount.toString(),
      currency,
      method: method || 'stripe',
      walletAddress: session.walletAddress || '',
    }).toString();

    // 存储待处理充值
    this.updateSession(sessionId, {
      pendingTopUp: {
        amount,
        currency,
        method: method || 'stripe',
        checkoutUrl,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟
      },
    });

    return {
      success: true,
      checkoutUrl,
      amount,
      currency,
      paymentMethods,
      message: `💰 充值 ${amount} ${currency}\n\n` +
        `👉 点击链接完成充值: ${checkoutUrl}\n\n` +
        `支持的支付方式：\n` +
        `• 💳 信用卡/借记卡 (Stripe)\n` +
        `• 📱 Google Pay\n` +
        `• 🍎 Apple Pay\n` +
        `• 💚 微信支付\n` +
        `• 🔵 支付宝\n\n` +
        `充值完成后，资金将自动转入您的钱包。`,
    };
  }

  /**
   * 查询余额
   */
  async getBalance(sessionId: string): Promise<{
    success: boolean;
    balance?: { usdc: number; eth: number; cny: number };
    message: string;
  }> {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, message: '会话不存在' };
    }

    if (!session.walletCreated) {
      return {
        success: false,
        message: '您还没有 Agentrix 钱包。回复「创建钱包」立即创建。',
      };
    }

    // 模拟余额查询（实际应调用区块链）
    const balance = {
      usdc: 100.50,
      eth: 0.05,
      cny: 720.00, // 约等于 CNY
    };

    // 缓存余额
    this.updateSession(sessionId, {
      balance: {
        usdc: balance.usdc,
        eth: balance.eth,
        lastUpdated: new Date(),
      },
    });

    return {
      success: true,
      balance,
      message: `💰 钱包余额\n\n` +
        `📍 地址: ${session.walletAddress?.substring(0, 10)}...${session.walletAddress?.substring(36)}\n\n` +
        `💵 USDC: ${balance.usdc.toFixed(2)}\n` +
        `⟠ ETH: ${balance.eth.toFixed(4)}\n` +
        `≈ ¥${balance.cny.toFixed(2)} CNY\n\n` +
        `${balance.usdc < 10 ? '💡 余额较低，回复「充值 100」快速充值' : ''}`,
    };
  }

  /**
   * 执行支付（使用钱包余额）
   */
  async executePayment(
    sessionId: string,
    amount: number,
    currency: string = 'USDC',
    productId?: string,
    description?: string,
  ): Promise<{
    success: boolean;
    transactionId?: string;
    message: string;
    requiresTopUp?: boolean;
  }> {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, message: '会话不存在' };
    }

    if (!session.walletCreated) {
      return {
        success: false,
        message: '请先创建钱包。回复「创建钱包」开始。',
      };
    }

    // 检查授权
    if (!session.quickPayAuthorized && !session.x402Authorized) {
      return {
        success: false,
        message: '请先设置支付授权。回复「设置支付授权」开始。',
      };
    }

    // 检查限额
    if (session.authorizationLimits) {
      if (amount > session.authorizationLimits.singleLimit) {
        return {
          success: false,
          message: `支付金额 ${amount} 超过单笔限额 ${session.authorizationLimits.singleLimit}`,
        };
      }
    }

    // 检查余额（简化实现）
    const balance = session.balance?.usdc || 0;
    if (balance < amount) {
      return {
        success: false,
        requiresTopUp: true,
        message: `余额不足。当前余额 ${balance.toFixed(2)} USDC，需要 ${amount} USDC。\n\n` +
          `回复「充值 ${Math.ceil(amount - balance + 10)}」快速充值`,
      };
    }

    // 执行支付（模拟）
    const transactionId = `tx_${Date.now()}_${uuidv4().substring(0, 8)}`;

    // 更新余额
    this.updateSession(sessionId, {
      balance: {
        usdc: balance - amount,
        eth: session.balance?.eth || 0,
        lastUpdated: new Date(),
      },
    });

    this.logger.log(`Payment executed: ${transactionId}, amount: ${amount} ${currency}`);

    return {
      success: true,
      transactionId,
      message: `✅ 支付成功！\n\n` +
        `💰 金额: ${amount} ${currency}\n` +
        `📝 交易ID: ${transactionId}\n` +
        `${description ? `📦 说明: ${description}\n` : ''}\n` +
        `💵 剩余余额: ${(balance - amount).toFixed(2)} USDC`,
    };
  }

  /**
   * 生成简化备份码
   */
  private generateBackupCode(): string {
    const words = [
      'apple', 'banana', 'cherry', 'dragon', 'eagle', 'forest',
      'garden', 'harbor', 'island', 'jungle', 'kingdom', 'lemon',
      'mountain', 'nature', 'ocean', 'panda', 'queen', 'river',
      'sunset', 'tiger', 'umbrella', 'valley', 'winter', 'yellow',
    ];

    const selected: string[] = [];
    for (let i = 0; i < 6; i++) {
      const idx = Math.floor(Math.random() * words.length);
      selected.push(words[idx]);
    }

    return selected.join('-');
  }
}
