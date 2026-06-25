import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  S1_WHITELIST_LEADS_PACKAGE,
  WHITELIST_LEADS_REQUIRED_SECTIONS,
} from './s1-whitelist-leads-package';

/**
 * S1 交付包 F · 白名单 / 候补名单收集 单测(任务 19.5 / 需求 14.23–14.25)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 + 计费按结果 per_result)。
 *   - 合格 leads 名单产出:必备章节清单覆盖
 *     (qualified_leads/dedup_summary/suspicious_findings/authenticity_criteria)。
 *   - 名单导出 🟡 强制人确认(external_publish / high)→ user_confirmation,
 *     即便有充足预算授权也不可绕过(需求 14.24 防外泄)。
 *   - 买粉/机器人/刷量(redline)→ deny,任何授权不可绕过(需求 6)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('S1_WHITELIST_LEADS_PACKAGE (任务 19.5 / 需求 14.23–14.25)', () => {
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
      opts?.packages ?? [S1_WHITELIST_LEADS_PACKAGE],
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
    it('包含五要素且覆盖需求 14.23–14.25', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-whitelist-leads');
      expect(tpl.stage).toBe('S1');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['14.23', '14.24', '14.25']),
      );
    });

    it('计费为按结果(合格 leads 数,需求 14.25)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-whitelist-leads');
      expect(tpl.billing.model).toBe('per_result');
      expect(tpl.billing.unit).toContain('合格 leads');
    });

    it('含 🟡 名单导出(external_publish 高风险)与 🟢 合格 leads 名单交付物', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-whitelist-leads');
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      const deliverables = tpl.steps.filter(
        (s) => s.kind === 'deliverable_production',
      );
      expect(writes.map((s) => s.action?.actionType)).toContain(
        'external_publish',
      );
      expect(deliverables.map((s) => s.deliverable?.deliverableType)).toContain(
        'whitelist',
      );
    });

    it('validateInputs:缺必填(名单收集配置)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s1-whitelist-leads', {
        submissions: {},
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toContain('collectionConfig');
    });
  });

  // ───────────────────── 合格 leads 名单产出(14.23/14.24) ─────────────────────

  describe('produceDeliverable(合格 leads 名单)', () => {
    it('覆盖全部必备章节 → 合格落库 whitelist', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-whitelist-leads',
        stepId: 'whitelist-leads-list',
        content: fullContent(WHITELIST_LEADS_REQUIRED_SECTIONS),
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('whitelist');
      expect(deliverableRepo.rows[0].qualified).toBe(true);
    });

    it('缺 dedup_summary(去重剔除数)章节 → 不合格(14.24)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(WHITELIST_LEADS_REQUIRED_SECTIONS);
      delete (content.sections as any).dedup_summary;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-whitelist-leads',
        stepId: 'whitelist-leads-list',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('dedup_summary');
    });

    it('缺 suspicious_findings(可疑数及依据)章节 → 不合格(14.24)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(WHITELIST_LEADS_REQUIRED_SECTIONS);
      delete (content.sections as any).suspicious_findings;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-whitelist-leads',
        stepId: 'whitelist-leads-list',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('suspicious_findings');
    });
  });

  // ───────────────────── 名单导出 🟡 强制人确认(14.24) ─────────────────────

  describe('requestWriteAction(名单导出 🟡 防外泄人确认)', () => {
    it('导出 external_publish(high)→ 人确认,充足预算也不可绕过(14.24)', async () => {
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
        packageSlug: 's1-whitelist-leads',
        stepId: 'whitelist-export',
        cost: 1,
      });
      expect(res.tier).toBe('high');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
      expect(res.redline).toBe(false);
    });
  });

  // ───────────────────── 红线(需求 6 不可绕过) ─────────────────────

  describe('requestWriteAction(买粉/机器人/刷量红线)', () => {
    it('买粉刷量假名单 → deny,任何授权不可绕过', async () => {
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
        ...S1_WHITELIST_LEADS_PACKAGE,
        slug: 's1-whitelist-leads-redline',
        steps: [
          {
            id: 'buy-followers',
            label: '买粉刷量灌注假名单',
            kind: 'write_action',
            action: {
              actionType: 'external_publish',
              target: 'whitelist_leads_export',
            },
          },
        ],
      };
      const { runner } = makeRunner({
        packages: [redlinePackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-whitelist-leads-redline',
        stepId: 'buy-followers',
        intent: '帮我买粉刷量灌注假名单做假数据',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });
  });
});
