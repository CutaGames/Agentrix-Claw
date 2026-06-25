import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentOpsTaskEntity,
  AgentOpsRiskTier,
} from './entities/agent-ops-task.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import { ApprovalGrantService } from './approval-grant.service';
import {
  ActionDescriptor,
  PolicyEvaluatorService,
  RiskTier,
} from '../agent/policy-evaluator.service';
import {
  BROWSER_ACTION_EXECUTOR,
  BrowserAction,
  BrowserActionExecutor,
  BrowserActionResult,
  LLM_DECISION_PROVIDER,
  LlmDecisionProvider,
  OrchestrationResult,
  OrchestratorDecision,
  OrchestratorFailureReason,
  OrchestratorStepRecord,
  RunOrchestrationParams,
} from './task-orchestrator.types';

/** 可重试的失败原因(瞬时:超时 / 结构变化 / 未知)。 */
const RETRIABLE_REASONS: ReadonlySet<OrchestratorFailureReason> = new Set([
  'timeout',
  'dom_changed',
  'unknown',
]);

/** 可降级的失败原因(换选择器 / 换锚定方式 / 换数据源)。 */
const DEGRADABLE_REASONS: ReadonlySet<OrchestratorFailureReason> = new Set([
  'selector_miss',
]);

const DEFAULT_MAX_STEPS = 20;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_BASE_MS = 250;
const DEFAULT_BACKOFF_CAP_MS = 4_000;

/**
 * TaskOrchestrator — 浏览器自动化任务编排循环(crypto-native-agent-ops 任务 11)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C2「浏览器自动化任务编排器」、§Error Handling。
 *   - 需求 2.1/2.2/2.3/2.4。
 *
 * 编排循环(每步):
 *   读取(eval/选择器)→ LLM 决策 → 分级审批 → CDP 动作 → 回执 → 落审计轨迹。
 *
 * 锚定优先级:`browser_eval`(JS 读取 DOM)> `click_selector`(选择器)>(P1)`pixel_click`。
 * 失败返回结构化原因(selector_miss/timeout/dom_changed/blocked):
 *   - timeout/dom_changed/unknown → 指数退避重试(上限内);
 *   - selector_miss → 降级(LLM 提供的 fallbackAction);
 *   - blocked → 不重试,任务失败。
 *
 * 风险分级复用 Task 9 `PolicyEvaluatorService` + Task 10 `ApprovalGrantService`:
 *   - 红线 → 拒绝(blocked),不执行;
 *   - read → 自动放行;
 *   - medium → 命中会话/任务预算授权自动放行,否则回落人确认(awaiting_approval);
 *   - high → 强制人确认(awaiting_approval)。
 *
 * 执行落点在桌面端(用户本地 Chrome,隔离 profile)—— 经可注入的
 * {@link BrowserActionExecutor} 下发;LLM 决策经可注入的 {@link LlmDecisionProvider}。
 * 后端只下发计划 + 收集结果 + 落 `agent_ops_action_log`。
 */
@Injectable()
export class TaskOrchestrator {
  private readonly logger = new Logger(TaskOrchestrator.name);

  constructor(
    @InjectRepository(AgentOpsTaskEntity)
    private readonly taskRepo: Repository<AgentOpsTaskEntity>,
    @InjectRepository(AgentOpsActionLogEntity)
    private readonly actionLogRepo: Repository<AgentOpsActionLogEntity>,
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly approvalGrants: ApprovalGrantService,
    @Inject(LLM_DECISION_PROVIDER)
    private readonly llm: LlmDecisionProvider,
    @Inject(BROWSER_ACTION_EXECUTOR)
    private readonly executor: BrowserActionExecutor,
  ) {}

  /**
   * 运行一个任务的编排循环,直至完成 / 失败 / 需人确认 / 触达步数上限。
   */
  async run(params: RunOrchestrationParams): Promise<OrchestrationResult> {
    const maxSteps = params.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxRetries = params.maxRetriesPerAction ?? DEFAULT_MAX_RETRIES;
    const backoffBaseMs = params.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    const backoffCapMs = params.backoffCapMs ?? DEFAULT_BACKOFF_CAP_MS;

    const task = await this.taskRepo.findOne({
      where: { id: params.taskId, ownerId: params.userId },
    });
    if (!task) {
      throw new NotFoundException(`AgentOpsTask ${params.taskId} not found`);
    }

    const goal: string =
      (task.input && (task.input.goal as string)) || `task:${task.type}`;
    const history: OrchestratorStepRecord[] = [];

    await this.markStatus(task, 'running');

    let step = 0;
    while (step < maxSteps) {
      const observation = {
        step: step + 1,
        lastAction: history[history.length - 1]?.action,
        lastResult: history[history.length - 1]?.result,
        history,
      };

      // 1. LLM 决策
      let decision: OrchestratorDecision;
      try {
        decision = await this.llm.decideNext({ task, goal, observation });
      } catch (err: any) {
        await this.markStatus(task, 'failed');
        return {
          taskId: task.id,
          status: 'failed',
          steps: step,
          failureReason: 'unknown',
          reason: `LLM_DECISION_ERROR: ${err?.message ?? err}`,
          history,
        };
      }

      // 2. 完成判定
      if (decision.done) {
        await this.markStatus(task, 'completed');
        return {
          taskId: task.id,
          status: 'completed',
          steps: step,
          summary: decision.summary,
          reason: decision.reason,
          history,
        };
      }

      const action = decision.action;
      if (!action) {
        await this.markStatus(task, 'failed');
        return {
          taskId: task.id,
          status: 'failed',
          steps: step,
          failureReason: 'unknown',
          reason: 'LLM_DECISION_NO_ACTION',
          history,
        };
      }

      step += 1;

      // 3. 分级审批(红线/read/medium/high)
      const tier = this.classifyTier(action);
      const approval = await this.approvalGrants.evaluateAndConsume({
        action: this.toActionDescriptor(action),
        userId: params.userId,
        agentId: task.agentId,
        scope: 'task',
        scopeId: task.id,
        cost: action.cost ?? 0,
      });

      if (approval.decision === 'deny') {
        // 红线:拒绝执行,记审计后任务失败(blocked)。
        const result: BrowserActionResult = {
          success: false,
          failureReason: 'blocked',
          error: approval.reason ?? 'REDLINE_VIOLATION',
        };
        await this.logAction(task.id, step, action, result, tier, null);
        history.push({ step, action, result, riskTier: tier });
        await this.markStatus(task, 'failed');
        return {
          taskId: task.id,
          status: 'failed',
          steps: step,
          failureReason: 'blocked',
          reason: approval.reason ?? 'REDLINE_VIOLATION',
          history,
        };
      }

      if (approval.decision === 'user_confirmation') {
        // 需人确认:暂停编排,记审计(approvedBy=null,result 标记 requiresApproval)。
        const result: BrowserActionResult = {
          success: false,
          error: approval.reason ?? 'REQUIRES_APPROVAL',
          raw: { requiresApproval: true, tier: approval.tier },
        };
        await this.logAction(task.id, step, action, result, tier, null);
        history.push({ step, action, result, riskTier: tier });
        await this.markStatus(task, 'awaiting_approval', 'pending');
        return {
          taskId: task.id,
          status: 'awaiting_approval',
          steps: step,
          failureReason: undefined,
          reason: approval.reason ?? 'REQUIRES_APPROVAL',
          history,
        };
      }

      // 4. 执行(含重试 + 降级)
      const result = await this.executeWithResilience(
        params,
        task.agentId,
        action,
        decision.fallbackAction,
        { maxRetries, backoffBaseMs, backoffCapMs },
      );

      // 5. 落审计轨迹
      await this.logAction(task.id, step, action, result, tier, null);
      history.push({ step, action, result, riskTier: tier });

      // 6. 不可恢复失败 → 任务失败
      if (!result.success) {
        await this.markStatus(task, 'failed');
        return {
          taskId: task.id,
          status: 'failed',
          steps: step,
          failureReason: result.failureReason ?? 'unknown',
          reason: result.error,
          history,
        };
      }
    }

    // 触达步数上限仍未完成 → 失败(超时语义)。
    await this.markStatus(task, 'failed');
    return {
      taskId: task.id,
      status: 'failed',
      steps: step,
      failureReason: 'timeout',
      reason: 'MAX_STEPS_EXCEEDED',
      history,
    };
  }

  /**
   * 执行单步动作:失败时按结构化原因重试(指数退避)或降级(fallbackAction)。
   *
   *   - timeout/dom_changed/unknown → 指数退避重试,至 maxRetries;
   *   - selector_miss → 若提供 fallbackAction 则改用其执行一次(降级),否则不重试;
   *   - blocked → 立即返回,不重试。
   */
  private async executeWithResilience(
    params: RunOrchestrationParams,
    agentId: string,
    action: BrowserAction,
    fallbackAction: BrowserAction | undefined,
    cfg: { maxRetries: number; backoffBaseMs: number; backoffCapMs: number },
  ): Promise<BrowserActionResult> {
    let attempt = 0;
    let lastResult: BrowserActionResult = {
      success: false,
      failureReason: 'unknown',
    };
    let degraded = false;
    let current = action;

    // 重试次数 = 首次 + 最多 maxRetries 次重试
    while (attempt <= cfg.maxRetries) {
      const result = await this.safeExecute(params, agentId, current);
      lastResult = result;

      if (result.success) {
        return result;
      }

      const reason = result.failureReason ?? 'unknown';

      // 阻断:不重试。
      if (reason === 'blocked') {
        return result;
      }

      // 选择器未命中:降级一次(若有 fallbackAction)。
      if (DEGRADABLE_REASONS.has(reason)) {
        if (fallbackAction && !degraded) {
          degraded = true;
          current = fallbackAction;
          attempt += 1;
          continue;
        }
        return result;
      }

      // 可重试:指数退避后再试。
      if (RETRIABLE_REASONS.has(reason) && attempt < cfg.maxRetries) {
        const delay = Math.min(
          cfg.backoffBaseMs * Math.pow(2, attempt),
          cfg.backoffCapMs,
        );
        await this.sleep(delay);
        attempt += 1;
        continue;
      }

      return result;
    }

    return lastResult;
  }

  /** 调用执行器并把抛错归一为结构化回执(超时/未知)。 */
  private async safeExecute(
    params: RunOrchestrationParams,
    agentId: string,
    action: BrowserAction,
  ): Promise<BrowserActionResult> {
    try {
      return await this.executor.execute({
        userId: params.userId,
        agentId,
        action,
        deviceId: params.deviceId,
        sessionId: params.sessionId,
      });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const failureReason: OrchestratorFailureReason = /timeout|timed out/i.test(
        msg,
      )
        ? 'timeout'
        : 'unknown';
      return { success: false, failureReason, error: msg };
    }
  }

  /** 把 BrowserAction 映射为分级审批的 ActionDescriptor。 */
  private toActionDescriptor(action: BrowserAction): ActionDescriptor {
    switch (action.kind) {
      case 'browser_eval':
        // JS 只读 DOM 提取 → read。
        return { type: 'browser_eval_read', intent: action.target };
      case 'click_selector':
        return { type: 'browser_click_selector', intent: action.target };
      case 'navigate':
        return {
          type: 'navigate',
          toExternalDomain: action.toExternalDomain,
          intent: action.url ?? action.target,
        };
      case 'pixel_click':
        // 像素点击 → 中风险(click)。
        return { type: 'click', intent: action.target };
      default:
        return { type: 'unknown' };
    }
  }

  /** 动作风险档(落库用,与 ActionDescriptor 分级一致)。 */
  private classifyTier(action: BrowserAction): AgentOpsRiskTier {
    const { tier } = this.policyEvaluator.classifyActionRisk(
      this.toActionDescriptor(action),
    );
    return this.toAgentOpsRiskTier(tier);
  }

  private toAgentOpsRiskTier(tier: RiskTier): AgentOpsRiskTier {
    return tier;
  }

  /** 追加一条审计轨迹(append-only)。 */
  private async logAction(
    taskId: string,
    step: number,
    action: BrowserAction,
    result: BrowserActionResult,
    riskTier: AgentOpsRiskTier,
    approvedBy: string | null,
  ): Promise<AgentOpsActionLogEntity> {
    const entry = this.actionLogRepo.create({
      taskId,
      step,
      target: this.actionTarget(action),
      action: action.kind,
      result: this.serializeResult(result),
      riskTier,
      approvedBy,
    });
    return this.actionLogRepo.save(entry);
  }

  /** 审计目标:URL / 选择器 / 表达式片段 / 坐标。 */
  private actionTarget(action: BrowserAction): string | null {
    if (action.target) return action.target;
    switch (action.kind) {
      case 'navigate':
        return action.url ?? null;
      case 'click_selector':
        return action.selector ?? null;
      case 'browser_eval':
        return (action.expression ?? '').slice(0, 200) || null;
      case 'pixel_click':
        return action.x != null && action.y != null
          ? `(${action.x}, ${action.y})`
          : null;
      default:
        return null;
    }
  }

  /** 结果落 jsonb;成功保留 data,失败保留结构化原因 + 错误。 */
  private serializeResult(result: BrowserActionResult): Record<string, any> {
    if (result.success) {
      return { success: true, data: result.data ?? null };
    }
    return {
      success: false,
      failureReason: result.failureReason ?? 'unknown',
      ...(result.error ? { error: result.error } : {}),
      ...(result.raw ? { raw: result.raw } : {}),
    };
  }

  private async markStatus(
    task: AgentOpsTaskEntity,
    status: AgentOpsTaskEntity['status'],
    approvalState?: AgentOpsTaskEntity['approvalState'],
  ): Promise<void> {
    task.status = status;
    if (approvalState) {
      task.approvalState = approvalState;
    }
    await this.taskRepo.save(task);
  }

  /** 可被测试覆盖的退避 sleep(默认真实定时器)。 */
  protected sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
