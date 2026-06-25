import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonTaskContract } from '../entities/aeon-task-contract.entity';
import { AeonEconomyService } from '../economy/aeon-economy.service';
import { WorldNewsService } from '../news/world-news.service';
import { RealityLoopService } from '../reality/reality-loop.service';
import { AsyncInboxService } from '../inbox/async-inbox.service';
import type { ComplianceContext } from '../economy/compliance-gate.service';
import { isLegalTransition, type AeonTaskState } from './task-state-machine';

function assertTransition(from: string, to: string): void {
  if (!isLegalTransition(from as AeonTaskState, to as AeonTaskState)) {
    throw new BadRequestException(`非法状态迁移: ${from} → ${to}`);
  }
}

/**
 * TaskContractService — 统一任务/契约状态机(Task 3.6 / 3.8 / R7 / R9)。
 *
 * 三 kind 共用状态机:plaza(广场)/ bounty(悬赏,escrow+里程碑)/ kpi(公司)。
 * 复用现有 task_post/task_search 平台工具做对外发布/检索(wiring 接入);本服务管
 * 契约生命周期 + 结算(经 AeonEconomyService)。
 */
@Injectable()
export class TaskContractService {
  private readonly logger = new Logger(TaskContractService.name);

  constructor(
    @InjectRepository(AeonTaskContract)
    private readonly repo: Repository<AeonTaskContract>,
    private readonly economy: AeonEconomyService,
    private readonly news: WorldNewsService,
    private readonly reality: RealityLoopService,
    private readonly inbox: AsyncInboxService,
  ) {}

  /** 发布任务(R7.1)。bounty 在发布即托管全额(R9.1)。 */
  async post(input: {
    initiatorUserId: string;
    title: string;
    description?: string;
    acceptanceCriteria?: Record<string, unknown>;
    rewardAmount: number;
    rewardCurrency?: string;
    deadlineAt?: number;
    kind?: 'plaza' | 'bounty' | 'kpi';
    orgId?: string | null;
    milestones?: Record<string, unknown>[];
    compliance: ComplianceContext;
  }): Promise<AeonTaskContract> {
    const kind = input.kind ?? 'plaza';
    if (input.rewardAmount < 0) throw new BadRequestException('报酬不能为负');

    const contract = this.repo.create({
      orgId: input.orgId ?? null,
      initiatorUserId: input.initiatorUserId,
      kind,
      state: 'open',
      title: input.title,
      description: input.description ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? null,
      rewardAmount: input.rewardAmount,
      rewardCurrency: input.rewardCurrency ?? 'AXP',
      deadlineAt: input.deadlineAt ? String(input.deadlineAt) : null,
      escrowed: false,
      milestones: input.milestones ?? null,
    });

    // bounty:先托管(escrow_hold),再变 biddable(R9.1)。
    if (kind === 'bounty' && input.rewardAmount > 0) {
      await this.economy.transfer({
        orgId: input.orgId ?? null,
        payerUserId: input.initiatorUserId,
        payeeUserId: AeonEconomyService.ESCROW_ACCOUNT,
        amount: input.rewardAmount,
        currency: input.rewardCurrency ?? 'AXP',
        capability: 'pay',
        reason: 'escrow_hold',
        compliance: input.compliance,
      });
      contract.escrowed = true;
    }
    const saved = await this.repo.save(contract);
    if (kind === 'bounty') {
      this.news.publish('bounty_posted', `悬赏「${input.title}」发布,赏金 ${input.rewardAmount} ${contract.rewardCurrency} 💰`, { refId: saved.id });
    }
    return saved;
  }

  /** 接单(R7.3):独占,记录承接方,转 in_progress。 */
  async accept(
    id: string,
    acceptorUserId: string,
    acceptorAgentInstanceId?: string | null,
  ): Promise<AeonTaskContract> {
    const c = await this.get(id);
    if (c.state !== 'open') throw new BadRequestException('该任务已不可接');
    assertTransition(c.state, 'in_progress');
    c.acceptorUserId = acceptorUserId;
    c.acceptorAgentInstanceId = acceptorAgentInstanceId ?? null;
    c.state = 'in_progress';
    const saved = await this.repo.save(c);
    this.news.publish('task_accepted', `有人接下了「${c.title}」,任务进行中 🚀`, { refId: c.id });
    return saved;
  }

  /** 提交交付物(R7.4):转 awaiting_verify。 */
  async submit(id: string, acceptorUserId: string, deliverable: Record<string, unknown>): Promise<AeonTaskContract> {
    const c = await this.get(id);
    if (c.acceptorUserId !== acceptorUserId) throw new ForbiddenException('只有承接方能提交');
    assertTransition(c.state, 'awaiting_verify');
    c.deliverable = deliverable;
    c.state = 'awaiting_verify';
    return this.repo.save(c);
  }

  /** 验收通过(R7.5):放款给承接方,转 completed。 */
  async verify(id: string, initiatorUserId: string, compliance: ComplianceContext): Promise<AeonTaskContract> {
    const c = await this.get(id);
    if (c.initiatorUserId !== initiatorUserId) throw new ForbiddenException('只有发起方能验收');
    assertTransition(c.state, 'completed');
    if (!c.acceptorUserId) throw new BadRequestException('无承接方,无法放款');

    if (c.rewardAmount > 0) {
      // bounty:从 escrow 释放;plaza/kpi:从发起方/org 直接转。
      await this.economy.transfer({
        orgId: c.orgId,
        payerUserId: c.escrowed ? AeonEconomyService.ESCROW_ACCOUNT : c.initiatorUserId,
        payeeUserId: c.acceptorUserId,
        amount: c.rewardAmount,
        currency: c.rewardCurrency,
        capability: 'pay',
        reason: c.kind === 'bounty' ? 'bounty' : c.kind === 'kpi' ? 'wage' : 'task',
        refId: c.id,
        compliance,
        debitFromOrg: c.kind === 'kpi' && !!c.orgId,
      });
      // 钱包桥接(R20.4):任务/悬赏收入出金到全局 AXP 钱包。降级不阻断。
      if (c.rewardCurrency === 'AXP') {
        const src = c.kind === 'bounty' ? 'aeon_bounty' : c.kind === 'kpi' ? 'aeon_wage' : 'aeon_task';
        await this.reality.creditWallet(c.acceptorUserId, c.rewardAmount, src, c.id);
      }
      // 通知承接方收到报酬(R13.4 异步 digest)。
      this.inbox.push(
        c.acceptorUserId,
        'wage_paid',
        '任务报酬到账',
        `「${c.title}」验收通过,你获得 ${c.rewardAmount} ${c.rewardCurrency}。`,
        c.id,
      );
    }
    c.state = 'completed';
    const saved = await this.repo.save(c);
    this.news.publish('task_completed', `「${c.title}」已完成验收,报酬已发放 ✅`, { refId: c.id });
    return saved;
  }

  /** 验收驳回(R7.6):回 in_progress 附原因,不放款。 */
  async reject(id: string, initiatorUserId: string, reason: string): Promise<AeonTaskContract> {
    const c = await this.get(id);
    if (c.initiatorUserId !== initiatorUserId) throw new ForbiddenException('只有发起方能驳回');
    assertTransition(c.state, 'in_progress');
    c.state = 'in_progress';
    c.rejectionReason = reason;
    return this.repo.save(c);
  }

  /** 取消(R9.5):bounty 退还托管全额给发起方。 */
  async cancel(id: string, byUserId: string, compliance: ComplianceContext): Promise<AeonTaskContract> {
    const c = await this.get(id);
    if (c.initiatorUserId !== byUserId) throw new ForbiddenException('只有发起方能取消');
    assertTransition(c.state, 'cancelled');
    if (c.escrowed && c.rewardAmount > 0) {
      await this.economy.transfer({
        orgId: c.orgId,
        payerUserId: AeonEconomyService.ESCROW_ACCOUNT,
        payeeUserId: c.initiatorUserId,
        amount: c.rewardAmount,
        currency: c.rewardCurrency,
        capability: 'pay',
        reason: 'escrow_release',
        refId: c.id,
        compliance,
      });
      c.escrowed = false;
    }
    c.state = 'cancelled';
    return this.repo.save(c);
  }

  /** 截止过期(R7.8):in_progress 无提交 → expired,释放预留。 */
  async expire(id: string): Promise<AeonTaskContract> {
    const c = await this.get(id);
    assertTransition(c.state, 'expired');
    c.state = 'expired';
    return this.repo.save(c);
  }

  /** 列出开放任务(广场浏览,R7.2;真实检索复用 task_search 在 wiring 接入)。 */
  async listOpen(kind?: string): Promise<AeonTaskContract[]> {
    const where: Record<string, unknown> = { state: 'open' };
    if (kind) where.kind = kind;
    return this.repo.find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  async get(id: string): Promise<AeonTaskContract> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('任务不存在');
    return c;
  }
}
