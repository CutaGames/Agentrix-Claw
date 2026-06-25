import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentOpsTaskEntity,
  AgentOpsTaskType,
} from './entities/agent-ops-task.entity';
import { AgentOpsDeliverableEntity } from './entities/agent-ops-deliverable.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import {
  AUTONOMOUS_COMPLETION_THRESHOLD,
  AutonomousCompletionMetric,
  ColdStartFunnel,
  FunnelStage,
  LatencyMetric,
  MetricsWindow,
  QUALITY_PASS_THRESHOLD,
  QualityPassMetric,
  RecordHumanSpotCheckParams,
  ReliabilitySnapshot,
} from './reliability-metrics.types';

/** 视为「一次尝试」(达终态)的任务状态。 */
const ATTEMPT_TERMINAL_STATUSES = new Set(['completed', 'failed']);

/** 默认度量的垂直活儿(需求 18.2:首个垂直 = 尽调)。 */
const DEFAULT_TASK_TYPE: AgentOpsTaskType = 'due_diligence';

/** 冷启动漏斗 + 付费信号入参。 */
export interface FunnelParams extends MetricsWindow {
  /**
   * 「付费」侧信号:已产生真实收入的 Agent id 集合,由调用方
   * (结算编排 / 分享侧)提供。分享侧信号从交付物 `sharedAt` 派生。
   */
  paidAgentIds?: Iterable<string>;
}

/**
 * ReliabilityMetricsService — 可靠性度量埋点(crypto-native-agent-ops 任务 15)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「指标采集」、§Phasing P0。
 *   - 需求 18.2:自主完成率(≥80%)/ 质量合格率(≥90%,人工抽检);18.4:冷启动漏斗。
 *
 * 设计:
 *   - 指标基于 `agent_ops_task` / `agent_ops_deliverable` / `agent_ops_action_log`
 *     三表派生,**不引入新事实源**(口径单一权威)。
 *   - 「无人工救场」由 `task.approvalState` + `action_log.approvedBy` 派生。
 *   - 人工抽检入口 {@link recordHumanSpotCheck} 写入交付物 humanReview* 字段,
 *     与自动校验器口径 `qualified` 分离,互不覆盖。
 *   - 窗口过滤在内存中完成(度量数据量小、按需触发),便于口径可验证。
 */
@Injectable()
export class ReliabilityMetricsService {
  private readonly logger = new Logger(ReliabilityMetricsService.name);

  constructor(
    @InjectRepository(AgentOpsTaskEntity)
    private readonly taskRepo: Repository<AgentOpsTaskEntity>,
    @InjectRepository(AgentOpsDeliverableEntity)
    private readonly deliverableRepo: Repository<AgentOpsDeliverableEntity>,
    @InjectRepository(AgentOpsActionLogEntity)
    private readonly actionLogRepo: Repository<AgentOpsActionLogEntity>,
  ) {}

  // ─────────────────────── 人工抽检入口(需求 18.2) ───────────────────────

  /**
   * 人工抽检入口:将某交付物标记为人工判定合格/不合格。
   * 独立记录,不覆盖自动校验器口径 `qualified`(保住自主完成率口径)。
   */
  async recordHumanSpotCheck(
    params: RecordHumanSpotCheckParams,
  ): Promise<AgentOpsDeliverableEntity> {
    const deliverable = await this.deliverableRepo.findOne({
      where: { id: params.deliverableId },
    });
    if (!deliverable) {
      throw new NotFoundException(
        `AgentOpsDeliverable ${params.deliverableId} not found`,
      );
    }
    deliverable.humanReviewState = params.qualified ? 'qualified' : 'unqualified';
    deliverable.humanReviewedBy = params.reviewerId;
    deliverable.humanReviewedAt = new Date();
    deliverable.humanReviewNotes = params.notes ?? null;
    const saved = await this.deliverableRepo.save(deliverable);
    this.logger.debug(
      `spot-check deliverable=${saved.id} by=${params.reviewerId} qualified=${params.qualified}`,
    );
    return saved;
  }

  /** 标记交付物已分享(冷启动漏斗末段分享侧信号,需求 18.4)。 */
  async markDeliverableShared(
    deliverableId: string,
  ): Promise<AgentOpsDeliverableEntity> {
    const deliverable = await this.deliverableRepo.findOne({
      where: { id: deliverableId },
    });
    if (!deliverable) {
      throw new NotFoundException(
        `AgentOpsDeliverable ${deliverableId} not found`,
      );
    }
    if (!deliverable.sharedAt) {
      deliverable.sharedAt = new Date();
      return this.deliverableRepo.save(deliverable);
    }
    return deliverable;
  }

  // ─────────────────────── 指标计算 ───────────────────────

  /**
   * 自主完成率 = 全程无人工救场即交付合格 / 总尝试(需求 18.2)。
   * 总尝试 = 窗口内达终态(completed/failed)的目标类型任务。
   */
  async computeAutonomousCompletionRate(
    window: MetricsWindow = {},
  ): Promise<AutonomousCompletionMetric> {
    const taskType = window.taskType ?? DEFAULT_TASK_TYPE;
    const tasks = (await this.loadTasks(window, taskType)).filter((t) =>
      ATTEMPT_TERMINAL_STATUSES.has(t.status),
    );
    const deliverables = await this.loadDeliverables(window);
    const logs = await this.loadActionLogs();

    // 每任务:是否存在人工审批步。
    const humanApprovedTaskIds = new Set<string>();
    for (const log of logs) {
      if (log.approvedBy != null) humanApprovedTaskIds.add(log.taskId);
    }
    // 每任务:是否有合格(自动口径)交付物。
    const qualifiedTaskIds = new Set<string>();
    for (const d of deliverables) {
      if (d.qualified === true) qualifiedTaskIds.add(d.taskId);
    }

    let autonomous = 0;
    let autonomousQualified = 0;
    for (const task of tasks) {
      const isAutonomous =
        task.approvalState === 'auto' && !humanApprovedTaskIds.has(task.id);
      if (!isAutonomous) continue;
      autonomous += 1;
      if (qualifiedTaskIds.has(task.id)) autonomousQualified += 1;
    }

    const attempts = tasks.length;
    const rate = attempts === 0 ? null : autonomousQualified / attempts;
    return {
      attempts,
      autonomous,
      autonomousQualified,
      rate,
      threshold: AUTONOMOUS_COMPLETION_THRESHOLD,
      meetsThreshold: rate != null && rate >= AUTONOMOUS_COMPLETION_THRESHOLD,
    };
  }

  /**
   * 质量合格率 = 交付物经人工抽检判为合格 / 已交付(需求 18.2)。
   * 门槛口径:抽检合格 / 抽检数(抽检样本均为已交付物);另报抽检覆盖率。
   */
  async computeQualityPassRate(
    window: MetricsWindow = {},
  ): Promise<QualityPassMetric> {
    const deliverables = await this.loadDeliverables(window);
    const delivered = deliverables.length;
    let spotChecked = 0;
    let spotCheckQualified = 0;
    for (const d of deliverables) {
      if (d.humanReviewState === 'qualified' || d.humanReviewState === 'unqualified') {
        spotChecked += 1;
        if (d.humanReviewState === 'qualified') spotCheckQualified += 1;
      }
    }
    const rate = spotChecked === 0 ? null : spotCheckQualified / spotChecked;
    const spotCheckCoverage = delivered === 0 ? null : spotChecked / delivered;
    return {
      delivered,
      spotChecked,
      spotCheckQualified,
      rate,
      spotCheckCoverage,
      threshold: QUALITY_PASS_THRESHOLD,
      meetsThreshold: rate != null && rate >= QUALITY_PASS_THRESHOLD,
    };
  }

  /** 时延统计(毫秒,来自交付物报告 latencyMs)。 */
  async computeLatencyStats(window: MetricsWindow = {}): Promise<LatencyMetric> {
    const deliverables = await this.loadDeliverables(window);
    const samples: number[] = [];
    for (const d of deliverables) {
      const ms = this.extractLatencyMs(d);
      if (ms != null) samples.push(ms);
    }
    if (samples.length === 0) {
      return { count: 0, avgMs: null, minMs: null, maxMs: null, p50Ms: null, p95Ms: null };
    }
    samples.sort((a, b) => a - b);
    const sum = samples.reduce((acc, v) => acc + v, 0);
    return {
      count: samples.length,
      avgMs: sum / samples.length,
      minMs: samples[0],
      maxMs: samples[samples.length - 1],
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
    };
  }

  /**
   * 冷启动漏斗(需求 18.4):
   * 创建 Agent → 跑首个任务 → 拿到合格交付 → 付费/分享。
   */
  async computeColdStartFunnel(params: FunnelParams = {}): Promise<ColdStartFunnel> {
    const tasks = await this.loadTasks(params, params.taskType);
    const deliverables = await this.loadDeliverables(params);

    // 段 1+2:有任务的 Agent(= 创建 Agent 且跑了首个任务)。
    // 「创建 Agent」以「在 ops 中出现的 Agent」为口径(任务/交付物归属的 agentId)。
    const createdAgents = new Set<string>();
    const ranTaskAgents = new Set<string>();
    for (const t of tasks) {
      createdAgents.add(t.agentId);
      ranTaskAgents.add(t.agentId);
    }
    for (const d of deliverables) createdAgents.add(d.agentId);

    // 段 3:拿到合格交付(自动口径 qualified === true)的 Agent。
    const qualifiedAgents = new Set<string>();
    for (const d of deliverables) {
      if (d.qualified === true) qualifiedAgents.add(d.agentId);
    }

    // 段 4:付费 或 分享。
    const paidSet = new Set<string>(params.paidAgentIds ?? []);
    const paidOrSharedAgents = new Set<string>();
    for (const d of deliverables) {
      if (d.sharedAt != null) paidOrSharedAgents.add(d.agentId);
    }
    for (const id of paidSet) paidOrSharedAgents.add(id);

    const stages: FunnelStage[] = [
      stage('created_agent', createdAgents.size, null),
      stage('ran_first_task', ranTaskAgents.size, createdAgents.size),
      stage('got_qualified_delivery', qualifiedAgents.size, ranTaskAgents.size),
      stage('paid_or_shared', paidOrSharedAgents.size, qualifiedAgents.size),
    ];
    return { stages };
  }

  /** 汇总快照(三指标 + 漏斗 + 门槛判定)。 */
  async getReliabilitySnapshot(
    params: FunnelParams = {},
  ): Promise<ReliabilitySnapshot> {
    const taskType = params.taskType ?? DEFAULT_TASK_TYPE;
    const [autonomousCompletion, qualityPass, latency, funnel] = await Promise.all([
      this.computeAutonomousCompletionRate(params),
      this.computeQualityPassRate(params),
      this.computeLatencyStats(params),
      this.computeColdStartFunnel(params),
    ]);
    return {
      window: {
        since: params.since ? params.since.toISOString() : null,
        until: params.until ? params.until.toISOString() : null,
        agentId: params.agentId ?? null,
        taskType,
      },
      autonomousCompletion,
      qualityPass,
      latency,
      funnel,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────── 数据加载 + 窗口过滤 ───────────────────────

  private async loadTasks(
    window: MetricsWindow,
    taskType?: AgentOpsTaskType,
  ): Promise<AgentOpsTaskEntity[]> {
    const rows = await this.taskRepo.find();
    return rows.filter(
      (t) =>
        (taskType == null || t.type === taskType) &&
        (window.agentId == null || t.agentId === window.agentId) &&
        inWindow(t.createdAt, window),
    );
  }

  private async loadDeliverables(
    window: MetricsWindow,
  ): Promise<AgentOpsDeliverableEntity[]> {
    const rows = await this.deliverableRepo.find();
    return rows.filter(
      (d) =>
        (window.agentId == null || d.agentId === window.agentId) &&
        inWindow(d.createdAt, window),
    );
  }

  private async loadActionLogs(): Promise<AgentOpsActionLogEntity[]> {
    return this.actionLogRepo.find();
  }

  /** 从交付物中提取报告时延(优先 content.report.latencyMs)。 */
  private extractLatencyMs(d: AgentOpsDeliverableEntity): number | null {
    const content = (d.content ?? {}) as Record<string, any>;
    const candidates = [content?.report?.latencyMs, content?.latencyMs];
    for (const c of candidates) {
      if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
    }
    return null;
  }
}

// ─────────────────────── 工具 ───────────────────────

function stage(
  name: FunnelStage['stage'],
  count: number,
  prevCount: number | null,
): FunnelStage {
  const conversionFromPrev =
    prevCount == null ? null : prevCount === 0 ? null : count / prevCount;
  return { stage: name, count, conversionFromPrev };
}

/** 时间是否落在窗口内(含端点)。 */
function inWindow(at: Date | null | undefined, window: MetricsWindow): boolean {
  if (at == null) return true;
  const t = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (window.since && t < window.since.getTime()) return false;
  if (window.until && t > window.until.getTime()) return false;
  return true;
}

/** 线性插值百分位(samples 已升序)。 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}
