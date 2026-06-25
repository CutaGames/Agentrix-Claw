import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';

/**
 * 用户使用模式分析和转化引导服务
 * 
 * 核心功能:
 * 1. 记录用户调用历史
 * 2. 分析使用模式
 * 3. 生成个性化引导建议
 */

// ============ 类型定义 ============

export interface UsageHint {
  key: string;
  type: 'upgrade' | 'marketplace' | 'pattern' | 'welcome';
  priority: 'low' | 'medium' | 'high';
  message: string;
  messageZh: string;
  action: string;
  actionZh: string;
  link: string;
  suggestedConfig?: {
    productType?: string;
    fee?: string;
    splitRules?: Array<{ role: string; share: string }>;
  };
  dismissible: boolean;
  expiresAt?: Date;
}

export interface CallRecord {
  userId: string;
  action: string;
  params: Record<string, any>;
  timestamp: Date;
}

export interface UsageStats {
  totalCalls: number;
  callsLast7Days: number;
  uniqueActions: string[];
  patterns: string[];
}

// ============ 模式检测规则 ============

interface PatternRule {
  name: string;
  detector: (calls: CallRecord[]) => boolean;
  hint: UsageHint;
}

const PATTERN_RULES: PatternRule[] = [
  // 规则1: 创作者分成模式
  {
    name: 'creator_split',
    detector: (calls) => {
      const splitCalls = calls.filter(c => 
        c.action === 'split' || c.action === 'createSplitPlan'
      );
      return splitCalls.some(c => {
        const rules = c.params?.rules || c.params?.recipients || [];
        return rules.some((r: any) => 
          ['creator', 'developer', 'author', 'artist'].includes(r.role?.toLowerCase())
        );
      });
    },
    hint: {
      key: 'creator_split',
      type: 'marketplace',
      priority: 'high',
      message: 'You are using a "Creator Split" model. Publish to Marketplace for more exposure!',
      messageZh: '您正在使用「创作者分成」模式，发布到Marketplace可获得更多曝光和自动推广',
      action: 'Publish Now',
      actionZh: '一键发布',
      link: '/publish?template=creator-split',
      suggestedConfig: {
        productType: 'virtual',
        fee: '3%',
        splitRules: [
          { role: 'creator', share: '70%' },
          { role: 'promoter', share: '30%' },
        ],
      },
      dismissible: true,
    },
  },

  // 规则2: 里程碑付款模式
  {
    name: 'milestone_project',
    detector: (calls) => {
      const hasBudgetPool = calls.some(c => c.action === 'createBudgetPool');
      const milestoneCount = calls.filter(c => 
        c.action === 'createMilestone' || c.action === 'addMilestone'
      ).length;
      return hasBudgetPool && milestoneCount >= 2;
    },
    hint: {
      key: 'milestone_project',
      type: 'marketplace',
      priority: 'high',
      message: 'Managing a multi-phase project? Publish as "Project Service" to auto-match executors!',
      messageZh: '您正在管理多阶段项目，发布为「项目制服务」可自动匹配执行者',
      action: 'Publish Project',
      actionZh: '发布项目',
      link: '/publish?template=project',
      suggestedConfig: {
        productType: 'service',
        fee: '5%',
      },
      dismissible: true,
    },
  },

  // 规则3: 订阅/会员模式
  {
    name: 'subscription_model',
    detector: (calls) => {
      return calls.some(c => 
        c.action === 'createSubscription' ||
        c.params?.recurring === true ||
        c.params?.billingCycle
      );
    },
    hint: {
      key: 'subscription_model',
      type: 'marketplace',
      priority: 'medium',
      message: 'Subscription model detected. List on Marketplace for recurring revenue!',
      messageZh: '检测到订阅模式，发布到Marketplace可获得持续收入',
      action: 'Create Subscription Product',
      actionZh: '创建订阅商品',
      link: '/publish?template=subscription',
      suggestedConfig: {
        productType: 'subscription',
        fee: '5%',
      },
      dismissible: true,
    },
  },

  // 规则4: Agent任务分配模式
  {
    name: 'agent_task_distribution',
    detector: (calls) => {
      const taskCalls = calls.filter(c => 
        c.action === 'assignTask' || 
        c.action === 'distributeReward' ||
        c.params?.agentId
      );
      const uniqueAgents = new Set(taskCalls.map(c => c.params?.agentId).filter(Boolean));
      return uniqueAgents.size >= 3;
    },
    hint: {
      key: 'agent_task_distribution',
      type: 'marketplace',
      priority: 'medium',
      message: 'Multi-agent collaboration detected. Create an Agent Task marketplace listing!',
      messageZh: '检测到多Agent协作，创建Agent任务可吸引更多执行者',
      action: 'Create Agent Task',
      actionZh: '创建Agent任务',
      link: '/publish?template=agent-task',
      suggestedConfig: {
        productType: 'agent_task',
        fee: '5%',
      },
      dismissible: true,
    },
  },
];

// ============ 使用频率规则 ============

interface FrequencyRule {
  name: string;
  threshold: number;
  periodDays: number;
  hint: UsageHint;
}

const FREQUENCY_RULES: FrequencyRule[] = [
  {
    name: 'high_frequency_user',
    threshold: 10,
    periodDays: 7,
    hint: {
      key: 'high_frequency_user',
      type: 'upgrade',
      priority: 'medium',
      message: 'You\'ve made {count} calls in {days} days. Integrate SDK for batch discounts!',
      messageZh: '您已在{days}天内调用{count}次，接入SDK可享受批量折扣和更低延迟',
      action: 'View SDK Docs',
      actionZh: '查看SDK文档',
      link: '/docs/sdk',
      dismissible: true,
    },
  },
  {
    name: 'power_user',
    threshold: 50,
    periodDays: 30,
    hint: {
      key: 'power_user',
      type: 'upgrade',
      priority: 'high',
      message: 'Power user detected! Contact us for enterprise pricing.',
      messageZh: '检测到高频使用，联系我们获取企业定价方案',
      action: 'Contact Sales',
      actionZh: '联系销售',
      link: '/enterprise',
      dismissible: true,
    },
  },
];

// ============ 服务实现 ============

@Injectable()
export class UsagePatternService {
  private readonly logger = new Logger(UsagePatternService.name);
  
  // 内存缓存 (生产环境应使用Redis)
  private callHistory = new Map<string, CallRecord[]>();
  private dismissedHints = new Map<string, Set<string>>();

  /**
   * 记录用户调用
   */
  recordCall(userId: string, action: string, params: Record<string, any>): void {
    const record: CallRecord = {
      userId,
      action,
      params,
      timestamp: new Date(),
    };

    const history = this.callHistory.get(userId) || [];
    history.push(record);
    
    // 只保留最近100条记录
    if (history.length > 100) {
      history.shift();
    }
    
    this.callHistory.set(userId, history);
    this.logger.debug(`Recorded call: ${userId} -> ${action}`);
  }

  /**
   * 获取用户使用统计
   */
  getUsageStats(userId: string): UsageStats {
    const history = this.callHistory.get(userId) || [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const recentCalls = history.filter(c => c.timestamp > sevenDaysAgo);
    const uniqueActions = [...new Set(history.map(c => c.action))];
    const patterns = this.detectPatterns(history);

    return {
      totalCalls: history.length,
      callsLast7Days: recentCalls.length,
      uniqueActions,
      patterns,
    };
  }

  /**
   * 检测使用模式
   */
  private detectPatterns(calls: CallRecord[]): string[] {
    const patterns: string[] = [];
    
    for (const rule of PATTERN_RULES) {
      if (rule.detector(calls)) {
        patterns.push(rule.name);
      }
    }
    
    return patterns;
  }

  /**
   * 生成引导建议
   */
  generateHints(userId: string, currentAction?: string): UsageHint | null {
    const history = this.callHistory.get(userId) || [];
    const dismissed = this.dismissedHints.get(userId) || new Set();

    // 1. 首次使用欢迎
    if (history.length === 1) {
      return {
        key: 'welcome',
        type: 'welcome',
        priority: 'low',
        message: 'Welcome to Commerce Skill! Explore more capabilities...',
        messageZh: '欢迎使用Commerce Skill！探索更多支付和分账能力...',
        action: 'Explore',
        actionZh: '探索功能',
        link: '/docs/commerce-skill',
        dismissible: true,
      };
    }

    // 2. 检查模式匹配
    for (const rule of PATTERN_RULES) {
      if (dismissed.has(rule.name)) continue;
      
      if (rule.detector(history)) {
        this.logger.log(`Pattern detected for ${userId}: ${rule.name}`);
        return rule.hint;
      }
    }

    // 3. 检查使用频率
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCalls = history.filter(c => c.timestamp > sevenDaysAgo);

    for (const rule of FREQUENCY_RULES) {
      if (dismissed.has(rule.name)) continue;
      
      const periodStart = new Date(Date.now() - rule.periodDays * 24 * 60 * 60 * 1000);
      const periodCalls = history.filter(c => c.timestamp > periodStart);
      
      if (periodCalls.length >= rule.threshold) {
        // 替换模板变量
        const hint = { ...rule.hint };
        hint.message = hint.message
          .replace('{count}', periodCalls.length.toString())
          .replace('{days}', rule.periodDays.toString());
        hint.messageZh = hint.messageZh
          .replace('{count}', periodCalls.length.toString())
          .replace('{days}', rule.periodDays.toString());
        
        return hint;
      }
    }

    return null;
  }

  /**
   * 用户关闭提示
   */
  dismissHint(userId: string, hintType: string): void {
    const dismissed = this.dismissedHints.get(userId) || new Set();
    dismissed.add(hintType);
    this.dismissedHints.set(userId, dismissed);
  }

  /**
   * 获取推荐的商品化配置
   */
  getSuggestedMarketplaceConfig(userId: string): {
    productType: string;
    suggestedFee: string;
    splitRules: Array<{ role: string; share: string }>;
    template: string;
  } | null {
    const history = this.callHistory.get(userId) || [];
    
    // 分析最常见的分账角色
    const roleCount = new Map<string, number>();
    const shareSum = new Map<string, number>();
    
    for (const call of history) {
      const rules = call.params?.rules || call.params?.recipients || [];
      for (const rule of rules) {
        if (rule.role) {
          roleCount.set(rule.role, (roleCount.get(rule.role) || 0) + 1);
          shareSum.set(rule.role, (shareSum.get(rule.role) || 0) + (rule.share || rule.shareBps || 0));
        }
      }
    }

    if (roleCount.size === 0) return null;

    // 计算平均分成
    const splitRules: Array<{ role: string; share: string }> = [];
    for (const [role, count] of roleCount) {
      const avgShare = Math.round((shareSum.get(role) || 0) / count);
      const sharePercent = avgShare > 100 ? avgShare / 100 : avgShare; // 处理bps和百分比
      splitRules.push({ role, share: `${sharePercent}%` });
    }

    // 根据模式选择商品类型
    const patterns = this.detectPatterns(history);
    let productType = 'virtual';
    let template = 'default';

    if (patterns.includes('creator_split')) {
      productType = 'virtual';
      template = 'creator-split';
    } else if (patterns.includes('milestone_project')) {
      productType = 'service';
      template = 'project';
    } else if (patterns.includes('subscription_model')) {
      productType = 'subscription';
      template = 'subscription';
    } else if (patterns.includes('agent_task_distribution')) {
      productType = 'agent_task';
      template = 'agent-task';
    }

    // 根据商品类型推荐费率
    const feeMap: Record<string, string> = {
      physical: '3%',
      service: '5%',
      virtual: '3%',
      nft: '2.5%',
      skill: '10%',
      subscription: '5%',
      agent_task: '5%',
    };

    return {
      productType,
      suggestedFee: feeMap[productType] || '5%',
      splitRules,
      template,
    };
  }
}

export default UsagePatternService;
