import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter } from 'events';

/**
 * 意图确认状态
 */
export enum IntentConfirmationStatus {
  PENDING = 'pending',           // 等待用户确认
  CONFIRMED = 'confirmed',       // 用户已确认
  REJECTED = 'rejected',         // 用户已拒绝
  EXPIRED = 'expired',           // 已过期
  EXECUTED = 'executed',         // 已执行
  FAILED = 'failed',             // 执行失败
}

/**
 * 意图确认记录
 */
export interface IntentConfirmation {
  id: string;
  userId: string;
  
  // 意图信息
  intentType: string;
  intentText: string;
  parsedIntent: any;
  
  // 交易预览
  preview: TransactionPreview;
  
  // 状态
  status: IntentConfirmationStatus;
  
  // 时间戳
  createdAt: Date;
  expiresAt: Date;
  confirmedAt?: Date;
  executedAt?: Date;
  
  // 执行结果
  transactionHash?: string;
  error?: string;
}

/**
 * 交易预览
 */
export interface TransactionPreview {
  // 基本信息
  type: 'payment' | 'split' | 'subscription' | 'deposit';
  title: string;
  description: string;
  
  // 金额
  totalAmount: number;
  currency: string;
  currencySymbol: string;
  
  // 收款方
  recipients: Array<{
    address: string;
    name?: string;
    amount: number;
    role: string;
    avatar?: string;
  }>;
  
  // 费用明细
  fees: {
    platformFee: number;
    platformFeeLabel: string;
    gasFee: number;
    gasFeeLabel: string;
    totalFees: number;
  };
  
  // 资金来源
  source: {
    type: 'wallet' | 'session' | 'quickpay' | 'card';
    label: string;
    balance?: number;
    icon?: string;
  };
  
  // 风险提示
  warnings?: string[];
  
  // 预估
  estimatedTime: string;
  estimatedGas?: string;
}

/**
 * 意图确认流服务
 * 
 * 实现完整的: 自然语言 → 交易预览 → 用户确认 → MPC签名 → 执行
 */
@Injectable()
export class IntentConfirmationService {
  private readonly logger = new Logger(IntentConfirmationService.name);
  
  // 待确认意图缓存
  private confirmations: Map<string, IntentConfirmation> = new Map();
  
  // 内部事件发射器
  private readonly eventEmitter = new EventEmitter();
  
  // 默认过期时间（分钟）
  private readonly DEFAULT_EXPIRY_MINUTES = 5;

  constructor(
    private readonly configService: ConfigService,
  ) {
    // 定时清理过期确认
    setInterval(() => this.cleanupExpired(), 60 * 1000);
  }

  /**
   * 创建意图确认
   */
  createConfirmation(
    userId: string,
    intentType: string,
    intentText: string,
    parsedIntent: any,
    preview: TransactionPreview,
    expiryMinutes?: number,
  ): IntentConfirmation {
    const id = this.generateConfirmationId();
    const now = new Date();
    const expiry = expiryMinutes || this.DEFAULT_EXPIRY_MINUTES;
    
    const confirmation: IntentConfirmation = {
      id,
      userId,
      intentType,
      intentText,
      parsedIntent,
      preview,
      status: IntentConfirmationStatus.PENDING,
      createdAt: now,
      expiresAt: new Date(now.getTime() + expiry * 60 * 1000),
    };
    
    this.confirmations.set(id, confirmation);
    
    // 发送事件
    this.eventEmitter.emit('intent.confirmation.created', {
      confirmationId: id,
      userId,
      preview,
    });
    
    this.logger.log(`创建意图确认: ${id} for user ${userId}`);
    
    return confirmation;
  }

  /**
   * 获取意图确认
   */
  getConfirmation(confirmationId: string): IntentConfirmation | null {
    const confirmation = this.confirmations.get(confirmationId);
    
    if (!confirmation) {
      return null;
    }
    
    // 检查是否过期
    if (new Date() > confirmation.expiresAt && confirmation.status === IntentConfirmationStatus.PENDING) {
      confirmation.status = IntentConfirmationStatus.EXPIRED;
      this.confirmations.set(confirmationId, confirmation);
    }
    
    return confirmation;
  }

  /**
   * 用户确认意图
   */
  async confirmIntent(
    confirmationId: string,
    userId: string,
  ): Promise<IntentConfirmation> {
    const confirmation = this.getConfirmation(confirmationId);
    
    if (!confirmation) {
      throw new BadRequestException('确认ID无效或不存在');
    }
    
    if (confirmation.userId !== userId) {
      throw new BadRequestException('无权确认此意图');
    }
    
    if (confirmation.status !== IntentConfirmationStatus.PENDING) {
      throw new BadRequestException(`意图状态无效: ${confirmation.status}`);
    }
    
    if (new Date() > confirmation.expiresAt) {
      confirmation.status = IntentConfirmationStatus.EXPIRED;
      this.confirmations.set(confirmationId, confirmation);
      throw new BadRequestException('意图已过期，请重新发起');
    }
    
    // 更新状态
    confirmation.status = IntentConfirmationStatus.CONFIRMED;
    confirmation.confirmedAt = new Date();
    this.confirmations.set(confirmationId, confirmation);
    
    // 发送事件
    this.eventEmitter.emit('intent.confirmation.confirmed', {
      confirmationId,
      userId,
      confirmation,
    });
    
    this.logger.log(`用户确认意图: ${confirmationId}`);
    
    return confirmation;
  }

  /**
   * 用户拒绝意图
   */
  async rejectIntent(
    confirmationId: string,
    userId: string,
    reason?: string,
  ): Promise<IntentConfirmation> {
    const confirmation = this.getConfirmation(confirmationId);
    
    if (!confirmation) {
      throw new BadRequestException('确认ID无效');
    }
    
    if (confirmation.userId !== userId) {
      throw new BadRequestException('无权拒绝此意图');
    }
    
    confirmation.status = IntentConfirmationStatus.REJECTED;
    confirmation.error = reason;
    this.confirmations.set(confirmationId, confirmation);
    
    // 发送事件
    this.eventEmitter.emit('intent.confirmation.rejected', {
      confirmationId,
      userId,
      reason,
    });
    
    this.logger.log(`用户拒绝意图: ${confirmationId}, reason: ${reason}`);
    
    return confirmation;
  }

  /**
   * 标记意图已执行
   */
  markExecuted(
    confirmationId: string,
    transactionHash: string,
  ): IntentConfirmation {
    const confirmation = this.confirmations.get(confirmationId);
    
    if (!confirmation) {
      throw new BadRequestException('确认ID无效');
    }
    
    confirmation.status = IntentConfirmationStatus.EXECUTED;
    confirmation.executedAt = new Date();
    confirmation.transactionHash = transactionHash;
    this.confirmations.set(confirmationId, confirmation);
    
    // 发送事件
    this.eventEmitter.emit('intent.confirmation.executed', {
      confirmationId,
      transactionHash,
    });
    
    return confirmation;
  }

  /**
   * 标记意图执行失败
   */
  markFailed(
    confirmationId: string,
    error: string,
  ): IntentConfirmation {
    const confirmation = this.confirmations.get(confirmationId);
    
    if (!confirmation) {
      throw new BadRequestException('确认ID无效');
    }
    
    confirmation.status = IntentConfirmationStatus.FAILED;
    confirmation.error = error;
    this.confirmations.set(confirmationId, confirmation);
    
    // 发送事件
    this.eventEmitter.emit('intent.confirmation.failed', {
      confirmationId,
      error,
    });
    
    return confirmation;
  }

  /**
   * 获取用户待确认列表
   */
  getUserPendingConfirmations(userId: string): IntentConfirmation[] {
    const result: IntentConfirmation[] = [];
    
    this.confirmations.forEach(c => {
      if (c.userId === userId && c.status === IntentConfirmationStatus.PENDING) {
        // 检查过期
        if (new Date() > c.expiresAt) {
          c.status = IntentConfirmationStatus.EXPIRED;
        } else {
          result.push(c);
        }
      }
    });
    
    return result;
  }

  /**
   * 生成交易预览
   */
  generatePreview(
    type: TransactionPreview['type'],
    params: {
      amount: number;
      currency: string;
      recipients: Array<{
        address: string;
        name?: string;
        amount: number;
        role: string;
        avatar?: string;
      }>;
      source: TransactionPreview['source'];
      description?: string;
    },
  ): TransactionPreview {
    const { amount, currency, recipients, source, description } = params;
    
    // 计算费用
    const platformFee = amount * 0.01; // 1%
    const gasFee = 0.1; // 预估 Gas
    
    // 货币符号
    const currencySymbols: Record<string, string> = {
      'USDC': '$',
      'USDT': '$',
      'USD': '$',
      'CNY': '¥',
      'ETH': 'Ξ',
    };
    
    // 标题
    const titles: Record<string, string> = {
      'payment': '支付确认',
      'split': '分账支付确认',
      'subscription': '订阅确认',
      'deposit': '预存款确认',
    };
    
    return {
      type,
      title: titles[type] || '交易确认',
      description: description || `支付 ${amount} ${currency}`,
      totalAmount: amount,
      currency,
      currencySymbol: currencySymbols[currency] || '$',
      recipients: recipients.map(r => ({
        ...r,
        avatar: r.avatar || this.generateAvatar(r.address),
      })),
      fees: {
        platformFee,
        platformFeeLabel: '平台服务费 (1%)',
        gasFee,
        gasFeeLabel: '预估 Gas 费',
        totalFees: platformFee + gasFee,
      },
      source: {
        ...source,
        label: this.getSourceLabel(source.type),
        icon: this.getSourceIcon(source.type),
      },
      warnings: this.generateWarnings(amount, source),
      estimatedTime: '约 30 秒',
      estimatedGas: `~${gasFee} USDC`,
    };
  }

  /**
   * 生成确认ID
   */
  private generateConfirmationId(): string {
    return `icf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 清理过期确认
   */
  private cleanupExpired(): void {
    const now = new Date();
    let cleaned = 0;
    
    this.confirmations.forEach((c, id) => {
      // 删除已执行或过期超过1小时的记录
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      if (c.status === IntentConfirmationStatus.EXECUTED && c.executedAt && c.executedAt < oneHourAgo) {
        this.confirmations.delete(id);
        cleaned++;
      } else if (c.status === IntentConfirmationStatus.EXPIRED && c.expiresAt < oneHourAgo) {
        this.confirmations.delete(id);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      this.logger.log(`清理了 ${cleaned} 条过期确认记录`);
    }
  }

  /**
   * 生成头像
   */
  private generateAvatar(address: string): string {
    // 使用地址生成简单的渐变头像
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`;
  }

  /**
   * 获取资金来源标签
   */
  private getSourceLabel(type: string): string {
    const labels: Record<string, string> = {
      'wallet': 'Agentrix 钱包',
      'session': '预存款 Session',
      'quickpay': 'QuickPay 授权',
      'card': '信用卡/借记卡',
    };
    return labels[type] || type;
  }

  /**
   * 获取资金来源图标
   */
  private getSourceIcon(type: string): string {
    const icons: Record<string, string> = {
      'wallet': '💳',
      'session': '🔐',
      'quickpay': '⚡',
      'card': '💳',
    };
    return icons[type] || '💰';
  }

  /**
   * 生成风险提示
   */
  private generateWarnings(amount: number, source: TransactionPreview['source']): string[] {
    const warnings: string[] = [];
    
    // 大额交易警告
    if (amount > 1000) {
      warnings.push('⚠️ 这是一笔大额交易，请仔细核对收款方信息');
    }
    
    // 余额不足警告
    if (source.balance !== undefined && source.balance < amount) {
      warnings.push(`❌ 余额不足，当前余额: ${source.balance} ${source.type === 'wallet' ? 'USDC' : ''}`);
    }
    
    // 首次向此地址转账
    // TODO: 实际检查历史交易
    
    return warnings;
  }
}
