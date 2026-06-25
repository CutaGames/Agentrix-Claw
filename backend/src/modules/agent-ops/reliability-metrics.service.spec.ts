import { ReliabilityMetricsService } from './reliability-metrics.service';
import { AgentOpsTaskEntity } from './entities/agent-ops-task.entity';
import { AgentOpsDeliverableEntity } from './entities/agent-ops-deliverable.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import {
  AUTONOMOUS_COMPLETION_THRESHOLD,
  QUALITY_PASS_THRESHOLD,
} from './reliability-metrics.types';

/**
 * ReliabilityMetricsService 单测(crypto-native-agent-ops 任务 15 / 需求 18)。
 *
 * 重点:**指标口径正确**
 *   - 自主完成率 = 全程无人工救场(approvalState=auto 且无 approvedBy 审批步)且交付合格
 *     / 总尝试(达终态 completed/failed 的目标类型任务)≥ 0.8;
 *   - 质量合格率 = 人工抽检合格 / 抽检数(已交付样本)≥ 0.9;与自动口径 qualified 分离;
 *   - 时延统计来自交付物报告 latencyMs;
 *   - 冷启动漏斗:创建 Agent → 跑首个任务 → 拿到合格交付 → 付费/分享。
 */
describe('ReliabilityMetricsService (任务 15 / 需求 18)', () => {
  // ── 数组支撑的可核 mock 仓库 ──
  function makeRepo<T extends { id?: string }>(rows: T[]) {
    return {
      rows,
      find: jest.fn(async () => rows.slice()),
      findOne: jest.fn(async (opts: any) => {
        const id = opts?.where?.id;
        return rows.find((r) => (r as any).id === id) ?? null;
      }),
      save: jest.fn(async (e: any) => {
        const idx = rows.findIndex((r) => (r as any).id === e.id);
        if (idx >= 0) rows[idx] = e;
        else rows.push(e);
        return e;
      }),
    };
  }

  function makeService(
    tasks: Partial<AgentOpsTaskEntity>[],
    deliverables: Partial<AgentOpsDeliverableEntity>[],
    logs: Partial<AgentOpsActionLogEntity>[],
  ) {
    const taskRepo = makeRepo(tasks as any[]);
    const deliverableRepo = makeRepo(deliverables as any[]);
    const logRepo = makeRepo(logs as any[]);
    const service = new ReliabilityMetricsService(
      taskRepo as any,
      deliverableRepo as any,
      logRepo as any,
    );
    return { service, taskRepo, deliverableRepo, logRepo };
  }

  const T0 = new Date('2026-05-10T00:00:00.000Z');

  function task(
    id: string,
    over: Partial<AgentOpsTaskEntity> = {},
  ): Partial<AgentOpsTaskEntity> {
    return {
      id,
      agentId: `agent-${id}`,
      ownerId: 'owner-1',
      type: 'due_diligence',
      status: 'completed',
      approvalState: 'auto',
      createdAt: T0,
      ...over,
    };
  }

  function deliverable(
    id: string,
    over: Partial<AgentOpsDeliverableEntity> = {},
  ): Partial<AgentOpsDeliverableEntity> {
    return {
      id,
      taskId: id,
      agentId: `agent-${id}`,
      type: 'due_diligence_report',
      content: {},
      qualified: true,
      createdAt: T0,
      ...over,
    };
  }

  // ───────────────────── 自主完成率 ─────────────────────

  describe('自主完成率口径', () => {
    it('= 无人工救场且合格 / 总尝试;4/5=0.8 达标', async () => {
      const tasks = [
        task('t1'),
        task('t2'),
        task('t3'),
        task('t4'),
        // 人工审批 → 非自主(approvalState=pending)。
        task('t5', { approvalState: 'approved' }),
      ];
      const deliverables = [
        deliverable('t1'),
        deliverable('t2'),
        deliverable('t3'),
        deliverable('t4'),
        deliverable('t5'),
      ];
      const { service } = makeService(tasks, deliverables, []);
      const m = await service.computeAutonomousCompletionRate();
      expect(m.attempts).toBe(5);
      expect(m.autonomous).toBe(4);
      expect(m.autonomousQualified).toBe(4);
      expect(m.rate).toBeCloseTo(0.8, 10);
      expect(m.threshold).toBe(AUTONOMOUS_COMPLETION_THRESHOLD);
      expect(m.meetsThreshold).toBe(true);
    });

    it('action_log 存在 approvedBy → 该任务计为人工救场(非自主)', async () => {
      const tasks = [task('t1'), task('t2')];
      const deliverables = [deliverable('t1'), deliverable('t2')];
      const logs = [
        { id: 'l1', taskId: 't1', approvedBy: 'human-1' } as any,
        { id: 'l2', taskId: 't2', approvedBy: null } as any,
      ];
      const { service } = makeService(tasks, deliverables, logs);
      const m = await service.computeAutonomousCompletionRate();
      expect(m.attempts).toBe(2);
      expect(m.autonomous).toBe(1); // 仅 t2 自主
      expect(m.autonomousQualified).toBe(1);
      expect(m.rate).toBeCloseTo(0.5, 10);
      expect(m.meetsThreshold).toBe(false);
    });

    it('自主但交付不合格 → 不计入分子', async () => {
      const tasks = [task('t1'), task('t2')];
      const deliverables = [
        deliverable('t1', { qualified: true }),
        deliverable('t2', { qualified: false }),
      ];
      const { service } = makeService(tasks, deliverables, []);
      const m = await service.computeAutonomousCompletionRate();
      expect(m.autonomous).toBe(2);
      expect(m.autonomousQualified).toBe(1);
      expect(m.rate).toBeCloseTo(0.5, 10);
    });

    it('总尝试只含达终态(completed/failed),排除 pending/running', async () => {
      const tasks = [
        task('t1', { status: 'completed' }),
        task('t2', { status: 'failed' }),
        task('t3', { status: 'pending' }),
        task('t4', { status: 'running' }),
        task('t5', { status: 'awaiting_approval' }),
      ];
      const deliverables = [deliverable('t1')];
      const { service } = makeService(tasks, deliverables, []);
      const m = await service.computeAutonomousCompletionRate();
      expect(m.attempts).toBe(2); // t1, t2
      expect(m.autonomousQualified).toBe(1); // 仅 t1 有合格交付
    });

    it('只统计目标任务类型(默认 due_diligence)', async () => {
      const tasks = [
        task('t1', { type: 'due_diligence' }),
        task('t2', { type: 'monitor' }),
      ];
      const deliverables = [deliverable('t1'), deliverable('t2')];
      const { service } = makeService(tasks, deliverables, []);
      const m = await service.computeAutonomousCompletionRate();
      expect(m.attempts).toBe(1);
    });

    it('无尝试 → rate=null,meetsThreshold=false', async () => {
      const { service } = makeService([], [], []);
      const m = await service.computeAutonomousCompletionRate();
      expect(m.attempts).toBe(0);
      expect(m.rate).toBeNull();
      expect(m.meetsThreshold).toBe(false);
    });
  });

  // ───────────────────── 质量合格率 ─────────────────────

  describe('质量合格率口径', () => {
    it('= 人工抽检合格 / 抽检数;且与自动 qualified 分离', async () => {
      const deliverables = [
        deliverable('d1', { humanReviewState: 'qualified' }),
        deliverable('d2', { humanReviewState: 'qualified' }),
        deliverable('d3', { humanReviewState: 'unqualified' }),
        // 未抽检:不计入分母。
        deliverable('d4', { humanReviewState: null }),
      ];
      const { service } = makeService([], deliverables, []);
      const m = await service.computeQualityPassRate();
      expect(m.delivered).toBe(4);
      expect(m.spotChecked).toBe(3);
      expect(m.spotCheckQualified).toBe(2);
      expect(m.rate).toBeCloseTo(2 / 3, 10);
      expect(m.spotCheckCoverage).toBeCloseTo(3 / 4, 10);
      expect(m.threshold).toBe(QUALITY_PASS_THRESHOLD);
    });

    it('10 抽检 9 合格 = 0.9 达标', async () => {
      const deliverables = Array.from({ length: 10 }, (_, i) =>
        deliverable(`d${i}`, {
          humanReviewState: i === 0 ? 'unqualified' : 'qualified',
        }),
      );
      const { service } = makeService([], deliverables, []);
      const m = await service.computeQualityPassRate();
      expect(m.rate).toBeCloseTo(0.9, 10);
      expect(m.meetsThreshold).toBe(true);
    });

    it('无抽检 → rate=null,coverage=0', async () => {
      const deliverables = [deliverable('d1', { humanReviewState: null })];
      const { service } = makeService([], deliverables, []);
      const m = await service.computeQualityPassRate();
      expect(m.spotChecked).toBe(0);
      expect(m.rate).toBeNull();
      expect(m.spotCheckCoverage).toBe(0);
      expect(m.meetsThreshold).toBe(false);
    });
  });

  // ───────────────────── 时延 ─────────────────────

  describe('时延统计口径', () => {
    it('从 content.report.latencyMs 聚合 avg/min/max/p50/p95', async () => {
      const ms = [100, 200, 300, 400, 500];
      const deliverables = ms.map((v, i) =>
        deliverable(`d${i}`, { content: { report: { latencyMs: v } } }),
      );
      const { service } = makeService([], deliverables, []);
      const m = await service.computeLatencyStats();
      expect(m.count).toBe(5);
      expect(m.avgMs).toBe(300);
      expect(m.minMs).toBe(100);
      expect(m.maxMs).toBe(500);
      expect(m.p50Ms).toBe(300);
      expect(m.p95Ms).toBeCloseTo(480, 10);
    });

    it('忽略缺失/非法 latencyMs', async () => {
      const deliverables = [
        deliverable('d1', { content: { report: { latencyMs: 100 } } }),
        deliverable('d2', { content: {} }),
        deliverable('d3', { content: { report: { latencyMs: -5 } } }),
        deliverable('d4', { content: { latencyMs: 300 } }), // 顶层兜底
      ];
      const { service } = makeService([], deliverables, []);
      const m = await service.computeLatencyStats();
      expect(m.count).toBe(2);
      expect(m.avgMs).toBe(200);
    });

    it('无样本 → 全 null', async () => {
      const { service } = makeService([], [], []);
      const m = await service.computeLatencyStats();
      expect(m.count).toBe(0);
      expect(m.avgMs).toBeNull();
      expect(m.p95Ms).toBeNull();
    });
  });

  // ───────────────────── 冷启动漏斗 ─────────────────────

  describe('冷启动漏斗口径', () => {
    it('创建 → 跑首个任务 → 合格交付 → 付费/分享 各段计数+转化', async () => {
      const tasks = [
        task('t1', { agentId: 'a1' }),
        task('t2', { agentId: 'a2' }),
        task('t3', { agentId: 'a3' }),
        task('t4', { agentId: 'a4' }),
      ];
      const deliverables = [
        deliverable('d1', { taskId: 't1', agentId: 'a1', qualified: true, sharedAt: T0 }),
        deliverable('d2', { taskId: 't2', agentId: 'a2', qualified: true }),
        deliverable('d3', { taskId: 't3', agentId: 'a3', qualified: false }),
      ];
      const { service } = makeService(tasks, deliverables, []);
      // a1 分享;a2 付费(外部信号)。
      const funnel = await service.computeColdStartFunnel({
        paidAgentIds: ['a2'],
      });
      const byStage = Object.fromEntries(
        funnel.stages.map((s) => [s.stage, s.count]),
      );
      expect(byStage.created_agent).toBe(4); // a1..a4
      expect(byStage.ran_first_task).toBe(4);
      expect(byStage.got_qualified_delivery).toBe(2); // a1, a2
      expect(byStage.paid_or_shared).toBe(2); // a1(分享) + a2(付费)

      const qualifiedStage = funnel.stages.find(
        (s) => s.stage === 'got_qualified_delivery',
      )!;
      expect(qualifiedStage.conversionFromPrev).toBeCloseTo(2 / 4, 10);
    });

    it('首段转化率为 null', async () => {
      const { service } = makeService([task('t1', { agentId: 'a1' })], [], []);
      const funnel = await service.computeColdStartFunnel();
      expect(funnel.stages[0].conversionFromPrev).toBeNull();
    });
  });

  // ───────────────────── 人工抽检入口 ─────────────────────

  describe('人工抽检入口(recordHumanSpotCheck)', () => {
    it('写入 humanReview* 字段,且不覆盖自动 qualified', async () => {
      const d = deliverable('d1', { qualified: true, humanReviewState: null });
      const { service, deliverableRepo } = makeService([], [d], []);
      const updated = await service.recordHumanSpotCheck({
        deliverableId: 'd1',
        reviewerId: 'qa-1',
        qualified: false,
        notes: '报告数字矛盾',
      });
      expect(updated.humanReviewState).toBe('unqualified');
      expect(updated.humanReviewedBy).toBe('qa-1');
      expect(updated.humanReviewedAt).toBeInstanceOf(Date);
      expect(updated.humanReviewNotes).toBe('报告数字矛盾');
      // 自动口径不被覆盖。
      expect(updated.qualified).toBe(true);
      expect(deliverableRepo.save).toHaveBeenCalledTimes(1);
    });

    it('交付物不存在 → 抛 NotFound', async () => {
      const { service } = makeService([], [], []);
      await expect(
        service.recordHumanSpotCheck({
          deliverableId: 'missing',
          reviewerId: 'qa-1',
          qualified: true,
        }),
      ).rejects.toThrow();
    });

    it('markDeliverableShared 写入 sharedAt(幂等)', async () => {
      const d = deliverable('d1', { sharedAt: null });
      const { service } = makeService([], [d], []);
      const first = await service.markDeliverableShared('d1');
      expect(first.sharedAt).toBeInstanceOf(Date);
      const firstAt = first.sharedAt;
      const second = await service.markDeliverableShared('d1');
      expect(second.sharedAt).toBe(firstAt); // 不重复刷新
    });
  });

  // ───────────────────── 窗口过滤 ─────────────────────

  describe('窗口/范围过滤', () => {
    it('按 since/until 过滤任务与交付物', async () => {
      const early = new Date('2026-05-01T00:00:00.000Z');
      const late = new Date('2026-05-20T00:00:00.000Z');
      const tasks = [
        task('t1', { createdAt: early }),
        task('t2', { createdAt: late }),
      ];
      const deliverables = [
        deliverable('t1', { createdAt: early }),
        deliverable('t2', { createdAt: late }),
      ];
      const { service } = makeService(tasks, deliverables, []);
      const m = await service.computeAutonomousCompletionRate({
        since: new Date('2026-05-15T00:00:00.000Z'),
      });
      expect(m.attempts).toBe(1); // 仅 t2
    });

    it('按 agentId 过滤', async () => {
      const tasks = [
        task('t1', { agentId: 'a1' }),
        task('t2', { agentId: 'a2' }),
      ];
      const deliverables = [
        deliverable('t1', { agentId: 'a1' }),
        deliverable('t2', { agentId: 'a2' }),
      ];
      const { service } = makeService(tasks, deliverables, []);
      const m = await service.computeAutonomousCompletionRate({ agentId: 'a1' });
      expect(m.attempts).toBe(1);
    });
  });

  // ───────────────────── 汇总快照 ─────────────────────

  it('getReliabilitySnapshot 汇总三指标 + 漏斗 + 窗口元信息', async () => {
    const tasks = [task('t1', { agentId: 'a1' })];
    const deliverables = [
      deliverable('t1', {
        agentId: 'a1',
        qualified: true,
        humanReviewState: 'qualified',
        content: { report: { latencyMs: 1234 } },
      }),
    ];
    const { service } = makeService(tasks, deliverables, []);
    const snap = await service.getReliabilitySnapshot({ agentId: 'a1' });
    expect(snap.window.agentId).toBe('a1');
    expect(snap.window.taskType).toBe('due_diligence');
    expect(snap.autonomousCompletion.attempts).toBe(1);
    expect(snap.qualityPass.spotChecked).toBe(1);
    expect(snap.latency.count).toBe(1);
    expect(snap.funnel.stages).toHaveLength(4);
    expect(typeof snap.generatedAt).toBe('string');
  });
});
