/**
 * Workflow 引擎接口定义
 * 用于管理多步骤流程的执行
 */

export enum WorkflowStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export interface WorkflowStep {
  id: string; // 步骤ID
  skillId: string; // 要执行的 Skill ID
  input: Record<string, any>; // 输入参数（支持模板变量）
  output?: Record<string, string>; // 输出映射（将 Skill 结果映射到上下文）
  condition?: string; // 条件表达式（决定是否执行此步骤）
  retry?: {
    maxAttempts: number;
    delay: number; // 毫秒
  };
}

export interface WorkflowDefinition {
  id: string; // 流程ID
  name: string; // 流程名称
  description?: string;
  steps: WorkflowStep[]; // 步骤列表
  triggers?: string[]; // 触发此流程的意图列表
}

export interface WorkflowState {
  id: string;
  sessionId: string;
  workflowId: string; // WorkflowDefinition.id
  currentStepIndex: number; // 当前步骤索引
  status: WorkflowStatus;
  context: Record<string, any>; // 流程上下文（存储步骤之间的数据）
  error?: {
    step: string;
    message: string;
    stack?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowResult {
  success: boolean;
  workflowState: WorkflowState;
  output?: any; // 最终输出
  error?: string;
}

export interface IWorkflowEngine {
  /**
   * 注册流程定义
   */
  registerWorkflow(definition: WorkflowDefinition): void;

  /**
   * 启动流程
   */
  startWorkflow(
    sessionId: string,
    workflowId: string,
    initialContext?: Record<string, any>,
  ): Promise<WorkflowResult>;

  /**
   * 执行下一步
   */
  executeNextStep(workflowStateId: string, stepInput?: Record<string, any>): Promise<WorkflowResult>;

  /**
   * 获取当前流程状态
   */
  getWorkflowState(sessionId: string, workflowId?: string): Promise<WorkflowState | null>;

  /**
   * 恢复流程
   */
  resumeWorkflow(workflowStateId: string): Promise<WorkflowResult>;

  /**
   * 暂停流程
   */
  pauseWorkflow(workflowStateId: string): Promise<void>;

  /**
   * 取消流程
   */
  cancelWorkflow(workflowStateId: string): Promise<void>;

  /**
   * 根据意图获取流程定义
   */
  getWorkflowByIntent(intent: string): WorkflowDefinition | null;
}

