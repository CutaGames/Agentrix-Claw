/**
 * Workflow Composer Service
 * 
 * Phase 4: 工作流编排器 - 支持多 Skill 组合编排
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill, SkillLayer, SkillCategory, SkillSource, SkillStatus, SkillPricingType } from '../../entities/skill.entity';

export enum WorkflowNodeType {
  SKILL = 'skill',
  CONDITION = 'condition',
  LOOP = 'loop',
  PARALLEL = 'parallel',
  TRANSFORM = 'transform',
  HUMAN_INPUT = 'human_input',
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config: {
    skillId?: string;
    condition?: string;
    loopConfig?: {
      maxIterations: number;
      breakCondition?: string;
    };
    parallelConfig?: {
      nodeIds: string[];
      waitAll: boolean;
    };
    transformConfig?: {
      expression: string;
    };
    humanInputConfig?: {
      prompt: string;
      timeout?: number;
    };
  };
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
  label?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, any>;
  triggers?: WorkflowTrigger[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event' | 'webhook';
  config: Record<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  currentNodeId?: string;
  variables: Record<string, any>;
  nodeResults: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

@Injectable()
export class WorkflowComposerService {
  private readonly logger = new Logger(WorkflowComposerService.name);
  
  // 内存存储（生产环境应使用数据库）
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
  ) {}

  /**
   * 创建工作流
   */
  async createWorkflow(
    name: string,
    description: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    variables?: Record<string, any>,
  ): Promise<WorkflowDefinition> {
    const id = this.generateId('wf');

    const workflow: WorkflowDefinition = {
      id,
      name,
      description,
      version: '1.0.0',
      nodes,
      edges,
      variables: variables || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 验证工作流
    await this.validateWorkflow(workflow);

    this.workflows.set(id, workflow);
    this.logger.log(`Workflow created: ${id} - ${name}`);

    return workflow;
  }

  /**
   * 从模板创建工作流
   */
  async createFromTemplate(templateName: string, customizations?: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new HttpException(`Template ${templateName} not found`, HttpStatus.NOT_FOUND);
    }

    const workflow = {
      ...template,
      id: this.generateId('wf'),
      ...customizations,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  /**
   * 获取预定义模板
   */
  private getTemplate(name: string): WorkflowDefinition | null {
    const templates: Record<string, WorkflowDefinition> = {
      'smart-shopping': {
        id: 'template_smart_shopping',
        name: 'Smart Shopping Workflow',
        description: 'Search products, compare prices, and purchase the best option',
        version: '1.0.0',
        nodes: [
          {
            id: 'search',
            type: WorkflowNodeType.SKILL,
            name: 'Search Products',
            config: { skillId: 'search_products' },
            inputs: { query: '{{input.query}}', limit: '10' },
            outputs: { products: 'searchResults' },
            position: { x: 100, y: 100 },
          },
          {
            id: 'compare',
            type: WorkflowNodeType.SKILL,
            name: 'Compare Prices',
            config: { skillId: 'compare_prices' },
            inputs: { products: '{{searchResults}}' },
            outputs: { bestProduct: 'bestProduct' },
            position: { x: 300, y: 100 },
          },
          {
            id: 'confirm',
            type: WorkflowNodeType.HUMAN_INPUT,
            name: 'Confirm Purchase',
            config: {
              humanInputConfig: {
                prompt: 'Do you want to purchase {{bestProduct.name}} for {{bestProduct.price}}?',
                timeout: 300,
              },
            },
            inputs: { product: '{{bestProduct}}' },
            outputs: { confirmed: 'userConfirmed' },
            position: { x: 500, y: 100 },
          },
          {
            id: 'purchase',
            type: WorkflowNodeType.SKILL,
            name: 'Create Order',
            config: { skillId: 'create_order' },
            inputs: { productId: '{{bestProduct.id}}', quantity: '1' },
            outputs: { order: 'orderResult' },
            position: { x: 700, y: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'search', target: 'compare' },
          { id: 'e2', source: 'compare', target: 'confirm' },
          { id: 'e3', source: 'confirm', target: 'purchase', condition: '{{userConfirmed}} === true' },
        ],
        variables: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      'investment-portfolio': {
        id: 'template_investment',
        name: 'Investment Portfolio Management',
        description: 'Analyze market, rebalance portfolio, and execute trades',
        version: '1.0.0',
        nodes: [
          {
            id: 'fetch_prices',
            type: WorkflowNodeType.SKILL,
            name: 'Fetch Crypto Prices',
            config: { skillId: 'fetch_crypto_price' },
            inputs: { symbols: '{{input.symbols}}' },
            outputs: { prices: 'currentPrices' },
            position: { x: 100, y: 100 },
          },
          {
            id: 'analyze',
            type: WorkflowNodeType.SKILL,
            name: 'Analyze Portfolio',
            config: { skillId: 'analyze_portfolio' },
            inputs: { prices: '{{currentPrices}}', holdings: '{{input.holdings}}' },
            outputs: { analysis: 'portfolioAnalysis' },
            position: { x: 300, y: 100 },
          },
          {
            id: 'check_rebalance',
            type: WorkflowNodeType.CONDITION,
            name: 'Need Rebalance?',
            config: { condition: '{{portfolioAnalysis.needsRebalance}}' },
            inputs: {},
            outputs: {},
            position: { x: 500, y: 100 },
          },
          {
            id: 'rebalance',
            type: WorkflowNodeType.SKILL,
            name: 'Execute Rebalance',
            config: { skillId: 'execute_rebalance' },
            inputs: { analysis: '{{portfolioAnalysis}}' },
            outputs: { trades: 'executedTrades' },
            position: { x: 700, y: 50 },
          },
        ],
        edges: [
          { id: 'e1', source: 'fetch_prices', target: 'analyze' },
          { id: 'e2', source: 'analyze', target: 'check_rebalance' },
          { id: 'e3', source: 'check_rebalance', target: 'rebalance', condition: 'true' },
        ],
        variables: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    return templates[name] || null;
  }

  /**
   * 验证工作流
   */
  async validateWorkflow(workflow: WorkflowDefinition): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 检查节点
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }

    // 检查边的连接
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge ${edge.id} references non-existent source node: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge ${edge.id} references non-existent target node: ${edge.target}`);
      }
    }

    // 检查 Skill 节点的 Skill 是否存在
    for (const node of workflow.nodes) {
      if (node.type === WorkflowNodeType.SKILL && node.config.skillId) {
        const skill = await this.skillRepository.findOne({
          where: { id: node.config.skillId, status: SkillStatus.PUBLISHED },
        });
        if (!skill) {
          // 尝试按名称查找
          const skillByName = await this.skillRepository.findOne({
            where: { name: node.config.skillId, status: SkillStatus.PUBLISHED },
          });
          if (!skillByName) {
            errors.push(`Node ${node.id} references non-existent skill: ${node.config.skillId}`);
          }
        }
      }
    }

    // 检查是否有循环依赖
    if (this.hasCycle(workflow)) {
      errors.push('Workflow contains circular dependencies');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 检查循环依赖
   */
  private hasCycle(workflow: WorkflowDefinition): boolean {
    const adjacency = new Map<string, string[]>();
    workflow.nodes.forEach(n => adjacency.set(n.id, []));
    workflow.edges.forEach(e => {
      adjacency.get(e.source)?.push(e.target);
    });

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowId: string,
    input: Record<string, any>,
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new HttpException(`Workflow ${workflowId} not found`, HttpStatus.NOT_FOUND);
    }

    const executionId = this.generateId('exec');
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: WorkflowStatus.RUNNING,
      variables: { input, ...workflow.variables },
      nodeResults: {},
      startedAt: new Date(),
    };

    this.executions.set(executionId, execution);
    this.logger.log(`Starting workflow execution: ${executionId}`);

    // 异步执行工作流
    this.runWorkflow(execution, workflow).catch(error => {
      execution.status = WorkflowStatus.FAILED;
      execution.error = error.message;
      execution.completedAt = new Date();
      this.logger.error(`Workflow execution failed: ${executionId}`, error);
    });

    return execution;
  }

  /**
   * 运行工作流
   */
  private async runWorkflow(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
  ): Promise<void> {
    // 找到入口节点（没有入边的节点）
    const entryNodes = this.findEntryNodes(workflow);

    // 执行拓扑排序后的节点
    const sortedNodes = this.topologicalSort(workflow);

    for (const node of sortedNodes) {
      execution.currentNodeId = node.id;
      
      try {
        const result = await this.executeNode(node, execution, workflow);
        execution.nodeResults[node.id] = result;
        
        // 更新变量
        for (const [key, varName] of Object.entries(node.outputs)) {
          execution.variables[varName] = result[key];
        }
      } catch (error) {
        execution.status = WorkflowStatus.FAILED;
        execution.error = `Node ${node.id} failed: ${error.message}`;
        execution.completedAt = new Date();
        throw error;
      }
    }

    execution.status = WorkflowStatus.COMPLETED;
    execution.completedAt = new Date();
    this.logger.log(`Workflow execution completed: ${execution.id}`);
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: WorkflowNode,
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
  ): Promise<any> {
    this.logger.log(`Executing node: ${node.id} (${node.type})`);

    // 解析输入参数
    const resolvedInputs: Record<string, any> = {};
    for (const [key, value] of Object.entries(node.inputs)) {
      resolvedInputs[key] = this.resolveVariable(value, execution.variables);
    }

    switch (node.type) {
      case WorkflowNodeType.SKILL:
        return this.executeSkillNode(node, resolvedInputs);

      case WorkflowNodeType.CONDITION:
        return this.evaluateCondition(node.config.condition || '', execution.variables);

      case WorkflowNodeType.TRANSFORM:
        return this.executeTransform(node.config.transformConfig?.expression || '', execution.variables);

      case WorkflowNodeType.HUMAN_INPUT:
        // 在实际实现中，这里应该暂停执行并等待用户输入
        return { confirmed: true, input: 'simulated_user_input' };

      case WorkflowNodeType.PARALLEL:
        // 并行执行多个节点
        const parallelNodeIds = node.config.parallelConfig?.nodeIds || [];
        const parallelNodes = workflow.nodes.filter(n => parallelNodeIds.includes(n.id));
        const results = await Promise.all(
          parallelNodes.map(n => this.executeNode(n, execution, workflow))
        );
        return results;

      case WorkflowNodeType.LOOP:
        // 循环执行
        const maxIterations = node.config.loopConfig?.maxIterations || 10;
        const loopResults: any[] = [];
        for (let i = 0; i < maxIterations; i++) {
          // 检查退出条件
          if (node.config.loopConfig?.breakCondition) {
            const shouldBreak = this.evaluateCondition(
              node.config.loopConfig.breakCondition,
              { ...execution.variables, loopIndex: i, loopResults }
            );
            if (shouldBreak) break;
          }
          loopResults.push({ iteration: i });
        }
        return loopResults;

      default:
        return {};
    }
  }

  /**
   * 执行 Skill 节点
   */
  private async executeSkillNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    const skillId = node.config.skillId;
    if (!skillId) {
      throw new Error(`Skill node ${node.id} has no skillId configured`);
    }

    // 在实际实现中，这里应该调用 Skill 执行服务
    this.logger.log(`Executing skill: ${skillId} with inputs: ${JSON.stringify(inputs)}`);

    // 模拟 Skill 执行结果
    return {
      success: true,
      skillId,
      inputs,
      result: `Simulated result for ${skillId}`,
    };
  }

  /**
   * 解析变量
   */
  private resolveVariable(template: string, variables: Record<string, any>): any {
    if (typeof template !== 'string') return template;

    // 检查是否是纯变量引用
    const pureVarMatch = template.match(/^\{\{([^}]+)\}\}$/);
    if (pureVarMatch) {
      return this.getNestedValue(variables, pureVarMatch[1].trim());
    }

    // 替换模板中的变量
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(variables, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * 获取嵌套值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    try {
      const resolved = this.resolveVariable(condition, variables);
      // 简单的条件评估（生产环境应使用安全的表达式解析器）
      return Boolean(resolved);
    } catch {
      return false;
    }
  }

  /**
   * 执行转换
   */
  private executeTransform(expression: string, variables: Record<string, any>): any {
    return this.resolveVariable(expression, variables);
  }

  /**
   * 找到入口节点
   */
  private findEntryNodes(workflow: WorkflowDefinition): WorkflowNode[] {
    const targetNodes = new Set(workflow.edges.map(e => e.target));
    return workflow.nodes.filter(n => !targetNodes.has(n.id));
  }

  /**
   * 拓扑排序
   */
  private topologicalSort(workflow: WorkflowDefinition): WorkflowNode[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    workflow.nodes.forEach(n => {
      inDegree.set(n.id, 0);
      adjacency.set(n.id, []);
    });

    workflow.edges.forEach(e => {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      adjacency.get(e.source)?.push(e.target);
    });

    const queue: string[] = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) queue.push(nodeId);
    });

    const sorted: WorkflowNode[] = [];
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeMap.get(nodeId)!);

      for (const neighbor of adjacency.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  /**
   * 将工作流发布为 Composite Skill
   */
  async publishAsSkill(workflowId: string, authorId: string): Promise<Skill> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new HttpException(`Workflow ${workflowId} not found`, HttpStatus.NOT_FOUND);
    }

    const skill = new Skill();
    skill.name = `workflow_${workflow.name.toLowerCase().replace(/\s+/g, '_')}`;
    skill.displayName = workflow.name;
    skill.description = workflow.description;
    skill.layer = SkillLayer.COMPOSITE;
    skill.category = SkillCategory.WORKFLOW;
    skill.source = SkillSource.NATIVE;
    skill.status = SkillStatus.PUBLISHED;
    skill.humanAccessible = true;
    skill.tags = ['workflow', 'composite'];
    skill.executor = {
      type: 'internal',
      internalHandler: `workflow:${workflowId}`,
    };
    skill.pricing = {
      type: SkillPricingType.FREE,
      currency: 'USD',
    };
    skill.authorId = authorId;

    return this.skillRepository.save(skill);
  }

  /**
   * 获取工作流
   */
  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  /**
   * 获取执行状态
   */
  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  /**
   * 生成 ID
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
