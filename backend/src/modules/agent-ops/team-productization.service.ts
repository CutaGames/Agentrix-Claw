import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common';

import type { AgentRoleDefinition } from '../../entities/agent-team-template.entity';
import {
  AgentTeamService,
  ProvisionedTeamResult,
} from '../agent-team/agent-team.service';
import { SubscriptionUsageService } from '../multi-agent-summary/subscription-usage.service';
import { HireSettlementOrchestrator } from './hire-settlement-orchestrator.service';

import {
  CycleEndAction,
  InFlightDisposition,
  MemberFaultCompensation,
  OverQuotaPolicy,
  ProvisionCustomTeamDto,
  ROLE_OVERRIDE_WHITELIST,
  RoleOverrideValidation,
  SettlementRecord,
  SubTaskDeliverable,
  SubTaskSpec,
  SubTaskAssignment,
  TaskSplitPlan,
  TeamBudgetDecision,
  TeamBudgetEvaluation,
  TeamDeliverable,
  TeamLeaseWindow,
  TeamMember,
  TeamMeteringDashboard,
  TeamReplacementAuditInput,
  TeamResultSettlementDto,
  TeamSettlementResult,
  TeamSizeValidation,
  TEAM_MAX_ROLES,
  TEAM_MIN_ROLES,
  SubscriptionQuotaDecision,
  MemberReplacementAudit,
} from './team-productization.types';

const MS_PER_DAY = 86_400_000;

/**
 * TeamProductizationService — 可订阅 / 可租赁的定制 Agent 团队产品化编排器
 * (crypto-native-agent-ops 任务 24 / 需求 17)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C7「Agent 团队(P1 产品化)」。
 *   - 需求 17.1–17.27。
 *
 * **设计原则:全程复用既有积木,不重造轮子。**
 *   - A 组 组建:`AgentTeamService.provisionTeam` + `AgentTeamTemplate`(白名单校验 + 失败回滚)。
 *   - B 组 订阅:`SubscriptionUsageService`(周期配额 + 超配额策略 + 周期结束处置)。
 *   - C 组 租赁:`pet_rental_leases` 租约模式(durationDays → 窗口;续租;到期回收;故障补偿)。
 *   - D 组 按结果:`HireSettlementOrchestrator`(escrow 轨道,24h 争议窗口)。
 *   - E 组 编排:`agent_tasks` 父/子 + `worktree_lanes`(纯函数拆分计划 + 汇总 + 成员替换审计)。
 *   - G 组 计量:`user_subscription_usage` + 透明看板(区分三种口径)。
 *   - H 组 多跳分佣:经 `HireSettlementOrchestrator` listing.parties 合并链上一次提交。
 *   - I 组 团队级预算:团队级上限优先于单成员限额(纯函数决策,触顶即停告警)。
 *
 * 重型依赖以 `@Optional()` 注入,纯决策函数(校验/预算/拆分/汇总/看板)不依赖 DB,
 * 便于单测;实际执行(建团/结算)在依赖可用时透传。
 */
@Injectable()
export class TeamProductizationService {
  private readonly logger = new Logger(TeamProductizationService.name);

  /** escrow 争议窗口(小时),与 AgentHireEscrowService 同口径。 */
  static readonly DISPUTE_WINDOW_HOURS = 24;

  constructor(
    @Optional()
    @Inject(forwardRef(() => AgentTeamService))
    private readonly agentTeam?: AgentTeamService,
    @Optional()
    @Inject(forwardRef(() => SubscriptionUsageService))
    private readonly subscriptionUsage?: SubscriptionUsageService,
    @Optional()
    @Inject(forwardRef(() => HireSettlementOrchestrator))
    private readonly hireSettlement?: HireSettlementOrchestrator,
  ) {}

  // ═══════════════════════ A 组:组建与定制 ═══════════════════════

  /**
   * roleOverrides 白名单校验(需求 17.3)。仅允许 model/capabilities/approvalLevel/
   * spendingLimits 覆盖;任何其它字段(codename/name/initialCreditScore 等)视为越权扩权。
   */
  validateRoleOverrides(
    roleOverrides?: Record<string, Partial<AgentRoleDefinition>>,
  ): RoleOverrideValidation {
    const violations: RoleOverrideValidation['violations'] = [];
    if (!roleOverrides) return { ok: true, violations };

    const whitelist = new Set<string>(ROLE_OVERRIDE_WHITELIST as string[]);
    for (const [codename, override] of Object.entries(roleOverrides)) {
      if (!override) continue;
      const illegalFields = Object.keys(override).filter(
        (k) => !whitelist.has(k),
      );
      if (illegalFields.length > 0) {
        violations.push({ codename, illegalFields });
      }
    }
    return { ok: violations.length === 0, violations };
  }

  /** 团队规模校验(需求 17.3):1–20 角色。 */
  validateTeamSize(roleCount: number): TeamSizeValidation {
    if (roleCount < TEAM_MIN_ROLES) {
      return {
        ok: false,
        size: roleCount,
        reason: `team must have at least ${TEAM_MIN_ROLES} role`,
      };
    }
    if (roleCount > TEAM_MAX_ROLES) {
      return {
        ok: false,
        size: roleCount,
        reason: `team size ${roleCount} exceeds max ${TEAM_MAX_ROLES}`,
      };
    }
    return { ok: true, size: roleCount };
  }

  /**
   * 定制团队组建(需求 17.1–17.5)。先做白名单 + 规模校验,再透传
   * `AgentTeamService.provisionTeam`;**provision 中途失败 → 回滚已创建成员,不留半成品**
   * (需求 17.4)。成员继承 AgentRoleDefinition 的 approvalLevel/spendingLimits 由 provisionTeam 保证。
   */
  async provisionCustomTeam(
    ownerId: string,
    dto: ProvisionCustomTeamDto,
  ): Promise<ProvisionedTeamResult> {
    if (!this.agentTeam) {
      throw new BadRequestException(
        'team provisioning unavailable (AgentTeamService not wired)',
      );
    }

    // 1. 白名单校验(越权扩权直接拒绝)。
    const overrideCheck = this.validateRoleOverrides(dto.roleOverrides);
    if (!overrideCheck.ok) {
      const detail = overrideCheck.violations
        .map((v) => `${v.codename}:[${v.illegalFields.join(',')}]`)
        .join('; ');
      throw new BadRequestException(
        `roleOverrides contains non-whitelisted (privilege-escalating) fields: ${detail}`,
      );
    }

    // 2. 规模校验(读取模板角色数)。
    const template = await this.agentTeam
      .getTemplateForProvision(dto.templateId, dto.templateSlug)
      .catch((e: any) => {
        throw new BadRequestException(e?.message ?? 'template not found');
      });
    const sizeCheck = this.validateTeamSize(template.roles.length);
    if (!sizeCheck.ok) {
      throw new BadRequestException(sizeCheck.reason);
    }

    // 3. 透传 provision;失败 → 回滚(disbandTeam),不留半成品。
    try {
      return await this.agentTeam.provisionTeam(ownerId, {
        templateId: dto.templateId,
        templateSlug: dto.templateSlug,
        teamNamePrefix: dto.teamNamePrefix,
        roleOverrides: dto.roleOverrides,
      });
    } catch (err: any) {
      this.logger.warn(
        `provisionCustomTeam failed for owner=${ownerId} template=${template.slug}: ${err?.message} — rolling back`,
      );
      try {
        await this.agentTeam.disbandTeam(ownerId, template.slug);
      } catch (rollbackErr: any) {
        this.logger.error(
          `rollback (disbandTeam) failed for owner=${ownerId} template=${template.slug}: ${rollbackErr?.message}`,
        );
      }
      throw err;
    }
  }

  // ═══════════════════════ B 组:订阅生命周期 ═══════════════════════

  /**
   * 订阅周期配额检查(需求 17.6 / 17.7)。配额内放行;超配额告警 + 按策略处置
   * (pause / overage_billing)。委托 `SubscriptionUsageService.checkQuota`。
   */
  async checkSubscriptionQuota(
    userId: string,
    overQuotaPolicy: OverQuotaPolicy = 'pause',
  ): Promise<SubscriptionQuotaDecision> {
    if (!this.subscriptionUsage) {
      throw new BadRequestException(
        'subscription metering unavailable (SubscriptionUsageService not wired)',
      );
    }
    const q = await this.subscriptionUsage.checkQuota(userId);
    const quota = q.monthlyIncluded;
    const used = q.monthCount;
    const remaining = quota == null ? null : Math.max(0, quota - used);
    // 超配额 = 不放行(free 命中硬顶)或达 80% 软告警阈值(pro/business)。
    const overQuota = !q.allowed;
    const warn = overQuota || (q.warningThreshold != null && used >= q.warningThreshold);

    return {
      allowed: q.allowed,
      warn,
      overQuotaAction: overQuota ? overQuotaPolicy : null,
      used,
      remaining,
      quota,
      reason: q.reason,
    };
  }

  /**
   * 周期结束处置(需求 17.8 / 17.9)。纯决策:返回周期结束动作 + 进行中任务处置。
   *   - renew → 进行中任务继续(无影响)。
   *   - downgrade / cancel + 有进行中任务 → 宽限期完成(grace_complete)或冻结(frozen)。
   *     默认宽限完成,不丢失已交付成果(需求 17.9)。
   */
  resolveCycleEnd(
    action: CycleEndAction,
    hasInFlightTasks: boolean,
    freezePolicy: InFlightDisposition = 'grace_complete',
  ): { action: CycleEndAction; inFlight: InFlightDisposition | null } {
    if (action === 'renew' || !hasInFlightTasks) {
      return { action, inFlight: null };
    }
    return { action, inFlight: freezePolicy };
  }

  // ═══════════════════════ C 组:租赁生命周期 ═══════════════════════

  /** 创建团队租约窗口(需求 17.10)。durationDays → startsAt/endsAt/status=active。 */
  createLeaseWindow(durationDays: number, startsAt: Date = new Date()): TeamLeaseWindow {
    if (!(durationDays >= 1) || !Number.isFinite(durationDays)) {
      throw new BadRequestException('rental durationDays must be >= 1');
    }
    const endsAt = new Date(startsAt.getTime() + durationDays * MS_PER_DAY);
    return { durationDays, startsAt, endsAt, status: 'active', compensatedDays: 0 };
  }

  /** 续租(需求 17.12):延长 endsAt。仅 active 租约可续。 */
  renewLease(lease: TeamLeaseWindow, extraDays: number): TeamLeaseWindow {
    if (lease.status !== 'active') {
      throw new BadRequestException(`cannot renew lease in status=${lease.status}`);
    }
    if (!(extraDays >= 1) || !Number.isFinite(extraDays)) {
      throw new BadRequestException('renew extraDays must be >= 1');
    }
    return {
      ...lease,
      durationDays: lease.durationDays + extraDays,
      endsAt: new Date(lease.endsAt.getTime() + extraDays * MS_PER_DAY),
    };
  }

  /** 租期到期回收(需求 17.11)。endsAt ≤ now → status=expired(幂等)。 */
  expireLeaseIfDue(lease: TeamLeaseWindow, now: Date = new Date()): TeamLeaseWindow {
    if (lease.status !== 'active') return lease;
    if (lease.endsAt.getTime() <= now.getTime()) {
      return { ...lease, status: 'expired' };
    }
    return lease;
  }

  /**
   * 成员故障补偿(需求 17.12)。extend → 延租 compensationDays;refund → 标记退款
   * (本编排器只产出补偿后的租约窗口 + 退款金额,真实退款由结算轨道执行)。
   */
  compensateMemberFault(
    lease: TeamLeaseWindow,
    mode: MemberFaultCompensation,
    params: { compensationDays?: number; pricePerDayUsd?: number },
  ): { lease: TeamLeaseWindow; refundUsd: number } {
    if (mode === 'extend') {
      const days = params.compensationDays ?? 1;
      if (!(days >= 1)) throw new BadRequestException('compensationDays must be >= 1');
      return {
        lease: {
          ...lease,
          durationDays: lease.durationDays + days,
          endsAt: new Date(lease.endsAt.getTime() + days * MS_PER_DAY),
          compensatedDays: (lease.compensatedDays ?? 0) + days,
        },
        refundUsd: 0,
      };
    }
    // refund
    const days = params.compensationDays ?? 1;
    const refundUsd = Math.round((params.pricePerDayUsd ?? 0) * days * 100) / 100;
    return { lease, refundUsd };
  }

  // ═══════════════════════ D 组 + H 组:按结果付费 + 多跳分佣 ═══════════════════════

  /**
   * 团队按结果结算(需求 17.13–17.17 + 17.25)。复用 `HireSettlementOrchestrator`:
   * escrow 轨道 reserve agreedUsd → release = min(agreedUsd, actualCostUsd) → 24h 争议窗口;
   * 多跳分佣(listing.parties)合并为链上一次提交。
   */
  async settleTeamResult(dto: TeamResultSettlementDto): Promise<TeamSettlementResult> {
    if (!this.hireSettlement) {
      throw new BadRequestException(
        'per-result settlement unavailable (HireSettlementOrchestrator not wired)',
      );
    }
    return this.hireSettlement.settleHire({
      listing: dto.listing,
      hirerUserId: dto.hirerUserId,
      quantity: dto.quantity ?? 1,
      currency: 'USDC',
      rail: 'escrow',
      taskId: dto.taskId,
    });
  }

  // ═══════════════════════ E 组:协作编排 ═══════════════════════

  /**
   * 任务拆分计划(需求 17.18)。把子任务按角色/能力匹配派给成员,并为每个子任务
   * 分配 worktree lane(隔离上下文)。匹配优先级:preferredCodename → requiredCapability →
   * 轮询(round_robin)。无可匹配成员 → unassigned。
   *
   * 纯函数:产出计划供调用方落 `agent_tasks`(parentTaskId=父)+ `worktree_lanes`。
   */
  planTaskSplit(
    parentTaskId: string,
    subTasks: SubTaskSpec[],
    members: TeamMember[],
  ): TaskSplitPlan {
    const assignments: SubTaskAssignment[] = [];
    const unassigned: string[] = [];
    let rrIndex = 0;

    for (const sub of subTasks) {
      let member: TeamMember | undefined;
      let matchedBy: SubTaskAssignment['matchedBy'] = 'unassigned';

      // 1. preferredCodename 精确匹配。
      if (sub.preferredCodename) {
        member = members.find((m) => m.codename === sub.preferredCodename);
        if (member) matchedBy = 'preferred';
      }
      // 2. requiredCapability 能力匹配。
      if (!member && sub.requiredCapability) {
        member = members.find((m) =>
          (m.capabilities ?? []).includes(sub.requiredCapability!),
        );
        if (member) matchedBy = 'capability';
      }
      // 3. 轮询兜底(有成员时)。
      if (!member && members.length > 0) {
        member = members[rrIndex % members.length];
        rrIndex += 1;
        matchedBy = 'round_robin';
      }

      const laneId = `lane:${parentTaskId}:${sub.id}`;
      if (!member) {
        unassigned.push(sub.id);
        assignments.push({
          subTaskId: sub.id,
          title: sub.title,
          parentTaskId,
          assignedAgentId: null,
          assignedCodename: null,
          laneId,
          matchedBy: 'unassigned',
        });
        continue;
      }

      assignments.push({
        subTaskId: sub.id,
        title: sub.title,
        parentTaskId,
        assignedAgentId: member.agentId,
        assignedCodename: member.codename,
        laneId,
        matchedBy,
      });
    }

    return { parentTaskId, assignments, unassigned };
  }

  /**
   * 跨角色汇总团队级交付物(需求 17.19 / 17.21 / 17.22)。全部子任务合格 → 团队交付合格;
   * 任一不合格 → 标记不合格 + needsRework(触发重做 / 争议)。
   */
  aggregateDeliverables(
    parentTaskId: string,
    parts: SubTaskDeliverable[],
  ): TeamDeliverable {
    const unqualified = parts.filter((p) => !p.qualified).map((p) => p.subTaskId);
    const qualified = parts.length > 0 && unqualified.length === 0;
    return {
      parentTaskId,
      parts,
      qualified,
      unqualified,
      needsRework: unqualified.length > 0,
    };
  }

  /**
   * 成员中途替换(需求 17.20)。把派给 fromAgentId 的子任务改派给 toAgentId,
   * 保持任务连续性(laneId 不变 → 上下文延续),产出可追溯审计记录。
   */
  replaceMember(
    plan: TaskSplitPlan,
    input: TeamReplacementAuditInput,
    now: Date = new Date(),
  ): { plan: TaskSplitPlan; audit: MemberReplacementAudit } {
    const reassigned: string[] = [];
    const assignments = plan.assignments.map((a) => {
      if (a.assignedAgentId === input.fromAgentId) {
        reassigned.push(a.subTaskId);
        return {
          ...a,
          assignedAgentId: input.toAgentId,
          assignedCodename: input.toCodename ?? a.assignedCodename,
          // laneId 保持不变以延续上下文(连续性)。
        };
      }
      return a;
    });

    const audit: MemberReplacementAudit = {
      parentTaskId: plan.parentTaskId,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      reassignedSubTasks: reassigned,
      at: now.toISOString(),
    };
    return { plan: { ...plan, assignments }, audit };
  }

  // ═══════════════════════ I 组:团队级预算 ═══════════════════════

  /**
   * 团队级预算评估(需求 17.27)。**团队级支出预算上限优先于单成员限额。**
   *   - 团队预算触顶(teamUsed + cost > teamBudgetCap)→ stop_team_budget(即停 + 告警),
   *     即便成员仍有额度。
   *   - 团队预算内但成员超限(memberUsed + cost > memberLimit)→ block_member_limit。
   *   - 二者皆内 → allow。
   *
   * 纯函数,无副作用;调用方在 allow 时方可消费成员/团队预算。
   */
  evaluateTeamBudget(e: TeamBudgetEvaluation): TeamBudgetDecision {
    const cost = e.cost ?? 0;
    // 团队级优先判定。
    if (e.teamUsed + cost > e.teamBudgetCap) {
      return {
        decision: 'stop_team_budget',
        teamCapped: true,
        alert: true,
        reason: `team budget cap reached: used ${e.teamUsed} + cost ${cost} > cap ${e.teamBudgetCap}`,
      };
    }
    // 团队内,再判成员限额。
    if (e.memberUsed + cost > e.memberLimit) {
      return {
        decision: 'block_member_limit',
        teamCapped: false,
        alert: true,
        reason: `member limit reached: used ${e.memberUsed} + cost ${cost} > limit ${e.memberLimit}`,
      };
    }
    return {
      decision: 'allow',
      teamCapped: false,
      alert: false,
      reason: 'within team budget and member limit',
    };
  }

  // ═══════════════════════ G 组:计量与看板 ═══════════════════════

  /**
   * 构建三模式透明计量看板(需求 17.23 / 17.24)。区分订阅 / 租赁 / 按结果;
   * 展示已用/剩余配额、进行中/已交付任务、结算与分佣记录。纯函数(数据由调用方注入)。
   */
  buildDashboard(args: {
    subscription?: SubscriptionQuotaDecision | null;
    leases?: TeamLeaseWindow[];
    settlements?: SettlementRecord[];
    tasks?: { inProgress: number; delivered: number };
    now?: Date;
  }): TeamMeteringDashboard {
    const now = args.now ?? new Date();
    const leases = args.leases ?? [];
    const settlements = args.settlements ?? [];

    const activeLeases = leases.filter(
      (l) => this.expireLeaseIfDue(l, now).status === 'active',
    );
    const expiredLeases = leases.filter(
      (l) => this.expireLeaseIfDue(l, now).status !== 'active',
    );
    const nextExpiry = activeLeases
      .map((l) => l.endsAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const perResult = settlements.filter((s) => s.mode === 'per_result');
    const totalSettledUsd =
      Math.round(perResult.reduce((sum, s) => sum + s.totalUsd, 0) * 100) / 100;

    const sub = args.subscription;
    return {
      subscription: {
        used: sub?.used ?? 0,
        remaining: sub?.remaining ?? null,
        quota: sub?.quota ?? null,
        warn: sub?.warn ?? false,
      },
      rental: {
        activeLeases: activeLeases.length,
        expiredLeases: expiredLeases.length,
        nextExpiryAt: nextExpiry ? nextExpiry.toISOString() : null,
      },
      perResult: {
        settledTasks: perResult.length,
        totalSettledUsd,
      },
      tasks: {
        inProgress: args.tasks?.inProgress ?? 0,
        delivered: args.tasks?.delivered ?? 0,
      },
      settlements,
    };
  }

  /** 把一笔结算结果转成看板记录(多跳分佣审计 —— 需求 17.24 / 17.25)。 */
  toSettlementRecord(
    result: TeamSettlementResult,
    mode: 'per_result' = 'per_result',
  ): SettlementRecord {
    return {
      taskId: result.taskId,
      mode,
      totalUsd: result.breakdown.totalUsd,
      merchantNetUsd: result.breakdown.merchantNetUsd,
      parties: result.breakdown.partyShares.map((p) => ({
        role: p.role,
        agentId: p.agentId,
        amountUsd: p.amountUsd,
      })),
      submissionRef: result.commission.submissionRef,
      at: result.commission.submittedAt,
    };
  }
}
