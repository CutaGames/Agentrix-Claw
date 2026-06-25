import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';

import { AgentHireEscrow, AgentHireEscrowStatus } from '../../entities/agent-hire-escrow.entity';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';
import { AgentAccountService } from '../agent-account/agent-account.service';

/**
 * Multi-Agent v2 W7 — Marketplace-hire escrow lifecycle service.
 *
 * Spec: design.md §13.5; tasks.md W7.3
 *
 * Responsibilities
 *   - reserve()   : called by AgentTaskSpawnService when target=marketplace-hire
 *   - releaseOnSuccess() / refundOnFailure() : called by AgentTaskWorker
 *                  via the existing recordHireEarning hook
 *   - dispute()   : 24h window after release; hirer can flag; admin reviews
 *   - autoSettleDisputeWindow() : cron — once an escrow has been in
 *                  status='released' for >24h with no dispute, mark
 *                  finalized (no-op for now, future use for analytics)
 *
 * NOTE: This is "soft" escrow — no on-chain hold. The marketplace UI
 * shows the hirer "$X reserved" but the backend bookkeeping is purely
 * relational. Real on-chain escrow is gated for v2.3 once payment rails
 * are decided. Current flow is good enough for trust-based v2.1 hire.
 */
@Injectable()
export class AgentHireEscrowService {
  private readonly logger = new Logger(AgentHireEscrowService.name);
  private readonly DISPUTE_WINDOW_HOURS = 24;

  // 信用评分增量(crypto-native-agent-ops 任务 4 · 需求 7.8/7.9 · design §C1 C 组)。
  // 履约成功加分;任务失败 / 争议退款减分。钳制与映射在 AgentAccountService 内完成。
  private readonly CREDIT_DELTA_RELEASE_SUCCESS = 10;
  private readonly CREDIT_DELTA_TASK_FAILURE = -20;
  private readonly CREDIT_DELTA_DISPUTE_REFUND = -30;

  constructor(
    @InjectRepository(AgentHireEscrow)
    private readonly escrowRepo: Repository<AgentHireEscrow>,
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    // crypto-native-agent-ops 任务 2.2:结算出口自动记账(需求 7.1/7.2 · design §C1)。
    // @Optional 以兼容未挂载 AgentAccountModule 的测试/装配场景。
    @Optional()
    @Inject(forwardRef(() => AgentAccountService))
    private readonly agentAccount?: AgentAccountService,
  ) {}

  /**
   * 结算出口统一记账钩子(crypto-native-agent-ops 任务 2.2)。
   *
   * 只对**真实成交**(escrow release 成功)记账;被拒/退款/未成交不调用。
   * 以 escrow.id 派生幂等键防重复计数(Property 1 账实一致)。
   * 记账失败不得中断结算主流程(吞错并告警,幂等键允许后续补偿重试)。
   */
  private async recordAgentSpending(escrow: AgentHireEscrow, amountUsd: number): Promise<void> {
    if (!this.agentAccount || !escrow.agentId || amountUsd <= 0) return;
    try {
      await this.agentAccount.recordSpending(
        escrow.agentId,
        amountUsd,
        true,
        `escrow-release:${escrow.id}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `recordSpending failed for escrow=${escrow.id} agent=${escrow.agentId}: ${err?.message}`,
      );
    }
  }

  /**
   * 信用评分自动更新钩子(crypto-native-agent-ops 任务 4 · 需求 7.8/7.9/7.10/7.11)。
   *
   * - release 成功(履约成功)→ 加分;refund/dispute(任务失败/被退款)→ 减分。
   * - 钳制(0–1000)、creditScoreUpdatedAt 同步、riskLevel 映射均由
   *   `AgentAccountService.updateCreditScore` 负责(design §C1 C 组)。
   * - 评分更新失败不得中断结算/退款主流程(吞错并告警)。
   * - 调用点均在状态机迁移之后(release/refund/dispute 各自幂等),
   *   故重复调用不会重复加减分。
   */
  private async adjustAgentCredit(
    agentId: string | null | undefined,
    delta: number,
    reason: string,
  ): Promise<void> {
    if (!this.agentAccount || !agentId || delta === 0) return;
    try {
      await this.agentAccount.updateCreditScore(agentId, delta, reason);
    } catch (err: any) {
      this.logger.warn(
        `updateCreditScore failed for agent=${agentId} reason=${reason}: ${err?.message}`,
      );
    }
  }

  /** Reserve funds when a marketplace-hire sub-task is spawned. */
  async reserve(args: {
    taskId: string;
    hirerUserId: string;
    sellerUserId: string;
    agentId?: string | null;
    agreedUsd: number;
  }): Promise<AgentHireEscrow> {
    if (!args.taskId) throw new BadRequestException('taskId required');
    if (args.agreedUsd <= 0) throw new BadRequestException('agreedUsd must be > 0');
    if (args.hirerUserId === args.sellerUserId) {
      throw new BadRequestException('hirer and seller must be different users');
    }

    // Idempotency — one escrow row per task.
    const existing = await this.escrowRepo.findOne({ where: { taskId: args.taskId } });
    if (existing) {
      this.logger.debug?.(`escrow already exists for task ${args.taskId}, returning existing`);
      return existing;
    }

    const row = this.escrowRepo.create({
      taskId: args.taskId,
      hirerUserId: args.hirerUserId,
      sellerUserId: args.sellerUserId,
      agentId: args.agentId ?? null,
      agreedUsd: args.agreedUsd,
      status: 'reserved',
    });
    const saved = await this.escrowRepo.save(row);
    this.logger.log(
      `escrow reserved task=${args.taskId} hirer=${args.hirerUserId.slice(0,8)} seller=${args.sellerUserId.slice(0,8)} amount=$${args.agreedUsd.toFixed(2)}`,
    );

    // Notify both parties.
    emitDesktopSyncEvent(args.hirerUserId, 'multi-agent:hire-escrow', {
      type: 'reserved',
      escrowId: saved.id,
      taskId: args.taskId,
      role: 'hirer',
      amountUsd: args.agreedUsd,
    });
    emitDesktopSyncEvent(args.sellerUserId, 'multi-agent:hire-escrow', {
      type: 'reserved',
      escrowId: saved.id,
      taskId: args.taskId,
      role: 'seller',
      amountUsd: args.agreedUsd,
    });

    return saved;
  }

  /** Release funds to seller when sub-task succeeds. Idempotent. */
  async releaseOnSuccess(taskId: string, actualCostUsd: number): Promise<AgentHireEscrow | null> {
    const escrow = await this.escrowRepo.findOne({ where: { taskId } });
    if (!escrow) return null;
    if (escrow.status !== 'reserved') {
      this.logger.debug?.(`escrow ${escrow.id} not in reserved state (was ${escrow.status}), skip release`);
      return escrow;
    }

    // Cap release at the agreed amount; over-spend is absorbed by platform.
    const released = Math.min(actualCostUsd, escrow.agreedUsd);
    escrow.releasedUsd = released;
    escrow.status = 'released';
    escrow.releasedAt = new Date();
    escrow.disputeWindowEndsAt = new Date(
      Date.now() + this.DISPUTE_WINDOW_HOURS * 3600 * 1000,
    );
    const saved = await this.escrowRepo.save(escrow);

    this.logger.log(
      `escrow released task=${taskId} amount=$${released.toFixed(4)} disputeWindow=${this.DISPUTE_WINDOW_HOURS}h`,
    );

    // 结算出口自动记账(任务 2.2 · 需求 7.1/7.2):真实 release → recordSpending。
    await this.recordAgentSpending(escrow, released);

    // 信用评分自动加分(任务 4 · 需求 7.8):履约成功 → +score。
    await this.adjustAgentCredit(
      escrow.agentId,
      this.CREDIT_DELTA_RELEASE_SUCCESS,
      `escrow-release-success:${escrow.id}`,
    );

    emitDesktopSyncEvent(escrow.hirerUserId, 'multi-agent:hire-escrow', {
      type: 'released',
      escrowId: escrow.id,
      taskId,
      role: 'hirer',
      amountUsd: released,
      disputeWindowEndsAt: escrow.disputeWindowEndsAt.toISOString(),
    });
    emitDesktopSyncEvent(escrow.sellerUserId, 'multi-agent:hire-escrow', {
      type: 'released',
      escrowId: escrow.id,
      taskId,
      role: 'seller',
      amountUsd: released,
    });
    return saved;
  }

  /** Refund hirer when sub-task fails. Idempotent. */
  async refundOnFailure(taskId: string, reason: string): Promise<AgentHireEscrow | null> {
    const escrow = await this.escrowRepo.findOne({ where: { taskId } });
    if (!escrow) return null;
    if (escrow.status !== 'reserved') {
      this.logger.debug?.(`escrow ${escrow.id} not in reserved state, skip refund`);
      return escrow;
    }

    escrow.status = 'refunded';
    escrow.refundedAt = new Date();
    escrow.disputeReason = reason.slice(0, 500);
    const saved = await this.escrowRepo.save(escrow);

    this.logger.log(`escrow refunded task=${taskId} reason="${reason.slice(0, 80)}"`);

    // 信用评分自动减分(任务 4 · 需求 7.9):任务失败 → -score。
    await this.adjustAgentCredit(
      escrow.agentId,
      this.CREDIT_DELTA_TASK_FAILURE,
      `escrow-task-failure:${escrow.id}`,
    );

    emitDesktopSyncEvent(escrow.hirerUserId, 'multi-agent:hire-escrow', {
      type: 'refunded',
      escrowId: escrow.id,
      taskId,
      role: 'hirer',
      amountUsd: escrow.agreedUsd,
      reason,
    });
    emitDesktopSyncEvent(escrow.sellerUserId, 'multi-agent:hire-escrow', {
      type: 'refunded',
      escrowId: escrow.id,
      taskId,
      role: 'seller',
      reason,
    });
    return saved;
  }

  /**
   * Hirer raises a dispute within the 24h window after release.
   * Reverses the release into 'disputed' state pending admin review.
   */
  async dispute(args: {
    taskId: string;
    hirerUserId: string;
    reason: string;
  }): Promise<AgentHireEscrow> {
    const escrow = await this.escrowRepo.findOne({ where: { taskId: args.taskId } });
    if (!escrow) throw new NotFoundException('escrow not found for task');
    if (escrow.hirerUserId !== args.hirerUserId) {
      throw new ForbiddenException('only the hirer may dispute this escrow');
    }
    if (escrow.status === 'refunded' || escrow.status === 'disputed') {
      throw new BadRequestException(`escrow already in terminal state: ${escrow.status}`);
    }
    if (escrow.status === 'released' && escrow.disputeWindowEndsAt && escrow.disputeWindowEndsAt < new Date()) {
      throw new BadRequestException('dispute window has expired');
    }
    if (!args.reason || args.reason.trim().length < 10) {
      throw new BadRequestException('dispute reason must be at least 10 characters');
    }

    escrow.status = 'disputed';
    escrow.disputedAt = new Date();
    escrow.disputeReason = args.reason.slice(0, 500);
    const saved = await this.escrowRepo.save(escrow);

    this.logger.warn(
      `escrow DISPUTED task=${args.taskId} by hirer=${args.hirerUserId.slice(0,8)} reason="${args.reason.slice(0,80)}"`,
    );

    emitDesktopSyncEvent(escrow.hirerUserId, 'multi-agent:hire-escrow', {
      type: 'disputed',
      escrowId: escrow.id,
      taskId: args.taskId,
      role: 'hirer',
      reason: args.reason,
    });
    emitDesktopSyncEvent(escrow.sellerUserId, 'multi-agent:hire-escrow', {
      type: 'disputed',
      escrowId: escrow.id,
      taskId: args.taskId,
      role: 'seller',
      reason: args.reason,
    });
    return saved;
  }

  /** Admin endpoint — uphold a dispute (refund hirer fully). */
  async adminUpholdDispute(escrowId: string): Promise<AgentHireEscrow> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('escrow not found');
    if (escrow.status !== 'disputed') {
      throw new BadRequestException(`escrow is in ${escrow.status}, not disputed`);
    }
    escrow.status = 'refunded';
    escrow.refundedAt = new Date();
    const saved = await this.escrowRepo.save(escrow);

    // 信用评分自动减分(任务 4 · 需求 7.9):争议成立退款 → -score。
    await this.adjustAgentCredit(
      escrow.agentId,
      this.CREDIT_DELTA_DISPUTE_REFUND,
      `escrow-dispute-refund:${escrow.id}`,
    );

    return saved;
  }

  /** Admin endpoint — reject dispute (re-release to seller). */
  async adminRejectDispute(escrowId: string): Promise<AgentHireEscrow> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('escrow not found');
    if (escrow.status !== 'disputed') {
      throw new BadRequestException(`escrow is in ${escrow.status}, not disputed`);
    }
    escrow.status = 'released';
    escrow.disputeWindowEndsAt = new Date(); // window ends immediately
    return this.escrowRepo.save(escrow);
  }

  /** List a user's escrows (as hirer or seller). */
  async listForUser(userId: string, role: 'hirer' | 'seller' | 'both' = 'both', limit = 50): Promise<AgentHireEscrow[]> {
    const where: any = role === 'both'
      ? [{ hirerUserId: userId }, { sellerUserId: userId }]
      : role === 'hirer'
        ? { hirerUserId: userId }
        : { sellerUserId: userId };
    return this.escrowRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** Cron-callable: scan stuck `reserved` escrows tied to terminal tasks. */
  async reconcileStaleEscrows(): Promise<{ reconciled: number }> {
    // Find reserved escrows whose linked task is already terminal.
    const reserved = await this.escrowRepo.find({
      where: { status: 'reserved', createdAt: LessThan(new Date(Date.now() - 5 * 60 * 1000)) }, // > 5 min old
      take: 50,
    });
    if (reserved.length === 0) return { reconciled: 0 };

    const taskIds = reserved.map((e) => e.taskId);
    const tasks = await this.taskRepo.find({
      where: { id: In(taskIds), status: In(['succeeded', 'failed', 'canceled']) },
    });
    const byId = new Map(tasks.map((t) => [t.id, t]));

    let reconciled = 0;
    for (const escrow of reserved) {
      const task = byId.get(escrow.taskId);
      if (!task) continue;
      try {
        if (task.status === 'succeeded') {
          await this.releaseOnSuccess(escrow.taskId, Number(task.costUsd ?? 0));
          reconciled++;
        } else {
          await this.refundOnFailure(escrow.taskId, task.errorMessage || `task ${task.status}`);
          reconciled++;
        }
      } catch (e: any) {
        this.logger.warn(`reconcile failed for escrow ${escrow.id}: ${e?.message}`);
      }
    }
    return { reconciled };
  }

  /** Get escrow by task id (controller helper). */
  getByTaskId(taskId: string): Promise<AgentHireEscrow | null> {
    return this.escrowRepo.findOne({ where: { taskId } });
  }
}
