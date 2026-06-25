import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreationRepository } from './creation.repository';
import {
  CreationStateMachine,
  InvalidCreationTransitionError,
} from './creation-state-machine';
import { CreationEntity } from './entities/creation.entity';
import {
  CreationModerationDecisionEntity,
  type CreationModerationDecision,
  type CreationModerationStage,
} from './entities/creation-moderation-decision.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';

import type { WorldCreationError } from '../../../shared/types/world-creation';
import type {
  CreationModerationDecisionEntry,
  ReportCreationResponse,
  TakedownCreationResponse,
  UnpublishCreationResponse,
} from '../../../shared/types/creation-api';

/** 举报受理结果(对已发布 Creation 才受理,需求 3.4)。 */
export type ReportResult =
  | { received: true; reportId: string }
  | { received: false; error: WorldCreationError };

/**
 * CreationModerationService — 统一 Creation 的「举报 / 下架 / 审核审计」管线
 * (world-creation-feed task 2.4)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 3.3:结构化拒绝/违规原因随审计与响应返回;创作者主动下架内容保留不丢失。
 *   - 需求 3.4:任意用户对**已发布** Creation 提交举报;确认违规 → status=suspended,
 *               即时移出发现面(发现层按 DISCOVERABLE_STATUSES={published,listed} 过滤,
 *               suspended 不在其中,故立即不可见,Property 4)。
 *   - 需求 3.5:为每个 Creation 保留审核决策审计记录(**谁 / 何时 / 结论 / 原因**)。
 *
 * 设计依据:复用 world-creation `PlotModerationService` 的审计约定与下架语义,把审核
 * 对象从 WorldPlot 换成统一 Creation —— 不重建审核基建(AGENTS.md hard rule)。
 * 状态流转一律经 {@link CreationStateMachine} 守卫(审核前置 / 违规即移出);下架决策
 * 落 `creation_moderation_decisions` 审计表。
 *
 * 职责:
 *  - {@link report}:受理对已发布 Creation 的举报(decision=pending,需求 3.4)。
 *  - {@link takedown}:命中违规 → status=suspended(移出发现面)+ 通知 owner +
 *    写 takedown rejected 审计(需求 3.4 / 3.5);幂等。
 *  - {@link unpublish}:创作者主动下架 published/listed→unpublished(内容保留,可逆)。
 *  - {@link getDecisions}:读取某 Creation 的审核决策审计日志(需求 3.5)。
 *
 * 全局 SnakeNamingStrategy:列名自动派生,禁止手写 name。
 */
@Injectable()
export class CreationModerationService {
  private readonly logger = new Logger(CreationModerationService.name);

  constructor(
    private readonly repo: CreationRepository,
    private readonly stateMachine: CreationStateMachine,
    @InjectRepository(CreationModerationDecisionEntity)
    private readonly decisionRepo: Repository<CreationModerationDecisionEntity>,
    /** 解析 owner → 通知用户;@Optional 使服务在缺少账户仓库时仍可单测。 */
    @Optional()
    @InjectRepository(AgentAccount)
    private readonly accountRepo?: Repository<AgentAccount>,
    /** 下架时通知 owner(需求 3.4);@Optional 便于单测。 */
    @Optional()
    private readonly notificationService?: NotificationService,
  ) {}

  // ============================================================
  // 需求 3.4 — 举报受理(任意用户对已发布 Creation)
  // ============================================================

  /**
   * 受理一条对已发布 Creation 的举报:写入 `report` 待处理审计(decision=pending),
   * 按审核 SLA 处理(需求 3.4)。
   *
   * 仅受理**对已发布**(published/listed)Creation 的举报;对未在发现面的 Creation
   * (draft/under_review/unpublished/suspended)举报无意义 —— 返回结构化
   * `MODERATION_REJECTED`,不写审计。
   *
   * @returns reportId — 举报审计记录 id,用于 SLA 跟踪
   */
  async report(
    creationId: string,
    reporterId: string,
    reason: string,
  ): Promise<ReportResult> {
    const creation = await this.getOrThrow(creationId);

    // 仅对发现面可见(已发布)的 Creation 受理举报(需求 3.4)。
    if (!this.stateMachine.isDiscoverable(creation.status)) {
      return {
        received: false,
        error: {
          error: 'MODERATION_REJECTED',
          detail: `[report] cannot report a Creation that is not published (status=${creation.status})`,
        },
      };
    }

    const saved = await this.recordDecision(
      creationId,
      'report',
      'pending',
      `Report by ${reporterId}: ${reason}`,
      reporterId,
      null,
    );

    this.logger.log(
      `Creation report filed: creation=${creationId} by=${reporterId} reason="${reason}" reportId=${saved.id}`,
    );
    return { received: true, reportId: saved.id };
  }

  // ============================================================
  // 需求 3.4 / 3.5 — 下架(确认违规 → suspended,即时移出发现面)
  // ============================================================

  /**
   * 命中违规下架:status→suspended(移出发现面)+ 通知 owner + 写 `takedown` rejected
   * 审计(需求 3.4 / 3.5)。
   *
   * 经状态机守卫(任意非终态 → suspended);幂等:对已 suspended 的 Creation 重复调用
   * 只补记审计、不重复流转/通知。
   */
  async takedown(
    creationId: string,
    reason: string,
    reviewerId?: string,
  ): Promise<TakedownCreationResponse> {
    const creation = await this.getOrThrow(creationId);

    const alreadyDown = creation.status === 'suspended';
    if (!alreadyDown) {
      // 经状态机守卫:任意非终态 → suspended(违规即移出,需求 3.4)。
      this.stateMachine.assertTransition(creation.status, 'suspended');
      creation.status = 'suspended';
      await this.repo.save(creation);
    }

    await this.recordDecision(
      creationId,
      'takedown',
      'rejected',
      `Taken down: ${reason}`,
      null,
      reviewerId ?? null,
    );

    if (!alreadyDown) {
      await this.notifyOwner(creation, reason);
    }

    this.logger.warn(
      `Creation taken down (removed from discovery): creation=${creationId} reason="${reason}"`,
    );
    return { taken: true, status: creation.status };
  }

  // ============================================================
  // 需求 3.4 — 创作者主动下架(可逆,内容保留)
  // ============================================================

  /**
   * 创作者主动下架:published/listed → unpublished(内容保留,可重新发布;需求 3.3/3.4)。
   *
   * 经状态机守卫:仅 published/listed 可主动下架,其余状态(draft/under_review/
   * suspended)抛 {@link InvalidCreationTransitionError}。写 `unpublish` 审计。
   */
  async unpublish(
    creationId: string,
    reason?: string,
    actorId?: string,
  ): Promise<UnpublishCreationResponse> {
    const creation = await this.getOrThrow(creationId);

    // 非法流转(如对 draft/suspended 下架)→ 抛结构化 INVALID_CREATION_TRANSITION。
    this.stateMachine.assertTransition(creation.status, 'unpublished');
    creation.status = 'unpublished';
    await this.repo.save(creation);

    await this.recordDecision(
      creationId,
      'unpublish',
      'unpublished',
      reason ? `Unpublished by creator: ${reason}` : 'Unpublished by creator',
      null,
      actorId ?? null,
    );

    this.logger.log(
      `Creation unpublished by creator: creation=${creationId}`,
    );
    return { unpublished: true, status: creation.status };
  }

  // ============================================================
  // 需求 3.5 — 审核决策审计日志读取
  // ============================================================

  /** 读取某 Creation 的审核决策审计日志(按时间升序;需求 3.5)。 */
  async getDecisions(
    creationId: string,
  ): Promise<CreationModerationDecisionEntry[]> {
    const rows = await this.decisionRepo.find({
      where: { creationId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      creationId: r.creationId,
      stage: r.stage,
      decision: r.decision,
      reason: r.reason,
      reporterId: r.reporterId,
      reviewerId: r.reviewerId,
      ts: r.createdAt instanceof Date ? r.createdAt.getTime() : Date.now(),
    }));
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** 按 id 获取 Creation;不存在抛 NotFoundException。 */
  private async getOrThrow(creationId: string): Promise<CreationEntity> {
    const creation = await this.repo.findById(creationId);
    if (!creation) {
      throw new NotFoundException(`Creation not found: ${creationId}`);
    }
    return creation;
  }

  /** 写一条 creation_moderation_decisions 审计(谁/何时/结论/原因,需求 3.5)。 */
  private async recordDecision(
    creationId: string,
    stage: CreationModerationStage,
    decision: CreationModerationDecision,
    reason: string | null,
    reporterId: string | null,
    reviewerId: string | null,
  ): Promise<CreationModerationDecisionEntity> {
    const record = this.decisionRepo.create({
      creationId,
      stage,
      decision,
      reason,
      reporterId,
      reviewerId,
    });
    return this.decisionRepo.save(record);
  }

  /**
   * 通知 Creation owner 其创作被下架及原因(需求 3.4)。owner 经 ownerAccountId →
   * AgentAccount.ownerId(userId)解析;通知设施缺失或解析失败不阻断下架。
   */
  private async notifyOwner(
    creation: CreationEntity,
    reason: string,
  ): Promise<void> {
    if (!this.notificationService || !this.accountRepo || !creation.ownerAccountId) {
      return;
    }
    try {
      const account = await this.accountRepo.findOne({
        where: { id: creation.ownerAccountId },
      });
      const ownerUserId = account?.ownerId;
      if (!ownerUserId) {
        return;
      }
      await this.notificationService.createNotification(ownerUserId, {
        type: NotificationType.SECURITY,
        title: '你的创作已被下架',
        message: `创作「${creation.title ?? creation.id}」经审核后被移出地图/创作流:${reason}`,
        metadata: {
          creationId: creation.id,
          kind: 'creation_takedown',
          reason,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to notify owner of creation ${creation.id} takedown: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
