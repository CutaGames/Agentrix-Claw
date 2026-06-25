import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  S2S3_ASSIST_PACKAGE,
  LISTING_PREP_REQUIRED_SECTIONS,
  MARKET_MAKING_MONITOR_REQUIRED_SECTIONS,
  BD_IR_LEADS_REQUIRED_SECTIONS,
  GOVERNANCE_ASSIST_REQUIRED_SECTIONS,
} from './s2s3-assist-package';

/**
 * S2/S3 辅助交付包单测(任务 23 / 需求 16.1–16.5)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 + agent 辅助/非交付 计费口径)。
 *   - 上所备料 / 做市监控 / BD-IR / 治理 四类交付物:必备章节清单覆盖(含 靠人/不承诺/不刷量 声明章节)。
 *   - 上所提交 / 签约谈判 / 链上提交:🔴 irreversible_submit(high)→ 强制人确认,不可代执行(16.1/16.3/16.4)。
 *   - BD/IR 外联:🟡 submit_form(medium)→ 有预算授权自动放行;无授权回落人确认(16.3)。
 *   - wash trading(redline)→ deny,任何授权不可绕过(需求 16.2 / 6)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('S2S3_ASSIST_PACKAGE (任务 23 / 需求 16.1–16.5)', () => {
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
      opts?.packages ?? [S2S3_ASSIST_PACKAGE],
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
    it('包含五要素且覆盖需求 16.1–16.5', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s2s3-assist');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['16.1', '16.2', '16.3', '16.4', '16.5']),
      );
    });

    it('计费为订阅(agent 辅助/非交付,不按结果计费)(需求 16.5)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s2s3-assist');
      expect(tpl.billing.model).toBe('subscription');
      expect(tpl.billing.meteringRef).toBe('user_subscription_usage');
    });

    it('四类备料/外联/跟踪交付物均为只读自动产出(deliverable_production)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s2s3-assist');
      const deliverables = tpl.steps
        .filter((s) => s.kind === 'deliverable_production')
        .map((s) => s.deliverable?.deliverableType);
      expect(deliverables).toEqual(
        expect.arrayContaining([
          'listing_prep_dossier',
          'market_making_monitor',
          'bd_ir_leads',
          'governance_assist',
        ]),
      );
    });

    it('含 🟡 外联(submit_form)与 🔴 提交/签约/上链(irreversible_submit)写动作', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s2s3-assist');
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      const types = writes.map((s) => s.action?.actionType);
      expect(types).toEqual(expect.arrayContaining(['submit_form', 'irreversible_submit']));
      // 上所/签约/上链共 3 个不可逆提交写动作。
      expect(types.filter((t) => t === 'irreversible_submit').length).toBe(3);
    });

    it('做市监控为纯监控看板:不含任何 wash trading 类写动作(需求 16.2)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s2s3-assist');
      const types = tpl.steps
        .filter((s) => s.kind === 'write_action')
        .map((s) => s.action?.actionType ?? '');
      expect(types).not.toContain('wash_trading');
    });

    it('validateInputs:缺必填(projectName)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s2s3-assist', {
        listingTargets: { cex: ['x'] },
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toContain('projectName');
    });
  });

  // ───────────────────── 备料/监控/跟踪交付物(16.1–16.4) ─────────────────────

  describe('produceDeliverable(备料/监控/跟踪记录)', () => {
    it('上所备料覆盖必备章节 → 合格落库 listing_prep_dossier(16.1)', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's2s3-assist',
        stepId: 'listing-prep-dossier',
        content: fullContent(LISTING_PREP_REQUIRED_SECTIONS),
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('listing_prep_dossier');
      expect(deliverableRepo.rows[0].qualified).toBe(true);
    });

    it('上所备料缺 human_decision_notice(靠人声明)→ 不合格(16.1/16.5)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(LISTING_PREP_REQUIRED_SECTIONS);
      delete (content.sections as any).human_decision_notice;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's2s3-assist',
        stepId: 'listing-prep-dossier',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('human_decision_notice');
    });

    it('做市监控看板缺 no_wash_trading_notice(不刷量声明)→ 不合格(16.2)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(MARKET_MAKING_MONITOR_REQUIRED_SECTIONS);
      delete (content.sections as any).no_wash_trading_notice;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's2s3-assist',
        stepId: 'market-making-monitor',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('no_wash_trading_notice');
    });

    it('BD/IR 跟踪缺 human_required_notice(签约靠人声明)→ 不合格(16.3/16.5)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(BD_IR_LEADS_REQUIRED_SECTIONS);
      delete (content.sections as any).human_required_notice;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's2s3-assist',
        stepId: 'bd-ir-leads',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('human_required_notice');
    });

    it('治理辅助缺 assist_disclaimer(不承诺结果声明)→ 不合格(16.4/16.5)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(GOVERNANCE_ASSIST_REQUIRED_SECTIONS);
      delete (content.sections as any).assist_disclaimer;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's2s3-assist',
        stepId: 'governance-assist',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('assist_disclaimer');
    });
  });

  // ───────────────────── BD/IR 外联 🟡(16.3) ─────────────────────

  describe('requestWriteAction(BD/IR 外联 🟡)', () => {
    it('外联 submit_form(medium)+ 有效预算授权 → 自动放行(16.3)', async () => {
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
        packageSlug: 's2s3-assist',
        stepId: 'bd-ir-outreach',
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
        packageSlug: 's2s3-assist',
        stepId: 'bd-ir-outreach',
        cost: 5,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
    });
  });

  // ───────────────────── 上所/签约/上链 🔴(16.1/16.3/16.4) ─────────────────────

  describe('requestWriteAction(上所/签约/上链 🔴 强制人确认)', () => {
    const highRiskSteps = [
      ['listing-submission', '上所提交(16.1)'],
      ['bd-ir-commit', '签约/谈判/法务(16.3)'],
      ['governance-onchain-submit', '链上提案/投票(16.4)'],
    ] as const;

    it.each(highRiskSteps)(
      '%s irreversible_submit(high)→ 强制人确认,不可代执行(充足预算授权也不放行)',
      async (stepId) => {
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
          packageSlug: 's2s3-assist',
          stepId,
          cost: 1,
        });
        expect(res.tier).toBe('high');
        expect(res.decision).toBe('user_confirmation');
        expect(res.mayProceed).toBe(false);
        expect(res.redline).toBe(false);
      },
    );
  });

  // ───────────────────── wash trading 红线(需求 16.2 / 6 不可绕过) ─────────────────────

  describe('requestWriteAction(wash trading 红线)', () => {
    it('做市拉量 / wash trading → deny,任何授权不可绕过(需求 16.2/6)', async () => {
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
      // 构造一个尝试代执行 wash trading 的写动作步骤,验证框架红线拦截。
      const redlinePackage: DeliveryPackageTemplate = {
        ...S2S3_ASSIST_PACKAGE,
        slug: 's2s3-assist-redline',
        steps: [
          {
            id: 'wash-trading',
            label: 'DEX 做市拉量(违规)',
            kind: 'write_action',
            action: {
              actionType: 'submit_form',
              target: 'dex_market_making',
            },
          },
        ],
      };
      const { runner } = makeRunner({
        packages: [redlinePackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's2s3-assist-redline',
        stepId: 'wash-trading',
        intent: '帮我在 DEX 上 wash trading 对敲刷交易量拉盘',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });
  });
});
