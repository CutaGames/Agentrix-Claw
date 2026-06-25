import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MerchantTask,
  TaskStatus,
  TaskVisibility,
} from '../../entities/merchant-task.entity';
import { TaskBid, BidStatus } from '../../entities/task-bid.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { PetEconomicService } from './pet-economic.service';

export interface Opportunity {
  taskId: string;
  title: string;
  type: string;
  budget: number;
  currency: string;
  tags: string[];
  matchScore: number;
}

export interface AcceptResult {
  ok: boolean;
  bidId: string;
  taskId: string;
  proposedBudget: number;
  agentAccountId: string;
}

/**
 * PetAutoEarnService — 萌宠半自主接活（Pet Earning Flywheel 需求 6，D2=半自主）。
 *
 * 机会发现：聚合集市真实开放任务（MerchantTask PENDING/PUBLIC，排除自己发布的）。
 * 一键接活：在 AgentAccount.spendingLimits 围栏内，由萌宠绑定的 agent 代用户投标
 * （真实 TaskBid，接入既有 bid→accept→complete→commission 链路）。收入在任务完成时
 * 经既有结算路径入账，出现在收益中心。**不伪造收益、不绕过风控。**
 *
 * 全自主（无人值守自动选单/执行）为后续 D2(b)，本服务仅做推荐 + 用户一键授权投标。
 */
@Injectable()
export class PetAutoEarnService {
  private readonly logger = new Logger(PetAutoEarnService.name);
  private static readonly DEFAULT_ESTIMATED_DAYS = 3;

  constructor(
    @InjectRepository(MerchantTask)
    private readonly tasks: Repository<MerchantTask>,
    @InjectRepository(TaskBid)
    private readonly bids: Repository<TaskBid>,
    @InjectRepository(AgentAccount)
    private readonly accounts: Repository<AgentAccount>,
    private readonly economic: PetEconomicService,
  ) {}

  /** 发现可接的真实开放任务（按预算降序，排除自己发布的）。 */
  async listOpportunities(userId: string, limit = 20): Promise<Opportunity[]> {
    const rows = await this.tasks.find({
      where: { status: TaskStatus.PENDING, visibility: TaskVisibility.PUBLIC },
      order: { budget: 'DESC' },
      take: Math.min(limit, 50),
    });
    return rows
      .filter((t) => t.userId !== userId) // 不接自己发布的任务
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        type: String(t.type),
        budget: Number(t.budget),
        currency: t.currency,
        tags: Array.isArray(t.tags) ? t.tags : [],
        // 简化匹配分：预算越高排序越前（后续可接入能力/历史匹配）。
        matchScore: Number(t.budget) || 0,
      }));
  }

  /**
   * 一键接活：确保萌宠有赚钱能力 → 限额围栏 → 代投标。
   */
  async acceptOpportunity(userId: string, taskId: string): Promise<AcceptResult> {
    // 1. 确保萌宠绑定的经济主体存在（幂等）。
    const cap = await this.economic.ensureEarningCapability(userId);
    const account = await this.accounts.findOne({ where: { id: cap.boundAgentAccountId } });
    if (!account) throw new NotFoundException('pet agent account not found');

    // 2. 任务校验。
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('task not found');
    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException('task is not open for bidding');
    }
    if (task.visibility === TaskVisibility.PRIVATE) {
      throw new BadRequestException('cannot bid on private tasks');
    }
    if (task.userId === userId) {
      throw new BadRequestException('cannot accept your own task');
    }

    // 3. 限额围栏（Property 6）：任务预算不得超过萌宠单笔承接上限。
    const singleLimit = Number(account.spendingLimits?.singleTxLimit ?? 0);
    if (singleLimit > 0 && Number(task.budget) > singleLimit) {
      throw new BadRequestException(
        `task budget ${task.budget} exceeds pet single-task limit ${singleLimit}`,
      );
    }

    // 4. 幂等：同一用户对同一任务已有待处理投标则不重复。
    const existing = await this.bids.findOne({
      where: { taskId, bidderId: userId, status: BidStatus.PENDING },
    });
    if (existing) {
      return {
        ok: true,
        bidId: existing.id,
        taskId,
        proposedBudget: Number(existing.proposedBudget),
        agentAccountId: account.id,
      };
    }

    // 5. 代投标（真实 TaskBid，接入既有 bid→accept→complete→commission 链路）。
    const bid = await this.bids.save(
      this.bids.create({
        taskId,
        bidderId: userId,
        proposedBudget: Number(task.budget),
        currency: task.currency,
        estimatedDays: PetAutoEarnService.DEFAULT_ESTIMATED_DAYS,
        proposal: `[萌宠代投标] 你的 AI 萌宠已为你接下「${task.title}」。完成后收益将入账并显示在收益中心。`,
        status: BidStatus.PENDING,
        metadata: { source: 'pet-auto-earn', agentAccountId: account.id },
      }),
    );
    this.logger.log(`pet auto-bid user=${userId} task=${taskId} bid=${bid.id}`);

    return {
      ok: true,
      bidId: bid.id,
      taskId,
      proposedBudget: Number(bid.proposedBudget),
      agentAccountId: account.id,
    };
  }
}
