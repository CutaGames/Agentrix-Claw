import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  S1_SOCIAL_GROWTH_PACKAGE,
  GROWTH_WEEKLY_REPORT_REQUIRED_SECTIONS,
} from './s1-social-growth-package';

/**
 * S1 交付包 A · 社媒增长运营 单测(任务 19.1 / 需求 14.1–14.6)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 + 订阅计费挂 user_subscription_usage)。
 *   - 量化周报产出:必备章节清单覆盖(净增/曝光/互动率/采集来源)。
 *   - 写动作分级审批(任务 9/10):
 *       · 常规排期发布 publish(medium):有预算授权 → 自动放行;无授权 → 回落人确认(14.1)。
 *       · 新模板首发 external_publish(high)→ 强制人确认(14.1)。
 *       · 买粉等达成路径(redline)→ deny,任何授权不可绕过(14.4)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('S1_SOCIAL_GROWTH_PACKAGE (任务 19.1 / 需求 14)', () => {
  const ctx: DeliveryPackageContext = {
    taskId: 'task-1',
    agentId: 'agent-1',
    userId: 'user-1',
  };

  function makeDeliverableRepo() {
    const rows: any[] = [];
    return {
      rows,
      create: (e: any) => ({ ...e }),
      save: jest.fn(async (e: any) => {
        const saved = { id: `dlv-${rows.length + 1}`, ...e };
        rows.push(saved);
        return saved;
      }),
    };
  }

  function makeActionLogRepo() {
    const rows: any[] = [];
    return {
      rows,
      create: (e: any) => ({ ...e }),
      save: jest.fn(async (e: any) => {
        const saved = { id: `log-${rows.length + 1}`, ...e };
        rows.push(saved);
        return saved;
      }),
      count: jest.fn(async ({ where }: any) =>
        rows.filter((r) => r.taskId === where.taskId).length,
      ),
    };
  }

  function makeGrantRepo(seed: any[] = []) {
    const rows: any[] = [...seed];
    return {
      rows,
      findOne: jest.fn(async ({ where }: any) => {
        const matches = rows.filter(
          (r) =>
            r.userId === where.userId &&
            r.agentId === where.agentId &&
            r.scope === where.scope &&
            r.scopeId === where.scopeId,
        );
        return matches[matches.length - 1] ?? null;
      }),
      increment: jest.fn(async ({ id }: any, field: string, val: number) => {
        const row = rows.find((r) => r.id === id);
        if (row) row[field] = (Number(row[field]) + val).toString();
        return { affected: 1 };
      }),
    };
  }

  function makeRunner(opts?: {
    packages?: DeliveryPackageTemplate[];
    grantSeed?: any[];
  }) {
    const deliverableRepo = makeDeliverableRepo();
    const actionLogRepo = makeActionLogRepo();
    const grantRepo = makeGrantRepo(opts?.grantSeed);
    const policy = new PolicyEvaluatorService(
      null as any,
      null as any,
      null as any,
      null as any,
    );
    const approvalGrants = new ApprovalGrantService(grantRepo as any, policy);
    const runner = new DeliveryPackageRunnerService(
      opts?.packages ?? [S1_SOCIAL_GROWTH_PACKAGE],
      approvalGrants,
      deliverableRepo as any,
      actionLogRepo as any,
    );
    return { runner, deliverableRepo, actionLogRepo, grantRepo };
  }

  function fullContent(sections: readonly string[]): ProducedDeliverableContent {
    const out: Record<string, unknown> = {};
    for (const s of sections) out[s] = `value:${s}`;
    return { sections: out };
  }

  // ───────────────────── 模板结构(五要素) ─────────────────────

  describe('模板结构', () => {
    it('S1 包含五要素且覆盖需求 14.1–14.6', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-social-growth');
      expect(tpl.stage).toBe('S1');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining([
          '14.1',
          '14.2',
          '14.3',
          '14.4',
          '14.5',
          '14.6',
        ]),
      );
    });

    it('计费为订阅,挂 user_subscription_usage(需求 14.6)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-social-growth');
      expect(tpl.billing.model).toBe('subscription');
      expect(tpl.billing.meteringRef).toBe('user_subscription_usage');
    });

    it('含对外发布写动作(常规 publish + 新模板 external_publish + 互动)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-social-growth');
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      const actionTypes = writes.map((s) => s.action?.actionType);
      expect(actionTypes).toEqual(
        expect.arrayContaining(['publish', 'external_publish']),
      );
    });

    it('validateInputs:缺必填(授权账号/排期/配额)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s1-social-growth', {
        contentSource: { template: 't1' },
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toEqual(
        expect.arrayContaining([
          'authorizedAccount',
          'publishSchedule',
          'dailyInteractionCap',
          'platformTosCap',
        ]),
      );
    });
  });

  // ───────────────────── 量化周报产出(14.2/14.3) ─────────────────────

  describe('produceDeliverable(量化周报)', () => {
    it('覆盖全部必备章节 → 合格落库 growth_weekly_report', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-social-growth',
        stepId: 'growth-weekly-report',
        content: fullContent(GROWTH_WEEKLY_REPORT_REQUIRED_SECTIONS),
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('growth_weekly_report');
      expect(deliverableRepo.rows[0].qualified).toBe(true);
    });

    it('缺采集来源标注章节 → 不合格(14.3)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(GROWTH_WEEKLY_REPORT_REQUIRED_SECTIONS);
      delete (content.sections as any).collection_meta;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-social-growth',
        stepId: 'growth-weekly-report',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('collection_meta');
    });
  });

  // ───────────────────── 写动作分级审批(14.1/14.4) ─────────────────────

  describe('requestWriteAction(分级审批)', () => {
    it('常规排期发布 publish(medium)+ 有效预算授权 → 自动放行(14.1)', async () => {
      const grantSeed = [
        {
          id: 'grant-1',
          userId: 'user-1',
          agentId: 'agent-1',
          scope: 'task',
          scopeId: 'task-1',
          budgetCap: '100',
          used: '0',
          expiresAt: null,
        },
      ];
      const { runner, grantRepo } = makeRunner({ grantSeed });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-social-growth',
        stepId: 'scheduled-publish',
        cost: 5,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('auto_execute');
      expect(res.mayProceed).toBe(true);
      expect(grantRepo.increment).toHaveBeenCalledWith(
        { id: 'grant-1' },
        'used',
        5,
      );
    });

    it('常规排期发布无授权 → 回落人确认(预算/频率上限外)', async () => {
      const { runner } = makeRunner();
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-social-growth',
        stepId: 'scheduled-publish',
        cost: 5,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
    });

    it('新模板首发 external_publish(high)→ 强制人确认(14.1)', async () => {
      const { runner } = makeRunner();
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-social-growth',
        stepId: 'new-template-first-publish',
      });
      expect(res.tier).toBe('high');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
      expect(res.redline).toBe(false);
    });

    it('账号互动 publish(medium)→ 无授权回落人确认(14.5 配额由执行链裁决)', async () => {
      const { runner } = makeRunner();
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-social-growth',
        stepId: 'account-interaction',
      });
      expect(res.tier).toBe('medium');
      expect(res.mayProceed).toBe(false);
    });

    it('买粉等达成路径(redline)→ deny,任何授权不可绕过(14.4)', async () => {
      // 即使携带大额任务预算授权,红线动作仍被拒绝。
      const grantSeed = [
        {
          id: 'grant-1',
          userId: 'user-1',
          agentId: 'agent-1',
          scope: 'task',
          scopeId: 'task-1',
          budgetCap: '9999',
          used: '0',
          expiresAt: null,
        },
      ];
      const redlinePackage: DeliveryPackageTemplate = {
        ...S1_SOCIAL_GROWTH_PACKAGE,
        slug: 's1-social-growth-redline',
        steps: [
          {
            id: 'buy-followers',
            label: '买粉刷量达成净增',
            kind: 'write_action',
            action: { actionType: 'buy_followers', target: 'x_account' },
          },
        ],
      };
      const { runner } = makeRunner({
        packages: [redlinePackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-social-growth-redline',
        stepId: 'buy-followers',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });
  });
});
