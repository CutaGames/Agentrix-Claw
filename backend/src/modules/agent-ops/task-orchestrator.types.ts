import type { AgentOpsTaskEntity, AgentOpsRiskTier } from './entities/agent-ops-task.entity';

/**
 * TaskOrchestrator 公共类型与可注入契约(crypto-native-agent-ops 任务 11)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C2「浏览器自动化任务编排器」。
 *   - 需求 2.1/2.2/2.3/2.4:受控 Chrome(隔离 profile + CDP)执行导航/JS 求值/选择器
 *     读取与点击;DOM/选择器/JS 锚定而非像素猜测;失败返回结构化原因并允许重试或降级;
 *     记录每次浏览器操作的可审计轨迹。
 *
 * 设计要点:
 *   - LLM 决策步骤抽象在 {@link LlmDecisionProvider} 接口后,集成测可注入 mock。
 *   - CDP 动作落点在桌面端(用户本地 Chrome,隔离 profile),抽象在
 *     {@link BrowserActionExecutor} 接口后(默认实现经 desktop-sync 通道下发)。
 *   - 后端只下发任务计划 + 收集结果 + 落审计轨迹,不在后端进程内直接驱动浏览器。
 */

/**
 * 浏览器动作类型,锚定优先级(高 → 低):
 *   1. `browser_eval`   —— JS 读取 DOM(只读锚定,首选)。
 *   2. `click_selector` —— 选择器点击(DOM 锚定)。
 *   3. `navigate`       —— 导航。
 *   4. `pixel_click`    —— 像素坐标点击(P1 降级,仅当 DOM 锚定不可用时)。
 */
export type BrowserActionKind =
  | 'browser_eval'
  | 'click_selector'
  | 'navigate'
  | 'pixel_click';

/**
 * 单步浏览器动作描述。锚定优先级由 {@link BrowserActionKind} 体现:
 * 上层(LLM 决策)应优先产出 `browser_eval`/`click_selector`,`pixel_click` 为降级兜底。
 */
export interface BrowserAction {
  kind: BrowserActionKind;
  /** `browser_eval`:待求值的 JS 表达式(只读 DOM 提取)。 */
  expression?: string;
  /** `click_selector`:CSS 选择器。 */
  selector?: string;
  /** `navigate`:目标 URL。 */
  url?: string;
  /** `navigate`:是否跨到新域(true → 中风险)。 */
  toExternalDomain?: boolean;
  /** `pixel_click`:像素坐标(P1 降级)。 */
  x?: number;
  y?: number;
  /** CDP 目标 tab id(可选)。 */
  targetId?: string;
  /** 人类可读的动作目标(审计用,落 `agent_ops_action_log.target`)。 */
  target?: string;
  /** 本步的预算成本(USD),用于中风险预算授权,默认 0。 */
  cost?: number;
}

/**
 * 结构化失败原因(需求 2.3 / design §Error Handling)。
 *   - `selector_miss` —— 选择器未命中(可降级:换选择器/换锚定方式)。
 *   - `timeout`       —— 超时(可重试:指数退避)。
 *   - `dom_changed`   —— 页面结构变化(可重试 / 重新读取)。
 *   - `blocked`       —— 被阻断(红线/拒绝/反爬),不重试。
 *   - `unknown`       —— 未归类失败(保守:有限重试)。
 */
export type OrchestratorFailureReason =
  | 'selector_miss'
  | 'timeout'
  | 'dom_changed'
  | 'blocked'
  | 'unknown';

/** 单步动作执行回执。 */
export interface BrowserActionResult {
  /** 是否成功。 */
  success: boolean;
  /** 成功时的数据(eval 求值结果 / 点击确认 / 导航结果)。 */
  data?: any;
  /** 失败时的结构化原因。 */
  failureReason?: OrchestratorFailureReason;
  /** 原始错误信息(审计用)。 */
  error?: string;
  /** 底层原始回执(调试用)。 */
  raw?: any;
}

/** 一步执行的历史记录(供 LLM 决策上下文与审计)。 */
export interface OrchestratorStepRecord {
  step: number;
  action: BrowserAction;
  result: BrowserActionResult;
  riskTier: AgentOpsRiskTier;
}

/** LLM 决策的观察上下文。 */
export interface OrchestratorObservation {
  /** 当前步序号(从 1 起)。 */
  step: number;
  /** 上一步动作(首步为空)。 */
  lastAction?: BrowserAction;
  /** 上一步回执(首步为空)。 */
  lastResult?: BrowserActionResult;
  /** 截至当前的完整步骤历史。 */
  history: OrchestratorStepRecord[];
}

/** LLM 决策输出:下一步动作,或宣告任务完成。 */
export interface OrchestratorDecision {
  /** true 表示任务已达成,结束循环(此时 action 可空)。 */
  done: boolean;
  /** 下一步动作(done=false 时必填)。 */
  action?: BrowserAction;
  /**
   * 降级备选动作(可选):当 action 因 `selector_miss` 失败时,
   * 编排器用 fallbackAction 重试(换选择器 / 换锚定方式 / 换数据源)。
   */
  fallbackAction?: BrowserAction;
  /** done=true 时的成果摘要。 */
  summary?: string;
  /** 决策原因(审计用)。 */
  reason?: string;
}

/**
 * LLM 决策提供方(可注入,集成测可 mock)。
 *
 * 抽象「读取(eval/选择器)→ LLM 决策」中的决策步骤:输入任务目标 + 当前观察,
 * 输出下一步动作或完成信号。真实实现接 OpenClaw/Claude;测试注入确定性 mock。
 */
export interface LlmDecisionProvider {
  decideNext(ctx: {
    task: AgentOpsTaskEntity;
    goal: string;
    observation: OrchestratorObservation;
  }): Promise<OrchestratorDecision>;
}

/** LLM 决策提供方注入令牌。 */
export const LLM_DECISION_PROVIDER = Symbol('LLM_DECISION_PROVIDER');

/**
 * 浏览器动作执行器(可注入,集成测可 mock)。
 *
 * 抽象「CDP 动作 → 回执」:把单步 {@link BrowserAction} 下发到桌面端本地 Chrome
 * (隔离 profile)并收集结构化回执。默认实现经 desktop-sync 命令通道下发
 * (computer_use_browser_*),测试注入 mock 以模拟页面读取/点击/导航成败路径。
 */
export interface BrowserActionExecutor {
  execute(params: {
    userId: string;
    agentId: string;
    action: BrowserAction;
    deviceId?: string;
    sessionId?: string;
  }): Promise<BrowserActionResult>;
}

/** 浏览器动作执行器注入令牌。 */
export const BROWSER_ACTION_EXECUTOR = Symbol('BROWSER_ACTION_EXECUTOR');

/** 编排循环入参。 */
export interface RunOrchestrationParams {
  /** 任务归属用户。 */
  userId: string;
  /** 任务 id(编排器从库中读取任务实体)。 */
  taskId: string;
  /** 目标桌面设备(可选,缺省由 desktop-sync 路由)。 */
  deviceId?: string;
  /** 关联会话 id(可选)。 */
  sessionId?: string;
  /** 最大步数上限(防失控),默认 20。 */
  maxSteps?: number;
  /** 单步最大重试次数(指数退避上限),默认 2。 */
  maxRetriesPerAction?: number;
  /** 指数退避基数(ms),默认 250;测试可传 0 以加速。 */
  backoffBaseMs?: number;
  /** 指数退避上限(ms),默认 4000。 */
  backoffCapMs?: number;
}

/** 编排循环最终结果。 */
export interface OrchestrationResult {
  taskId: string;
  /** completed:LLM 宣告完成;failed:动作不可恢复失败/超步数;awaiting_approval:需人确认。 */
  status: 'completed' | 'failed' | 'awaiting_approval';
  /** 实际执行步数。 */
  steps: number;
  /** 成果摘要(completed 时)。 */
  summary?: string;
  /** 失败原因(failed 时)。 */
  failureReason?: OrchestratorFailureReason;
  /** 结束原因码(审计用)。 */
  reason?: string;
  /** 完整步骤历史(审计 / 测试断言)。 */
  history: OrchestratorStepRecord[];
}
