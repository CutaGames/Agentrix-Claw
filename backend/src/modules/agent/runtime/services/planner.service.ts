/**
 * Planner Service - P2: Plan-Act-Observe 循环
 * 
 * 核心功能：
 * 1. 将复杂用户意图拆解为可执行的子任务序列
 * 2. 根据上一个 Skill 的执行结果，动态调整后续计划
 * 3. 支持自主决策（如库存不足时寻找替代品）
 */

import { Injectable, Logger } from '@nestjs/common';
import { SkillsRegistry } from './skills-registry.service';
import { MemoryService } from './memory.service';
import { MemoryType } from '../../../../entities/agent-memory.entity';

export interface PlanStep {
  id: string;
  skillId: string;
  description: string;
  input: Record<string, any>;
  dependsOn?: string[];  // 依赖的前置步骤 ID
  condition?: string;    // 执行条件
  fallback?: string;     // 失败时的备选 skillId
}

export interface Plan {
  id: string;
  sessionId: string;
  intent: string;
  steps: PlanStep[];
  currentStepIndex: number;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'replanning';
  context: Record<string, any>;
  history: PlanExecutionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanExecutionRecord {
  stepId: string;
  skillId: string;
  input: Record<string, any>;
  output: any;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export interface PlanResult {
  success: boolean;
  plan?: Plan;
  output?: any;
  error?: string;
  needsUserInput?: boolean;
  userPrompt?: string;
}

// 意图模式匹配规则
interface IntentPattern {
  pattern: RegExp;
  intentType: string;
  extractParams: (match: RegExpMatchArray, text: string) => Record<string, any>;
}

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private plans: Map<string, Plan> = new Map();

  // 意图识别模式
  private readonly intentPatterns: IntentPattern[] = [
    {
      pattern: /(?:帮我|请|我想|我要)?(?:搜索|查找|找|搜)(.+?)(?:并|然后|,|，)?(?:买|购买|下单)?/i,
      intentType: 'search_and_buy',
      extractParams: (match, text) => ({
        query: match[1]?.trim(),
        wantToBuy: /买|购买|下单/.test(text),
      }),
    },
    {
      pattern: /(?:帮我|请)?(?:对比|比较)(.+?)(?:的)?(?:优缺点|价格|性能)?/i,
      intentType: 'compare_products',
      extractParams: (match) => ({
        products: match[1]?.trim().split(/和|与|,|，/),
      }),
    },
    {
      pattern: /(?:帮我|请)?(?:调研|研究|了解)(.+)/i,
      intentType: 'research',
      extractParams: (match) => ({
        topic: match[1]?.trim(),
      }),
    },
    {
      pattern: /(?:查看|查询|看看)?(?:我的)?(?:资产|余额|钱包)/i,
      intentType: 'asset_overview',
      extractParams: () => ({}),
    },
    {
      pattern: /(?:领取|获取)?(?:空投|airdrop)/i,
      intentType: 'airdrop_claim',
      extractParams: () => ({}),
    },
  ];

  constructor(
    private readonly skillsRegistry: SkillsRegistry,
    private readonly memoryService: MemoryService,
  ) {}

  /**
   * 分析用户意图并生成执行计划
   */
  async createPlan(sessionId: string, userIntent: string, context: Record<string, any> = {}): Promise<PlanResult> {
    this.logger.log(`Creating plan for intent: ${userIntent}`);

    // 1. 意图识别
    const intentAnalysis = this.analyzeIntent(userIntent);
    
    if (!intentAnalysis) {
      return {
        success: false,
        error: '无法理解您的意图，请尝试更具体的描述',
      };
    }

    // 2. 生成计划步骤
    const steps = this.generateSteps(intentAnalysis.intentType, intentAnalysis.params, context);

    if (steps.length === 0) {
      return {
        success: false,
        error: '无法为该意图生成执行计划',
      };
    }

    // 3. 创建计划对象
    const plan: Plan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      intent: userIntent,
      steps,
      currentStepIndex: 0,
      status: 'executing',
      context: { ...context, ...intentAnalysis.params },
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.plans.set(plan.id, plan);

    // 保存到 Memory
    await this.memoryService.saveMemory(
      sessionId,
      MemoryType.WORKFLOW,
      `active_plan_${plan.id}`,
      { planId: plan.id, intent: userIntent },
    );

    return {
      success: true,
      plan,
    };
  }

  /**
   * 执行计划的下一步
   */
  async executeNextStep(planId: string, stepInput?: Record<string, any>): Promise<PlanResult> {
    const plan = this.plans.get(planId);

    if (!plan) {
      return { success: false, error: `Plan not found: ${planId}` };
    }

    if (plan.status === 'completed' || plan.status === 'failed') {
      return { success: true, plan, output: plan.context };
    }

    if (plan.currentStepIndex >= plan.steps.length) {
      plan.status = 'completed';
      plan.updatedAt = new Date();
      return { success: true, plan, output: plan.context };
    }

    const step = plan.steps[plan.currentStepIndex];

    // 检查依赖条件
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        const depRecord = plan.history.find(h => h.stepId === depId);
        if (!depRecord || !depRecord.success) {
          return {
            success: false,
            error: `依赖步骤 ${depId} 未完成或失败`,
            plan,
          };
        }
      }
    }

    // 准备输入参数
    const input = this.resolveInput(step.input, plan.context, stepInput);

    try {
      // 执行 Skill
      const result = await this.skillsRegistry.executeSkill(
        step.skillId,
        input,
        {
          sessionId: plan.sessionId,
          memory: this.memoryService,
          workflow: null as any,
        },
      );

      // 记录执行历史
      const record: PlanExecutionRecord = {
        stepId: step.id,
        skillId: step.skillId,
        input,
        output: result.data,
        success: result.success,
        error: result.error,
        timestamp: new Date(),
      };
      plan.history.push(record);

      if (!result.success) {
        // 尝试 fallback
        if (step.fallback) {
          this.logger.log(`Step ${step.id} failed, trying fallback: ${step.fallback}`);
          return this.executeFallback(plan, step, input);
        }

        // 尝试重新规划
        const replanResult = await this.replan(plan, step, result.error || 'Unknown error');
        if (replanResult) {
          return this.executeNextStep(planId);
        }

        plan.status = 'failed';
        plan.updatedAt = new Date();
        return { success: false, error: result.error, plan };
      }

      // 更新上下文
      if (result.data) {
        Object.assign(plan.context, this.extractContextFromResult(step.id, result.data));
      }

      // 移动到下一步
      plan.currentStepIndex += 1;
      plan.updatedAt = new Date();

      // 检查是否完成
      if (plan.currentStepIndex >= plan.steps.length) {
        plan.status = 'completed';
        return { success: true, plan, output: plan.context };
      }

      // 检查下一步是否需要用户输入
      const nextStep = plan.steps[plan.currentStepIndex];
      if (this.needsUserInput(nextStep, plan.context)) {
        return {
          success: true,
          plan,
          needsUserInput: true,
          userPrompt: this.generateUserPrompt(nextStep, plan.context),
        };
      }

      // 继续执行下一步
      return this.executeNextStep(planId);

    } catch (error: any) {
      this.logger.error(`Error executing step ${step.id}: ${error.message}`);
      plan.status = 'failed';
      plan.updatedAt = new Date();
      return { success: false, error: error.message, plan };
    }
  }

  /**
   * 意图分析
   */
  private analyzeIntent(text: string): { intentType: string; params: Record<string, any> } | null {
    for (const pattern of this.intentPatterns) {
      const match = text.match(pattern.pattern);
      if (match) {
        return {
          intentType: pattern.intentType,
          params: pattern.extractParams(match, text),
        };
      }
    }

    // 默认意图：通用查询
    return {
      intentType: 'general_query',
      params: { query: text },
    };
  }

  /**
   * 根据意图类型生成执行步骤
   */
  private generateSteps(intentType: string, params: Record<string, any>, context: Record<string, any>): PlanStep[] {
    switch (intentType) {
      case 'search_and_buy':
        return this.generateSearchAndBuySteps(params);
      case 'compare_products':
        return this.generateCompareSteps(params);
      case 'research':
        return this.generateResearchSteps(params);
      case 'asset_overview':
        return this.generateAssetOverviewSteps(params);
      case 'airdrop_claim':
        return this.generateAirdropSteps(params);
      case 'general_query':
        return this.generateGeneralQuerySteps(params);
      default:
        return [];
    }
  }

  private generateSearchAndBuySteps(params: Record<string, any>): PlanStep[] {
    const steps: PlanStep[] = [
      {
        id: 'search',
        skillId: 'product-search',
        description: `搜索商品: ${params.query}`,
        input: { query: params.query },
      },
    ];

    if (params.wantToBuy) {
      steps.push({
        id: 'select',
        skillId: 'add-to-cart',
        description: '将选中的商品加入购物车',
        input: { productId: '{{selectedProductId}}', quantity: 1 },
        dependsOn: ['search'],
      });
      steps.push({
        id: 'checkout',
        skillId: 'checkout',
        description: '结账',
        input: {},
        dependsOn: ['select'],
      });
    }

    return steps;
  }

  private generateCompareSteps(params: Record<string, any>): PlanStep[] {
    const products = params.products || [];
    const steps: PlanStep[] = [];

    // 为每个产品创建搜索步骤
    products.forEach((product: string, index: number) => {
      steps.push({
        id: `search_${index}`,
        skillId: 'product-search',
        description: `搜索: ${product}`,
        input: { query: product.trim() },
      });
    });

    return steps;
  }

  private generateResearchSteps(params: Record<string, any>): PlanStep[] {
    return [
      {
        id: 'search',
        skillId: 'product-search',
        description: `调研: ${params.topic}`,
        input: { query: params.topic },
      },
    ];
  }

  private generateAssetOverviewSteps(params: Record<string, any>): PlanStep[] {
    return [
      {
        id: 'asset_overview',
        skillId: 'asset_overview',
        description: '获取资产总览',
        input: {},
      },
    ];
  }

  private generateAirdropSteps(params: Record<string, any>): PlanStep[] {
    return [
      {
        id: 'discover',
        skillId: 'airdrop_discover',
        description: '发现可领取的空投',
        input: {},
      },
      {
        id: 'claim',
        skillId: 'airdrop_claim',
        description: '领取空投',
        input: { airdropId: '{{discoveredAirdropId}}' },
        dependsOn: ['discover'],
      },
    ];
  }

  private generateGeneralQuerySteps(params: Record<string, any>): PlanStep[] {
    return [
      {
        id: 'search',
        skillId: 'product-search',
        description: `查询: ${params.query}`,
        input: { query: params.query },
      },
    ];
  }

  /**
   * 重新规划（根据失败原因调整计划）
   */
  private async replan(plan: Plan, failedStep: PlanStep, error: string): Promise<boolean> {
    this.logger.log(`Replanning due to error: ${error}`);
    plan.status = 'replanning';

    // 库存不足 -> 搜索替代品
    if (error.includes('库存不足') || error.includes('out of stock')) {
      const alternativeStep: PlanStep = {
        id: `alternative_${failedStep.id}`,
        skillId: 'product-search',
        description: '搜索替代商品',
        input: { query: `${plan.context.query} 替代品` },
      };
      
      // 插入替代步骤
      plan.steps.splice(plan.currentStepIndex, 0, alternativeStep);
      plan.status = 'executing';
      return true;
    }

    // 价格超出预算 -> 搜索更便宜的
    if (error.includes('超出预算') || error.includes('too expensive')) {
      const cheaperStep: PlanStep = {
        id: `cheaper_${failedStep.id}`,
        skillId: 'product-search',
        description: '搜索更便宜的商品',
        input: { query: `${plan.context.query} 便宜`, priceMax: plan.context.budget },
      };
      
      plan.steps.splice(plan.currentStepIndex, 0, cheaperStep);
      plan.status = 'executing';
      return true;
    }

    return false;
  }

  /**
   * 执行 fallback 技能
   */
  private async executeFallback(plan: Plan, step: PlanStep, input: Record<string, any>): Promise<PlanResult> {
    if (!step.fallback) {
      return { success: false, error: 'No fallback available', plan };
    }

    const result = await this.skillsRegistry.executeSkill(
      step.fallback,
      input,
      {
        sessionId: plan.sessionId,
        memory: this.memoryService,
        workflow: null as any,
      },
    );

    const record: PlanExecutionRecord = {
      stepId: `${step.id}_fallback`,
      skillId: step.fallback,
      input,
      output: result.data,
      success: result.success,
      error: result.error,
      timestamp: new Date(),
    };
    plan.history.push(record);

    if (result.success) {
      if (result.data) {
        Object.assign(plan.context, this.extractContextFromResult(step.id, result.data));
      }
      plan.currentStepIndex += 1;
      plan.updatedAt = new Date();
      return this.executeNextStep(plan.id);
    }

    plan.status = 'failed';
    return { success: false, error: result.error, plan };
  }

  /**
   * 解析输入参数中的模板变量
   */
  private resolveInput(
    template: Record<string, any>,
    context: Record<string, any>,
    stepInput?: Record<string, any>,
  ): Record<string, any> {
    const merged = { ...context, ...stepInput };
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const varName = value.slice(2, -2);
        resolved[key] = merged[varName];
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 从执行结果中提取上下文变量
   */
  private extractContextFromResult(stepId: string, data: any): Record<string, any> {
    const context: Record<string, any> = {};
    context[`${stepId}_result`] = data;

    // 特殊处理：搜索结果
    if (data.products && Array.isArray(data.products)) {
      context.products = data.products;
      if (data.products.length > 0) {
        context.firstProduct = data.products[0];
        context.selectedProductId = data.products[0].id;
      }
    }

    // 特殊处理：空投发现
    if (data.airdrops && Array.isArray(data.airdrops) && data.airdrops.length > 0) {
      context.discoveredAirdropId = data.airdrops[0].id;
    }

    return context;
  }

  /**
   * 检查步骤是否需要用户输入
   */
  private needsUserInput(step: PlanStep, context: Record<string, any>): boolean {
    // 检查输入参数中是否有未解析的模板变量
    for (const value of Object.values(step.input)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const varName = value.slice(2, -2);
        if (context[varName] === undefined) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 生成用户提示
   */
  private generateUserPrompt(step: PlanStep, context: Record<string, any>): string {
    if (step.skillId === 'add-to-cart' && context.products) {
      const productList = context.products
        .slice(0, 5)
        .map((p: any, i: number) => `${i + 1}. ${p.name} - ¥${p.price}`)
        .join('\n');
      return `找到以下商品，请选择要购买的商品编号：\n${productList}`;
    }
    return `请提供 ${step.description} 所需的信息`;
  }

  /**
   * 获取计划状态
   */
  getPlan(planId: string): Plan | undefined {
    return this.plans.get(planId);
  }

  /**
   * 提供用户输入并继续执行
   */
  async provideUserInput(planId: string, input: Record<string, any>): Promise<PlanResult> {
    const plan = this.plans.get(planId);
    if (!plan) {
      return { success: false, error: `Plan not found: ${planId}` };
    }

    // 更新上下文
    Object.assign(plan.context, input);

    // 继续执行
    return this.executeNextStep(planId);
  }
}
