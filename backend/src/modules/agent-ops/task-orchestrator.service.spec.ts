import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TaskOrchestrator } from './task-orchestrator.service';
import { AgentOpsTaskEntity } from './entities/agent-ops-task.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import { ApprovalGrantService } from './approval-grant.service';
import { ApprovalGrantEntity } from './entities/approval-grant.entity';
import { PolicyEvaluatorService } from '../agent/policy-evaluator.service';
import {
  BROWSER_ACTION_EXECUTOR,
  BrowserActionResult,
  LLM_DECISION_PROVIDER,
  OrchestratorDecision,
} from './task-orchestrator.types';

/**
 * TaskOrchestrator 集成测(crypto-native-agent-ops 任务 11)。
 *
 * 覆盖 design §C2 / 需求 2.1–2.4:
 *   - 读取(eval/选择器)→ LLM 决策 → CDP 动作 → 回执 的编排循环;
 *   - 锚定优先级与多动作类型(navigate / browser_eval / click_selector / pixel_click);
 *   - 失败结构化原因(selector_miss/timeout/dom_changed/blocked)+ 重试(指数退避)/ 降级;
 *   - 每步落 `agent_ops_action_log`,审计轨迹完整(目标/动作/结果/riskTier/approvedBy)。
 *
 * LLM 决策与浏览器执行(CDP 落点在桌面端)均经可注入接口 mock:
 *   - LLM_DECISION_PROVIDER:脚本化决策序列;
 *   - BROWSER_ACTION_EXECUTOR:模拟页面读取/点击/导航的成败路径。
 *
 * 分级审批使用真实 `ApprovalGrantService` + 真实 `PolicyEvaluatorService`(纯函数分级),
 * grant 仓库为 mock。
 */
describe('TaskOrchestrator — 编排循环 (需求 2 / design §C2)', () => {
  let orchestrator: TaskOrchestrator;

  // ── mock 仓库 ──
  const mockTaskRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const savedLogs: any[] = [];
  const mockActionLogRepo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => {
      const entry = { id: `log-${savedLogs.length + 1}`, at: new Date(), ...x };
      savedLogs.push(entry);
      return entry;
    }),
  };
  const mockGrantRepo = {
    findOne: jest.fn(),
    increment: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn(),
    save: jest.fn(),
  };

  // ── mock 可注入接口 ──
  const mockLlm = { decideNext: jest.fn() };
  const mockExecutor = { execute: jest.fn() };

  const TASK_ID = 'task-1';
  const USER_ID = 'user-1';
  const AGENT_ID = 'agent-1';

  const makeTask = (over: Partial<AgentOpsTaskEntity> = {}): AgentOpsTaskEntity =>
    ({
      id: TASK_ID,
      ownerId: USER_ID,
      agentId: AGENT_ID,
      type: 'due_diligence',
      input: { goal: 'research 0xabc' },
      status: 'pending',
      riskTier: 'read',
      approvalState: 'auto',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as AgentOpsTaskEntity;

  /** 脚本化 LLM:按序返回决策,耗尽后返回 done。 */
  const scriptLlm = (decisions: OrchestratorDecision[]) => {
    let i = 0;
    mockLlm.decideNext.mockImplementation(async () =>
      i < decisions.length ? decisions[i++] : { done: true, summary: 'end' },
    );
  };

  const ok = (data: any = { ok: true }): BrowserActionResult => ({
    success: true,
    data,
  });
  const fail = (
    failureReason: BrowserActionResult['failureReason'],
    error = 'err',
  ): BrowserActionResult => ({ success: false, failureReason, error });

  beforeEach(async () => {
    jest.clearAllMocks();
    savedLogs.length = 0;
    mockTaskRepo.findOne.mockResolvedValue(makeTask());
    mockTaskRepo.save.mockImplementation(async (x) => x);
    // 默认无 grant(read 动作不查;medium 默认回落人确认,除非测试覆盖)。
    mockGrantRepo.findOne.mockResolvedValue(null);

    const realEvaluator = new PolicyEvaluatorService(
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );
    const realApprovalGrants = new ApprovalGrantService(
      mockGrantRepo as any,
      realEvaluator,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskOrchestrator,
        { provide: getRepositoryToken(AgentOpsTaskEntity), useValue: mockTaskRepo },
        {
          provide: getRepositoryToken(AgentOpsActionLogEntity),
          useValue: mockActionLogRepo,
        },
        { provide: PolicyEvaluatorService, useValue: realEvaluator },
        { provide: ApprovalGrantService, useValue: realApprovalGrants },
        { provide: LLM_DECISION_PROVIDER, useValue: mockLlm },
        { provide: BROWSER_ACTION_EXECUTOR, useValue: mockExecutor },
      ],
    }).compile();

    orchestrator = module.get<TaskOrchestrator>(TaskOrchestrator);
  });

  it('should be defined', () => {
    expect(orchestrator).toBeDefined();
  });

  // ─────────────── 成功路径 ───────────────

  describe('成功路径:导航 → 读取 → 完成', () => {
    it('navigate(read) + browser_eval(read) → LLM 宣告完成,审计轨迹完整', async () => {
      scriptLlm([
        { done: false, action: { kind: 'navigate', url: 'https://etherscan.io/token/0xabc' } },
        { done: false, action: { kind: 'browser_eval', expression: 'document.title' } },
        { done: true, summary: '报告完成' },
      ]);
      mockExecutor.execute
        .mockResolvedValueOnce(ok({ navigated: true }))
        .mockResolvedValueOnce(ok({ title: 'Token 0xabc' }));

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('completed');
      expect(result.summary).toBe('报告完成');
      expect(result.steps).toBe(2);

      // 审计轨迹:2 步,均 read,均成功,target/action 正确。
      expect(savedLogs).toHaveLength(2);
      expect(savedLogs[0]).toMatchObject({
        taskId: TASK_ID,
        step: 1,
        action: 'navigate',
        target: 'https://etherscan.io/token/0xabc',
        riskTier: 'read',
        approvedBy: null,
      });
      expect(savedLogs[0].result).toMatchObject({ success: true });
      expect(savedLogs[1]).toMatchObject({
        step: 2,
        action: 'browser_eval',
        target: 'document.title',
        riskTier: 'read',
      });
      // 任务状态推进到 completed。
      expect(mockTaskRepo.save).toHaveBeenCalled();
    });
  });

  describe('成功路径:click_selector(medium)命中预算授权自动放行', () => {
    it('有覆盖的 grant → click_selector 自动放行并执行,审计 riskTier=medium', async () => {
      // 提供覆盖的会话/任务授权(预算够、未过期)。
      mockGrantRepo.findOne.mockResolvedValue({
        id: 'g1',
        userId: USER_ID,
        agentId: AGENT_ID,
        scope: 'task',
        scopeId: TASK_ID,
        budgetCap: '100',
        used: '0',
        expiresAt: null,
      });
      scriptLlm([
        { done: false, action: { kind: 'click_selector', selector: '#connect', cost: 1 } },
        { done: true, summary: 'clicked' },
      ]);
      mockExecutor.execute.mockResolvedValueOnce(ok({ clicked: true }));

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('completed');
      expect(savedLogs).toHaveLength(1);
      expect(savedLogs[0]).toMatchObject({
        action: 'click_selector',
        target: '#connect',
        riskTier: 'medium',
      });
      expect(mockGrantRepo.increment).toHaveBeenCalledWith({ id: 'g1' }, 'used', 1);
    });
  });

  // ─────────────── 重试(指数退避) ───────────────

  describe('失败重试:timeout 重试后成功', () => {
    it('browser_eval 连续 timeout 后成功 → 单步审计记最终成功', async () => {
      scriptLlm([
        { done: false, action: { kind: 'browser_eval', expression: 'window.__data' } },
        { done: true, summary: 'ok' },
      ]);
      mockExecutor.execute
        .mockResolvedValueOnce(fail('timeout'))
        .mockResolvedValueOnce(fail('timeout'))
        .mockResolvedValueOnce(ok({ data: 1 }));

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        maxRetriesPerAction: 2,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('completed');
      // 执行器被调用 3 次(首次 + 2 次重试)。
      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
      // 单步只落一条审计(最终成功)。
      expect(savedLogs).toHaveLength(1);
      expect(savedLogs[0].result).toMatchObject({ success: true });
    });

    it('timeout 超过重试上限 → 任务失败,审计记 failureReason=timeout', async () => {
      scriptLlm([
        { done: false, action: { kind: 'browser_eval', expression: 'x' } },
      ]);
      mockExecutor.execute.mockResolvedValue(fail('timeout'));

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        maxRetriesPerAction: 2,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('timeout');
      // 首次 + 2 次重试 = 3 次。
      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
      expect(savedLogs).toHaveLength(1);
      expect(savedLogs[0].result).toMatchObject({
        success: false,
        failureReason: 'timeout',
      });
    });
  });

  // ─────────────── 降级(selector_miss) ───────────────

  describe('失败降级:selector_miss → fallbackAction', () => {
    it('click_selector selector_miss → 改用 fallbackAction(browser_eval)成功', async () => {
      mockGrantRepo.findOne.mockResolvedValue({
        id: 'g1',
        userId: USER_ID,
        agentId: AGENT_ID,
        scope: 'task',
        scopeId: TASK_ID,
        budgetCap: '100',
        used: '0',
        expiresAt: null,
      });
      scriptLlm([
        {
          done: false,
          action: { kind: 'click_selector', selector: '#old-btn', cost: 0 },
          fallbackAction: { kind: 'browser_eval', expression: 'clickByText("Connect")' },
        },
        { done: true, summary: 'degraded ok' },
      ]);
      mockExecutor.execute
        .mockResolvedValueOnce(fail('selector_miss'))
        .mockResolvedValueOnce(ok({ viaFallback: true }));

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('completed');
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
      // 第二次调用应是 fallbackAction(browser_eval)。
      expect(mockExecutor.execute.mock.calls[1][0].action).toMatchObject({
        kind: 'browser_eval',
        expression: 'clickByText("Connect")',
      });
      expect(savedLogs[0].result).toMatchObject({ success: true });
    });

    it('selector_miss 且无 fallbackAction → 任务失败(不重试)', async () => {
      mockGrantRepo.findOne.mockResolvedValue({
        id: 'g1',
        userId: USER_ID,
        agentId: AGENT_ID,
        scope: 'task',
        scopeId: TASK_ID,
        budgetCap: '100',
        used: '0',
        expiresAt: null,
      });
      scriptLlm([
        { done: false, action: { kind: 'click_selector', selector: '#missing', cost: 0 } },
      ]);
      mockExecutor.execute.mockResolvedValue(fail('selector_miss'));

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('selector_miss');
      // 不重试:仅 1 次执行。
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────── 阻断(blocked) ───────────────

  describe('失败阻断:blocked 不重试', () => {
    it('navigate blocked → 立即失败,执行器仅调用一次', async () => {
      scriptLlm([
        { done: false, action: { kind: 'navigate', url: 'https://blocked.example' } },
      ]);
      mockExecutor.execute.mockResolvedValue(fail('blocked', 'captcha'));

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('blocked');
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
      expect(savedLogs[0].result).toMatchObject({
        success: false,
        failureReason: 'blocked',
      });
    });
  });

  // ─────────────── 红线 / 人确认(分级审批) ───────────────

  describe('分级审批:红线拒绝 + 高风险人确认', () => {
    it('红线动作 → deny:不执行,审计记 blocked,任务失败', async () => {
      scriptLlm([
        {
          done: false,
          action: {
            kind: 'click_selector',
            selector: '#go',
            target: 'wash trading 对敲刷量',
          },
        },
      ]);

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('blocked');
      // 红线先于执行:执行器从未被调用。
      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect(savedLogs[0].result).toMatchObject({
        success: false,
        failureReason: 'blocked',
      });
    });

    it('medium 无授权 → user_confirmation:暂停为 awaiting_approval,不执行', async () => {
      mockGrantRepo.findOne.mockResolvedValue(null); // 无 grant
      scriptLlm([
        { done: false, action: { kind: 'click_selector', selector: '#publish', cost: 5 } },
      ]);

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('awaiting_approval');
      expect(mockExecutor.execute).not.toHaveBeenCalled();
      // 审计记录该步需人确认(approvedBy=null)。
      expect(savedLogs).toHaveLength(1);
      expect(savedLogs[0]).toMatchObject({ action: 'click_selector', approvedBy: null });
      expect(savedLogs[0].result.raw).toMatchObject({ requiresApproval: true });
    });
  });

  // ─────────────── 步数上限 ───────────────

  describe('步数上限', () => {
    it('LLM 持续产出动作 → 触达 maxSteps 后失败(timeout 语义)', async () => {
      // LLM 永远返回可执行 read 动作。
      mockLlm.decideNext.mockResolvedValue({
        done: false,
        action: { kind: 'browser_eval', expression: 'loop' },
      });
      mockExecutor.execute.mockResolvedValue(ok());

      const result = await orchestrator.run({
        userId: USER_ID,
        taskId: TASK_ID,
        maxSteps: 3,
        backoffBaseMs: 0,
      });

      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('timeout');
      expect(result.reason).toBe('MAX_STEPS_EXCEEDED');
      expect(result.steps).toBe(3);
      expect(savedLogs).toHaveLength(3);
    });
  });
});
