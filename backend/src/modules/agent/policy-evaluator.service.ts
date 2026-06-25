import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Authorization, AuthorizationStatus } from '../../entities/authorization.entity';
import { Policy, PolicyType } from '../../entities/policy.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';
import { checkRedline, RedlineCheck } from './redlines';

/**
 * 风险分级(需求 3.1)。
 * - read:   只读,自动放行(无人值守)。
 * - medium: 中风险,策略 + 预算放行;无策略授权时回落人确认。
 * - high:   高风险,强制人工确认。
 * - redline: 红线,永久拒绝,不可被任何 UI/策略/预算绕过(需求 3.5 / 6.2)。
 */
export type RiskTier = 'read' | 'medium' | 'high' | 'redline';

/**
 * 只读动作类型(自动放行):截图 / 导航(同域)/ eval 读取 / 选择器读 / 无障碍树 / 聚焦 / 滚动。
 */
export const READ_ACTION_TYPES: ReadonlySet<string> = new Set([
  'screenshot',
  'navigate',
  'browser_eval_read',
  'eval_read',
  'read_selector',
  'browser_read_selector',
  'window_tree',
  'focus_window',
  'scroll',
]);

/**
 * 中风险动作类型(策略 + 预算):发布(站内表单提交)/ 点击 / 输入 / 导航新域。
 */
export const MEDIUM_ACTION_TYPES: ReadonlySet<string> = new Set([
  'click',
  'browser_click_selector',
  'type',
  'input',
  'submit_form',
  'navigate_new_domain',
  'publish',
  // crypto-native-agent-ops 任务 19.1(需求 14 锚点:对外发布/批量互动 = 🟡 策略+预算放行):
  // 社媒定时发布与单账号互动属中风险写动作,预算/频率上限内自动放行,越界回落人确认;
  // 买粉/机器人/刷假互动仍先经红线拦截(Property 3),不受此归类影响。
  'social_post',
  'social_interaction',
]);

/**
 * 高风险动作类型(人确认):交易签名 / 转账 / 新收款地址 / 对外发布 / 批量操作 / 不可逆提交。
 */
export const HIGH_ACTION_TYPES: ReadonlySet<string> = new Set([
  'transaction_sign',
  'transfer',
  'new_payee_address',
  'external_publish',
  'batch_operation',
  'irreversible_submit',
]);

/**
 * 分级审批的动作描述(需求 3)。
 */
export interface ActionDescriptor {
  /** 动作类型,见 READ/MEDIUM/HIGH/REDLINE 动作类型集合。 */
  type: string;
  /** 目标进程/应用名(用于红线进程黑名单)。 */
  targetApp?: string;
  /** 将被键入/提交的文本(用于提权与合规红线检测)。 */
  inputText?: string;
  /** 动作意图的自然语言描述(用于合规红线检测)。 */
  intent?: string;
  /** 导航是否跨到新域(true 则 navigate 升级为中风险)。 */
  toExternalDomain?: boolean;
  /** 是否为批量操作(true 则升级为高风险)。 */
  isBatch?: boolean;
  /** 中风险动作的预算授权上下文;提供时对 medium 档执行策略+预算评估。 */
  budget?: {
    userId: string;
    agentId: string;
    amount: number;
    merchantId: string;
    options?: {
      category?: string;
      productId?: string;
      orderId?: string;
      channel?: string;
    };
  };
}

/**
 * 分级审批评估结果(需求 3)。
 */
export interface RiskEvaluationResult {
  tier: RiskTier;
  /** 是否命中红线(命中即 deny,不可绕过)。 */
  redline: boolean;
  suggestedAction: 'auto_execute' | 'user_confirmation' | 'deny';
  reason?: string;
  /** 命中的红线规则标识(审计用)。 */
  redlineRule?: string;
  /** medium 档执行预算评估时的底层结果。 */
  policyEvaluation?: PolicyEvaluationResult;
}

/**
 * 策略评估结果
 */
export interface PolicyEvaluationResult {
  authorized: boolean;
  authorizationId?: string;
  reason?: string;
  evaluationDetails: {
    singleLimitCheck?: { passed: boolean; limit?: number; amount: number };
    dailyLimitCheck?: { passed: boolean; limit?: number; usedToday: number; remaining: number };
    monthlyLimitCheck?: { passed: boolean; limit?: number; usedThisMonth: number; remaining: number };
    merchantScopeCheck?: { passed: boolean; allowedMerchants?: string[]; requestedMerchant: string };
    categoryScopeCheck?: { passed: boolean; allowedCategories?: string[]; requestedCategory?: string };
    expiryCheck?: { passed: boolean; expiresAt?: Date };
    policyChecks?: { policyId: string; policyType: string; passed: boolean; details?: any }[];
  };
  suggestedAction?: 'auto_execute' | 'user_confirmation' | 'deny';
  confirmationUrl?: string;
}

/**
 * 策略评估器服务
 * 实现 PRD 中定义的策略评估逻辑
 */
@Injectable()
export class PolicyEvaluatorService {
  private readonly logger = new Logger(PolicyEvaluatorService.name);

  constructor(
    @InjectRepository(Authorization)
    private authorizationRepository: Repository<Authorization>,
    @InjectRepository(Policy)
    private policyRepository: Repository<Policy>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  /**
   * 风险分级(需求 3.1)。
   *
   * 判定顺序(红线优先,不可绕过 —— Property 3):
   *  1. 红线:终端/sudo/自身进程、提权文本、sybil/wash trading/买粉等合规滥用 → redline。
   *  2. 高风险动作类型 或 批量操作 → high。
   *  3. 中风险动作类型 或 导航新域 → medium。
   *  4. 只读动作类型 → read。
   *  5. 未知动作类型 → 默认 high(安全优先,不静默放行)。
   *
   * 纯函数,不访问数据库。
   */
  classifyActionRisk(action: ActionDescriptor): {
    tier: RiskTier;
    redline: boolean;
    redlineCheck: RedlineCheck;
  } {
    // 1. 红线优先(无论动作类型如何归类,命中即 redline,不可绕过)
    const redlineCheck = checkRedline({
      type: action.type,
      targetApp: action.targetApp,
      inputText: action.inputText,
      intent: action.intent,
    });
    if (!redlineCheck.ok) {
      return { tier: 'redline', redline: true, redlineCheck };
    }

    // 2. 高风险:显式高风险类型,或批量操作升级
    if (HIGH_ACTION_TYPES.has(action.type) || action.isBatch) {
      return { tier: 'high', redline: false, redlineCheck };
    }

    // 3. 中风险:显式中风险类型,或导航新域升级
    if (MEDIUM_ACTION_TYPES.has(action.type)) {
      return { tier: 'medium', redline: false, redlineCheck };
    }
    if (action.type === 'navigate' && action.toExternalDomain) {
      return { tier: 'medium', redline: false, redlineCheck };
    }

    // 4. 只读
    if (READ_ACTION_TYPES.has(action.type)) {
      return { tier: 'read', redline: false, redlineCheck };
    }

    // 5. 未知动作:安全优先,按高风险处理(不静默放行)
    return { tier: 'high', redline: false, redlineCheck };
  }

  /**
   * 分级审批评估(需求 3.1/3.2/3.3/3.5)。
   *
   * - redline → 永久拒绝(deny),先于任何策略/授权/预算判定,不可绕过(Property 3)。
   * - read    → 自动放行(auto_execute,无人值守)。
   * - high    → 强制人工确认(user_confirmation)。
   * - medium  → 若提供预算上下文则做策略+预算评估:授权通过 auto_execute,否则回落 user_confirmation;
   *             未提供预算上下文则保守回落 user_confirmation。
   */
  async evaluateActionRisk(action: ActionDescriptor): Promise<RiskEvaluationResult> {
    const { tier, redline, redlineCheck } = this.classifyActionRisk(action);

    // 红线:不可绕过,无视任何授权/策略/预算
    if (redline) {
      this.logger.warn(
        `红线拒绝: type=${action.type} rule=${redlineCheck.rule} reason=${redlineCheck.reason}`,
      );
      return {
        tier: 'redline',
        redline: true,
        suggestedAction: 'deny',
        reason: redlineCheck.reason || 'REDLINE_VIOLATION',
        redlineRule: redlineCheck.rule,
      };
    }

    if (tier === 'read') {
      return { tier, redline: false, suggestedAction: 'auto_execute' };
    }

    if (tier === 'high') {
      return {
        tier,
        redline: false,
        suggestedAction: 'user_confirmation',
        reason: 'HIGH_RISK_REQUIRES_CONFIRMATION',
      };
    }

    // medium:策略 + 预算放行
    if (action.budget) {
      const policyEvaluation = await this.evaluatePolicy(
        action.budget.userId,
        action.budget.agentId,
        action.budget.amount,
        action.budget.merchantId,
        action.budget.options,
      );
      const authorized =
        policyEvaluation.authorized && policyEvaluation.suggestedAction === 'auto_execute';
      return {
        tier,
        redline: false,
        suggestedAction: authorized ? 'auto_execute' : 'user_confirmation',
        reason: authorized ? undefined : policyEvaluation.reason || 'BUDGET_NOT_AUTHORIZED',
        policyEvaluation,
      };
    }

    // medium 但无预算上下文:保守回落人确认
    return {
      tier,
      redline: false,
      suggestedAction: 'user_confirmation',
      reason: 'MEDIUM_RISK_NO_BUDGET_CONTEXT',
    };
  }

  /**
   * 完整策略评估
   * 
   * 评估顺序：
   * 1. 检查是否存在有效授权
   * 2. 检查授权过期时间
   * 3. 检查商户范围
   * 4. 检查类目范围
   * 5. 检查单笔限额
   * 6. 检查日限额
   * 7. 检查月限额
   * 8. 检查用户自定义策略
   */
  async evaluatePolicy(
    userId: string,
    agentId: string,
    amount: number,
    merchantId: string,
    options?: {
      category?: string;
      productId?: string;
      orderId?: string;
      channel?: string;
    }
  ): Promise<PolicyEvaluationResult> {
    const evaluationDetails: PolicyEvaluationResult['evaluationDetails'] = {};

    // 1. 查找有效授权
    const authorizations = await this.authorizationRepository.find({
      where: {
        userId,
        agentId,
        status: AuthorizationStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });

    if (!authorizations || authorizations.length === 0) {
      return {
        authorized: false,
        reason: 'NO_ACTIVE_AUTHORIZATION',
        evaluationDetails,
        suggestedAction: 'user_confirmation',
      };
    }

    // 遍历所有授权，找到第一个满足条件的
    for (const auth of authorizations) {
      const result = await this.evaluateSingleAuthorization(
        auth,
        amount,
        merchantId,
        options
      );
      
      if (result.authorized) {
        return result;
      }
    }

    // 所有授权都不满足条件
    return {
      authorized: false,
      reason: 'NO_MATCHING_AUTHORIZATION',
      evaluationDetails,
      suggestedAction: 'user_confirmation',
    };
  }

  /**
   * 评估单个授权
   */
  private async evaluateSingleAuthorization(
    auth: Authorization,
    amount: number,
    merchantId: string,
    options?: {
      category?: string;
      productId?: string;
      orderId?: string;
    }
  ): Promise<PolicyEvaluationResult> {
    const evaluationDetails: PolicyEvaluationResult['evaluationDetails'] = {
      policyChecks: [],
    };

    // 1. 检查过期时间
    if (auth.expiresAt && auth.expiresAt < new Date()) {
      evaluationDetails.expiryCheck = { passed: false, expiresAt: auth.expiresAt };
      return {
        authorized: false,
        authorizationId: auth.id,
        reason: 'AUTHORIZATION_EXPIRED',
        evaluationDetails,
        suggestedAction: 'user_confirmation',
      };
    }
    evaluationDetails.expiryCheck = { passed: true, expiresAt: auth.expiresAt };

    // 2. 检查商户范围
    if (auth.merchantScope && auth.merchantScope.length > 0) {
      const passed = auth.merchantScope.includes(merchantId);
      evaluationDetails.merchantScopeCheck = {
        passed,
        allowedMerchants: auth.merchantScope,
        requestedMerchant: merchantId,
      };
      if (!passed) {
        return {
          authorized: false,
          authorizationId: auth.id,
          reason: 'MERCHANT_NOT_IN_SCOPE',
          evaluationDetails,
          suggestedAction: 'user_confirmation',
        };
      }
    } else {
      evaluationDetails.merchantScopeCheck = {
        passed: true,
        allowedMerchants: [],
        requestedMerchant: merchantId,
      };
    }

    // 3. 检查类目范围
    if (options?.category && auth.categoryScope && auth.categoryScope.length > 0) {
      const passed = auth.categoryScope.includes(options.category);
      evaluationDetails.categoryScopeCheck = {
        passed,
        allowedCategories: auth.categoryScope,
        requestedCategory: options.category,
      };
      if (!passed) {
        return {
          authorized: false,
          authorizationId: auth.id,
          reason: 'CATEGORY_NOT_IN_SCOPE',
          evaluationDetails,
          suggestedAction: 'user_confirmation',
        };
      }
    } else {
      evaluationDetails.categoryScopeCheck = {
        passed: true,
        allowedCategories: auth.categoryScope || [],
        requestedCategory: options?.category,
      };
    }

    // 4. 检查单笔限额
    if (auth.singleTxLimit) {
      const passed = amount <= Number(auth.singleTxLimit);
      evaluationDetails.singleLimitCheck = {
        passed,
        limit: Number(auth.singleTxLimit),
        amount,
      };
      if (!passed) {
        return {
          authorized: false,
          authorizationId: auth.id,
          reason: 'EXCEEDS_SINGLE_TX_LIMIT',
          evaluationDetails,
          suggestedAction: 'user_confirmation',
        };
      }
    } else {
      evaluationDetails.singleLimitCheck = { passed: true, amount };
    }

    // 5. 检查日限额
    if (auth.dailyLimit) {
      const usedToday = await this.getDailyUsage(auth.userId, auth.agentId);
      const remaining = Number(auth.dailyLimit) - usedToday;
      const passed = amount <= remaining;
      
      evaluationDetails.dailyLimitCheck = {
        passed,
        limit: Number(auth.dailyLimit),
        usedToday,
        remaining: Math.max(0, remaining),
      };
      
      if (!passed) {
        return {
          authorized: false,
          authorizationId: auth.id,
          reason: 'EXCEEDS_DAILY_LIMIT',
          evaluationDetails,
          suggestedAction: 'user_confirmation',
        };
      }
    } else {
      evaluationDetails.dailyLimitCheck = {
        passed: true,
        usedToday: 0,
        remaining: Infinity,
      };
    }

    // 6. 检查月限额
    if (auth.monthlyLimit) {
      const usedThisMonth = await this.getMonthlyUsage(auth.userId, auth.agentId);
      const remaining = Number(auth.monthlyLimit) - usedThisMonth;
      const passed = amount <= remaining;
      
      evaluationDetails.monthlyLimitCheck = {
        passed,
        limit: Number(auth.monthlyLimit),
        usedThisMonth,
        remaining: Math.max(0, remaining),
      };
      
      if (!passed) {
        return {
          authorized: false,
          authorizationId: auth.id,
          reason: 'EXCEEDS_MONTHLY_LIMIT',
          evaluationDetails,
          suggestedAction: 'user_confirmation',
        };
      }
    } else {
      evaluationDetails.monthlyLimitCheck = {
        passed: true,
        usedThisMonth: 0,
        remaining: Infinity,
      };
    }

    // 7. 检查用户自定义策略
    const userPolicies = await this.policyRepository.find({
      where: { userId: auth.userId, enabled: true },
    });

    for (const policy of userPolicies) {
      const policyResult = await this.evaluateCustomPolicy(policy, {
        amount,
        merchantId,
        category: options?.category,
        agentId: auth.agentId,
      });
      
      evaluationDetails.policyChecks?.push({
        policyId: policy.id,
        policyType: policy.type,
        passed: policyResult.passed,
        details: policyResult.details,
      });

      if (!policyResult.passed) {
        return {
          authorized: false,
          authorizationId: auth.id,
          reason: `POLICY_VIOLATION: ${policy.name}`,
          evaluationDetails,
          suggestedAction: 'user_confirmation',
        };
      }
    }

    // 所有检查通过
    this.logger.log(`策略评估通过: userId=${auth.userId}, agentId=${auth.agentId}, amount=${amount}`);
    
    return {
      authorized: true,
      authorizationId: auth.id,
      evaluationDetails,
      suggestedAction: 'auto_execute',
    };
  }

  /**
   * 评估自定义策略
   */
  private async evaluateCustomPolicy(
    policy: Policy,
    context: {
      amount: number;
      merchantId: string;
      category?: string;
      agentId?: string;
    }
  ): Promise<{ passed: boolean; details?: any }> {
    const value = policy.value;

    switch (policy.type) {
      case PolicyType.DAILY_LIMIT:
        // 额外的日限额策略（可能是针对特定商户或类目的）
        if (value.limit && context.amount > value.limit) {
          return { passed: false, details: { limit: value.limit, amount: context.amount } };
        }
        return { passed: true };

      case PolicyType.SINGLE_LIMIT:
        // 单笔限额策略
        if (value.limit && context.amount > value.limit) {
          return { passed: false, details: { limit: value.limit, amount: context.amount } };
        }
        return { passed: true };

      case PolicyType.PROTOCOL_WHITELIST:
        // 协议白名单（如只允许特定 DeFi 协议）
        if (value.protocols && value.protocols.length > 0) {
          // TODO: 从交易上下文中获取协议信息
          return { passed: true };
        }
        return { passed: true };

      case PolicyType.ACTION_WHITELIST:
        // 操作白名单
        if (value.actions && value.actions.length > 0) {
          // TODO: 检查操作类型
          return { passed: true };
        }
        return { passed: true };

      case PolicyType.AUTO_CLAIM_AIRDROP:
        // 自动领取空投的策略
        return { passed: true };

      default:
        return { passed: true };
    }
  }

  /**
   * 获取今日已使用额度
   */
  private async getDailyUsage(userId: string, agentId?: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const whereClause: any = {
      userId,
      status: PaymentStatus.COMPLETED,
      createdAt: Between(today, tomorrow),
    };

    if (agentId) {
      whereClause.agentId = agentId;
    }

    const payments = await this.paymentRepository.find({
      where: whereClause,
      select: ['amount'],
    });

    return payments.reduce((sum, p) => sum + Number(p.amount), 0);
  }

  /**
   * 获取本月已使用额度
   */
  private async getMonthlyUsage(userId: string, agentId?: string): Promise<number> {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const whereClause: any = {
      userId,
      status: PaymentStatus.COMPLETED,
      createdAt: Between(firstDayOfMonth, firstDayOfNextMonth),
    };

    if (agentId) {
      whereClause.agentId = agentId;
    }

    const payments = await this.paymentRepository.find({
      where: whereClause,
      select: ['amount'],
    });

    return payments.reduce((sum, p) => sum + Number(p.amount), 0);
  }

  /**
   * 创建快速评估（用于 UI 展示剩余额度）
   */
  async getQuickEvaluation(userId: string, agentId?: string): Promise<{
    hasActiveAuth: boolean;
    dailyRemaining: number;
    monthlyRemaining: number;
    singleLimit: number;
  }> {
    const auth = await this.authorizationRepository.findOne({
      where: {
        userId,
        agentId: agentId || undefined,
        status: AuthorizationStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });

    if (!auth) {
      return {
        hasActiveAuth: false,
        dailyRemaining: 0,
        monthlyRemaining: 0,
        singleLimit: 0,
      };
    }

    const dailyUsage = await this.getDailyUsage(userId, agentId);
    const monthlyUsage = await this.getMonthlyUsage(userId, agentId);

    return {
      hasActiveAuth: true,
      dailyRemaining: Math.max(0, Number(auth.dailyLimit || 0) - dailyUsage),
      monthlyRemaining: Math.max(0, Number(auth.monthlyLimit || 0) - monthlyUsage),
      singleLimit: Number(auth.singleTxLimit || 0),
    };
  }
}
