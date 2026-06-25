import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  S1_CONTENT_MEME_PACKAGE,
  CONTENT_CALENDAR_REQUIRED_SECTIONS,
} from './s1-content-meme-package';

/**
 * S1 交付包 B · 内容 / meme 生产 单测(任务 19.2 / 需求 14.7–14.10)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 + 订阅计费「条/周」挂 user_subscription_usage)。
 *   - 内容日历产出:必备章节清单覆盖(brand_tone/themes/weeks/asset_slots)。
 *   - 对外发布写动作走交付包 A 的 🟡 审批(任务 9/10):
 *       · 常规发布 publish(medium):有预算授权 → 自动放行;无授权 → 回落人确认(14.9)。
 *       · 无披露喊单/价格承诺(redline)→ deny,任何授权不可绕过(14.9)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('S1_CONTENT_MEME_PACKAGE (任务 19.2 / 需求 14.7–14.10)', () => {
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
      opts?.packages ?? [S1_CONTENT_MEME_PACKAGE],
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
    it('包含五要素且覆盖需求 14.7–14.10', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-content-meme');
      expect(tpl.stage).toBe('S1');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['14.7', '14.8', '14.9', '14.10']),
      );
    });

    it('计费为订阅「条/周」,挂 user_subscription_usage(需求 14.10)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-content-meme');
      expect(tpl.billing.model).toBe('subscription');
      expect(tpl.billing.unit).toBe('条/周');
      expect(tpl.billing.meteringRef).toBe('user_subscription_usage');
    });

    it('含对外发布写动作(publish,走交付包 A 🟡)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-content-meme');
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      expect(writes.map((s) => s.action?.actionType)).toEqual(
        expect.arrayContaining(['publish']),
      );
    });

    it('validateInputs:缺必填(品牌调性/主题/最小频次)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s1-content-meme', {
        platforms: ['x'],
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toEqual(
        expect.arrayContaining(['brandTone', 'themes', 'minPerWeek']),
      );
    });
  });

  // ───────────────────── 内容日历产出(14.7/14.8) ─────────────────────

  describe('produceDeliverable(内容日历)', () => {
    it('覆盖全部必备章节 → 合格落库 content_calendar', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-content-meme',
        stepId: 'content-calendar',
        content: fullContent(CONTENT_CALENDAR_REQUIRED_SECTIONS),
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('content_calendar');
      expect(deliverableRepo.rows[0].qualified).toBe(true);
    });

    it('缺 asset_slots(配套素材)章节 → 不合格(14.8)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(CONTENT_CALENDAR_REQUIRED_SECTIONS);
      delete (content.sections as any).asset_slots;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-content-meme',
        stepId: 'content-calendar',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('asset_slots');
    });
  });

  // ───────────────────── 写动作分级审批(14.9 走 🟡) ─────────────────────

  describe('requestWriteAction(对外发布走交付包 A 🟡)', () => {
    it('常规发布 publish(medium)+ 有效预算授权 → 自动放行(14.9)', async () => {
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
        packageSlug: 's1-content-meme',
        stepId: 'external-publish',
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

    it('常规发布无授权 → 回落人确认(预算/频率上限外)', async () => {
      const { runner } = makeRunner();
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-content-meme',
        stepId: 'external-publish',
        cost: 5,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
    });

    it('无披露喊单/价格承诺(redline)→ deny,任何授权不可绕过(14.9)', async () => {
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
        ...S1_CONTENT_MEME_PACKAGE,
        slug: 's1-content-meme-redline',
        steps: [
          {
            id: 'shill-publish',
            label: '无披露付费喊单',
            kind: 'write_action',
            action: {
              actionType: 'publish',
              target: 'authorized_social_account',
            },
          },
        ],
      };
      const { runner } = makeRunner({
        packages: [redlinePackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-content-meme-redline',
        stepId: 'shill-publish',
        intent: '发布付费喊单,保证收益翻倍',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });
  });
});
