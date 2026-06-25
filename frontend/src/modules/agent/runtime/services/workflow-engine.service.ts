import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentWorkflow, WorkflowStatus } from '../../../../entities/agent-workflow.entity';
import { MemoryType } from '../../../../entities/agent-memory.entity';
import {
  IWorkflowEngine,
  WorkflowDefinition,
  WorkflowState,
  WorkflowResult,
  WorkflowStep,
} from '../interfaces/workflow.interface';
import { SkillsRegistry } from './skills-registry.service';
import { MemoryService } from './memory.service';

@Injectable()
export class WorkflowEngine implements IWorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private intentToWorkflow: Map<string, WorkflowDefinition> = new Map();

  constructor(
    @InjectRepository(AgentWorkflow)
    private workflowRepository: Repository<AgentWorkflow>,
    private skillsRegistry: SkillsRegistry,
    private memoryService: MemoryService,
  ) {}

  registerWorkflow(definition: WorkflowDefinition): void {
    if (this.workflows.has(definition.id)) {
      this.logger.warn(`Workflow ${definition.id} already registered, overwriting...`);
    }

    this.workflows.set(definition.id, definition);

    // 注册意图映射
    if (definition.triggers) {
      for (const intent of definition.triggers) {
        if (this.intentToWorkflow.has(intent)) {
          this.logger.warn(`Intent ${intent} already mapped to another workflow, overwriting...`);
        }
        this.intentToWorkflow.set(intent, definition);
      }
    }

    this.logger.log(`Workflow registered: ${definition.id} (${definition.name})`);
  }

  async startWorkflow(
    sessionId: string,
    workflowId: string,
    initialContext: Record<string, any> = {},
  ): Promise<WorkflowResult> {
    const definition = this.workflows.get(workflowId);

    if (!definition) {
      return {
        success: false,
        error: `Workflow not found: ${workflowId}`,
        workflowState: null as any,
      };
    }

    // 检查是否有进行中的流程
    const existing = await this.getWorkflowState(sessionId, workflowId);
    if (existing && existing.status === WorkflowStatus.ACTIVE) {
      this.logger.warn(`Workflow ${workflowId} already active for session ${sessionId}, resuming...`);
      return this.resumeWorkflow(existing.id);
    }

    // 创建新的流程状态
    const workflowState = this.workflowRepository.create({
      sessionId,
      workflowId,
      currentStepIndex: 0,
      status: WorkflowStatus.ACTIVE,
      context: initialContext,
    });

    const saved = await this.workflowRepository.save(workflowState);

    // 保存到 Memory
    await this.memoryService.saveMemory(
      sessionId,
      MemoryType.WORKFLOW,
      `active_workflow_${workflowId}`,
      {
        workflowStateId: saved.id,
        workflowId,
        currentStepIndex: 0,
      },
    );

    // 执行第一步
    return this.executeNextStep(saved.id);
  }

  async executeNextStep(workflowStateId: string, stepInput?: Record<string, any>): Promise<WorkflowResult> {
    const workflowState = await this.workflowRepository.findOne({
      where: { id: workflowStateId },
    });

    if (!workflowState) {
      return {
        success: false,
        error: `Workflow state not found: ${workflowStateId}`,
        workflowState: null as any,
      };
    }

    const definition = this.workflows.get(workflowState.workflowId);

    if (!definition) {
      return {
        success: false,
        error: `Workflow definition not found: ${workflowState.workflowId}`,
        workflowState: this.toWorkflowState(workflowState),
      };
    }

    // 检查是否已完成
    if (workflowState.currentStepIndex >= definition.steps.length) {
      workflowState.status = WorkflowStatus.COMPLETED;
      await this.workflowRepository.save(workflowState);
      return {
        success: true,
        workflowState: this.toWorkflowState(workflowState),
        output: workflowState.context,
      };
    }

    const step = definition.steps[workflowState.currentStepIndex];

    try {
      // 准备输入参数（支持模板变量）
      const input = this.resolveTemplate(step.input, {
        ...workflowState.context,
        ...stepInput,
      });

      // 执行 Skill
      const skillResult = await this.skillsRegistry.executeSkill(
        step.skillId,
        input,
        {
          sessionId: workflowState.sessionId,
          memory: this.memoryService,
          workflow: this,
        },
      );

      if (!skillResult.success) {
        workflowState.status = WorkflowStatus.FAILED;
        const errorMessage = skillResult.error || skillResult.message || 'Unknown error';
        workflowState.error = {
          step: step.id,
          message: errorMessage,
        };
        await this.workflowRepository.save(workflowState);
        return {
          success: false,
          error: errorMessage,
          workflowState: this.toWorkflowState(workflowState),
        };
      }

      // 更新上下文（根据 output 映射）
      if (step.output && skillResult.data) {
        for (const [key, path] of Object.entries(step.output)) {
          const value = this.getNestedValue(skillResult.data, path);
          workflowState.context[key] = value;
        }
      } else if (skillResult.data) {
        // 如果没有 output 映射，直接保存整个结果
        workflowState.context[`step_${step.id}_result`] = skillResult.data;
      }

      // 移动到下一步
      workflowState.currentStepIndex += 1;

      // 检查是否完成
      if (workflowState.currentStepIndex >= definition.steps.length) {
        workflowState.status = WorkflowStatus.COMPLETED;
        await this.workflowRepository.save(workflowState);
        return {
          success: true,
          workflowState: this.toWorkflowState(workflowState),
          output: workflowState.context,
        };
      }

      // 对于电商流程的搜索步骤，检查是否找到商品
      if (workflowState.workflowId === 'ecommerce' && step.id === 'search') {
        const products = skillResult.data?.products || workflowState.context?.products || [];
        if (products.length === 0) {
          // 没有找到商品，终止 workflow
          this.logger.log(`No products found, cancelling workflow`);
          workflowState.status = WorkflowStatus.CANCELLED;
          await this.workflowRepository.save(workflowState);
          return {
            success: true,
            workflowState: this.toWorkflowState(workflowState),
            output: workflowState.context,
          };
        }
        // 找到商品，暂停 workflow，等待用户选择
        await this.workflowRepository.save(workflowState);
        return {
          success: true,
          workflowState: this.toWorkflowState(workflowState),
          output: workflowState.context,
        };
      }

      // 检查下一步是否需要用户输入（有 condition 且条件不满足）
      const nextStep = definition.steps[workflowState.currentStepIndex];
      if (nextStep.condition) {
        // 评估条件表达式
        const conditionMet = this.evaluateCondition(nextStep.condition, workflowState.context);
        if (!conditionMet) {
          // 条件不满足，暂停 workflow，等待用户输入
          this.logger.log(`Workflow paused at step ${nextStep.id}, waiting for user input`);
          await this.workflowRepository.save(workflowState);
          // 返回当前步骤的结果，但不继续执行下一步
          return {
            success: true,
            workflowState: this.toWorkflowState(workflowState),
            output: workflowState.context,
          };
        }
      }

      await this.workflowRepository.save(workflowState);

      // 如果未完成且下一步可以执行，继续执行下一步
      if (workflowState.status === WorkflowStatus.ACTIVE) {
        return this.executeNextStep(workflowStateId);
      }

      return {
        success: true,
        workflowState: this.toWorkflowState(workflowState),
        output: workflowState.context,
      };
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      this.logger.error(`Error executing workflow step: ${errorMessage}`, error?.stack);
      workflowState.status = WorkflowStatus.FAILED;
      workflowState.error = {
        step: step.id,
        message: errorMessage,
        stack: error?.stack,
      };
      await this.workflowRepository.save(workflowState);
      return {
        success: false,
        error: errorMessage,
        workflowState: this.toWorkflowState(workflowState),
      };
    }
  }

  async getWorkflowState(sessionId: string, workflowId?: string): Promise<WorkflowState | null> {
    const where: any = { sessionId, status: WorkflowStatus.ACTIVE };
    if (workflowId) {
      where.workflowId = workflowId;
    }

    const workflow = await this.workflowRepository.findOne({
      where,
      order: { createdAt: 'DESC' },
    });

    return workflow ? this.toWorkflowState(workflow) : null;
  }

  async resumeWorkflow(workflowStateId: string): Promise<WorkflowResult> {
    const workflowState = await this.workflowRepository.findOne({
      where: { id: workflowStateId },
    });

    if (!workflowState) {
      return {
        success: false,
        error: `Workflow state not found: ${workflowStateId}`,
        workflowState: null as any,
      };
    }

    if (workflowState.status !== WorkflowStatus.PAUSED) {
      return {
        success: false,
        error: `Workflow is not paused: ${workflowState.status}`,
        workflowState: this.toWorkflowState(workflowState),
      };
    }

    workflowState.status = WorkflowStatus.ACTIVE;
    await this.workflowRepository.save(workflowState);

    return this.executeNextStep(workflowStateId);
  }

  async pauseWorkflow(workflowStateId: string): Promise<void> {
    const workflowState = await this.workflowRepository.findOne({
      where: { id: workflowStateId },
    });

    if (!workflowState) {
      throw new Error(`Workflow state not found: ${workflowStateId}`);
    }

    workflowState.status = WorkflowStatus.PAUSED;
    await this.workflowRepository.save(workflowState);
  }

  async cancelWorkflow(workflowStateId: string): Promise<void> {
    const workflowState = await this.workflowRepository.findOne({
      where: { id: workflowStateId },
    });

    if (!workflowState) {
      throw new Error(`Workflow state not found: ${workflowStateId}`);
    }

    workflowState.status = WorkflowStatus.CANCELLED;
    await this.workflowRepository.save(workflowState);
  }

  getWorkflowByIntent(intent: string): WorkflowDefinition | null {
    return this.intentToWorkflow.get(intent) || null;
  }

  private resolveTemplate(template: any, context: Record<string, any>): any {
    if (typeof template === 'string') {
      // 替换 {{variable}} 模板变量
      // 如果变量不存在，返回 undefined（而不是保留模板字符串）
      return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (context[key] !== undefined && context[key] !== null) {
          return context[key];
        }
        // 如果变量不存在，返回空字符串（而不是保留模板）
        return '';
      });
    } else if (Array.isArray(template)) {
      return template.map((item) => this.resolveTemplate(item, context));
    } else if (typeof template === 'object' && template !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(template)) {
        const resolvedValue = this.resolveTemplate(value, context);
        // 只添加非空值（过滤掉空字符串的模板变量）
        if (resolvedValue !== '' || typeof value !== 'string' || !value.match(/\{\{(\w+)\}\}/)) {
          resolved[key] = resolvedValue;
        }
      }
      return resolved;
    }
    return template;
  }

  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    return value;
  }

  /**
   * 评估条件表达式（简单版本）
   * 支持：{{variable}} || {{variable2}} 和 {{variable}} && {{variable2}}
   */
  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    if (!condition) return true;

    // 替换模板变量
    const resolved = condition.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = context[key];
      // 转换为布尔值
      if (value === undefined || value === null || value === '') {
        return 'false';
      }
      return 'true';
    });

    // 简单的逻辑表达式评估（支持 || 和 &&）
    try {
      // 替换 || 和 && 为 JavaScript 操作符
      const jsExpression = resolved
        .replace(/\|\|/g, '||')
        .replace(/&&/g, '&&');
      
      // 使用 Function 构造函数安全地评估表达式
      return new Function(`return ${jsExpression}`)();
    } catch (error) {
      this.logger.warn(`Failed to evaluate condition: ${condition}`, error);
      return false;
    }
  }

  private toWorkflowState(workflow: AgentWorkflow): WorkflowState {
    return {
      id: workflow.id,
      sessionId: workflow.sessionId,
      workflowId: workflow.workflowId,
      currentStepIndex: workflow.currentStepIndex,
      status: workflow.status,
      context: workflow.context,
      error: workflow.error,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}

