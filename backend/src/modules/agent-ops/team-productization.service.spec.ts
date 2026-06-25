import { BadRequestException } from '@nestjs/common';

import { TeamProductizationService } from './team-productization.service';
import type { AgentServiceListing } from './hire-settlement.types';
import type { SubTaskSpec, TeamMember } from './team-productization.types';

/**
 * TeamProductizationService 单测 —— 可订阅/可租赁的定制 Agent 团队产品化
 * (crypto-native-agent-ops 任务 24 / 需求 17)。
 *
 * 覆盖六组职责(全部复用既有积木,本服务承担编排 + 纯决策):
 *   A 组 组建:roleOverrides 白名单 + 1–20 规模校验 + provision 失败回滚(17.3/17.4)。
 *   B 组 订阅:周期配额放行/超配额告警 + 周期结束处置(17.6–17.9)。
 *   C 组 租赁:租约窗口/续租/到期回收/故障补偿(17.10–17.12)。
 *   D+H 组 按结果:escrow + USDC + 多跳分佣透传 HireSettlementOrchestrator(17.13–17.17/17.25)。
 *   E 组 编排:子任务拆分派 + 汇总 + 成员替换连续性(17.18–17.22)。
 *   G 组 计量:三模式看板 + 结算记录(17.23/17.24)。
 *   I 组 预算:团队级上限优先于单成员限额,触顶即停告警(17.27)。
 *
 * 重型依赖以 mock 注入;纯决策函数无需 DB。
 */
describe('TeamProductizationService — Agent 团队产品化 (需求 17)', () => {
  const makeService = (deps?: {
    agentTeam?: any;
    subscriptionUsage?: any;
    hireSettlement?: any;
  }) =>
    new TeamProductizationService(
      deps?.agentTeam,
      deps?.subscriptionUsage,
      deps?.hireSettlement,
    );

  // ─────────────── A 组:组建与定制 ───────────────
  describe('A 组 — roleOverrides 白名单 + 规模 + 回滚', () => {
    it('仅白名单字段(model/capabilities/approvalLevel/spendingLimits)合法', () => {
      const svc = makeService();
      const res = svc.validateRoleOverrides({
        ceo: { preferredModel: 'gpt-4o', capabilities: ['x'], approvalLevel: 'manual' },
        dev: { spendingLimits: { singleTxLimit: 1, dailyLimit: 2, monthlyLimit: 3, currency: 'USDC' } },
      });
      expect(res.ok).toBe(true);
      expect(res.violations).toHaveLength(0);
    });

    it('非白名单字段(越权扩权)被标记违规', () => {
      const svc = makeService();
      const res = svc.validateRoleOverrides({
        // initialCreditScore / codename / name 均为越权字段
        treasury: { initialCreditScore: 9999 as any, codename: 'hacker' as any },
      });
      expect(res.ok).toBe(false);
      expect(res.violations[0].codename).toBe('treasury');
      expect(res.violations[0].illegalFields.sort()).toEqual(['codename', 'initialCreditScore']);
    });

    it('团队规模 1–20 通过,越界拒绝', () => {
      const svc = makeService();
      expect(svc.validateTeamSize(1).ok).toBe(true);
      expect(svc.validateTeamSize(20).ok).toBe(true);
      expect(svc.validateTeamSize(0).ok).toBe(false);
      expect(svc.validateTeamSize(21).ok).toBe(false);
    });

    it('provisionCustomTeam 越权字段直接拒绝(不调 provisionTeam)', async () => {
      const provisionTeam = jest.fn();
      const svc = makeService({
        agentTeam: {
          getTemplateForProvision: jest.fn(async () => ({ slug: 's', roles: [{}] })),
          provisionTeam,
          disbandTeam: jest.fn(),
        },
      });
      await expect(
        svc.provisionCustomTeam('owner1', {
          templateSlug: 's',
          roleOverrides: { ceo: { name: 'evil' as any } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provisionTeam).not.toHaveBeenCalled();
    });

    it('provision 中途失败 → 回滚(disbandTeam),不留半成品', async () => {
      const disbandTeam = jest.fn(async () => ({ disbanded: 3 }));
      const svc = makeService({
        agentTeam: {
          getTemplateForProvision: jest.fn(async () => ({ slug: 'agentrix-11', roles: new Array(11).fill({}) })),
          provisionTeam: jest.fn(async () => {
            throw new Error('boom on member 5');
          }),
          disbandTeam,
        },
      });
      await expect(
        svc.provisionCustomTeam('owner1', { templateSlug: 'agentrix-11' }),
      ).rejects.toThrow('boom on member 5');
      expect(disbandTeam).toHaveBeenCalledWith('owner1', 'agentrix-11');
    });

    it('规模超 20 的模板被拒绝', async () => {
      const svc = makeService({
        agentTeam: {
          getTemplateForProvision: jest.fn(async () => ({ slug: 'big', roles: new Array(21).fill({}) })),
          provisionTeam: jest.fn(),
          disbandTeam: jest.fn(),
        },
      });
      await expect(
        svc.provisionCustomTeam('owner1', { templateSlug: 'big' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─────────────── B 组:订阅生命周期 ───────────────
  describe('B 组 — 订阅配额 + 周期结束', () => {
    it('配额内放行,无告警', async () => {
      const svc = makeService({
        subscriptionUsage: {
          checkQuota: jest.fn(async () => ({
            tier: 'pro',
            allowed: true,
            reason: 'ok',
            todayCount: 1,
            monthCount: 10,
            dailyCap: null,
            monthlyIncluded: 200,
            warningThreshold: 160,
          })),
        },
      });
      const d = await svc.checkSubscriptionQuota('u1');
      expect(d.allowed).toBe(true);
      expect(d.warn).toBe(false);
      expect(d.remaining).toBe(190);
      expect(d.overQuotaAction).toBeNull();
    });

    it('达 80% 软阈值 → 告警(仍放行)', async () => {
      const svc = makeService({
        subscriptionUsage: {
          checkQuota: jest.fn(async () => ({
            tier: 'pro',
            allowed: true,
            reason: 'warn',
            todayCount: 1,
            monthCount: 170,
            dailyCap: null,
            monthlyIncluded: 200,
            warningThreshold: 160,
          })),
        },
      });
      const d = await svc.checkSubscriptionQuota('u1');
      expect(d.allowed).toBe(true);
      expect(d.warn).toBe(true);
    });

    it('超配额 → 不放行 + 按策略处置(pause)', async () => {
      const svc = makeService({
        subscriptionUsage: {
          checkQuota: jest.fn(async () => ({
            tier: 'free',
            allowed: false,
            reason: 'cap',
            todayCount: 20,
            monthCount: 600,
            dailyCap: 20,
            monthlyIncluded: 600,
            warningThreshold: null,
          })),
        },
      });
      const d = await svc.checkSubscriptionQuota('u1', 'pause');
      expect(d.allowed).toBe(false);
      expect(d.warn).toBe(true);
      expect(d.overQuotaAction).toBe('pause');
      expect(d.remaining).toBe(0);
    });

    it('续费不影响进行中任务;取消/降级 + 有进行中任务 → 宽限完成', () => {
      const svc = makeService();
      expect(svc.resolveCycleEnd('renew', true)).toEqual({ action: 'renew', inFlight: null });
      expect(svc.resolveCycleEnd('cancel', false)).toEqual({ action: 'cancel', inFlight: null });
      expect(svc.resolveCycleEnd('downgrade', true)).toEqual({
        action: 'downgrade',
        inFlight: 'grace_complete',
      });
      expect(svc.resolveCycleEnd('cancel', true, 'frozen')).toEqual({
        action: 'cancel',
        inFlight: 'frozen',
      });
    });
  });

  // ─────────────── C 组:租赁生命周期 ───────────────
  describe('C 组 — 租约窗口/续租/到期/补偿', () => {
    const start = new Date('2026-06-01T00:00:00Z');

    it('createLeaseWindow durationDays → endsAt 正确,status=active', () => {
      const svc = makeService();
      const lease = svc.createLeaseWindow(7, start);
      expect(lease.status).toBe('active');
      expect(lease.endsAt.getTime() - lease.startsAt.getTime()).toBe(7 * 86_400_000);
    });

    it('durationDays < 1 拒绝', () => {
      const svc = makeService();
      expect(() => svc.createLeaseWindow(0, start)).toThrow(BadRequestException);
    });

    it('renewLease 延长 endsAt;到期回收 expireLeaseIfDue', () => {
      const svc = makeService();
      const lease = svc.createLeaseWindow(7, start);
      const renewed = svc.renewLease(lease, 3);
      expect(renewed.durationDays).toBe(10);
      expect(renewed.endsAt.getTime() - lease.endsAt.getTime()).toBe(3 * 86_400_000);

      // 未到期 → 不变
      const notDue = svc.expireLeaseIfDue(renewed, new Date('2026-06-05T00:00:00Z'));
      expect(notDue.status).toBe('active');
      // 到期 → expired
      const due = svc.expireLeaseIfDue(renewed, new Date('2026-07-01T00:00:00Z'));
      expect(due.status).toBe('expired');
    });

    it('成员故障补偿:extend 延租 / refund 退款金额', () => {
      const svc = makeService();
      const lease = svc.createLeaseWindow(7, start);
      const extended = svc.compensateMemberFault(lease, 'extend', { compensationDays: 2 });
      expect(extended.lease.durationDays).toBe(9);
      expect(extended.lease.compensatedDays).toBe(2);
      expect(extended.refundUsd).toBe(0);

      const refunded = svc.compensateMemberFault(lease, 'refund', {
        compensationDays: 2,
        pricePerDayUsd: 5,
      });
      expect(refunded.refundUsd).toBe(10);
      expect(refunded.lease.durationDays).toBe(7); // 不变
    });
  });

  // ─────────────── D+H 组:按结果付费 + 多跳分佣 ───────────────
  describe('D+H 组 — settleTeamResult 透传 escrow + USDC', () => {
    const listing: AgentServiceListing = {
      listingId: 'L1',
      executingAgentId: 'agent-exec',
      sellerUserId: 'seller',
      merchantWallet: '0xabc',
      unitPriceUsd: 100,
      productType: 'service',
      x402Enabled: false,
      parties: [{ role: 'author', agentId: 'agent-author', wallet: '0xdef', poolShare: 0.5 }],
    };

    it('以 escrow + USDC 调 HireSettlementOrchestrator.settleHire', async () => {
      const settleHire = jest.fn(async () => ({ taskId: 't1' } as any));
      const svc = makeService({ hireSettlement: { settleHire } });
      await svc.settleTeamResult({
        taskId: 't1',
        hirerUserId: 'hirer',
        listing,
        quantity: 2,
      });
      expect(settleHire).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 't1',
          hirerUserId: 'hirer',
          quantity: 2,
          currency: 'USDC',
          rail: 'escrow',
          listing,
        }),
      );
    });

    it('依赖缺失 → 抛 BadRequest(显式不可用)', async () => {
      const svc = makeService();
      await expect(
        svc.settleTeamResult({ taskId: 't', hirerUserId: 'h', listing }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─────────────── E 组:协作编排 ───────────────
  describe('E 组 — 拆分派 + 汇总 + 成员替换', () => {
    const members: TeamMember[] = [
      { agentId: 'a-ceo', codename: 'ceo', capabilities: ['strategy'] },
      { agentId: 'a-dev', codename: 'dev', capabilities: ['coding'] },
    ];
    const subTasks: SubTaskSpec[] = [
      { id: 's1', title: '架构', preferredCodename: 'ceo' },
      { id: 's2', title: '编码', requiredCapability: 'coding' },
      { id: 's3', title: '其它' }, // round robin
    ];

    it('planTaskSplit:preferred / capability / round_robin 匹配 + lane 隔离', () => {
      const svc = makeService();
      const plan = svc.planTaskSplit('parent1', subTasks, members);
      const byId = Object.fromEntries(plan.assignments.map((a) => [a.subTaskId, a]));
      expect(byId.s1.matchedBy).toBe('preferred');
      expect(byId.s1.assignedAgentId).toBe('a-ceo');
      expect(byId.s2.matchedBy).toBe('capability');
      expect(byId.s2.assignedAgentId).toBe('a-dev');
      expect(byId.s3.matchedBy).toBe('round_robin');
      // 每个子任务独立 lane(隔离上下文)
      const lanes = plan.assignments.map((a) => a.laneId);
      expect(new Set(lanes).size).toBe(3);
      expect(plan.unassigned).toHaveLength(0);
    });

    it('无成员 → 全部 unassigned', () => {
      const svc = makeService();
      const plan = svc.planTaskSplit('parent1', subTasks, []);
      expect(plan.unassigned).toEqual(['s1', 's2', 's3']);
    });

    it('aggregateDeliverables:全部合格 → 团队合格;有不合格 → needsRework', () => {
      const svc = makeService();
      const ok = svc.aggregateDeliverables('p', [
        { subTaskId: 's1', agentId: 'a', qualified: true },
        { subTaskId: 's2', agentId: 'b', qualified: true },
      ]);
      expect(ok.qualified).toBe(true);
      expect(ok.needsRework).toBe(false);

      const bad = svc.aggregateDeliverables('p', [
        { subTaskId: 's1', agentId: 'a', qualified: true },
        { subTaskId: 's2', agentId: 'b', qualified: false },
      ]);
      expect(bad.qualified).toBe(false);
      expect(bad.unqualified).toEqual(['s2']);
      expect(bad.needsRework).toBe(true);
    });

    it('replaceMember:改派 + 保持 laneId 连续 + 审计记录', () => {
      const svc = makeService();
      const plan = svc.planTaskSplit('parent1', subTasks, members);
      const ceoLanes = plan.assignments
        .filter((a) => a.assignedAgentId === 'a-ceo')
        .map((a) => a.laneId);
      const { plan: next, audit } = svc.replaceMember(
        plan,
        { fromAgentId: 'a-ceo', toAgentId: 'a-ceo-2', toCodename: 'ceo' },
        new Date('2026-06-10T00:00:00Z'),
      );
      // 被改派的子任务现归 a-ceo-2,但 lane 不变
      const reassigned = next.assignments.filter((a) => a.assignedAgentId === 'a-ceo-2');
      expect(reassigned.length).toBeGreaterThan(0);
      expect(reassigned.map((a) => a.laneId).sort()).toEqual(ceoLanes.sort());
      expect(audit.fromAgentId).toBe('a-ceo');
      expect(audit.toAgentId).toBe('a-ceo-2');
      expect(audit.reassignedSubTasks).toEqual(reassigned.map((a) => a.subTaskId));
    });
  });

  // ─────────────── I 组:团队级预算 ───────────────
  describe('I 组 — 团队级预算优先于单成员限额 (17.27)', () => {
    it('团队预算内 + 成员内 → allow', () => {
      const svc = makeService();
      const d = svc.evaluateTeamBudget({
        teamBudgetCap: 1000,
        teamUsed: 100,
        memberLimit: 200,
        memberUsed: 50,
        cost: 30,
      });
      expect(d.decision).toBe('allow');
      expect(d.alert).toBe(false);
    });

    it('团队预算触顶 → stop_team_budget(即便成员仍有额度)', () => {
      const svc = makeService();
      const d = svc.evaluateTeamBudget({
        teamBudgetCap: 100,
        teamUsed: 90,
        memberLimit: 10_000, // 成员额度充裕
        memberUsed: 0,
        cost: 20,
      });
      expect(d.decision).toBe('stop_team_budget');
      expect(d.teamCapped).toBe(true);
      expect(d.alert).toBe(true);
    });

    it('团队内但成员超限 → block_member_limit', () => {
      const svc = makeService();
      const d = svc.evaluateTeamBudget({
        teamBudgetCap: 10_000,
        teamUsed: 100,
        memberLimit: 50,
        memberUsed: 40,
        cost: 20,
      });
      expect(d.decision).toBe('block_member_limit');
      expect(d.teamCapped).toBe(false);
      expect(d.alert).toBe(true);
    });
  });

  // ─────────────── G 组:计量与看板 ───────────────
  describe('G 组 — 三模式看板 + 结算记录', () => {
    it('buildDashboard 区分订阅/租赁/按结果 + 任务进度', () => {
      const svc = makeService();
      const start = new Date('2026-06-01T00:00:00Z');
      const now = new Date('2026-06-05T00:00:00Z');
      const dash = svc.buildDashboard({
        subscription: {
          allowed: true,
          warn: false,
          overQuotaAction: null,
          used: 10,
          remaining: 190,
          quota: 200,
          reason: 'ok',
        },
        leases: [
          svc.createLeaseWindow(7, start), // active at now
          { durationDays: 1, startsAt: start, endsAt: new Date('2026-06-02T00:00:00Z'), status: 'active' }, // due → expired
        ],
        settlements: [
          {
            taskId: 't1',
            mode: 'per_result',
            totalUsd: 100,
            merchantNetUsd: 90,
            parties: [{ role: 'author', agentId: 'a', amountUsd: 5 }],
            at: now.toISOString(),
          },
        ],
        tasks: { inProgress: 2, delivered: 5 },
        now,
      });
      expect(dash.subscription.remaining).toBe(190);
      expect(dash.rental.activeLeases).toBe(1);
      expect(dash.rental.expiredLeases).toBe(1);
      expect(dash.perResult.settledTasks).toBe(1);
      expect(dash.perResult.totalSettledUsd).toBe(100);
      expect(dash.tasks).toEqual({ inProgress: 2, delivered: 5 });
      expect(dash.settlements).toHaveLength(1);
    });

    it('toSettlementRecord 从结算结果提取多跳分佣审计', () => {
      const svc = makeService();
      const rec = svc.toSettlementRecord({
        taskId: 't1',
        listingId: 'L1',
        executingAgentId: 'exec',
        currency: 'USDC',
        rail: 'escrow',
        breakdown: {
          totalUsd: 100,
          merchantNetUsd: 90,
          platformFeeUsd: 5,
          channelFeeUsd: 0,
          partyShares: [
            { role: 'author', agentId: 'a-author', wallet: '0x', amountUsd: 5, percentage: 5 },
          ],
          shares: [],
        },
        commission: {
          flatConfig: {} as any,
          splitHash: '0xhash',
          submissionRef: 'commission-submit:L1:0xhash',
          submittedAt: '2026-06-05T00:00:00.000Z',
        },
        settlementRef: 'escrow:e1',
        spendingEvents: [],
      });
      expect(rec.mode).toBe('per_result');
      expect(rec.totalUsd).toBe(100);
      expect(rec.merchantNetUsd).toBe(90);
      expect(rec.parties).toEqual([{ role: 'author', agentId: 'a-author', amountUsd: 5 }]);
      expect(rec.submissionRef).toBe('commission-submit:L1:0xhash');
    });
  });
});
