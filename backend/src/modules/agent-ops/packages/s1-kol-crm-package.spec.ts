import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  S1_KOL_CRM_PACKAGE,
  KOL_LIST_REQUIRED_SECTIONS,
} from './s1-kol-crm-package';

/**
 * S1 交付包 C · KOL 发现 / 外联 / CRM 单测(任务 19.3 / 需求 14.11–14.15)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 + 计费二选一 subscription_or_per_result)。
 *   - KOL 名单产出:必备章节清单覆盖(qualified_kols/flagged_suspected_fake/dedup_summary/authenticity_criteria)。
 *   - 外联触达 🟡(submit_form / medium):有预算授权 → 自动放行;无授权 → 回落人确认(14.13)。
 *   - 报价/签约 🔴(irreversible_submit / high)→ 强制人确认,不可代执行(14.14)。
 *   - 买粉(redline)→ deny,任何授权不可绕过(需求 6)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('S1_KOL_CRM_PACKAGE (任务 19.3 / 需求 14.11–14.15)', () => {
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
      opts?.packages ?? [S1_KOL_CRM_PACKAGE],
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
    it('包含五要素且覆盖需求 14.11–14.15', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-kol-crm');
      expect(tpl.stage).toBe('S1');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['14.11', '14.12', '14.13', '14.14', '14.15']),
      );
    });

    it('计费为按结果/订阅二选一(需求 14.15)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-kol-crm');
      expect(tpl.billing.model).toBe('subscription_or_per_result');
    });

    it('含 🟡 外联(submit_form)与 🔴 谈判(irreversible_submit)写动作', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-kol-crm');
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      expect(writes.map((s) => s.action?.actionType)).toEqual(
        expect.arrayContaining(['submit_form', 'irreversible_submit']),
      );
    });

    it('validateInputs:缺必填(画像/真实性阈值)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s1-kol-crm', {
        candidateSources: ['x-search'],
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toEqual(
        expect.arrayContaining(['trackProfile', 'authenticityThresholds']),
      );
    });
  });

  // ───────────────────── KOL 名单产出(14.11/14.12) ─────────────────────

  describe('produceDeliverable(KOL 名单)', () => {
    it('覆盖全部必备章节 → 合格落库 kol_list', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-kol-crm',
        stepId: 'kol-list',
        content: fullContent(KOL_LIST_REQUIRED_SECTIONS),
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('kol_list');
      expect(deliverableRepo.rows[0].qualified).toBe(true);
    });

    it('缺 flagged_suspected_fake(真实性核验)章节 → 不合格(14.12)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(KOL_LIST_REQUIRED_SECTIONS);
      delete (content.sections as any).flagged_suspected_fake;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-kol-crm',
        stepId: 'kol-list',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('flagged_suspected_fake');
    });
  });

  // ───────────────────── 外联 🟡(14.13) ─────────────────────

  describe('requestWriteAction(外联触达 🟡)', () => {
    it('外联 submit_form(medium)+ 有效预算授权 → 自动放行(14.13)', async () => {
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
        packageSlug: 's1-kol-crm',
        stepId: 'kol-outreach',
        cost: 5,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('auto_execute');
      expect(res.mayProceed).toBe(true);
      expect(grantRepo.increment).toHaveBeenCalledWith({ id: 'grant-1' }, 'used', 5);
    });

    it('外联无授权 → 回落人确认(预算上限外)', async () => {
      const { runner } = makeRunner();
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-kol-crm',
        stepId: 'kol-outreach',
        cost: 5,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
    });
  });

  // ───────────────────── 谈判/签约 🔴(14.14) ─────────────────────

  describe('requestWriteAction(报价/签约 🔴)', () => {
    it('报价/签约 irreversible_submit(high)→ 强制人确认,不可代执行(14.14)', async () => {
      // 即便携带充足任务预算授权,高风险动作仍强制人确认(grant 不能放行 high)。
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
      const { runner } = makeRunner({ grantSeed });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-kol-crm',
        stepId: 'kol-negotiation-commit',
        cost: 1,
      });
      expect(res.tier).toBe('high');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
      expect(res.redline).toBe(false);
    });
  });

  // ───────────────────── 红线(需求 6 不可绕过) ─────────────────────

  describe('requestWriteAction(买粉红线)', () => {
    it('买粉/假互动 → deny,任何授权不可绕过', async () => {
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
        ...S1_KOL_CRM_PACKAGE,
        slug: 's1-kol-crm-redline',
        steps: [
          {
            id: 'buy-followers',
            label: '买粉刷互动',
            kind: 'write_action',
            action: {
              actionType: 'submit_form',
              target: 'kol_outreach_channel',
            },
          },
        ],
      };
      const { runner } = makeRunner({
        packages: [redlinePackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-kol-crm-redline',
        stepId: 'buy-followers',
        intent: '帮我买粉刷互动做假数据',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });
  });
});
