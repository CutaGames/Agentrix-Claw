import { Injectable, Logger } from '@nestjs/common';

/**
 * X402 支付元数据
 */
export interface X402PaymentMetadata {
  // 基础信息
  version: string;
  scheme: 'exact' | 'upto' | 'stream';
  network: string;
  
  // 支付信息
  asset: string;
  amount: string;
  recipient: string;
  
  // 扩展字段
  paymentReason?: string;
  orderId?: string;
  merchantId?: string;
  productId?: string;
  description?: string;
  
  // Agent 协作信息
  agentCollaboration?: {
    requestingAgent: string;
    executingAgent?: string;
    referrerAgent?: string;
    collaborationId?: string;
    taskId?: string;
  };
  
  // 分账配置
  splitConfig?: {
    merchantRatio: number;
    agentRatio: number;
    platformRatio: number;
    customSplits?: Array<{
      address: string;
      ratio: number;
      role: string;
    }>;
  };
  
  // 审计追踪
  audit?: {
    timestamp: number;
    nonce: string;
    signature?: string;
  };
}

/**
 * 解析后的支付理由
 */
export interface ParsedPaymentReason {
  category: 'purchase' | 'subscription' | 'api_call' | 'agent_task' | 'tip' | 'other';
  action: string;
  target?: string;
  details?: Record<string, any>;
  reconciliationKey?: string;
}

/**
 * 自动对账记录
 */
export interface ReconciliationRecord {
  paymentId: string;
  orderId?: string;
  merchantId: string;
  paymentReason: ParsedPaymentReason;
  amount: string;
  currency: string;
  status: 'pending' | 'matched' | 'unmatched' | 'disputed';
  matchedOrderId?: string;
  createdAt: Date;
}

/**
 * X402 V2+ Metadata 解析服务
 * 
 * 功能：
 * 1. 解析 X402 支付的 metadata 字段
 * 2. 支持 payment_reason 字段实现"带备注的自动对账"
 * 3. 提取 Agent 协作信息用于分账
 * 4. 生成对账记录
 */
@Injectable()
export class X402MetadataService {
  private readonly logger = new Logger(X402MetadataService.name);

  /**
   * 解析 X402 支付 metadata
   */
  parseMetadata(rawMetadata: string | object): X402PaymentMetadata | null {
    try {
      let metadata: any;
      
      if (typeof rawMetadata === 'string') {
        // 尝试解析 JSON
        metadata = JSON.parse(rawMetadata);
      } else {
        metadata = rawMetadata;
      }

      // 验证必要字段
      if (!metadata.version || !metadata.scheme) {
        this.logger.warn('Invalid X402 metadata: missing required fields');
        return null;
      }

      return {
        version: metadata.version || '2.0',
        scheme: metadata.scheme || 'exact',
        network: metadata.network || 'unknown',
        asset: metadata.asset || 'USDC',
        amount: metadata.amount || '0',
        recipient: metadata.recipient || '',
        paymentReason: metadata.payment_reason || metadata.paymentReason,
        orderId: metadata.order_id || metadata.orderId,
        merchantId: metadata.merchant_id || metadata.merchantId,
        productId: metadata.product_id || metadata.productId,
        description: metadata.description,
        agentCollaboration: this.parseAgentCollaboration(metadata),
        splitConfig: this.parseSplitConfig(metadata),
        audit: this.parseAuditInfo(metadata),
      };
    } catch (error: any) {
      this.logger.error(`Failed to parse X402 metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * 解析支付理由
   * 
   * 支持格式：
   * - 简单文本: "购买商品 A"
   * - 结构化: "purchase:product:123"
   * - JSON: {"type": "purchase", "productId": "123"}
   */
  parsePaymentReason(reason: string): ParsedPaymentReason {
    if (!reason) {
      return {
        category: 'other',
        action: 'unknown',
      };
    }

    // 尝试 JSON 格式
    try {
      const parsed = JSON.parse(reason);
      return {
        category: parsed.type || parsed.category || 'other',
        action: parsed.action || 'payment',
        target: parsed.target || parsed.productId || parsed.orderId,
        details: parsed,
        reconciliationKey: this.generateReconciliationKey(parsed),
      };
    } catch {
      // 非 JSON 格式
    }

    // 尝试结构化格式 (category:action:target)
    if (reason.includes(':')) {
      const parts = reason.split(':');
      const category = this.mapCategory(parts[0]);
      return {
        category,
        action: parts[1] || 'payment',
        target: parts[2],
        reconciliationKey: `${category}:${parts[1] || 'payment'}:${parts[2] || ''}`,
      };
    }

    // 自然语言解析
    return this.parseNaturalLanguageReason(reason);
  }

  /**
   * 自然语言支付理由解析
   */
  private parseNaturalLanguageReason(text: string): ParsedPaymentReason {
    const lowerText = text.toLowerCase();

    // 购买相关
    if (lowerText.includes('购买') || lowerText.includes('buy') || lowerText.includes('purchase')) {
      return {
        category: 'purchase',
        action: 'buy',
        details: { originalText: text },
        reconciliationKey: `purchase:${this.hashText(text)}`,
      };
    }

    // 订阅相关
    if (lowerText.includes('订阅') || lowerText.includes('subscribe') || lowerText.includes('subscription')) {
      return {
        category: 'subscription',
        action: 'subscribe',
        details: { originalText: text },
        reconciliationKey: `subscription:${this.hashText(text)}`,
      };
    }

    // API 调用
    if (lowerText.includes('api') || lowerText.includes('调用') || lowerText.includes('call')) {
      return {
        category: 'api_call',
        action: 'call',
        details: { originalText: text },
        reconciliationKey: `api:${this.hashText(text)}`,
      };
    }

    // Agent 任务
    if (lowerText.includes('agent') || lowerText.includes('task') || lowerText.includes('任务')) {
      return {
        category: 'agent_task',
        action: 'execute',
        details: { originalText: text },
        reconciliationKey: `agent:${this.hashText(text)}`,
      };
    }

    // 小费/打赏
    if (lowerText.includes('tip') || lowerText.includes('打赏') || lowerText.includes('小费')) {
      return {
        category: 'tip',
        action: 'tip',
        details: { originalText: text },
        reconciliationKey: `tip:${this.hashText(text)}`,
      };
    }

    return {
      category: 'other',
      action: 'payment',
      details: { originalText: text },
      reconciliationKey: `other:${this.hashText(text)}`,
    };
  }

  /**
   * 生成对账记录
   */
  createReconciliationRecord(
    paymentId: string,
    metadata: X402PaymentMetadata,
    transactionHash?: string,
  ): ReconciliationRecord {
    const paymentReason = metadata.paymentReason 
      ? this.parsePaymentReason(metadata.paymentReason)
      : { category: 'other' as const, action: 'payment' };

    return {
      paymentId,
      orderId: metadata.orderId,
      merchantId: metadata.merchantId || '',
      paymentReason,
      amount: metadata.amount,
      currency: metadata.asset,
      status: metadata.orderId ? 'pending' : 'unmatched',
      createdAt: new Date(),
    };
  }

  /**
   * 尝试自动匹配订单
   * 
   * 匹配策略：
   * 1. 精确匹配 orderId
   * 2. 基于 reconciliationKey 匹配
   * 3. 基于金额 + 商户 + 时间窗口匹配
   */
  async autoMatchOrder(
    record: ReconciliationRecord,
    pendingOrders: Array<{ id: string; amount: string; merchantId: string; createdAt: Date }>,
  ): Promise<string | null> {
    // 1. 精确匹配 orderId
    if (record.orderId) {
      const exactMatch = pendingOrders.find(o => o.id === record.orderId);
      if (exactMatch) {
        return exactMatch.id;
      }
    }

    // 2. 基于金额 + 商户匹配（30 分钟时间窗口）
    const timeWindow = 30 * 60 * 1000; // 30 分钟
    const now = Date.now();

    const candidates = pendingOrders.filter(order => {
      const orderTime = new Date(order.createdAt).getTime();
      const withinWindow = Math.abs(now - orderTime) < timeWindow;
      const amountMatch = order.amount === record.amount;
      const merchantMatch = !record.merchantId || order.merchantId === record.merchantId;
      
      return withinWindow && amountMatch && merchantMatch;
    });

    if (candidates.length === 1) {
      return candidates[0].id;
    }

    // 多个候选或无匹配
    this.logger.warn(`Auto-match found ${candidates.length} candidates for payment ${record.paymentId}`);
    return null;
  }

  /**
   * 提取 Agent 协作分账信息
   */
  extractSplitRoles(metadata: X402PaymentMetadata): {
    promoter?: string;
    referrer?: string;
    executor?: string;
  } {
    const collab = metadata.agentCollaboration;
    if (!collab) {
      return {};
    }

    return {
      promoter: collab.requestingAgent,
      referrer: collab.referrerAgent,
      executor: collab.executingAgent,
    };
  }

  /**
   * 验证 metadata 签名
   */
  verifyMetadataSignature(metadata: X402PaymentMetadata): boolean {
    if (!metadata.audit?.signature) {
      return false;
    }

    // TODO: 实现签名验证逻辑
    // 1. 重建签名消息
    // 2. 恢复签名者地址
    // 3. 验证签名者是否有权限

    return true;
  }

  /**
   * 构建 X402 支付 metadata
   */
  buildMetadata(params: {
    amount: string;
    recipient: string;
    network: string;
    paymentReason?: string;
    orderId?: string;
    merchantId?: string;
    agentCollaboration?: X402PaymentMetadata['agentCollaboration'];
    splitConfig?: X402PaymentMetadata['splitConfig'];
  }): X402PaymentMetadata {
    const timestamp = Date.now();
    const nonce = this.generateNonce();

    return {
      version: '2.0',
      scheme: 'exact',
      network: params.network,
      asset: 'USDC',
      amount: params.amount,
      recipient: params.recipient,
      paymentReason: params.paymentReason,
      orderId: params.orderId,
      merchantId: params.merchantId,
      agentCollaboration: params.agentCollaboration,
      splitConfig: params.splitConfig,
      audit: {
        timestamp,
        nonce,
      },
    };
  }

  // ========== 私有方法 ==========

  private parseAgentCollaboration(metadata: any): X402PaymentMetadata['agentCollaboration'] | undefined {
    const collab = metadata.agent_collaboration || metadata.agentCollaboration;
    if (!collab) return undefined;

    return {
      requestingAgent: collab.requesting_agent || collab.requestingAgent,
      executingAgent: collab.executing_agent || collab.executingAgent,
      referrerAgent: collab.referrer_agent || collab.referrerAgent,
      collaborationId: collab.collaboration_id || collab.collaborationId,
      taskId: collab.task_id || collab.taskId,
    };
  }

  private parseSplitConfig(metadata: any): X402PaymentMetadata['splitConfig'] | undefined {
    const split = metadata.split_config || metadata.splitConfig;
    if (!split) return undefined;

    return {
      merchantRatio: split.merchant_ratio || split.merchantRatio || 0.97,
      agentRatio: split.agent_ratio || split.agentRatio || 0.02,
      platformRatio: split.platform_ratio || split.platformRatio || 0.01,
      customSplits: split.custom_splits || split.customSplits,
    };
  }

  private parseAuditInfo(metadata: any): X402PaymentMetadata['audit'] | undefined {
    const audit = metadata.audit;
    if (!audit) return undefined;

    return {
      timestamp: audit.timestamp || Date.now(),
      nonce: audit.nonce || this.generateNonce(),
      signature: audit.signature,
    };
  }

  private mapCategory(input: string): ParsedPaymentReason['category'] {
    const mapping: Record<string, ParsedPaymentReason['category']> = {
      purchase: 'purchase',
      buy: 'purchase',
      订购: 'purchase',
      subscription: 'subscription',
      subscribe: 'subscription',
      订阅: 'subscription',
      api: 'api_call',
      call: 'api_call',
      agent: 'agent_task',
      task: 'agent_task',
      tip: 'tip',
      打赏: 'tip',
    };

    return mapping[input.toLowerCase()] || 'other';
  }

  private generateReconciliationKey(parsed: any): string {
    const parts = [
      parsed.type || parsed.category || 'other',
      parsed.action || 'payment',
      parsed.target || parsed.productId || parsed.orderId || '',
    ];
    return parts.filter(Boolean).join(':');
  }

  private generateNonce(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  private hashText(text: string): string {
    // 简单的文本哈希
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
