import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorldPlot } from '../entities/world-plot.entity';
import { EcsWorldVersion } from '../entities/ecs-world-version.entity';
import { PlotModerationDecision } from '../entities/plot-moderation-decision.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { ModerationService } from '../../world-engine/services/moderation.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../../entities/notification.entity';
import type {
  EcsWorld,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import type {
  PlotModerationDecisionEntry,
} from '../../../../shared/types/world-creation-api';
import {
  scanLogicModule,
  verifyHash,
  type ScanResult,
} from './static-code-scan';

/** Pipeline stages persisted to `plot_moderation_decisions` (R10.6). */
type PlotModerationStage =
  | 'pre_publish'
  | 'cn_region'
  | 'static_code_scan'
  | 'post_publish_report';

/** Result of the pre-publish moderation gate (consumed by ArenaService hook). */
export type PrePublishResult =
  | { passed: true }
  | { passed: false; error: WorldCreationError };

/** Options for the pre-publish gate. */
export interface RunPrePublishOptions {
  /** Apply the cn-region moderation increment on top of the v5 5-stage pipeline. */
  isChineseRegion?: boolean;
  /**
   * Reviewed source for each Tier_C logic module, keyed by `moduleId`. Supplied
   * by the publish flow so the `static_code_scan` stage can scan the actual
   * bytecode and lock its hash (design §10.2 / §3.3, R10.2). A Tier_C module
   * without a reviewable source here is treated as a scan failure (cannot
   * verify ⇒ block publish).
   */
  logicModuleSources?: Record<string, string>;
  /**
   * Egress host allowlist applied to the static scan's ④ egress check (exact
   * host or `*.example.com` wildcard, mirroring NetFetchProxy). Empty/omitted ⇒
   * any egress URL literal in a logic module is a violation.
   */
  egressAllowedHosts?: ReadonlyArray<string>;
}

/**
 * PlotModerationService — Plot 体验发布前 + 发布后审核管线 (Task 16.1, R10).
 *
 * **复用 v5 审核引擎，不重建**：注入 world-engine 的 {@link ModerationService}
 * (5 阶段审核 + cn-region 增量) 执行内容判定；本服务仅做 Plot 维度的编排、
 * 审计落库 (`plot_moderation_decisions`，cn-region 留存期) 与地图发现/下架的
 * 状态门控。
 *
 * 职责 (design §10)：
 *  - {@link runPrePublish}：发布前运行 v5 5 阶段 (版权 + 违禁词) + cn-region 增量；
 *    每阶段决策写审计；**通过才允许** 调用方将 Plot status→published 进入地图发现
 *    (R10.1/R10.3/R10.6)。
 *  - {@link reportPlot}：受理发布后举报，按既有 SLA 入队 (decision=pending)，
 *    与 v5 `ModerationService.submitReport` 语义一致 (R10.4)。
 *  - {@link takedown}：举报命中违规 → Plot status→suspended (从 MapService.discover
 *    的可见集 published/listed 中移除即下架) + 通知 owner + 写审计 (R10.5/R10.6)。
 *  - {@link getDecisions}：读取某 Plot 的审核决策审计日志 (R10.6)。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 *
 * @see backend/src/modules/world-engine/services/moderation.service.ts — v5 5 阶段 + cn-region
 */
@Injectable()
export class PlotModerationService {
  private readonly logger = new Logger(PlotModerationService.name);

  /** Map-visible statuses; takedown removes a Plot from this set. */
  private static readonly SUSPENDED_STATUS = 'suspended';

  /** Max characters of aggregated ECS text fed to the moderation engine. */
  private readonly MAX_MODERATION_TEXT = 8000;

  constructor(
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    @InjectRepository(EcsWorldVersion)
    private readonly versionRepo: Repository<EcsWorldVersion>,
    @InjectRepository(PlotModerationDecision)
    private readonly decisionRepo: Repository<PlotModerationDecision>,
    @InjectRepository(AgentAccount)
    private readonly accountRepo: Repository<AgentAccount>,
    /** Reuse v5 5-stage moderation engine (NOT rebuilt). */
    private readonly moderationService: ModerationService,
    /** Notify Plot owner on takedown; optional so the service is unit-testable. */
    @Optional()
    private readonly notificationService?: NotificationService,
  ) {}

  // ============================================================
  // R10.1 / R10.3 / R10.6 — Pre-publish moderation gate
  // ============================================================

  /**
   * 发布前审核：运行 v5 5 阶段 (版权 + 违禁词) + cn-region 增量，通过才允许发布。
   *
   * 每个阶段的判定都写入 `plot_moderation_decisions` 审计 (cn-region 留存期)。
   * 任一阶段拒绝 → 返回结构化 `MODERATION_REJECTED` 错误 (含具体阶段与原因，
   * R10.3)，调用方据此阻断发布、不改 Plot 状态。全部通过 → 记 `pre_publish`
   * approved 决策并返回 `{ passed: true }`。
   *
   * @param plotId 目标 Plot id
   * @param opts   `isChineseRegion` 触发 cn-region 增量
   */
  async runPrePublish(
    plotId: string,
    opts: RunPrePublishOptions = {},
  ): Promise<PrePublishResult> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }

    const { text, tags } = await this.collectModerationContent(plot);

    // Stage 1 (v5): 版权角色分类 (复用 checkCopyrightedCharacter)。
    const copyright = await this.moderationService.checkCopyrightedCharacter(
      [],
      plot.title ?? undefined,
      tags,
    );
    if (!copyright.passed) {
      return this.rejectAt(
        plot.id,
        'pre_publish',
        copyright.reason ?? 'copyright violation',
      );
    }

    // Stage 2 (v5): 违禁词过滤 (复用 checkProhibitedWords)。
    const words = await this.moderationService.checkProhibitedWords(text);
    if (!words.passed) {
      return this.rejectAt(
        plot.id,
        'pre_publish',
        `prohibited words: ${words.offendingTerms.join(', ')}`,
      );
    }

    // Stage 3 (v5 增量): cn-region 叠加 (仅在中国区生效)。
    if (opts.isChineseRegion) {
      const cn = await this.moderationService.applyCnRegionModeration(
        [],
        text,
        plot.id,
        true,
      );
      if (!cn.passed) {
        return this.rejectAt(
          plot.id,
          'cn_region',
          cn.reason ?? 'cn-region moderation rejected',
        );
      }
      await this.recordDecision(plot.id, 'cn_region', 'approved', null);
    }

    // Stage 4 (Tier_C 增量, R10.2): C 级体验额外静态代码扫描 + 字节码 hash 锁定。
    // 仅当世界声明了逻辑模块 (logicModules 非空，唯 Tier_C 允许) 时触发。
    const world = await this.loadEcsWorld(plot);
    if (world && (world.logicModules?.length ?? 0) > 0) {
      const scan = this.runStaticCodeScan(world, opts);
      if (!scan.passed) {
        return this.rejectAt(plot.id, 'static_code_scan', scan.reason);
      }
      await this.recordDecision(
        plot.id,
        'static_code_scan',
        'approved',
        `Passed Tier_C static code scan (${world.logicModules?.length ?? 0} module(s))`,
      );
    }

    await this.recordDecision(
      plot.id,
      'pre_publish',
      'approved',
      'Passed v5 5-stage pre-publish moderation',
    );

    this.logger.log(
      `Pre-publish moderation passed: plot=${plot.id} (cnRegion=${!!opts.isChineseRegion})`,
    );
    return { passed: true };
  }

  // ============================================================
  // R10.4 — Post-publish report intake (existing SLA)
  // ============================================================

  /**
   * 受理发布后举报：写入 `post_publish_report` 待处理决策 (decision=pending)，
   * 按既有审核 SLA 处理 (R10.4)。语义与 v5 `ModerationService.submitReport` 一致，
   * 但落 Plot 维度审计表 (plot ≠ world_asset)。
   *
   * @returns reportId — 审计决策 id，用于 SLA 跟踪
   */
  async reportPlot(
    plotId: string,
    reporterId: string,
    reason: string,
  ): Promise<{ reportId: string; stage: 'post_publish_report' }> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }

    const saved = await this.recordDecision(
      plotId,
      'post_publish_report',
      'pending',
      `Report by ${reporterId}: ${reason}`,
    );

    this.logger.log(
      `Post-publish report filed: plot=${plotId} by=${reporterId} reason="${reason}" reportId=${saved.id}`,
    );
    return { reportId: saved.id, stage: 'post_publish_report' };
  }

  // ============================================================
  // R10.5 / R10.6 — Takedown on violation
  // ============================================================

  /**
   * 命中违规下架：Plot status→suspended (移出地图发现可见集) + 通知 owner +
   * 写 `post_publish_report` rejected 审计 (R10.5/R10.6)。
   *
   * 幂等：对已 suspended 的 Plot 重复调用只补记审计、不重复通知。
   */
  async takedown(
    plotId: string,
    reason: string,
    reviewerId?: string,
  ): Promise<{ taken: boolean; status: string }> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }

    const alreadyDown =
      plot.status === PlotModerationService.SUSPENDED_STATUS;

    if (!alreadyDown) {
      plot.status = PlotModerationService.SUSPENDED_STATUS as WorldPlot['status'];
      await this.plotRepo.save(plot);
    }

    await this.recordDecision(
      plotId,
      'post_publish_report',
      'rejected',
      `Taken down: ${reason}`,
      reviewerId ?? null,
    );

    if (!alreadyDown) {
      await this.notifyOwner(plot, reason);
    }

    this.logger.warn(
      `Plot taken down from World_Map: plot=${plotId} reason="${reason}"`,
    );
    return { taken: true, status: plot.status };
  }

  // ============================================================
  // R10.6 — Audit log read
  // ============================================================

  /** 读取某 Plot 的审核决策审计日志 (按时间升序)。 */
  async getDecisions(plotId: string): Promise<PlotModerationDecisionEntry[]> {
    const rows = await this.decisionRepo.find({
      where: { plotId },
      order: { ts: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      plotId: r.plotId,
      stage: r.stage as PlotModerationDecisionEntry['stage'],
      decision: r.decision as PlotModerationDecisionEntry['decision'],
      reason: r.reason,
      reviewerId: r.reviewerId,
      ts: r.ts,
    }));
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * 记录一条 rejected 审计并返回结构化 MODERATION_REJECTED 错误 (含阶段+原因)。
   */
  private async rejectAt(
    plotId: string,
    stage: PlotModerationStage,
    reason: string,
  ): Promise<{ passed: false; error: WorldCreationError }> {
    await this.recordDecision(plotId, stage, 'rejected', reason);
    return {
      passed: false,
      error: {
        error: 'MODERATION_REJECTED',
        detail: `[${stage}] ${reason}`,
      },
    };
  }

  /** 写一条 plot_moderation_decisions 审计 (cn-region 留存期)。 */
  private async recordDecision(
    plotId: string,
    stage: PlotModerationStage,
    decision: 'approved' | 'rejected' | 'pending',
    reason: string | null,
    reviewerId: string | null = null,
  ): Promise<PlotModerationDecision> {
    const record = this.decisionRepo.create({
      plotId,
      stage,
      decision,
      reason,
      reviewerId,
      ts: Date.now().toString(),
    });
    return this.decisionRepo.save(record);
  }

  /**
   * 聚合 Plot 的可审核文本与标签：plot.title + ECS_World 标题 / 实体 id /
   * UI 文本 (panel/text/button)。文本上限 {@link MAX_MODERATION_TEXT} 防止超长输入。
   */
  private async collectModerationContent(
    plot: WorldPlot,
  ): Promise<{ text: string; tags: string[] }> {
    const parts: string[] = [];
    if (plot.title) {
      parts.push(plot.title);
    }

    if (plot.ecsVersionId) {
      const version = await this.versionRepo.findOne({
        where: { id: plot.ecsVersionId },
      });
      if (version?.snapshotJson) {
        parts.push(...this.extractEcsText(version.snapshotJson));
      }
    }

    const text = parts.join(' ').slice(0, this.MAX_MODERATION_TEXT);
    const tags = parts.slice(0, 32);
    return { text, tags };
  }

  /** 从 ECS_World 提取可审核的文本字段 (标题 / 实体 id / UI 文本)。 */
  private extractEcsText(world: EcsWorld): string[] {
    const out: string[] = [];
    if (world.meta?.title) {
      out.push(world.meta.title);
    }
    for (const entity of world.entities ?? []) {
      if (entity?.id) {
        out.push(entity.id);
      }
      const ui = entity?.components?.ui;
      if (ui) {
        if (ui.panel) out.push(ui.panel);
        if (ui.text) out.push(ui.text);
        if (ui.button) out.push(ui.button);
      }
    }
    return out;
  }

  // ============================================================
  // R10.2 / R10.3 — Tier_C static code scan (design §10.2 / §3.3)
  // ============================================================

  /** 加载 Plot 当前版本的 ECS_World 快照 (用于 Tier_C 逻辑模块扫描)；无版本 → null。 */
  private async loadEcsWorld(plot: WorldPlot): Promise<EcsWorld | null> {
    if (!plot.ecsVersionId) {
      return null;
    }
    const version = await this.versionRepo.findOne({
      where: { id: plot.ecsVersionId },
    });
    return version?.snapshotJson ?? null;
  }

  /**
   * 对 Tier_C 体验的每个逻辑模块运行静态代码扫描 + 字节码 hash 锁定校验 (R10.2)。
   *
   * 对每个 `logicModules[]`:
   *  1. **hash 锁定校验** (design §3.3)：若模块声明了 `hash`，重算审核源码 hash 并比对；
   *     不一致 → 视为发布后替换，阻断发布。
   *  2. **四类静态扫描** (§10.2)：能力滥用 / 动态求值 / 资源炸弹 / 出网白名单外；
   *     任一违规 → 报具体类别 + 行列 + 原因。
   *
   * 缺少可审核源码 (无法验证) → 视为扫描失败，阻断发布。返回首个违规的原因供
   * `rejectAt('static_code_scan', ...)` 报阶段与原因 (R10.3)。
   */
  private runStaticCodeScan(
    world: EcsWorld,
    opts: RunPrePublishOptions,
  ): { passed: true } | { passed: false; reason: string } {
    const sources = opts.logicModuleSources ?? {};
    const egressAllowedHosts = opts.egressAllowedHosts ?? [];

    for (const mod of world.logicModules ?? []) {
      const source = sources[mod.moduleId];

      if (typeof source !== 'string') {
        return {
          passed: false,
          reason: `logic module "${mod.moduleId}" has no reviewable source for static scan`,
        };
      }

      // (1) 锁定 hash 校验：防止发布后替换审核过的字节码 (design §3.3)。
      if (mod.hash && !verifyHash(source, mod.hash)) {
        return {
          passed: false,
          reason: `logic module "${mod.moduleId}" hash mismatch — reviewed bytecode was replaced (locked ${mod.hash})`,
        };
      }

      // (2) 四类静态扫描。
      const result: ScanResult = scanLogicModule(source, mod.capabilities ?? [], {
        egressAllowedHosts,
      });
      if (!result.passed) {
        const v = result.violations[0];
        return {
          passed: false,
          reason: `logic module "${mod.moduleId}": [${v.category}] ${v.reason} (line ${v.line}:${v.column})`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * 通知 Plot owner 体验被下架及原因 (R10.5)。owner 经 ownerAccountId →
   * AgentAccount.ownerId (userId) 解析；通知设施缺失或解析失败不阻断下架。
   */
  private async notifyOwner(plot: WorldPlot, reason: string): Promise<void> {
    if (!this.notificationService || !plot.ownerAccountId) {
      return;
    }
    try {
      const account = await this.accountRepo.findOne({
        where: { id: plot.ownerAccountId },
      });
      const ownerUserId = account?.ownerId;
      if (!ownerUserId) {
        return;
      }
      await this.notificationService.createNotification(ownerUserId, {
        type: NotificationType.SECURITY,
        title: 'Your experience was unpublished',
        message: `Plot "${plot.title ?? plot.id}" was removed from the World_Map after a moderation review: ${reason}`,
        metadata: {
          plotId: plot.id,
          kind: 'plot_takedown',
          reason,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to notify owner of plot ${plot.id} takedown: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
