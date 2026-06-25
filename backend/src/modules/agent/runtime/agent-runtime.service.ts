import { Injectable } from '@nestjs/common';
import { MemoryService } from './services/memory.service';
import { WorkflowEngine } from './services/workflow-engine.service';
import { SkillsRegistry } from './services/skills-registry.service';
import { PlannerService } from './services/planner.service';

/**
 * AgentRuntime - Runtime 架构的核心服务
 * 整合 Memory、Workflow、Skills、Planner 四大系统
 * 
 * P2 增强：Plan-Act-Observe 循环
 * - Planner: 将复杂意图拆解为子任务序列
 * - 支持根据执行结果动态调整计划
 */
@Injectable()
export class AgentRuntime {
  constructor(
    public readonly memory: MemoryService,
    public readonly workflow: WorkflowEngine,
    public readonly skills: SkillsRegistry,
    public readonly planner: PlannerService,
  ) {}

  /**
   * 处理用户意图（Plan-Act-Observe 入口）
   */
  async processIntent(sessionId: string, userIntent: string, context: Record<string, any> = {}) {
    // 1. Plan: 创建执行计划
    const planResult = await this.planner.createPlan(sessionId, userIntent, context);
    
    if (!planResult.success || !planResult.plan) {
      return {
        success: false,
        error: planResult.error,
        message: planResult.error,
      };
    }

    // 2. Act: 执行计划
    const executeResult = await this.planner.executeNextStep(planResult.plan.id);

    // 3. Observe: 返回结果，可能需要用户输入
    return {
      success: executeResult.success,
      planId: planResult.plan.id,
      status: executeResult.plan?.status,
      output: executeResult.output,
      needsUserInput: executeResult.needsUserInput,
      userPrompt: executeResult.userPrompt,
      error: executeResult.error,
    };
  }

  /**
   * 继续执行计划（用户提供输入后）
   */
  async continueWithInput(planId: string, userInput: Record<string, any>) {
    return this.planner.provideUserInput(planId, userInput);
  }
}

