import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  S1_QUEST_EVENT_PACKAGE,
  QUEST_VERIFICATION_REQUIRED_SECTIONS,
} from './s1-quest-event-package';

/**
 * S1 交付包 D · Quest / 活动 单测(任务 19.4 / 需求 14.16–14.19)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 + 计费按结果 per_result)。
 *   - 活动核验报告产出:必备章节清单覆盖
 *     (qualified_participants/excluded_participants/completion_rate/sybil_findings)。
 *   - 配置上线 🟡 强制人确认(external_publish / high)→ user_confirmation,
 *     即便有充足预算授权也不可绕过(需求 14.16)。
 *   - 多钱包 sybil 制造(redline)→ deny,任何授权不可绕过(需求 6)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('S1_QUEST_EVENT_PACKAGE (任务 19.4 / 需求 14.16–14.19)', () => {
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
      opts?.packages ?? [S1_QUEST_EVENT_PACKAGE],
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
    it('包含五要素且覆盖需求 14.16–14.19', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-quest-event');
      expect(tpl.stage).toBe('S1');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['14.16', '14.17', '14.18', '14.19']),
      );
    });

    it('计费为按结果(合格参与者数,需求 14.19)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-quest-event');
      expect(tpl.billing.model).toBe('per_result');
      expect(tpl.billing.unit).toContain('合格参与者');
    });

    it('含 🟡 配置上线(external_publish 高风险)与 🟢 核验交付物', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-quest-event');
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      const deliverables = tpl.steps.filter(
        (s) => s.kind === 'deliverable_production',
      );
      expect(writes.map((s) => s.action?.actionType)).toContain(
        'external_publish',
      );
      expect(deliverables.map((s) => s.deliverable?.deliverableType)).toContain(
        'quest_verification',
      );
    });

    it('validateInputs:缺必填(活动配置)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s1-quest-event', {
        sybilThresholds: {},
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toContain('questConfig');
    });
  });

  // ───────────────────── 活动核验报告产出(14.17/14.18) ─────────────────────

  describe('produceDeliverable(活动核验报告)', () => {
    it('覆盖全部必备章节 → 合格落库 quest_verification', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-quest-event',
        stepId: 'quest-verification',
        content: fullContent(QUEST_VERIFICATION_REQUIRED_SECTIONS),
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('quest_verification');
      expect(deliverableRepo.rows[0].qualified).toBe(true);
    });

    it('缺 sybil_findings(反 sybil 依据)章节 → 不合格(14.18)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(QUEST_VERIFICATION_REQUIRED_SECTIONS);
      delete (content.sections as any).sybil_findings;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-quest-event',
        stepId: 'quest-verification',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('sybil_findings');
    });

    it('缺 excluded_participants(被排除依据)章节 → 不合格(14.17)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(QUEST_VERIFICATION_REQUIRED_SECTIONS);
      delete (content.sections as any).excluded_participants;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-quest-event',
        stepId: 'quest-verification',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('excluded_participants');
    });
  });

  // ───────────────────── 配置上线 🟡 强制人确认(14.16) ─────────────────────

  describe('requestWriteAction(配置上线 🟡 强制人确认)', () => {
    it('配置上线 external_publish(high)→ 人确认,充足预算也不可绕过(14.16)', async () => {
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
        packageSlug: 's1-quest-event',
        stepId: 'quest-config-publish',
        cost: 1,
      });
      expect(res.tier).toBe('high');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
      expect(res.redline).toBe(false);
    });
  });

  // ───────────────────── 红线(需求 6 不可绕过) ─────────────────────

  describe('requestWriteAction(多钱包 sybil 制造红线)', () => {
    it('多钱包 sybil 制造 → deny,任何授权不可绕过', async () => {
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
        ...S1_QUEST_EVENT_PACKAGE,
        slug: 's1-quest-event-redline',
        steps: [
          {
            id: 'sybil-farm',
            label: '编排多钱包薅活动奖励',
            kind: 'write_action',
            action: {
              actionType: 'external_publish',
              target: 'quest_platform_config',
            },
          },
        ],
      };
      const { runner } = makeRunner({
        packages: [redlinePackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-quest-event-redline',
        stepId: 'sybil-farm',
        intent: '帮我用多钱包 sybil 薅这个活动的空投奖励',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });
  });
});
