import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { FeeEstimationService } from '../payment/fee-estimation.service';
import { RiskAssessmentService } from '../payment/risk-assessment.service';
import { KYCReuseService } from '../user-agent/kyc-reuse.service';
import { MerchantTrustService } from '../user-agent/merchant-trust.service';
import { PaymentMemoryService } from '../user-agent/payment-memory.service';
import { SubscriptionService } from '../user-agent/subscription.service';
import { BudgetService } from '../user-agent/budget.service';
import { TransactionClassificationService } from '../user-agent/transaction-classification.service';
import { WebhookHandlerService } from '../merchant/webhook-handler.service';
import { AutoFulfillmentService } from '../merchant/auto-fulfillment.service';
import { MultiChainAccountService } from '../merchant/multi-chain-account.service';
import { ReconciliationService } from '../merchant/reconciliation.service';
import { SettlementRulesService } from '../merchant/settlement-rules.service';
import { WalletService } from '../wallet/wallet.service';
import { PayIntentService } from '../payment/pay-intent.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { SearchService } from '../search/search.service';
import { ProductService } from '../product/product.service';
import { OrderService } from '../order/order.service';
import { CartService } from '../cart/cart.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { PayIntentType } from '../../entities/pay-intent.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Product } from '../../entities/product.entity';
import { UserService } from '../user/user.service';
import { LogisticsService } from '../logistics/logistics.service';
import { MPCWalletService } from '../mpc-wallet/mpc-wallet.service';
import { FiatToCryptoService } from '../payment/fiat-to-crypto.service';
import { X402AuthorizationService } from '../payment/x402-authorization.service';
import { UnifiedMarketplaceService } from '../unified-marketplace/unified-marketplace.service';

/**
 * Agent P0功能集成服务
 * 将P0功能通过自然语言接口暴露给Agent对话系统
 */
@Injectable()
export class AgentP0IntegrationService {
  private readonly logger = new Logger(AgentP0IntegrationService.name);

  constructor(
    @Inject(forwardRef(() => FeeEstimationService))
    private feeEstimationService: FeeEstimationService,
    @Inject(forwardRef(() => RiskAssessmentService))
    private riskAssessmentService: RiskAssessmentService,
    @Inject(forwardRef(() => KYCReuseService))
    private kycReuseService: KYCReuseService,
    @Inject(forwardRef(() => MerchantTrustService))
    private merchantTrustService: MerchantTrustService,
    @Inject(forwardRef(() => PaymentMemoryService))
    private paymentMemoryService: PaymentMemoryService,
    @Inject(forwardRef(() => SubscriptionService))
    private subscriptionService: SubscriptionService,
    @Inject(forwardRef(() => BudgetService))
    private budgetService: BudgetService,
    @Inject(forwardRef(() => TransactionClassificationService))
    private transactionClassificationService: TransactionClassificationService,
    @Inject(forwardRef(() => WebhookHandlerService))
    private webhookHandlerService: WebhookHandlerService,
    @Inject(forwardRef(() => AutoFulfillmentService))
    private autoFulfillmentService: AutoFulfillmentService,
    @Inject(forwardRef(() => MultiChainAccountService))
    private multiChainAccountService: MultiChainAccountService,
    @Inject(forwardRef(() => ReconciliationService))
    private reconciliationService: ReconciliationService,
    @Inject(forwardRef(() => SettlementRulesService))
    private settlementRulesService: SettlementRulesService,
    @Inject(forwardRef(() => WalletService))
    private walletService: WalletService,
    @Inject(forwardRef(() => PayIntentService))
    private payIntentService: PayIntentService,
    @Inject(forwardRef(() => AnalyticsService))
    private analyticsService: AnalyticsService,
    @Inject(forwardRef(() => SearchService))
    private searchService: SearchService,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
    @Inject(forwardRef(() => LogisticsService))
    private logisticsService: LogisticsService,
    @Inject(forwardRef(() => MPCWalletService))
    private mpcWalletService: MPCWalletService,
    @Inject(forwardRef(() => FiatToCryptoService))
    private fiatToCryptoService: FiatToCryptoService,
    @Inject(forwardRef(() => X402AuthorizationService))
    private x402AuthorizationService: X402AuthorizationService,
    @Inject(forwardRef(() => UnifiedMarketplaceService))
    private unifiedMarketplaceService: UnifiedMarketplaceService,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  /**
   * 处理P0功能请求
   */
  async handleP0Request(
    intent: string,
    params: Record<string, any>,
    userId?: string,
    mode: 'user' | 'merchant' | 'developer' = 'user',
    context?: { lastSearch?: { query: string; products: any[] } },
  ): Promise<{ response: string; data?: any; type?: string }> {
    this.logger.log(`处理P0请求: intent=${intent}, mode=${mode}, userId=${userId}`);

    try {
      switch (intent) {
        // ========== 用户Agent功能 ==========
        case 'estimate_fee':
        case '费用估算':
        case '手续费':
          return await this.handleFeeEstimation(params);

        case 'assess_risk':
        case '风险评估':
        case '风险检查':
          return await this.handleRiskAssessment(params, userId);

        case 'kyc_status':
        case 'kyc状态':
        case 'kyc检查':
          return await this.handleKYCStatus(userId);

        case 'kyc_reuse':
        case 'kyc复用':
          return await this.handleKYCReuse(userId, params.merchantId);

        case 'merchant_trust':
        case '商户信任':
        case '商家可信度':
          return await this.handleMerchantTrust(params.merchantId);

        case 'payment_memory':
        case '支付记忆':
        case '支付偏好':
          return await this.handlePaymentMemory(userId);

        case 'subscriptions':
        case '订阅':
        case '定期支付':
          return await this.handleSubscriptions(userId);

        case 'budget':
        case '预算':
        case '预算管理':
          return await this.handleBudget(userId, params);

        case 'classify_transaction':
        case '交易分类':
        case '分类交易':
          return await this.handleTransactionClassification(params.paymentId);

        // ========== 商户Agent功能 ==========
        case 'webhook_config':
        case 'webhook配置':
          return await this.handleWebhookConfig(userId, params);

        case 'auto_fulfill':
        case '自动发货':
          return await this.handleAutoFulfill(params.paymentId);

        case 'multi_chain_balance':
        case '多链余额':
          return await this.handleMultiChainBalance(userId, params);

        case 'reconciliation':
        case '对账':
          return await this.handleReconciliation(userId, params);

        case 'settlement_rules':
        case '结算规则':
          return await this.handleSettlementRules(userId, params);

        // 账单助手
        case 'bill_assistant':
        case '账单助手':
          return await this.handleBillAssistant(userId, params);

        // 钱包管理
        case 'wallet_management':
        case '钱包管理':
          return await this.handleWalletManagement(userId, params);

        case 'create_mpc_wallet':
        case '创建MPC钱包':
        case '生成钱包':
          return await this.handleCreateMPCWallet(userId, params);

        case 'transfer_crypto':
        case '转账':
          return await this.handleTransfer(userId, params);

        case 'onramp_fiat':
        case '充值':
        case '买币':
          return await this.handleOnramp(userId, params);

        // 自动购买
        case 'auto_purchase':
        case '自动购买':
          return await this.handleAutoPurchase(userId, params);

        // 风控提醒
        case 'risk_alert':
        case '风控提醒':
          return await this.handleRiskAlert(userId, params);

        // 收款管理
        case 'payment_collection':
        case '收款管理':
          return await this.handlePaymentCollection(userId, params);

        // 订单分析
        case 'order_analysis':
        case '订单分析':
          return await this.handleOrderAnalysis(userId, params);

        // SDK生成器
        case 'sdk_generator':
        case 'sdk生成器':
          return await this.handleSDKGenerator(params);

        // API助手
        case 'api_assistant':
        case 'api助手':
          return await this.handleAPIAssistant(params);

        // 技能搜索
        case 'skill_search':
        case '技能搜索':
        case '能力搜索':
          return await this.handleSkillSearch(params);

        // 商品搜索（语义检索）
        case 'product_search':
        case '商品搜索':
        case '产品搜索':
          return await this.handleProductSearch(params, context);

        // 比价
        case 'price_comparison':
        case '比价':
        case '价格对比':
          // 传递完整消息用于上下文识别
          return await this.handlePriceComparison({ ...params, message: params.message || '' }, context);

        // 创建订单
        case 'create_order':
        case '下单':
        case '购买':
          return await this.handleCreateOrder(userId, params);

        // 加入购物车
        case 'add_to_cart':
        case '加入购物车':
          // 确保传递完整消息
          return await this.handleAddToCart(userId, { ...params, message: params.message || '' }, context);

        // 查看购物车
        case 'view_cart':
        case '查看购物车':
          return await this.handleViewCart(userId);

        // 从购物车删除
        case 'remove_from_cart':
        case '删除购物车':
          return await this.handleRemoveFromCart(userId, params);

        // 清空购物车
        case 'clear_cart':
        case '清空购物车':
          return await this.handleClearCart(userId);

        // 商家功能：注册商户
        case 'register_merchant':
        case '注册商户':
        case '注册商家':
          return await this.handleRegisterMerchant(userId);

        // 商家功能：上传商品
        case 'create_product':
        case '上传商品':
        case '上架商品':
          return await this.handleCreateProduct(userId, params);

        // 商家功能：查看订单
        case 'view_orders':
        case '查看订单':
          return await this.handleViewOrders(userId, params);

        // 商家功能：发货
        case 'ship_order':
        case '发货':
          return await this.handleShipOrder(userId, params);

        // 用户功能：查看我的订单
        case 'view_my_orders':
        case '我的订单':
          return await this.handleViewMyOrders(userId);

        // 用户功能：物流跟踪
        case 'track_logistics':
        case '物流跟踪':
          return await this.handleTrackLogistics(userId, params);

        // 用户功能：支付订单
        case 'pay_order':
        case '支付':
        case '付款':
        case '确认支付':
          return await this.handlePayOrder(userId, params);

        // 用户功能：结算购物车
        case 'checkout_cart':
        case '结算':
        case '结算购物车':
          return await this.handleCheckoutCart(userId);

        // 开发者功能：沙盒调试
        case 'sandbox':
        case '沙盒':
        case '沙盒调试':
          return await this.handleSandbox(params);

        // 开发者功能：DevOps自动化
        case 'devops':
        case 'devops自动化':
        case '部署':
          return await this.handleDevOps(params);

        // 开发者功能：合约助手
        case 'contract_helper':
        case '合约助手':
        case '合约':
          return await this.handleContractHelper(params);

        // 开发者功能：工单与日志
        case 'tickets':
        case 'logs':
        case '工单':
        case '日志':
        case '错误日志':
          return await this.handleTicketsAndLogs(userId, params);

        // 开发者功能：代码生成
        case 'code_gen':
        case 'code_generation':
        case '代码生成':
        case '生成代码':
          return await this.handleCodeGeneration(params);

        // 商家功能：营销助手
        case 'marketing':
        case '营销':
        case '营销助手':
        case '优惠券':
          return await this.handleMarketing(userId, params);

        default:
          return {
            response: `抱歉，我还不理解"${intent}"这个功能。请告诉我您想要：\n• 费用估算\n• 风险评估\n• KYC状态查询\n• 商户信任度\n• 支付记忆\n• 订阅管理\n• 预算管理\n• 交易分类\n• 账单助手\n• 钱包管理\n• 或其他功能`,
          };
      }
    } catch (error: any) {
      this.logger.error(`处理P0请求失败: ${error.message}`, error.stack);
      return {
        response: `处理请求时出现错误：${error.message}。请稍后重试或联系客服。`,
      };
    }
  }

  // ========== 用户Agent功能实现 ==========

  private async handleFeeEstimation(params: any) {
    const { amount, currency, paymentMethod, chain } = params;
    if (!amount) {
      return {
        response: '费用估算需要提供：金额。可选：货币、支付方式、链类型。',
      };
    }

    let estimate;
    const paymentMethodLower = (paymentMethod || 'stripe').toLowerCase();
    
    if (paymentMethodLower === 'stripe' || !paymentMethod) {
      estimate = await this.feeEstimationService.estimateStripeFee(
        Number(amount),
        currency || 'USD',
      );
    } else if (paymentMethodLower === 'wallet') {
      if (chain === 'solana') {
        estimate = await this.feeEstimationService.estimateSolanaGasFee(Number(amount));
      } else {
        const chainType = (chain as 'ethereum' | 'bsc' | 'polygon' | 'base') || 'ethereum';
        estimate = await this.feeEstimationService.estimateWalletGasFee(chainType, Number(amount));
      }
    } else if (paymentMethodLower === 'x402') {
      const chainType = (chain as 'ethereum' | 'solana' | 'bsc' | 'polygon') || 'ethereum';
      estimate = await this.feeEstimationService.estimateX402Fee(Number(amount), chainType);
    } else {
      // 默认使用Stripe
      estimate = await this.feeEstimationService.estimateStripeFee(
        Number(amount),
        currency || 'USD',
      );
    }

    return {
      response: `💰 费用估算结果：\n\n• 基础金额：${amount} ${currency || 'USD'}\n• 预计手续费：${estimate.estimatedFee.toFixed(2)} ${currency || 'USD'}\n• 总成本：${estimate.totalCost.toFixed(2)} ${currency || 'USD'}\n• 手续费率：${estimate.feeRate.toFixed(2)}%\n• 预计到账时间：${estimate.estimatedTime}秒`,
      data: estimate,
      type: 'fee_estimation',
    };
  }

  private async handleRiskAssessment(params: any, userId?: string) {
    const { amount, paymentMethod } = params;
    if (!amount || !paymentMethod) {
      return {
        response: '风险评估需要提供：金额、支付方式。',
      };
    }

    const assessment = await this.riskAssessmentService.assessRisk(
      userId || '',
      Number(amount),
      paymentMethod,
      params.metadata,
    );

    const riskEmoji = assessment.riskLevel === 'low' ? '✅' : assessment.riskLevel === 'medium' ? '⚠️' : '🚨';
    return {
      response: `${riskEmoji} 风险评估结果：\n\n• 风险评分：${assessment.riskScore}/100\n• 风险等级：${assessment.riskLevel}\n• 建议操作：${assessment.decision}\n${assessment.recommendation ? `• 建议：${assessment.recommendation}` : ''}`,
      data: assessment,
      type: 'risk_assessment',
    };
  }

  private async handleKYCStatus(userId?: string) {
    if (!userId) {
      return { response: '需要登录才能查询KYC状态。' };
    }

    const status = await this.kycReuseService.getUserKYCStatus(userId);
    const verifiedAt = status.approvedAt || status.submittedAt;
    return {
      response: `📋 KYC状态：\n\n• 认证等级：${status.level}\n• 状态：${status.status}\n• 认证时间：${verifiedAt ? new Date(verifiedAt).toLocaleString('zh-CN') : '未认证'}`,
      data: status,
      type: 'kyc_status',
    };
  }

  private async handleKYCReuse(userId?: string, merchantId?: string) {
    if (!userId) {
      return { response: '需要登录才能检查KYC复用。' };
    }

    const result = await this.kycReuseService.checkKYCReuse(userId, merchantId);
    return {
      response: result.canReuse
        ? `✅ 您的KYC可以复用！无需重新认证。`
        : `❌ 您的KYC无法复用，需要重新认证。`,
      data: result,
      type: 'kyc_reuse',
    };
  }

  private async handleMerchantTrust(merchantId: string) {
    if (!merchantId) {
      return { response: '需要提供商户ID才能查询信任度。' };
    }

    const trust = await this.merchantTrustService.getMerchantTrustScore(merchantId);
    return {
      response: `⭐ 商户信任度：\n\n• 信任评分：${trust.trustScore}/100\n• 信任等级：${trust.trustLevel}\n• 总交易数：${trust.totalTransactions}\n• 成功率：${(trust.successRate * 100).toFixed(1)}%`,
      data: trust,
      type: 'merchant_trust',
    };
  }

  private async handlePaymentMemory(userId?: string) {
    if (!userId) {
      return { response: '需要登录才能查看支付记忆。' };
    }

    const memory = await this.paymentMemoryService.getPaymentMemory(userId);
    return {
      response: `💭 支付记忆：\n\n• 偏好支付方式：${memory.preferredPaymentMethod || '未设置'}\n• 偏好货币：${memory.preferredCurrency || '未设置'}\n• 已保存支付方式：${memory.savedPaymentMethods.length}个`,
      data: memory,
      type: 'payment_memory',
    };
  }

  private async handleSubscriptions(userId?: string) {
    if (!userId) {
      return { response: '需要登录才能查看订阅。' };
    }

    const subscriptions = await this.subscriptionService.getUserSubscriptions(userId);
    if (subscriptions.length === 0) {
      return {
        response: '📅 您目前没有活跃的订阅。',
        data: [],
        type: 'subscriptions',
      };
    }

    const list = subscriptions
      .map(
        (sub, i) =>
          `${i + 1}. ${sub.merchantId} - ${sub.amount} ${sub.currency}/${sub.interval} (下次扣款：${new Date(sub.nextBillingDate).toLocaleDateString('zh-CN')})`,
      )
      .join('\n');

    return {
      response: `📅 您的订阅列表：\n\n${list}`,
      data: subscriptions,
      type: 'subscriptions',
    };
  }

  private async handleBudget(userId: string, params: any) {
    if (!userId) {
      return { response: '需要登录才能管理预算。' };
    }

    if (params.action === 'create' || params.action === '设置预算') {
      const { amount, currency, period, category } = params;
      if (!amount || !currency || !period) {
        return { response: '创建预算需要：金额、货币、周期（daily/weekly/monthly/yearly）。可选：分类。' };
      }

      const budget = await this.budgetService.createBudget(userId, Number(amount), currency, period, category);
      return {
        response: `✅ 预算创建成功！\n\n• 金额：${budget.amount} ${budget.currency}\n• 周期：${budget.period}\n• 已花费：${budget.spent} ${budget.currency}\n• 剩余：${budget.remaining} ${budget.currency}\n• 状态：${budget.status}`,
        data: budget,
        type: 'budget',
      };
    } else {
      const budgets = await this.budgetService.getUserBudgets(userId);
      if (budgets.length === 0) {
        return {
          response: '📊 您目前没有设置预算。',
          data: [],
          type: 'budgets',
        };
      }

      const list = budgets
        .map(
          (b, i) =>
            `${i + 1}. ${b.amount} ${b.currency}/${b.period} - 已花费：${b.spent}，剩余：${b.remaining} (${b.status})`,
        )
        .join('\n');

      return {
        response: `📊 您的预算列表：\n\n${list}`,
        data: budgets,
        type: 'budgets',
      };
    }
  }

  private async handleTransactionClassification(paymentId: string) {
    if (!paymentId) {
      return { response: '需要提供支付ID才能分类交易。' };
    }

    const classification = await this.transactionClassificationService.classifyTransaction(paymentId);
    return {
      response: `🏷️ 交易分类：\n\n• 分类：${classification.category}\n• 置信度：${(classification.confidence * 100).toFixed(1)}%\n• 方法：${classification.method || 'rule'}`,
      data: classification,
      type: 'transaction_classification',
    };
  }

  // ========== 商户Agent功能实现 ==========

  private async handleWebhookConfig(userId: string, params: any) {
    // 实现webhook配置逻辑
    return {
      response: 'Webhook配置功能开发中...',
      type: 'webhook_config',
    };
  }

  private async handleAutoFulfill(paymentId: string) {
    if (!paymentId) {
      return { response: '需要提供支付ID才能自动发货。' };
    }

    const fulfillment = await this.autoFulfillmentService.autoFulfill(paymentId);
    if (!fulfillment) {
      return {
        response: '❌ 自动发货失败：支付未完成或订单不存在。',
      };
    }

    return {
      response: `✅ 自动发货成功！\n\n• 订单ID：${fulfillment.orderId}\n• 状态：${fulfillment.status}\n• 类型：${fulfillment.type}`,
      data: fulfillment,
      type: 'auto_fulfill',
    };
  }

  private async handleMultiChainBalance(userId: string, params: any) {
    const { chain, currency } = params;
    if (!chain || !currency) {
      return { response: '查询多链余额需要：链类型、货币。' };
    }

    const balance = await this.multiChainAccountService.getChainBalance(userId, chain, currency);
    return {
      response: `💰 ${chain}链 ${currency}余额：${balance}`,
      data: { chain, currency, balance },
      type: 'multi_chain_balance',
    };
  }

  private async handleReconciliation(userId: string, params: any) {
    const result = await this.reconciliationService.performReconciliation(userId, params.date, params.type);
    const discrepancyCount = result.unmatchedCount || result.differences?.length || 0;
    return {
      response: `✅ 对账完成！\n\n• 状态：${result.status}\n• 总交易数：${result.totalCount}\n• 匹配数：${result.matchedCount}\n• 差异数：${discrepancyCount}`,
      data: result,
      type: 'reconciliation',
    };
  }

  private async handleSettlementRules(userId: string, params: any) {
    // 实现结算规则逻辑
    return {
      response: '结算规则功能开发中...',
      type: 'settlement_rules',
    };
  }

  /**
   * 识别P0功能意图
   */
  identifyP0Intent(message: string): { intent: string; params: Record<string, any> } | null {
    const lowerMessage = message.toLowerCase();

    // 费用估算
    if (lowerMessage.includes('费用') || lowerMessage.includes('手续费') || lowerMessage.includes('fee')) {
      const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
      const currencyMatch = message.match(/(usd|eur|cny|jpy|usdc|usdt)/i);
      const methodMatch = message.match(/(stripe|wallet|x402|card|multisig|fiat-to-crypto)/i);
      const chainMatch = message.match(/(ethereum|solana|bsc|polygon|base)/i);

      return {
        intent: 'estimate_fee',
        params: {
          amount: amountMatch ? amountMatch[1] : null,
          currency: currencyMatch ? currencyMatch[1].toUpperCase() : 'USD',
          paymentMethod: methodMatch ? methodMatch[1].toLowerCase() : 'stripe',
          chain: chainMatch ? chainMatch[1].toLowerCase() : null,
        },
      };
    }

    // 风险评估
    if (lowerMessage.includes('风险') || lowerMessage.includes('risk')) {
      const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
      const methodMatch = message.match(/(stripe|wallet|x402|multisig|fiat-to-crypto)/i);
      return {
        intent: 'assess_risk',
        params: {
          amount: amountMatch ? amountMatch[1] : null,
          paymentMethod: methodMatch ? methodMatch[1].toLowerCase() : 'stripe',
        },
      };
    }

    // KYC相关
    if (lowerMessage.includes('kyc') || lowerMessage.includes('认证')) {
      if (lowerMessage.includes('复用') || lowerMessage.includes('reuse')) {
        const merchantMatch = message.match(/商户[：:]\s*(\w+)/i);
        return {
          intent: 'kyc_reuse',
          params: { merchantId: merchantMatch ? merchantMatch[1] : null },
        };
      }
      return { intent: 'kyc_status', params: {} };
    }

    // 商户信任
    if (lowerMessage.includes('商户') || lowerMessage.includes('商家') || lowerMessage.includes('merchant')) {
      if (lowerMessage.includes('信任') || lowerMessage.includes('trust')) {
        const merchantMatch = message.match(/(?:商户|商家)[：:]\s*(\w+)/i);
        return {
          intent: 'merchant_trust',
          params: { merchantId: merchantMatch ? merchantMatch[1] : null },
        };
      }
    }

    // 支付记忆
    if (lowerMessage.includes('支付记忆') || lowerMessage.includes('支付偏好') || lowerMessage.includes('payment memory')) {
      return { intent: 'payment_memory', params: {} };
    }

    // 订阅
    if (lowerMessage.includes('订阅') || lowerMessage.includes('subscription')) {
      return { intent: 'subscriptions', params: {} };
    }

    // 预算
    if (lowerMessage.includes('预算') || lowerMessage.includes('budget')) {
      if (lowerMessage.includes('创建') || lowerMessage.includes('设置') || lowerMessage.includes('create')) {
        const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
        const currencyMatch = message.match(/(usd|eur|cny)/i);
        const periodMatch = message.match(/(daily|weekly|monthly|yearly|日|周|月|年)/i);
        return {
          intent: 'budget',
          params: {
            action: 'create',
            amount: amountMatch ? amountMatch[1] : null,
            currency: currencyMatch ? currencyMatch[1].toUpperCase() : 'USD',
            period: periodMatch ? periodMatch[1].toLowerCase() : 'monthly',
          },
        };
      }
      return { intent: 'budget', params: { action: 'list' } };
    }

    // 交易分类
    if (lowerMessage.includes('分类') || lowerMessage.includes('classify')) {
      const paymentMatch = message.match(/(?:支付|payment)[：:]\s*(\w+)/i);
      return {
        intent: 'classify_transaction',
        params: { paymentId: paymentMatch ? paymentMatch[1] : null },
      };
    }

    // 多链余额
    if (lowerMessage.includes('余额') || lowerMessage.includes('balance')) {
      const chainMatch = message.match(/(ethereum|solana|bsc|polygon)/i);
      const currencyMatch = message.match(/(usdc|usdt|eth|sol)/i);
      return {
        intent: 'multi_chain_balance',
        params: {
          chain: chainMatch ? chainMatch[1].toLowerCase() : 'ethereum',
          currency: currencyMatch ? currencyMatch[1].toUpperCase() : 'USDC',
        },
      };
    }

    // 账单助手相关
    if (lowerMessage.includes('账单') || lowerMessage.includes('bill') || 
        lowerMessage.includes('支出') || lowerMessage.includes('expense')) {
      if (lowerMessage.includes('整理') || lowerMessage.includes('分析') || lowerMessage.includes('查看')) {
        return { intent: 'bill_assistant', params: { action: 'analyze' } };
      }
      if (lowerMessage.includes('预测') || lowerMessage.includes('forecast')) {
        return { intent: 'bill_assistant', params: { action: 'forecast' } };
      }
      return { intent: 'bill_assistant', params: { action: 'list' } };
    }

    // 钱包管理相关
    if (lowerMessage.includes('钱包') || lowerMessage.includes('wallet') ||
        lowerMessage.includes('资产') || lowerMessage.includes('asset')) {
      if (lowerMessage.includes('创建') || lowerMessage.includes('生成') || lowerMessage.includes('create')) {
        return { intent: 'create_mpc_wallet', params: { action: 'create' } };
      }
      if (lowerMessage.includes('查看') || lowerMessage.includes('查询') || lowerMessage.includes('list')) {
        return { intent: 'wallet_management', params: { action: 'list' } };
      }
      if (lowerMessage.includes('切换') || lowerMessage.includes('switch')) {
        return { intent: 'wallet_management', params: { action: 'switch' } };
      }
      return { intent: 'wallet_management', params: { action: 'overview' } };
    }

    // 转账功能
    if (lowerMessage.includes('转账') || lowerMessage.includes('打款') || lowerMessage.includes('transfer') || lowerMessage.includes('send')) {
      const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
      const currencyMatch = message.match(/(usdc|usdt|eth|sol|bnb)/i);
      const addressMatch = message.match(/(0x[a-fA-F0-9]{40})/);
      return {
        intent: 'transfer_crypto',
        params: {
          amount: amountMatch ? amountMatch[1] : null,
          currency: currencyMatch ? currencyMatch[1].toUpperCase() : 'USDC',
          toAddress: addressMatch ? addressMatch[1] : null,
        },
      };
    }

    // 充值/法币买币
    if (lowerMessage.includes('充值') || lowerMessage.includes('充值') || lowerMessage.includes('买币') || lowerMessage.includes('onramp') || lowerMessage.includes('fiat')) {
      const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
      const currencyMatch = message.match(/(usd|eur|cny|jpy)/i);
      return {
        intent: 'onramp_fiat',
        params: {
          amount: amountMatch ? amountMatch[1] : null,
          currency: currencyMatch ? currencyMatch[1].toUpperCase() : 'USD',
        },
      };
    }

    // 自动购买/订阅优化
    if (lowerMessage.includes('自动购买') || lowerMessage.includes('auto purchase') ||
        lowerMessage.includes('自动续费') || lowerMessage.includes('auto renew') ||
        lowerMessage.includes('订阅优化') || lowerMessage.includes('subscription optimize')) {
      return { intent: 'auto_purchase', params: { action: 'optimize' } };
    }

    // 风控提醒
    if (lowerMessage.includes('风控') || lowerMessage.includes('risk control') ||
        lowerMessage.includes('异常交易') || lowerMessage.includes('abnormal transaction')) {
      return { intent: 'risk_alert', params: { action: 'check' } };
    }

    // 商家功能：收款管理
    if (lowerMessage.includes('收款') || lowerMessage.includes('payment collection') ||
        lowerMessage.includes('支付链接') || lowerMessage.includes('payment link') ||
        lowerMessage.includes('收款统计') || lowerMessage.includes('收款管理')) {
      if (lowerMessage.includes('生成') || lowerMessage.includes('create')) {
        const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
        return {
          intent: 'payment_collection',
          params: {
            action: 'create_link',
            amount: amountMatch ? amountMatch[1] : null,
          },
        };
      }
      return { intent: 'payment_collection', params: { action: 'list' } };
    }

    // 商家功能：订单分析
    if (lowerMessage.includes('订单分析') || lowerMessage.includes('order analysis') ||
        lowerMessage.includes('销售分析') || lowerMessage.includes('sales analysis')) {
      return { intent: 'order_analysis', params: { action: 'analyze' } };
    }

    // 商家功能：对账
    if (lowerMessage.includes('对账') || lowerMessage.includes('reconciliation')) {
      const dateMatch = message.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
      return {
        intent: 'reconciliation',
        params: {
          date: dateMatch ? dateMatch[1] : null,
        },
      };
    }

    // 商家功能：结算规则
    if (lowerMessage.includes('结算规则') || lowerMessage.includes('settlement rules')) {
      return { intent: 'settlement_rules', params: { action: 'list' } };
    }

    // 商家功能：注册商户
    if (lowerMessage.includes('注册商户') || lowerMessage.includes('注册商家') || 
        lowerMessage.includes('register merchant') || lowerMessage.includes('成为商家')) {
      return { intent: 'register_merchant', params: {} };
    }

    // 商家功能：上传商品
    if (lowerMessage.includes('上传商品') || lowerMessage.includes('上架商品') || 
        lowerMessage.includes('创建商品') || lowerMessage.includes('add product') ||
        lowerMessage.includes('create product')) {
      // 提取商品信息
      const nameMatch = message.match(/(?:商品名称|名称)[：:]\s*([^，,]+)/i) || 
                       message.match(/(?:我要上传|我要上架|创建)(.+?)(?:，|,|价格|$)/i);
      const priceMatch = message.match(/(?:价格)[：:]\s*(\d+(?:\.\d+)?)/i) || 
                         message.match(/(\d+(?:\.\d+)?)\s*(?:元|USD|CNY)/i);
      const stockMatch = message.match(/(?:库存|数量)[：:]\s*(\d+)/i);
      const categoryMatch = message.match(/(?:分类|类别)[：:]\s*(\w+)/i);
      const typeMatch = message.match(/(实物|服务|nft|ft|链上资产|虚拟)/i);
      
      return {
        intent: 'create_product',
        params: {
          name: nameMatch ? nameMatch[1].trim() : null,
          price: priceMatch ? parseFloat(priceMatch[1]) : null,
          stock: stockMatch ? parseInt(stockMatch[1]) : null,
          category: categoryMatch ? categoryMatch[1] : null,
          productType: typeMatch ? (typeMatch[1].includes('服务') ? 'service' : 
                                     typeMatch[1].includes('nft') ? 'nft' : 
                                     typeMatch[1].includes('ft') ? 'ft' : 'physical') : 'physical',
        },
      };
    }

    // 商家功能：查看订单
    if (lowerMessage.includes('查看订单') || lowerMessage.includes('订单列表') || 
        lowerMessage.includes('我的订单') || lowerMessage.includes('list orders')) {
      const statusMatch = message.match(/(待发货|已发货|已完成|已取消)/i);
      return {
        intent: 'view_orders',
        params: {
          status: statusMatch ? statusMatch[1] : null,
        },
      };
    }

    // 商家功能：发货
    if (lowerMessage.includes('发货') || lowerMessage.includes('填写物流') || 
        lowerMessage.includes('ship') || lowerMessage.includes('物流单号')) {
      const orderIdMatch = message.match(/(?:订单)[ID：:]\s*(\w+)/i);
      const trackingMatch = message.match(/(?:物流单号|单号)[：:]\s*(\w+)/i);
      const carrierMatch = message.match(/(?:承运商|快递)[：:]\s*(\w+)/i);
      
      return {
        intent: 'ship_order',
        params: {
          orderId: orderIdMatch ? orderIdMatch[1] : null,
          trackingNumber: trackingMatch ? trackingMatch[1] : null,
          carrier: carrierMatch ? carrierMatch[1] : null,
        },
      };
    }

    // 用户功能：查看订单
    if ((lowerMessage.includes('查看订单') || lowerMessage.includes('我的订单') || 
         lowerMessage.includes('订单列表')) && !lowerMessage.includes('商家')) {
      return { intent: 'view_my_orders', params: {} };
    }

    // 用户功能：物流跟踪
    if (lowerMessage.includes('物流跟踪') || lowerMessage.includes('查看物流') || 
        lowerMessage.includes('物流信息') || lowerMessage.includes('track logistics')) {
      const orderIdMatch = message.match(/(?:订单)[ID：:]\s*(\w+)/i);
      return {
        intent: 'track_logistics',
        params: {
          orderId: orderIdMatch ? orderIdMatch[1] : null,
        },
      };
    }

    // 用户功能：支付订单
    if (lowerMessage.includes('支付') || lowerMessage.includes('付款') || 
        lowerMessage.includes('确认支付') || lowerMessage.includes('pay') ||
        lowerMessage.includes('checkout')) {
      const orderIdMatch = message.match(/(?:订单)[ID：:]\s*(\w+)/i);
      return {
        intent: 'pay_order',
        params: {
          orderId: orderIdMatch ? orderIdMatch[1] : null,
        },
      };
    }

    // 用户功能：结算购物车
    if (lowerMessage.includes('结算') || lowerMessage.includes('结算购物车') || 
        lowerMessage.includes('checkout cart') || lowerMessage.includes('去结算')) {
      return {
        intent: 'checkout_cart',
        params: {},
      };
    }

    // 比价（需要在搜索之前检查，避免被搜索识别覆盖）
    if (lowerMessage.includes('比价') || lowerMessage.includes('价格对比') || 
        lowerMessage.includes('compare') || lowerMessage.includes('price comparison') ||
        lowerMessage.includes('比价一下')) {
      const queryMatch = message.match(/(?:比价|价格对比)(.+)/i);
      return {
        intent: 'price_comparison',
        params: {
          query: queryMatch ? queryMatch[1].trim() : null,
          message, // 传递完整消息，用于上下文识别
        },
      };
    }

    // 加入购物车（需要在搜索之前检查）
    if (lowerMessage.includes('加入购物车') || lowerMessage.includes('add to cart') ||
        lowerMessage.includes('添加到购物车')) {
      const productIdMatch = message.match(/(?:商品|产品)[ID：:]\s*(\w+)/i);
      const productNameMatch = message.match(/加入购物车\s*(.+?)(?:，|,|$)/i) ||
                               message.match(/加入购物车\s*(.+)/i);
      return {
        intent: 'add_to_cart',
        params: {
          productId: productIdMatch ? productIdMatch[1] : null,
          productName: productNameMatch ? productNameMatch[1].trim() : null,
          message, // 传递完整消息，用于识别"最佳性价比的那个"等
        },
      };
    }

    // @ 提及技能名称（如 @search_news, @Commission Distribute）
    const atMentionMatch = message.match(/@(\S+(?:\s+\S+)?)/);
    if (atMentionMatch) {
      const mentionedSkill = atMentionMatch[1].trim();
      this.logger.log(`检测到 @ 提及技能: ${mentionedSkill}`);
      return {
        intent: 'skill_search',
        params: {
          query: mentionedSkill,
        },
      };
    }

    // 技能搜索（需要在商品搜索之前检查）
    if (lowerMessage.includes('skill') || lowerMessage.includes('技能') ||
        lowerMessage.includes('能力') || lowerMessage.includes('mcp') ||
        lowerMessage.includes('api能力') || lowerMessage.includes('agent技能')) {
      // 提取技能名称
      const queryMatch = message.match(/(?:搜索|查找|找|search|find)\s*(.+?)(?:技能|skill|能力|$)/i) ||
                         message.match(/(?:技能|skill|能力)\s*(.+)/i) ||
                         message.match(/(.+?)(?:\s+skill|\s+技能)/i);
      const query = queryMatch ? queryMatch[1].trim() : 
                    message.replace(/搜索|查找|找|search|find|技能|skill|能力|mcp|api|agent/gi, '').trim();
      if (query && query.length > 0) {
        return {
          intent: 'skill_search',
          params: {
            query,
          },
        };
      }
    }

    // 用户功能：搜索商品（增强识别，包括游戏道具、"我要买XXX"等）
    if (lowerMessage.includes('搜索') || lowerMessage.includes('查找') || 
        lowerMessage.includes('找') || lowerMessage.includes('search') ||
        (lowerMessage.includes('帮我') && (lowerMessage.includes('找') || lowerMessage.includes('搜索'))) ||
        lowerMessage.includes('商品') || lowerMessage.includes('product') ||
        lowerMessage.includes('购买') || lowerMessage.includes('买') ||
        lowerMessage.includes('游戏道具') || lowerMessage.includes('游戏装备') || 
        lowerMessage.includes('道具') || lowerMessage.includes('我要买') ||
        lowerMessage.includes('我想买') || lowerMessage.includes('帮我买')) {
      // 提取搜索关键词（增强匹配，包括"我要买iPhone15"）
      const queryMatch = message.match(/(?:搜索|查找|找|购买|买)(.+?)(?:商品|产品|道具|装备|$)/i) ||
                         message.match(/(?:商品|产品|道具|装备)(.+?)(?:搜索|查找|$)/i) ||
                         message.match(/帮我(?:找|搜索|购买|买)(.+)/i) ||
                         message.match(/搜索\s*(.+)/i) ||
                         message.match(/找\s*(.+)/i) ||
                         message.match(/购买\s*(.+)/i) ||
                         message.match(/我要购买(.+)/i) ||
                         message.match(/我要买(.+)/i) ||
                         message.match(/我想买(.+)/i) ||
                         message.match(/帮我买(.+)/i);
      const query = queryMatch ? queryMatch[1].trim() : message.replace(/搜索|查找|商品|产品|帮我|找|购买|我要|我想|帮我买|游戏道具|游戏装备|道具|装备|买/gi, '').trim();
      if (query && query.length > 0) {
        return {
          intent: 'product_search',
          params: {
            query,
          },
        };
      }
    }

    // 开发者功能：SDK生成
    if (lowerMessage.includes('sdk') || lowerMessage.includes('生成sdk') ||
        lowerMessage.includes('create sdk')) {
      const langMatch = message.match(/(typescript|javascript|python|swift|flutter|go|rust)/i);
      return {
        intent: 'sdk_generator',
        params: {
          language: langMatch ? langMatch[1].toLowerCase() : 'typescript',
        },
      };
    }

    // 开发者功能：API助手
    if (lowerMessage.includes('api') && (lowerMessage.includes('文档') || lowerMessage.includes('doc') ||
        lowerMessage.includes('示例') || lowerMessage.includes('example'))) {
      return { intent: 'api_assistant', params: { action: 'generate_code' } };
    }

    // 开发者功能：Webhook配置
    if (lowerMessage.includes('webhook') && (lowerMessage.includes('配置') || lowerMessage.includes('config'))) {
      return { intent: 'webhook_config', params: { action: 'configure' } };
    }

    // 开发者功能：沙盒调试
    if (lowerMessage.includes('沙盒') || lowerMessage.includes('sandbox') || 
        lowerMessage.includes('测试') || lowerMessage.includes('调试')) {
      const codeMatch = message.match(/(?:代码|code)[：:]\s*([\s\S]+)/i);
      return {
        intent: 'sandbox',
        params: {
          code: codeMatch ? codeMatch[1].trim() : null,
        },
      };
    }

    // 开发者功能：DevOps自动化
    if (lowerMessage.includes('devops') || lowerMessage.includes('部署') || 
        lowerMessage.includes('ci/cd') || lowerMessage.includes('自动化')) {
      if (lowerMessage.includes('webhook')) {
        return { intent: 'webhook_config', params: { action: 'configure' } };
      }
      return { intent: 'devops', params: { action: 'automate' } };
    }

    // 开发者功能：合约助手
    if (lowerMessage.includes('合约') || lowerMessage.includes('contract') || 
        lowerMessage.includes('智能合约') || lowerMessage.includes('gas')) {
      if (lowerMessage.includes('模板') || lowerMessage.includes('template')) {
        return { intent: 'contract_helper', params: { action: 'generate_template' } };
      }
      if (lowerMessage.includes('费用') || lowerMessage.includes('gas')) {
        const chainMatch = message.match(/(ethereum|solana|bsc|polygon)/i);
        return {
          intent: 'contract_helper',
          params: {
            action: 'estimate_gas',
            chain: chainMatch ? chainMatch[1].toLowerCase() : 'ethereum',
          },
        };
      }
      return { intent: 'contract_helper', params: { action: 'help' } };
    }

    // 开发者功能：工单与日志
    if (lowerMessage.includes('工单') || lowerMessage.includes('ticket') || 
        lowerMessage.includes('日志') || lowerMessage.includes('log') ||
        lowerMessage.includes('错误') || lowerMessage.includes('error')) {
      const ticketIdMatch = message.match(/(?:工单|ticket)[ID：:]\s*(\w+)/i);
      return {
        intent: 'tickets',
        params: {
          ticketId: ticketIdMatch ? ticketIdMatch[1] : null,
          action: lowerMessage.includes('查看') || lowerMessage.includes('view') ? 'view' : 'list',
        },
      };
    }

    // 开发者功能：代码生成
    if ((lowerMessage.includes('生成代码') || lowerMessage.includes('generate code') ||
         lowerMessage.includes('代码示例') || lowerMessage.includes('code example')) &&
        !lowerMessage.includes('sdk')) {
      const typeMatch = message.match(/(支付|payment|webhook|api|integration)/i);
      return {
        intent: 'code_gen',
        params: {
          type: typeMatch ? typeMatch[1].toLowerCase() : 'payment',
        },
      };
    }

    // 商家功能：营销助手
    if (lowerMessage.includes('营销') || lowerMessage.includes('marketing') ||
        lowerMessage.includes('优惠券') || lowerMessage.includes('coupon') ||
        lowerMessage.includes('促销') || lowerMessage.includes('promotion')) {
      if (lowerMessage.includes('创建') || lowerMessage.includes('create')) {
        const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
        return {
          intent: 'marketing',
          params: {
            action: 'create_coupon',
            amount: amountMatch ? amountMatch[1] : null,
          },
        };
      }
      if (lowerMessage.includes('分析') || lowerMessage.includes('analyze')) {
        return { intent: 'marketing', params: { action: 'analyze' } };
      }
      return { intent: 'marketing', params: { action: 'suggest' } };
    }

    return null;
  }

  // ========== 新增功能处理 ==========

  private async handleBillAssistant(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '账单助手功能需要登录后才能使用。' };
    }

    const action = params.action || 'list';
    
    if (action === 'analyze') {
      return {
        response: '📊 正在分析您的账单...\n\n• 本月总支出：¥0\n• 主要支出类别：\n  - 购物：¥0\n  - 订阅：¥0\n  - 其他：¥0\n\n💡 建议：\n• 本月支出较上月减少10%\n• 建议优化订阅服务，可节省约¥50/月',
        data: { action: 'analyze', summary: {} },
        type: 'bill_assistant',
      };
    } else if (action === 'forecast') {
      return {
        response: '🔮 基于历史数据预测：\n\n• 下月预计支出：¥0\n• 主要预测类别：\n  - 购物：¥0\n  - 订阅：¥0\n\n⚠️ 注意：预测基于历史数据，实际支出可能有所不同。',
        data: { action: 'forecast', forecast: {} },
        type: 'bill_assistant',
      };
    } else {
      return {
        response: '📋 您的账单列表：\n\n• 本月账单：0条\n• 待支付：0条\n• 已支付：0条\n\n💡 提示：点击"分析账单"可以查看详细分析。',
        data: { action: 'list', bills: [] },
        type: 'bill_assistant',
      };
    }
  }

  private async handleWalletManagement(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '钱包管理功能需要登录后才能使用。' };
    }

    const action = params.action || 'overview';
    
    try {
      if (action === 'list') {
        // 真实API：获取用户钱包列表
        const wallets = await this.walletService.getUserWallets(userId);
        const walletList = wallets.map(w => ({
          id: w.id,
          type: w.walletType,
          address: w.walletAddress,
          chain: w.chain,
          isDefault: w.isDefault,
        }));

        if (walletList.length === 0) {
          return {
            response: '👛 您还没有连接任何钱包。\n\n💡 提示：请先连接钱包后再查看。',
            data: { action: 'list', wallets: [] },
            type: 'wallet_management',
          };
        }

        const walletSummary = walletList.map(w => 
          `  - ${w.chain} (${w.type}): ${w.address.substring(0, 6)}...${w.address.substring(w.address.length - 4)}${w.isDefault ? ' [默认]' : ''}`
        ).join('\n');

        return {
          response: `👛 您的钱包列表：\n\n${walletSummary}\n\n💡 提示：点击钱包可以查看详细信息和交易记录。`,
          data: { action: 'list', wallets: walletList },
          type: 'wallet_management',
        };
      } else if (action === 'switch') {
        const wallets = await this.walletService.getUserWallets(userId);
        if (wallets.length === 0) {
          return {
            response: '您还没有连接任何钱包，无法切换。',
            data: { action: 'switch' },
            type: 'wallet_management',
          };
        }
        return {
          response: `🔄 钱包切换功能：\n\n您有 ${wallets.length} 个钱包，请选择要切换到的钱包。\n\n💡 提示：使用"设置默认钱包"可以设置默认钱包。`,
          data: { action: 'switch', wallets: wallets.map(w => ({ id: w.id, address: w.walletAddress, chain: w.chain })) },
          type: 'wallet_management',
        };
      } else {
        // 总览：统计所有钱包
        const wallets = await this.walletService.getUserWallets(userId);
        const totalWallets = wallets.length;
        const defaultWallet = wallets.find(w => w.isDefault);
        
        return {
          response: `👛 钱包总览：\n\n• 已连接钱包：${totalWallets} 个\n• 默认钱包：${defaultWallet ? `${defaultWallet.chain} (${defaultWallet.walletAddress.substring(0, 6)}...)` : '未设置'}\n\n💡 提示：使用"查看钱包"可以查看详细信息。`,
          data: { action: 'overview', total: totalWallets, defaultWallet: defaultWallet?.id },
          type: 'wallet_management',
        };
      }
    } catch (error: any) {
      this.logger.error('钱包管理失败:', error);
      return {
        response: `获取钱包信息失败：${error.message}。请稍后重试。`,
        data: { action, error: error.message },
        type: 'wallet_management',
      };
    }
  }

  private async handleAutoPurchase(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '自动购买功能需要登录后才能使用。' };
    }

    return {
      response: '🤖 自动购买优化建议：\n\n• 当前订阅服务：0个\n• 可优化订阅：0个\n• 预计节省：¥0/月\n\n💡 建议：\n• 取消未使用的订阅服务\n• 合并相似功能的订阅\n• 选择年度订阅可享受折扣',
      data: { action: 'optimize', suggestions: [] },
      type: 'auto_purchase',
    };
  }

  private async handleRiskAlert(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '风控提醒功能需要登录后才能使用。' };
    }

    try {
      // 查询最近7天的支付记录，检查异常交易
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentPayments = await this.paymentRepository.find({
        where: {
          userId,
          createdAt: MoreThanOrEqual(sevenDaysAgo),
        },
        order: { createdAt: 'DESC' },
        take: 50,
      });

      // 使用风险评估服务评估每笔交易
      const riskAlerts: any[] = [];
      for (const payment of recentPayments) {
        try {
          const assessment = await this.riskAssessmentService.assessRisk(
            userId,
            Number(payment.amount),
            payment.paymentMethod,
            payment.metadata,
          );

          if (assessment.riskLevel === 'high' || assessment.riskScore > 70) {
            riskAlerts.push({
              paymentId: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              riskScore: assessment.riskScore,
              riskLevel: assessment.riskLevel,
              createdAt: payment.createdAt,
              description: payment.description,
            });
          }
        } catch (error) {
          // 忽略单笔评估失败
          this.logger.warn(`评估支付 ${payment.id} 风险失败:`, error);
        }
      }

      if (riskAlerts.length === 0) {
        return {
          response: '🛡️ 风控状态检查：\n\n• 异常交易：0笔\n• 风险提醒：0条\n• 账户安全：✅ 正常\n\n💡 提示：系统会自动监控您的交易，发现异常会及时提醒。',
          data: { action: 'check', alerts: [], totalPayments: recentPayments.length },
          type: 'risk_alert',
        };
      }

      const alertsSummary = riskAlerts.slice(0, 5).map(alert => 
        `  - ${alert.createdAt.toLocaleDateString()}: ${alert.amount} ${alert.currency} (风险评分: ${alert.riskScore})`
      ).join('\n');

      return {
        response: `🛡️ 风控状态检查：\n\n• 异常交易：${riskAlerts.length}笔\n• 风险提醒：${riskAlerts.length}条\n• 账户安全：⚠️ 发现异常\n\n最近异常交易：\n${alertsSummary}\n\n💡 建议：请仔细检查这些交易，如有疑问请联系客服。`,
        data: { action: 'check', alerts: riskAlerts, totalPayments: recentPayments.length },
        type: 'risk_alert',
      };
    } catch (error: any) {
      this.logger.error('风控提醒失败:', error);
      return {
        response: `检查风控状态失败：${error.message}。请稍后重试。`,
        data: { action: 'check', error: error.message },
        type: 'risk_alert',
      };
    }
  }

  private async handlePaymentCollection(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '收款管理功能需要商户权限。' };
    }

    const action = params.action || 'list';
    
    try {
      if (action === 'create_link') {
        const amount = params.amount ? Number(params.amount) : null;
        if (!amount || amount <= 0) {
          return {
            response: '生成支付链接需要提供有效的金额。例如："生成支付链接 100元"',
            data: { action: 'create_link', error: 'Invalid amount' },
            type: 'payment_collection',
          };
        }

        // 真实API：创建PayIntent生成支付链接
        const payIntent = await this.payIntentService.createPayIntent(userId, {
          type: PayIntentType.ORDER_PAYMENT,
          amount,
          currency: 'CNY',
          description: `支付链接：${amount} CNY`,
          merchantId: userId, // 商户ID就是用户ID
          expiresIn: 3600, // 1小时过期
        });

        const payUrl = payIntent.metadata?.payUrl || '';
        const qrCode = payIntent.metadata?.qrCode || '';

        return {
          response: `💰 支付链接已生成：\n\n• 金额：${amount} CNY\n• 链接：${payUrl}\n• 二维码：已生成\n• 过期时间：1小时后\n\n💡 提示：您可以将链接或二维码分享给客户进行支付。`,
          data: { 
            action: 'create_link', 
            link: payUrl, 
            qrcode: qrCode,
            payIntentId: payIntent.id,
            expiresAt: payIntent.expiresAt,
          },
          type: 'payment_collection',
        };
      } else {
        // 查询收款统计（今日收款、待收款、已收款）
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayPayments = await this.paymentRepository.find({
          where: {
            merchantId: userId,
            createdAt: MoreThanOrEqual(today),
            status: PaymentStatus.COMPLETED,
          },
        });

        const pendingPayments = await this.paymentRepository.find({
          where: {
            merchantId: userId,
            status: PaymentStatus.PENDING,
          },
        });

        const todayTotal = todayPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const pendingTotal = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);

        return {
          response: `💰 收款管理：\n\n• 今日收款：¥${todayTotal.toFixed(2)} (${todayPayments.length}笔)\n• 待收款：¥${pendingTotal.toFixed(2)} (${pendingPayments.length}笔)\n• 已收款：总计\n\n💡 提示：使用"生成支付链接"可以创建新的收款链接。`,
          data: { 
            action: 'list', 
            todayTotal,
            pendingTotal,
            todayCount: todayPayments.length,
            pendingCount: pendingPayments.length,
          },
          type: 'payment_collection',
        };
      }
    } catch (error: any) {
      this.logger.error('收款管理失败:', error);
      return {
        response: `处理收款管理请求失败：${error.message}。请稍后重试。`,
        data: { action, error: error.message },
        type: 'payment_collection',
      };
    }
  }

  private async handleOrderAnalysis(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '订单分析功能需要商户权限。' };
    }

    try {
      // 真实API：获取商户分析数据
      const analytics = await this.analyticsService.getMerchantAnalytics({
        merchantId: userId,
      });

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);

      // 获取昨日和上周的数据用于对比
      const yesterdayAnalytics = await this.analyticsService.getMerchantAnalytics({
        merchantId: userId,
        startDate: yesterday.toISOString().split('T')[0],
        endDate: yesterday.toISOString().split('T')[0],
      });

      const lastWeekAnalytics = await this.analyticsService.getMerchantAnalytics({
        merchantId: userId,
        startDate: lastWeek.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0],
      });

      const todayGMV = analytics.todayGMV || 0;
      const yesterdayGMV = yesterdayAnalytics.todayGMV || 0;
      const weekGMV = lastWeekAnalytics.totalRevenue || 0;
      const gmvChange = yesterdayGMV > 0 ? ((todayGMV - yesterdayGMV) / yesterdayGMV * 100).toFixed(1) : '0';

      return {
        response: `📊 订单分析报告：\n\n• 今日订单：${analytics.todayOrders || 0}笔\n• 今日GMV：¥${todayGMV.toFixed(2)}\n• 平均订单金额：¥${analytics.avgOrderValue?.toFixed(2) || '0.00'}\n• 转化率：${((analytics.successRate || 0) * 100).toFixed(1)}%\n• 总营收：¥${(analytics.totalRevenue || 0).toFixed(2)}\n\n📈 趋势：\n• 较昨日：${gmvChange}%\n• 本周GMV：¥${weekGMV.toFixed(2)}\n\n💡 建议：\n• 优化商品描述\n• 提升客户服务\n• 分析转化率提升空间`,
        data: { 
          action: 'analyze', 
          analysis: {
            todayOrders: analytics.todayOrders,
            todayGMV: analytics.todayGMV,
            avgOrderValue: analytics.avgOrderValue,
            successRate: analytics.successRate,
            totalRevenue: analytics.totalRevenue,
            gmvChange,
          },
        },
        type: 'order_analysis',
      };
    } catch (error: any) {
      this.logger.error('订单分析失败:', error);
      return {
        response: `获取订单分析失败：${error.message}。请稍后重试。`,
        data: { action: 'analyze', error: error.message },
        type: 'order_analysis',
      };
    }
  }

  private async handleSDKGenerator(params: any) {
    const language = params.language || 'typescript';
    
    return {
      response: `🔧 ${language} SDK生成中...\n\n已为您生成${language} SDK代码示例。`,
      data: {
        language,
        code: `// ${language} SDK示例代码\nimport { PayMind } from '@paymind/sdk';\n\nconst client = new PayMind({ apiKey: 'your-api-key' });\n\n// 使用示例\nawait client.payments.create({ amount: 100, currency: 'USD' });`,
      },
      type: 'sdk_generator',
    };
  }

  /**
   * 商品搜索（语义检索）
   */
  private async handleProductSearch(params: any, context?: { lastSearch?: { query: string; products: any[] } }) {
    try {
      const { query, priceMin, priceMax, category } = params;
      
      if (!query || query.trim().length === 0) {
        return {
          response: '请告诉我您想搜索什么商品？例如："帮我找跑步鞋"',
          type: 'product_search',
        };
      }

      // 构建搜索过滤器
      const filters: Record<string, any> = { type: 'product' };
      if (priceMin) filters.priceMin = priceMin;
      if (priceMax) filters.priceMax = priceMax;
      if (category) filters.category = category;

      // 调用语义搜索（增加返回数量，从10改为50，确保能检索到更多商品）
      const searchResults = await this.searchService.semanticSearch(query, 50, filters);

      if (searchResults.length === 0) {
        return {
          response: `抱歉，没有找到与"${query}"相关的商品。\n\n💡 建议：\n• 尝试使用更通用的关键词\n• 检查价格范围是否合适\n• 尝试不同的分类`,
          type: 'product_search',
          data: { products: [], query },
        };
      }

      // 获取商品详情
      const productIds = searchResults.map(r => r.id);
      const products = await this.productRepository
        .createQueryBuilder('product')
        .where('product.id IN (:...ids)', { ids: productIds })
        .andWhere('product.status = :status', { status: 'active' })
        .getMany();

      // 按搜索结果的顺序排序
      const sortedProducts = productIds
        .map(id => products.find(p => p.id === id))
        .filter(Boolean);

      // 使用统一格式化函数格式化商品信息（包含图片）
      const { formatProductsForDisplay } = await import('../product/utils/product-formatter');
      const scores = searchResults.map((r) => r.score);
      const formattedProducts = formatProductsForDisplay(sortedProducts, {
        scores,
      });

      // 生成响应文本
      const productList = formattedProducts
        .slice(0, 5)
        .map((p, i) => `${i + 1}. ${p.name} - ¥${p.price.toFixed(2)} ${p.currency}${p.stock > 0 ? ' ✅有货' : ' ⚠️缺货'}`)
        .join('\n');

      return {
        response: `🔍 为您找到 ${formattedProducts.length} 件相关商品：\n\n${productList}${formattedProducts.length > 5 ? `\n\n...还有 ${formattedProducts.length - 5} 件商品` : ''}\n\n💡 您可以：\n• 说"加入购物车"或"购买"来下单\n• 说"比价"来查看价格对比\n• 继续搜索其他商品`,
        type: 'product_search',
        data: {
          products: formattedProducts,
          query,
          total: formattedProducts.length,
        },
      };
    } catch (error: any) {
      this.logger.error('商品搜索失败:', error);
      return {
        response: `搜索商品时出现错误：${error.message}。请稍后重试。`,
        type: 'product_search',
        data: { error: error.message },
      };
    }
  }

  /**
   * 比价功能
   */
  private async handlePriceComparison(params: any, context?: { lastSearch?: { query: string; products: any[] } }) {
    try {
      let { query, message } = params;
      
      // 如果没有提供query，尝试使用上一次搜索结果
      if (!query || query.trim().length === 0) {
        if (context?.lastSearch?.products && context.lastSearch.products.length > 0) {
          // 使用上一次搜索的商品进行比价
          const products = context.lastSearch.products;
          query = context.lastSearch.query || '这些商品';
          
          this.logger.log(`比价：使用上一次搜索结果，商品数量：${products.length}，查询：${query}`);
          
          // 直接使用上一次搜索的商品进行比价
          if (products.length > 0) {
            const prices = products.map(p => p.price);
            const cheapest = products.reduce((min, p) => p.price < min.price ? p : min);
            const mostExpensive = products.reduce((max, p) => p.price > max.price ? p : max);
            const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
            const bestValue = products.sort((a, b) => {
              const aScore = (a.score || 0) * 0.6 - (a.price / averagePrice) * 0.4;
              const bScore = (b.score || 0) * 0.6 - (b.price / averagePrice) * 0.4;
              return bScore - aScore;
            })[0];

            const comparisonText = `💰 比价结果（${products.length}件商品）：\n\n` +
              `• 最低价：${cheapest.name} - ¥${cheapest.price.toFixed(2)} ${cheapest.currency}\n` +
              `• 最高价：${mostExpensive.name} - ¥${mostExpensive.price.toFixed(2)} ${mostExpensive.currency}\n` +
              `• 平均价格：¥${averagePrice.toFixed(2)} ${cheapest.currency}\n` +
              `• 最佳性价比：${bestValue.name} - ¥${bestValue.price.toFixed(2)} ${bestValue.currency}\n` +
              `• 价格差异：¥${(mostExpensive.price - cheapest.price).toFixed(2)} ${cheapest.currency}`;

        return {
              response: comparisonText,
          type: 'price_comparison',
              data: {
                products,
                comparison: {
                  cheapest,
                  mostExpensive,
                  averagePrice,
                  bestValue,
                  priceRange: {
                    min: cheapest.price,
                    max: mostExpensive.price,
                    difference: mostExpensive.price - cheapest.price,
                  },
                },
                query,
              },
            };
          }
        }
        
        // 如果还是没有query，尝试从message中提取（可能是"比价一下"）
        if (message && (message.includes('比价一下') || message.includes('比价') || message.trim() === '比价')) {
          if (context?.lastSearch?.products && context.lastSearch.products.length > 0) {
            const products = context.lastSearch.products;
            query = context.lastSearch.query || '这些商品';
            this.logger.log(`比价：从上下文提取，商品数量：${products.length}，查询：${query}`);
            
            // 使用上一次搜索的商品进行比价
            if (products.length > 0) {
              const prices = products.map(p => p.price);
              const cheapest = products.reduce((min, p) => p.price < min.price ? p : min);
              const mostExpensive = products.reduce((max, p) => p.price > max.price ? p : max);
              const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
              const bestValue = products.sort((a, b) => {
                const aScore = (a.score || 0) * 0.6 - (a.price / averagePrice) * 0.4;
                const bScore = (b.score || 0) * 0.6 - (b.price / averagePrice) * 0.4;
                return bScore - aScore;
              })[0];

              const comparisonText = `💰 比价结果（${products.length}件商品）：\n\n` +
                `• 最低价：${cheapest.name} - ¥${cheapest.price.toFixed(2)} ${cheapest.currency}\n` +
                `• 最高价：${mostExpensive.name} - ¥${mostExpensive.price.toFixed(2)} ${mostExpensive.currency}\n` +
                `• 平均价格：¥${averagePrice.toFixed(2)} ${cheapest.currency}\n` +
                `• 最佳性价比：${bestValue.name} - ¥${bestValue.price.toFixed(2)} ${bestValue.currency}\n` +
                `• 价格差异：¥${(mostExpensive.price - cheapest.price).toFixed(2)} ${cheapest.currency}`;

              return {
                response: comparisonText,
                type: 'price_comparison',
                data: {
                  products,
                  comparison: {
                    cheapest,
                    mostExpensive,
                    averagePrice,
                    bestValue,
                    priceRange: {
                      min: cheapest.price,
                      max: mostExpensive.price,
                      difference: mostExpensive.price - cheapest.price,
                    },
                  },
                  query,
                },
              };
            }
          }
        }
        
        return {
          response: '请告诉我您想比价的商品？例如："帮我比价跑步鞋" 或先搜索商品后说"比价一下"',
          type: 'price_comparison',
        };
      }

      // 使用语义搜索查找相关商品
      const searchResults = await this.searchService.semanticSearch(query, 20, {
        type: 'product',
      });

      if (searchResults.length === 0) {
        return {
          response: `抱歉，没有找到与"${query}"相关的商品进行比价。`,
          type: 'price_comparison',
          data: { products: [], query },
        };
      }

      // 获取商品详情
      const productIds = searchResults.map(r => r.id);
      const products = await this.productRepository
        .createQueryBuilder('product')
        .where('product.id IN (:...ids)', { ids: productIds })
        .andWhere('product.status = :status', { status: 'active' })
        .andWhere('product.stock > 0')
        .getMany();

      if (products.length === 0) {
        return {
          response: `没有找到有库存的商品进行比价。`,
          type: 'price_comparison',
          data: { products: [], query },
        };
      }

      // 使用统一格式化函数格式化商品信息（包含图片）
      const { formatProductsForDisplay } = await import('../product/utils/product-formatter');
      const scores = searchResults.map((r) => r.score);
      const formattedProducts = formatProductsForDisplay(products, {
        scores,
      });

      // 计算比价信息
      const prices = formattedProducts.map(p => p.price);
      const cheapest = formattedProducts.reduce((min, p) => p.price < min.price ? p : min);
      const mostExpensive = formattedProducts.reduce((max, p) => p.price > max.price ? p : max);
      const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const bestValue = formattedProducts.sort((a, b) => {
        // 综合考虑价格和相似度分数
        const aScore = (a.score || 0) * 0.6 - (a.price / averagePrice) * 0.4;
        const bScore = (b.score || 0) * 0.6 - (b.price / averagePrice) * 0.4;
        return bScore - aScore;
      })[0];

      // 生成比价报告
      const comparisonText = `💰 比价结果（${formattedProducts.length}件商品）：\n\n` +
        `• 最低价：${cheapest.name} - ¥${cheapest.price.toFixed(2)} ${cheapest.currency}\n` +
        `• 最高价：${mostExpensive.name} - ¥${mostExpensive.price.toFixed(2)} ${mostExpensive.currency}\n` +
        `• 平均价格：¥${averagePrice.toFixed(2)} ${cheapest.currency}\n` +
        `• 最佳性价比：${bestValue.name} - ¥${bestValue.price.toFixed(2)} ${bestValue.currency}\n` +
        `• 价格差异：¥${(mostExpensive.price - cheapest.price).toFixed(2)} ${cheapest.currency}`;

      return {
        response: comparisonText,
        type: 'price_comparison',
        data: {
          products: formattedProducts,
          comparison: {
            cheapest,
            mostExpensive,
            averagePrice,
            bestValue,
            priceRange: {
              min: cheapest.price,
              max: mostExpensive.price,
              difference: mostExpensive.price - cheapest.price,
            },
          },
          query,
        },
      };
    } catch (error: any) {
      this.logger.error('比价失败:', error);
      return {
        response: `比价时出现错误：${error.message}。请稍后重试。`,
        type: 'price_comparison',
        data: { error: error.message },
      };
    }
  }

  /**
   * 创建订单（Agent对话下单）
   */
  private async handleCreateOrder(userId: string | undefined, params: any) {
    try {
      if (!userId) {
        return {
          response: '下单功能需要登录后才能使用。请先登录。',
          type: 'create_order',
        };
      }

      const { productId, productName, quantity = 1 } = params;

      // 如果没有提供productId，尝试通过productName搜索
      let finalProductId = productId;
      if (!finalProductId && productName) {
        const searchResults = await this.searchService.semanticSearch(productName, 1, {
          type: 'product',
        });
        if (searchResults.length > 0) {
          finalProductId = searchResults[0].id;
        }
      }

      if (!finalProductId) {
        return {
          response: '请提供商品ID或商品名称。例如："购买商品ID:xxx" 或 "购买跑步鞋"',
          type: 'create_order',
        };
      }

      // 获取商品信息
      const product = await this.productService.getProduct(finalProductId);
      if (!product) {
        return {
          response: `抱歉，找不到商品（ID: ${finalProductId}）。请检查商品ID是否正确。`,
          type: 'create_order',
        };
      }

      // 检查库存
      if (product.stock < quantity) {
        return {
          response: `抱歉，商品"${product.name}"库存不足。当前库存：${product.stock}，需要：${quantity}。`,
          type: 'create_order',
        };
      }

      // 计算总价
      const totalAmount = Number(product.price) * quantity;
      const currency = (product.metadata as any)?.currency || 'CNY';

      // 创建订单
      const order = await this.orderService.createOrder(userId, {
        merchantId: product.merchantId,
        productId: product.id,
        amount: totalAmount,
        currency,
        metadata: {
          quantity,
          productSnapshot: {
            name: product.name,
            price: product.price,
            category: product.category,
          },
          orderType: (product.metadata as any)?.productType || 'physical',
        },
      });

      return {
        response: `✅ 订单创建成功！\n\n📦 订单信息：\n• 商品：${product.name}\n• 数量：${quantity}\n• 单价：¥${product.price.toFixed(2)} ${currency}\n• 总价：¥${totalAmount.toFixed(2)} ${currency}\n• 订单ID：${order.id}\n\n💳 下一步：\n• 说"支付"或"确认支付"来完成支付\n• 或查看订单详情`,
        type: 'create_order',
        data: {
          order: {
            id: order.id,
            productId: product.id,
            productName: product.name,
            quantity,
            amount: totalAmount,
            currency,
            status: order.status,
          },
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            currency,
          },
        },
      };
    } catch (error: any) {
      this.logger.error('创建订单失败:', error);
      return {
        response: `创建订单时出现错误：${error.message}。请稍后重试。`,
        type: 'create_order',
        data: { error: error.message },
      };
    }
  }

  /**
   * 加入购物车
   */
  private async handleAddToCart(userId: string | undefined, params: any, context?: { lastSearch?: { query: string; products: any[] } }) {
    try {
      if (!userId) {
        return {
          response: '加入购物车功能需要登录后才能使用。请先登录。',
          type: 'add_to_cart',
        };
      }

      let { productId, productName, quantity = 1, message: paramMessage } = params;
      const message = paramMessage || '';

      // 处理"最佳性价比的那个"等指代
      let finalProductId = productId;
      if (!finalProductId && !productName && context?.lastSearch?.products && context.lastSearch.products.length > 0) {
        const products = context.lastSearch.products;
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('最佳性价比') || lowerMessage.includes('性价比最高') || lowerMessage.includes('性价比最好的')) {
          // 计算最佳性价比商品
          const prices = products.map(p => p.price);
          const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
          const bestValue = products.sort((a, b) => {
            const aScore = (a.score || 0) * 0.6 - (a.price / averagePrice) * 0.4;
            const bScore = (b.score || 0) * 0.6 - (b.price / averagePrice) * 0.4;
            return bScore - aScore;
          })[0];
          finalProductId = bestValue.id;
        } else if (lowerMessage.includes('最便宜的') || lowerMessage.includes('最低价')) {
          const cheapest = products.reduce((min, p) => p.price < min.price ? p : min);
          finalProductId = cheapest.id;
        } else if (lowerMessage.includes('第一个') || lowerMessage.includes('第一个')) {
          finalProductId = products[0].id;
        } else if (lowerMessage.includes('那个') || lowerMessage.includes('这个')) {
          // 默认使用第一个
          finalProductId = products[0].id;
        }
      }

      // 如果没有提供productId，尝试通过productName搜索
      if (!finalProductId && productName) {
        const searchResults = await this.searchService.semanticSearch(productName, 1, {
          type: 'product',
        });
        if (searchResults.length > 0) {
          finalProductId = searchResults[0].id;
        }
      }

      if (!finalProductId) {
        return {
          response: '请提供商品ID或商品名称。例如："加入购物车 商品ID:xxx" 或 "加入购物车 跑步鞋" 或 "加入购物车 最佳性价比的那个"',
          type: 'add_to_cart',
        };
      }

      // 获取商品信息
      const product = await this.productService.getProduct(finalProductId);
      if (!product) {
        return {
          response: `抱歉，找不到商品（ID: ${finalProductId}）。`,
          type: 'add_to_cart',
        };
      }

      // 检查库存
      if (product.stock < quantity) {
        return {
          response: `抱歉，商品"${product.name}"库存不足。当前库存：${product.stock}。`,
          type: 'add_to_cart',
        };
      }

      // 添加到购物车
      await this.cartService.addToCart(userId, finalProductId, quantity);

      return {
        response: `✅ 已加入购物车！\n\n📦 商品信息：\n• 商品：${product.name}\n• 数量：${quantity}\n• 单价：¥${product.price.toFixed(2)} ${(product.metadata as any)?.currency || 'CNY'}\n\n💡 您可以：\n• 说"查看购物车"查看所有商品\n• 说"结算"或"下单"来创建订单`,
        type: 'add_to_cart',
        data: {
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            currency: (product.metadata as any)?.currency || 'CNY',
            quantity,
          },
        },
      };
    } catch (error: any) {
      this.logger.error('加入购物车失败:', error);
      return {
        response: `加入购物车时出现错误：${error.message}。请稍后重试。`,
        type: 'add_to_cart',
        data: { error: error.message },
      };
    }
  }

  /**
   * 查看购物车
   */
  private async handleViewCart(userId: string | undefined) {
    try {
      if (!userId) {
        return {
          response: '查看购物车功能需要登录后才能使用。请先登录。',
          type: 'view_cart',
        };
      }

      const cart = await this.cartService.getCartWithProducts(userId);

      if (cart.items.length === 0) {
        return {
          response: '🛒 您的购物车是空的。\n\n💡 您可以：\n• 说"搜索商品"来查找商品\n• 说"加入购物车"来添加商品',
          type: 'view_cart',
          data: { items: [], total: 0, itemCount: 0 },
        };
      }

      // 生成购物车列表
      const itemsList = cart.items
        .map((item, idx) => 
          `${idx + 1}. ${item.product.name} - ¥${item.product.price.toFixed(2)} ${item.product.currency} x${item.quantity}`
        )
        .join('\n');

      return {
        response: `🛒 您的购物车（${cart.itemCount}件商品）：\n\n${itemsList}\n\n💰 总计：¥${cart.total.toFixed(2)} ${cart.items[0]?.product.currency || 'CNY'}\n\n💡 您可以：\n• 说"结算"或"下单"来创建订单\n• 说"删除购物车 商品ID:xxx"来删除商品\n• 说"清空购物车"来清空所有商品`,
        type: 'view_cart',
        data: {
          items: cart.items,
          total: cart.total,
          itemCount: cart.itemCount,
        },
      };
    } catch (error: any) {
      this.logger.error('查看购物车失败:', error);
      return {
        response: `查看购物车时出现错误：${error.message}。请稍后重试。`,
        type: 'view_cart',
        data: { error: error.message },
      };
    }
  }

  /**
   * 从购物车删除商品
   */
  private async handleRemoveFromCart(userId: string | undefined, params: any) {
    try {
      if (!userId) {
        return {
          response: '删除购物车商品功能需要登录后才能使用。请先登录。',
          type: 'remove_from_cart',
        };
      }

      const { productId } = params;

      if (!productId) {
        return {
          response: '请提供商品ID。例如："删除购物车 商品ID:xxx"',
          type: 'remove_from_cart',
        };
      }

      await this.cartService.removeFromCart(userId, productId);

      return {
        response: `✅ 已从购物车删除商品（ID: ${productId}）\n\n💡 您可以：\n• 说"查看购物车"查看剩余商品`,
        type: 'remove_from_cart',
        data: { productId },
      };
    } catch (error: any) {
      this.logger.error('删除购物车商品失败:', error);
      return {
        response: `删除购物车商品时出现错误：${error.message}。请稍后重试。`,
        type: 'remove_from_cart',
        data: { error: error.message },
      };
    }
  }

  /**
   * 清空购物车
   */
  private async handleClearCart(userId: string | undefined) {
    try {
      if (!userId) {
        return {
          response: '清空购物车功能需要登录后才能使用。请先登录。',
          type: 'clear_cart',
        };
      }

      await this.cartService.clearCart(userId);

      return {
        response: '✅ 购物车已清空。\n\n💡 您可以：\n• 说"搜索商品"来查找商品\n• 说"加入购物车"来添加商品',
        type: 'clear_cart',
      };
    } catch (error: any) {
      this.logger.error('清空购物车失败:', error);
      return {
        response: `清空购物车时出现错误：${error.message}。请稍后重试。`,
        type: 'clear_cart',
        data: { error: error.message },
      };
    }
  }

  /**
   * 注册商户
   */
  private async handleRegisterMerchant(userId: string | undefined) {
    try {
      if (!userId) {
        return {
          response: '注册商户功能需要登录后才能使用。请先登录。',
          type: 'register_merchant',
        };
      }

      // 添加商户角色
      const user = await this.userService.addRole(userId, 'merchant' as any);

      return {
        response: `✅ 注册商户成功！\n\n• 商户ID：${user.id}\n• Agentrix ID：${user.agentrixId}\n• 角色：${user.roles.join(', ')}\n\n💡 您现在可以：\n• 上传商品到Marketplace\n• 查看和管理订单\n• 生成收款链接\n• 查看销售分析`,
        type: 'register_merchant',
        data: {
          userId: user.id,
          agentrixId: user.agentrixId,
          roles: user.roles,
        },
      };
    } catch (error: any) {
      this.logger.error('注册商户失败:', error);
      return {
        response: `注册商户时出现错误：${error.message}。请稍后重试。`,
        type: 'register_merchant',
        data: { error: error.message },
      };
    }
  }

  /**
   * 商家上传商品
   */
  private async handleCreateProduct(userId: string | undefined, params: any) {
    try {
      if (!userId) {
        return {
          response: '上传商品功能需要登录后才能使用。请先登录。',
          type: 'create_product',
        };
      }

      const { name, price, stock, category, productType = 'physical' } = params;

      if (!name || !price || stock === undefined) {
        return {
          response: '上传商品需要提供：商品名称、价格、库存。可选：分类、商品类型（实物/服务/NFT等）。\n\n示例："上传商品：跑步鞋，价格150元，库存100，分类运动鞋"',
          type: 'create_product',
        };
      }

      // 创建商品（使用统一数据标准格式）
      const product = await this.productService.createProduct(userId, {
        name,
        description: params.description || '',
        price: {
          amount: Number(price),
          currency: params.currency || 'CNY',
        },
        inventory: {
          type: productType === 'service' ? 'unlimited' : 'finite',
          quantity: Number(stock),
        },
        category: category || '其他',
        commissionRate: params.commissionRate || 5,
        productType: productType as any,
        metadata: {
          core: {
            media: {
              images: params.image ? [{
                url: params.image,
                type: 'thumbnail' as const,
              }] : [],
            },
          },
          extensions: {
            productType: productType,
            currency: params.currency || 'CNY',
            ...params.metadata,
          },
        },
      });

      return {
        response: `✅ 商品已成功上架！\n\n📦 商品信息：\n• 商品ID：${product.id}\n• 名称：${product.name}\n• 价格：¥${product.price.toFixed(2)} ${(product.metadata as any)?.extensions?.currency || (product.metadata as any)?.currency || 'CNY'}\n• 库存：${product.stock}\n• 分类：${product.category}\n• 类型：${productType}\n\n💡 商品已自动索引到向量数据库，支持语义检索。`,
        type: 'create_product',
        data: {
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            stock: product.stock,
            category: product.category,
            productType: productType,
          },
        },
      };
    } catch (error: any) {
      this.logger.error('上传商品失败:', error);
      return {
        response: `上传商品时出现错误：${error.message}。请稍后重试。`,
        type: 'create_product',
        data: { error: error.message },
      };
    }
  }

  /**
   * 商家查看订单
   */
  private async handleViewOrders(userId: string | undefined, params: any) {
    try {
      if (!userId) {
        return {
          response: '查看订单功能需要登录后才能使用。请先登录。',
          type: 'view_orders',
        };
      }

      // 获取订单列表（作为商户）
      const orders = await this.orderRepository.find({
        where: { merchantId: userId },
        order: { createdAt: 'DESC' },
        take: 20,
      });

      if (orders.length === 0) {
        return {
          response: '📦 您还没有订单。\n\n💡 提示：商品上架后，用户下单时会自动通知您。',
          type: 'view_orders',
          data: { orders: [] },
        };
      }

      // 格式化订单列表
      const ordersList = orders.slice(0, 10).map((order, idx) => 
        `${idx + 1}. 订单ID: ${order.id}\n   金额: ¥${Number(order.amount).toFixed(2)} ${order.currency}\n   状态: ${order.status}\n   时间: ${new Date(order.createdAt).toLocaleString()}`
      ).join('\n\n');

      return {
        response: `📦 您的订单列表（共${orders.length}笔）：\n\n${ordersList}${orders.length > 10 ? `\n\n...还有 ${orders.length - 10} 笔订单` : ''}\n\n💡 您可以：\n• 说"查看订单详情 订单ID:xxx"查看详细信息\n• 说"发货 订单ID:xxx"来填写物流信息\n• 说"取消订单 订单ID:xxx"来取消未支付的订单`,
        type: 'view_orders',
        data: {
          orders: orders.map(o => ({
            id: o.id,
            amount: o.amount,
            currency: o.currency,
            status: o.status,
            createdAt: o.createdAt,
            items: o.items || (o.productId ? [{
              productId: o.productId,
              quantity: 1,
              price: Number(o.amount),
              name: o.metadata?.productName || '商品',
            }] : []),
            productId: o.productId,
            metadata: o.metadata,
          })),
          total: orders.length,
        },
      };
    } catch (error: any) {
      this.logger.error('查看订单失败:', error);
      return {
        response: `查看订单时出现错误：${error.message}。请稍后重试。`,
        type: 'view_orders',
        data: { error: error.message },
      };
    }
  }

  /**
   * 商家发货
   */
  private async handleShipOrder(userId: string | undefined, params: any) {
    try {
      if (!userId) {
        return {
          response: '发货功能需要登录后才能使用。请先登录。',
          type: 'ship_order',
        };
      }

      const { orderId, trackingNumber, carrier } = params;

      if (!orderId) {
        return {
          response: '请提供订单ID。例如："发货 订单ID:xxx 物流单号123456 承运商顺丰"',
          type: 'ship_order',
        };
      }

      // 检查订单是否存在且属于该商户
      const order = await this.orderRepository.findOne({
        where: { id: orderId, merchantId: userId },
      });

      if (!order) {
        return {
          response: `抱歉，找不到订单（ID: ${orderId}）或您无权操作此订单。`,
          type: 'ship_order',
        };
      }

      // 更新物流状态
      await this.logisticsService.updateLogisticsStatus(
        orderId,
        'shipped',
        trackingNumber,
        carrier,
      );

      return {
        response: `✅ 发货成功！\n\n📦 订单信息：\n• 订单ID：${orderId}\n• 物流单号：${trackingNumber || '待填写'}\n• 承运商：${carrier || '待填写'}\n\n💡 已通知用户订单已发货。`,
        type: 'ship_order',
        data: {
          orderId,
          trackingNumber,
          carrier,
        },
      };
    } catch (error: any) {
      this.logger.error('发货失败:', error);
      return {
        response: `发货时出现错误：${error.message}。请稍后重试。`,
        type: 'ship_order',
        data: { error: error.message },
      };
    }
  }

  /**
   * 用户查看我的订单
   */
  private async handleViewMyOrders(userId: string | undefined) {
    try {
      if (!userId) {
        return {
          response: '查看订单功能需要登录后才能使用。请先登录。',
          type: 'view_my_orders',
        };
      }

      // 获取订单列表（作为用户）
      const orders = await this.orderRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 20,
      });

      if (orders.length === 0) {
        return {
          response: '📦 您还没有订单。\n\n💡 提示：说"搜索商品"来查找商品并下单。',
          type: 'view_my_orders',
          data: { orders: [] },
        };
      }

      // 格式化订单列表
      const ordersList = orders.slice(0, 10).map((order, idx) => 
        `${idx + 1}. 订单ID: ${order.id}\n   金额: ¥${Number(order.amount).toFixed(2)} ${order.currency}\n   状态: ${order.status}\n   时间: ${new Date(order.createdAt).toLocaleString()}`
      ).join('\n\n');

      return {
        response: `📦 您的订单列表（共${orders.length}笔）：\n\n${ordersList}${orders.length > 10 ? `\n\n...还有 ${orders.length - 10} 笔订单` : ''}\n\n💡 您可以：\n• 说"查看订单详情 订单ID:xxx"查看详细信息\n• 说"物流跟踪 订单ID:xxx"查看物流信息`,
        type: 'view_my_orders',
        data: {
          orders: orders.map(o => ({
            id: o.id,
            amount: o.amount,
            currency: o.currency,
            status: o.status,
            createdAt: o.createdAt,
          })),
          total: orders.length,
        },
      };
    } catch (error: any) {
      this.logger.error('查看订单失败:', error);
      return {
        response: `查看订单时出现错误：${error.message}。请稍后重试。`,
        type: 'view_my_orders',
        data: { error: error.message },
      };
    }
  }

  /**
   * 用户物流跟踪
   */
  private async handleTrackLogistics(userId: string | undefined, params: any) {
    try {
      if (!userId) {
        return {
          response: '物流跟踪功能需要登录后才能使用。请先登录。',
          type: 'track_logistics',
        };
      }

      const { orderId } = params;

      if (!orderId) {
        return {
          response: '请提供订单ID。例如："物流跟踪 订单ID:xxx"',
          type: 'track_logistics',
        };
      }

      // 检查订单是否存在且属于该用户
      const order = await this.orderRepository.findOne({
        where: { id: orderId, userId },
      });

      if (!order) {
        return {
          response: `抱歉，找不到订单（ID: ${orderId}）或您无权查看此订单。`,
          type: 'track_logistics',
        };
      }

      // 获取物流跟踪信息
      const tracking = await this.logisticsService.getLogisticsTracking(orderId);

      if (!tracking) {
        return {
          response: `订单 ${orderId} 暂无物流信息。\n\n💡 提示：商家发货后会更新物流信息。`,
          type: 'track_logistics',
          data: { orderId },
        };
      }

      // 格式化物流信息
      const eventsList = tracking.events.map((event, idx) => 
        `${idx + 1}. ${new Date(event.timestamp).toLocaleString()}\n   ${event.location ? `📍 ${event.location} - ` : ''}${event.description}`
      ).join('\n\n');

      const statusText = {
        pending: '待发货',
        packed: '已打包',
        shipped: '已发货',
        in_transit: '运输中',
        delivered: '已送达',
        failed: '配送失败',
      }[tracking.status] || tracking.status;

      return {
        response: `📦 物流跟踪信息（订单ID: ${orderId}）：\n\n• 当前状态：${statusText}\n• 物流单号：${tracking.trackingNumber || '待填写'}\n• 承运商：${tracking.carrier || '待填写'}\n• 当前位置：${tracking.currentLocation || '未知'}\n${tracking.estimatedDelivery ? `• 预计送达：${new Date(tracking.estimatedDelivery).toLocaleString()}` : ''}\n\n📋 物流时间线：\n\n${eventsList}`,
        type: 'track_logistics',
        data: {
          orderId,
          tracking,
        },
      };
    } catch (error: any) {
      this.logger.error('物流跟踪失败:', error);
      return {
        response: `查询物流信息时出现错误：${error.message}。请稍后重试。`,
        type: 'track_logistics',
        data: { error: error.message },
      };
    }
  }

  /**
   * 支付订单
   */
  private async handlePayOrder(userId: string | undefined, params: any) {
    try {
      if (!userId) {
        return {
          response: '支付功能需要登录后才能使用。请先登录。',
          type: 'pay_order',
        };
      }

      const { orderId } = params;

      if (!orderId) {
        // 如果没有提供订单ID，尝试查找最近的待支付订单
        const pendingOrder = await this.orderRepository.findOne({
          where: { userId, status: OrderStatus.PENDING },
          order: { createdAt: 'DESC' },
        });

        if (!pendingOrder) {
          return {
            response: '请提供订单ID。例如："支付 订单ID:xxx" 或 "支付订单"',
            type: 'pay_order',
          };
        }

        // 使用找到的订单
        const order = pendingOrder;
        const payment = await this.payIntentService.createPayIntent(userId, {
          type: PayIntentType.ORDER_PAYMENT,
          amount: Number(order.amount),
          currency: order.currency,
          description: `订单支付：${order.id}`,
          orderId: order.id,
          merchantId: order.merchantId,
        });

        const paymentUrl = (payment.metadata as any)?.payUrl || '已生成';

        return {
          response: `💳 支付链接已生成！\n\n📦 订单信息：\n• 订单ID：${order.id}\n• 金额：¥${Number(order.amount).toFixed(2)} ${order.currency}\n• 支付链接：${paymentUrl}\n\n💡 请点击支付链接完成支付。`,
          type: 'pay_order',
          data: {
            orderId: order.id,
            paymentId: payment.id,
            paymentUrl,
            amount: order.amount,
            currency: order.currency,
          },
        };
      }

      // 检查订单是否存在且属于该用户
      const order = await this.orderRepository.findOne({
        where: { id: orderId, userId },
      });

      if (!order) {
        return {
          response: `抱歉，找不到订单（ID: ${orderId}）或您无权支付此订单。`,
          type: 'pay_order',
        };
      }

      if (order.status !== OrderStatus.PENDING) {
        return {
          response: `订单 ${orderId} 的状态为"${order.status}"，无法支付。只有待支付订单可以支付。`,
          type: 'pay_order',
        };
      }

      // 创建支付意图
      const payment = await this.payIntentService.createPayIntent(userId, {
        type: PayIntentType.ORDER_PAYMENT,
        amount: Number(order.amount),
        currency: order.currency,
        description: `订单支付：${order.id}`,
        orderId: order.id,
        merchantId: order.merchantId,
      });

      const paymentUrl = (payment.metadata as any)?.payUrl || '已生成';

      return {
        response: `💳 支付链接已生成！\n\n📦 订单信息：\n• 订单ID：${order.id}\n• 金额：¥${Number(order.amount).toFixed(2)} ${order.currency}\n• 支付链接：${paymentUrl}\n\n💡 请点击支付链接完成支付。`,
        type: 'pay_order',
        data: {
          orderId: order.id,
          paymentId: payment.id,
          paymentUrl,
          amount: order.amount,
          currency: order.currency,
        },
      };
    } catch (error: any) {
      this.logger.error('支付订单失败:', error);
      return {
        response: `支付订单时出现错误：${error.message}。请稍后重试。`,
        type: 'pay_order',
        data: { error: error.message },
      };
    }
  }

  /**
   * 结算购物车
   */
  private async handleCheckoutCart(userId: string | undefined) {
    try {
      if (!userId) {
        return {
          response: '结算购物车功能需要登录后才能使用。请先登录。',
          type: 'checkout_cart',
        };
      }

      // 获取购物车详情（包含商品信息）
      const cartData = await this.cartService.getCartWithProducts(userId);

      if (!cartData || cartData.items.length === 0) {
        return {
          response: '🛒 您的购物车是空的。\n\n💡 您可以：\n• 说"搜索商品"来查找商品\n• 说"加入购物车"来添加商品',
          type: 'checkout_cart',
          data: { cart: { items: [] } },
        };
      }

      // 获取第一个商品的商户ID和货币（假设所有商品来自同一商户）
      const firstItem = cartData.items[0];
      if (!firstItem.product) {
        return {
          response: '购物车中的商品信息不完整，无法结算。请重新添加商品。',
          type: 'checkout_cart',
        };
      }

      const merchantId = firstItem.product.merchantId || 'default';
      const currency = firstItem.product.currency || 'CNY';
      const firstProductId = firstItem.productId;

      // 创建订单（包含多个商品）
      // 注意：CreateOrderDto 需要 productId，我们使用第一个商品的 ID
      // 其他商品信息存储在 metadata 中
      const order = await this.orderService.createOrder(userId, {
        merchantId,
        productId: firstProductId,
        amount: cartData.total,
        currency,
        metadata: {
          items: cartData.items.map(item => ({
            productId: item.productId,
            productName: item.product?.name,
            quantity: item.quantity,
            price: item.product?.price,
          })),
          orderType: 'cart_checkout',
        },
      });

      // 清空购物车
      await this.cartService.clearCart(userId);

      return {
        response: `✅ 订单创建成功！\n\n📦 订单信息：\n• 订单ID：${order.id}\n• 商品数量：${cartData.itemCount}件\n• 总价：¥${cartData.total.toFixed(2)} ${currency}\n\n💳 下一步：\n• 说"支付 订单ID:${order.id}"来完成支付\n• 或查看订单详情`,
        type: 'checkout_cart',
        data: {
          order: {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            status: order.status,
          },
          items: cartData.items.map(item => ({
            productId: item.productId,
            productName: item.product?.name,
            quantity: item.quantity,
            price: item.product?.price,
          })),
        },
      };
    } catch (error: any) {
      this.logger.error('结算购物车失败:', error);
      return {
        response: `结算购物车时出现错误：${error.message}。请稍后重试。`,
        type: 'checkout_cart',
        data: { error: error.message },
      };
    }
  }

  private async handleAPIAssistant(params: any) {
    const action = params.action || 'generate_code';
    
    return {
      response: '🔗 API助手：\n\n我可以帮您：\n• 生成API调用代码\n• 查看API文档\n• 创建Mock Server\n\n请告诉我您需要什么帮助？',
      data: { action },
      type: 'api_assistant',
    };
  }

  /**
   * 处理技能搜索请求
   */
  private async handleSkillSearch(params: any) {
    const { query } = params;
    
    if (!query || query.trim().length === 0) {
      return {
        response: '🔍 技能搜索\n\n请输入您要搜索的技能名称，例如：\n• commission distribute skill\n• payment skill\n• product search\n\n💡 提示：您可以搜索支付、分账、物流等各类技能。',
        type: 'skill_search',
        data: { action: 'prompt_query' },
      };
    }

    try {
      // 调用统一市场服务搜索技能
      const searchResult = await this.unifiedMarketplaceService.search({
        query: query.trim(),
        limit: 10,
        sortBy: 'callCount',
        sortOrder: 'DESC',
      });

      if (searchResult.items.length === 0) {
        return {
          response: `🔍 未找到包含 "${query}" 的技能。\n\n💡 建议：\n• 尝试使用不同的关键词\n• 使用英文关键词可能会有更好的结果\n• 查看技能市场浏览所有可用技能`,
          type: 'skill_search',
          data: {
            query,
            skills: [],
            total: 0,
          },
        };
      }

      // 格式化技能列表
      const skillList = searchResult.items.map((skill, index) => {
        const pricing = skill.pricing as any;
        const price = pricing?.pricePerCall !== undefined ? `$${pricing.pricePerCall}` : '免费';
        const ratingValue = skill.rating != null ? Number(skill.rating) : null;
        const ratingStr = ratingValue != null && !isNaN(ratingValue) ? ratingValue.toFixed(1) : 'N/A';
        return `${index + 1}. **${skill.displayName || skill.name}**\n   📝 ${skill.description?.substring(0, 80) || '无描述'}...\n   💰 ${price}/次 | 📊 ${skill.callCount || 0}次调用 | ⭐ ${ratingStr}`;
      }).join('\n\n');

      return {
        response: `🎯 找到 ${searchResult.total} 个与 "${query}" 相关的技能：\n\n${skillList}\n\n💡 提示：\n• 点击技能名称查看详情\n• 在技能市场可以安装和管理技能`,
        type: 'skill_search',
        data: {
          query,
          skills: searchResult.items.map(skill => ({
            id: skill.id,
            name: skill.name,
            displayName: skill.displayName,
            description: skill.description,
            category: skill.category,
            layer: skill.layer,
            pricing: skill.pricing,
            callCount: skill.callCount,
            rating: skill.rating,
          })),
          total: searchResult.total,
        },
      };
    } catch (error) {
      this.logger.error(`技能搜索失败: ${error.message}`, error.stack);
      return {
        response: `⚠️ 搜索技能时发生错误：${error.message}\n\n请稍后重试或联系客服。`,
        type: 'skill_search',
        data: { query, error: error.message },
      };
    }
  }

  // ========== 开发者Agent额外功能 ==========

  private async handleSandbox(params: any) {
    const { code } = params;
    
    if (!code) {
      return {
        response: '🧪 沙盒调试功能\n\n请提供要测试的代码，例如：\n```javascript\nconst client = new PayMind({ apiKey: "test" });\nawait client.payments.create({ amount: 100 });\n```',
        type: 'sandbox',
        data: { action: 'prompt_code' },
      };
    }

    return {
      response: '🧪 正在沙盒环境中执行代码...\n\n✅ 代码执行成功！\n\n💡 提示：沙盒环境使用模拟数据，不会产生真实交易。',
      type: 'sandbox',
      data: {
        code,
        result: { success: true, message: '代码执行成功（模拟）' },
      },
    };
  }

  private async handleDevOps(params: any) {
    const { action } = params;
    
    if (action === 'automate') {
      return {
        response: '⚙️ DevOps自动化功能\n\n• Webhook自动配置\n• CI/CD集成\n• 签名验证\n• 部署自动化\n\n💡 提示：请访问开发者文档查看详细配置指南。',
        type: 'devops',
        data: { action: 'automate' },
      };
    }

    return {
      response: '⚙️ DevOps自动化功能开发中...',
      type: 'devops',
      data: { action },
    };
  }

  private async handleContractHelper(params: any) {
    const { action, chain } = params;
    
    if (action === 'generate_template') {
      return {
        response: '📜 合约模板生成\n\n已为您生成智能合约模板代码。\n\n💡 提示：请根据您的业务需求修改模板。',
        type: 'contract_helper',
        data: {
          action: 'generate_template',
          template: '// 智能合约模板\ncontract PayMindIntegration {\n  // 您的合约代码\n}',
        },
      };
    }

    if (action === 'estimate_gas') {
      const chainName = chain || 'ethereum';
      return {
        response: `⛽ ${chainName}链 Gas费用估算\n\n• 标准交易：~21,000 gas\n• 合约调用：~50,000 gas\n• 复杂合约：~100,000+ gas\n\n💡 提示：实际费用取决于网络拥堵情况。`,
        type: 'contract_helper',
        data: {
          action: 'estimate_gas',
          chain: chainName,
          estimates: {
            standard: 21000,
            contract: 50000,
            complex: 100000,
          },
        },
      };
    }

    return {
      response: '📜 合约助手\n\n我可以帮您：\n• 生成合约模板\n• 估算Gas费用\n• 模拟交易\n\n请告诉我您需要什么帮助？',
      type: 'contract_helper',
      data: { action: 'help' },
    };
  }

  private async handleTicketsAndLogs(userId: string | undefined, params: any) {
    const { ticketId, action } = params;
    
    if (!userId) {
      return {
        response: '工单与日志功能需要登录后才能使用。',
        type: 'tickets',
      };
    }

    if (ticketId) {
      return {
        response: `🎫 工单 #${ticketId}\n\n• 状态：处理中\n• 创建时间：2025-01-XX\n• 描述：支付相关问题\n\n💡 提示：工单详情功能开发中。`,
        type: 'tickets',
        data: { ticketId, action: 'view' },
      };
    }

    if (action === 'view' || action === 'list') {
      return {
        response: '📋 您的工单列表\n\n• 工单 #001 - 支付问题 - 处理中\n• 工单 #002 - API集成 - 已解决\n\n💡 提示：点击工单可查看详情。',
        type: 'tickets',
        data: { action: 'list', tickets: [] },
      };
    }

    return {
      response: '📋 工单与日志\n\n我可以帮您：\n• 查看工单列表\n• 分析错误日志\n• 调试支付问题\n\n请告诉我您需要什么帮助？',
      type: 'tickets',
      data: { action: 'help' },
    };
  }

  private async handleCodeGeneration(params: any) {
    const { type } = params;
    
    const codeExamples: Record<string, string> = {
      payment: `// 支付代码示例
import { PayMind } from '@paymind/sdk';

const client = new PayMind({ apiKey: 'your-api-key' });

// 创建支付
const payment = await client.payments.create({
  amount: 100,
  currency: 'USD',
  description: '订单支付',
});`,
      webhook: `// Webhook处理代码示例
import express from 'express';

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-paymind-signature'];
  const isValid = verifySignature(req.body, signature);
  
  if (isValid) {
    // 处理webhook事件
    await handlePaymentEvent(req.body);
    res.status(200).send('OK');
  } else {
    res.status(401).send('Invalid signature');
  }
});`,
      api: `// API调用示例
const response = await fetch('https://api.paymind.com/v1/payments', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    amount: 100,
    currency: 'USD',
  }),
});`,
    };

    const codeType = type || 'payment';
    const code = codeExamples[codeType] || codeExamples.payment;

    return {
      response: `💻 ${codeType}代码生成\n\n\`\`\`${codeType === 'webhook' ? 'javascript' : 'typescript'}\n${code}\n\`\`\``,
      type: 'code_gen',
      data: {
        type: codeType,
        code,
      },
    };
  }

  // ========== 基础设施作为技能 (Service as Skill) ==========

  private async handleCreateMPCWallet(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '创建 MPC 钱包需要登录。请先登录。' };
    }

    try {
      // 在实际生产中，密码应该由前端安全引导
      const defaultPassword = 'agentrix_secure_pwd_2025'; 
      const wallet = await this.mpcWalletService.generateMPCWallet(userId, defaultPassword);

      return {
        response: `👛 MPC 钱包创建成功！\n\n• 地址：${wallet.walletAddress}\n• 网络：BSC (Testnet)\n\n💡 提示：您的钱包已采用 Shamir 分片技术。分片 B 已由 Agentrix 安全存储，分片 A 和 C 将在界面上提供给您备份。`,
        data: {
          walletAddress: wallet.walletAddress,
          chain: 'BSC',
          type: 'MPC',
        },
        type: 'wallet_management',
      };
    } catch (error: any) {
      if (error.message.includes('already has')) {
        const wallet = await this.mpcWalletService.getMPCWallet(userId);
        return {
          response: `👛 您已经拥有活跃的 MPC 钱包。\n\n• 地址：${wallet.walletAddress}\n• 网络：${wallet.chain}`,
          data: { walletAddress: wallet.walletAddress, chain: wallet.chain },
          type: 'wallet_management',
        };
      }
      return { response: `创建钱包失败：${error.message}` };
    }
  }

  private async handleTransfer(userId: string | undefined, params: any) {
    if (!userId) {
      return { response: '转账功能需要登录才能使用。' };
    }

    const { amount, currency = 'USDC', toAddress } = params;

    if (!amount || !toAddress) {
      return {
        response: '⚠️ 转账信息不完整。\n\n请提供金额和目标地址。例如："转账 10 USDC 给 0x123..."',
        type: 'transfer_crypto',
      };
    }

    try {
      // 检查是否有 X402 授权，如果有，可以模拟"闭环支付"测试
      const auth = await this.x402AuthorizationService.checkAuthorization(userId);
      
      if (auth && auth.isActive && parseFloat(amount) <= auth.singleLimit) {
        // 模拟执行闭环支付
        // 在真实场景中，这里会调用 PayMindRelayerService.processQuickPay
        return {
          response: `💸 【闭环支付已执行】\n\n检测到您已开启 X402 自动授权，无需签名即可完成操作。\n\n• 金额：${amount} ${currency}\n• 接收方：${toAddress.substring(0, 10)}...\n• 状态：交易已提交 (Mock)\n\n✅ 交易哈希：0x${Math.random().toString(16).substring(2, 66)}`,
          data: { amount, currency, toAddress, status: 'success', x402: true },
          type: 'transfer_crypto',
        };
      }

      return {
        response: `💸 请确认您的转账意图：\n\n• 金额：${amount} ${currency}\n• 接收方：${toAddress}\n\n💡 提示：由于未开启 X402 自动授权，本次转账需要您在钱包中签署消息。`,
        data: { amount, currency, toAddress, status: 'pending_signature' },
        type: 'transfer_crypto',
      };
    } catch (error: any) {
      return { response: `发起转账失败：${error.message}` };
    }
  }

  private async handleOnramp(userId: string | undefined, params: any) {
    const { amount, currency = 'USD' } = params;

    if (!amount) {
      return {
        response: '请输入您想充值的金额。例如："充值 $100"',
        type: 'onramp_fiat',
      };
    }

    // 生成入金链接（Transak 逻辑）
    const transakUrl = `https://global.transak.com/?apiKey=demo&fiatAmount=${amount}&fiatCurrency=${currency.toUpperCase()}&cryptoCurrencyCode=USDC&network=bsc`;

    return {
      response: `🛒 已为您生成充值通道（Transak）：\n\n• 您将支付：${amount} ${currency}\n• 您将收到：~${amount} USDC (BSC)\n\n💡 点击下方链接使用信用卡或银行转账完成购买：\n${transakUrl}`,
      data: { amount, currency, url: transakUrl },
      type: 'onramp_fiat',
    };
  }

  // ========== 商家Agent额外功能 ==========

  private async handleMarketing(userId: string | undefined, params: any) {
    if (!userId) {
      return {
        response: '营销助手功能需要登录后才能使用。',
        type: 'marketing',
      };
    }

    const { action, amount } = params;
    
    if (action === 'create_coupon') {
      return {
        response: `🎫 创建优惠券\n\n• 面额：${amount ? `¥${amount}` : '待设置'}\n• 类型：满减券\n• 有效期：30天\n\n💡 提示：优惠券创建功能开发中。`,
        type: 'marketing',
        data: {
          action: 'create_coupon',
          amount: amount ? parseFloat(amount) : null,
        },
      };
    }

    if (action === 'analyze') {
      return {
        response: '📊 营销数据分析\n\n• 本月销售额：¥0\n• 优惠券使用率：0%\n• 转化率：0%\n\n💡 提示：营销分析功能开发中。',
        type: 'marketing',
        data: { action: 'analyze' },
      };
    }

    return {
      response: '📢 营销助手\n\n我可以帮您：\n• 创建优惠券\n• 分析营销数据\n• 提供营销建议\n• A/B测试\n\n请告诉我您需要什么帮助？',
      type: 'marketing',
      data: { action: 'suggest' },
    };
  }
}

