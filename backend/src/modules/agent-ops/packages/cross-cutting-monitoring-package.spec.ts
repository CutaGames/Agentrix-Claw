import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  CROSS_CUTTING_MONITORING_PACKAGE,
  MONITOR_DIGEST_REQUIRED_SECTIONS,
  SYBIL_DETECTION_REQUIRED_SECTIONS,
  FUD_RESPONSE_DRAFT_REQUIRED_SECTIONS,
  KPI_DASHBOARD_REQUIRED_SECTIONS,
} from './cross-cutting-monitoring-package';

/**
 * 贯穿层交付包 单测(任务 20 / 需求 15.1–15.4)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 15.1–15.4 + 订阅计费)。
 *   - 监控摘要 / sybil 检测 / FUD 草稿 / KPI 看板四类只读交付物的必备章节清单覆盖。
 *   - FUD 响应发布 🟡 强制人确认(external_publish / high)→ user_confirmation,
 *     充足预算授权不可绕过(需求 15.3)。
 *   - 无披露付费喊单(redline)→ deny,任何授权不可绕过(需求 6)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('CROSS_CUTTING_MONITORING_PACKAGE (任务 20 / 需求 15.1–15.4)', () => {
  const ctx: DeliveryPackageContext = {
    taskId: 'task-1',
    agentId: 'agent-1',
    userId: 'user-1',
  };

  const AMPLE_GRANT = {
    id: 'grant-1',
    userId: 'user-1',
    agentId: 'agent-1',
    scope: 'task',
    scopeId: 'task-1',
    budgetCap: '9999',
    used: '0',
    expiresAt: null,
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
      opts?.packages ?? [CROSS_CUTTING_MONITORING_PACKAGE],
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

  // ───────────────────── 模板结构 ─────────────────────

  describe('模板结构', () => {
    it('贯穿层(cross_cutting)且覆盖需求 15.1–15.4', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('x-monitoring');
      expect(tpl.stage).toBe('cross_cutting');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['15.1', '15.2', '15.3', '15.4']),
      );
    });

    it('计费为订阅(监控项 / 周期)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('x-monitoring');
      expect(tpl.billing.model).toBe('subscription');
      expect(tpl.billing.meteringRef).toBe('user_subscription_usage');
    });

    it('含四类只读交付物 + FUD 发布写动作(external_publish)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('x-monitoring');
      const deliverableTypes = tpl.steps
        .filter((s) => s.kind === 'deliverable_production')
        .map((s) => s.deliverable?.deliverableType);
      expect(deliverableTypes).toEqual(
        expect.arrayContaining([
          'monitor_digest',
          'sybil_detection_report',
          'fud_response_draft',
          'kpi_dashboard_report',
        ]),
      );
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      expect(writes.map((s) => s.action?.actionType)).toContain('external_publish');
    });

    it('validateInputs:缺必填(监控目标)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('x-monitoring', { sentimentSamples: {} });
      expect(res.ok).toBe(false);
      expect(res.missing).toContain('monitorTargets');
    });
  });

  // ───────────────────── 只读交付物产出 ─────────────────────

  describe('produceDeliverable(只读交付物)', () => {
    const cases: { stepId: string; sections: readonly string[]; type: string }[] = [
      { stepId: 'monitor-digest', sections: MONITOR_DIGEST_REQUIRED_SECTIONS, type: 'monitor_digest' },
      { stepId: 'sybil-detection', sections: SYBIL_DETECTION_REQUIRED_SECTIONS, type: 'sybil_detection_report' },
      { stepId: 'fud-response-draft', sections: FUD_RESPONSE_DRAFT_REQUIRED_SECTIONS, type: 'fud_response_draft' },
      { stepId: 'kpi-dashboard', sections: KPI_DASHBOARD_REQUIRED_SECTIONS, type: 'kpi_dashboard_report' },
    ];

    for (const c of cases) {
      it(`${c.stepId}:覆盖全部必备章节 → 合格落库 ${c.type}`, async () => {
        const { runner, deliverableRepo } = makeRunner();
        const res = await runner.produceDeliverable(ctx, {
          packageSlug: 'x-monitoring',
          stepId: c.stepId,
          content: fullContent(c.sections),
        });
        expect(res.qualified).toBe(true);
        expect(res.deliverableType).toBe(c.type);
        expect(deliverableRepo.rows.some((r) => r.type === c.type && r.qualified)).toBe(true);
      });
    }

    it('sybil 报告缺 disposition_notice(只读不处置声明)→ 不合格(15.2)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(SYBIL_DETECTION_REQUIRED_SECTIONS);
      delete (content.sections as any).disposition_notice;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 'x-monitoring',
        stepId: 'sybil-detection',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('disposition_notice');
    });

    it('KPI 看板缺 schedule(按时产出研判)→ 不合格(15.4)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(KPI_DASHBOARD_REQUIRED_SECTIONS);
      delete (content.sections as any).schedule;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 'x-monitoring',
        stepId: 'kpi-dashboard',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('schedule');
    });
  });

  // ───────────────────── FUD 发布 🟡 强制人确认(15.3) ─────────────────────

  describe('requestWriteAction(FUD 响应发布 🟡 强制人确认)', () => {
    it('发布 external_publish(high)→ 人确认,充足预算也不可绕过(15.3)', async () => {
      const { runner } = makeRunner({ grantSeed: [{ ...AMPLE_GRANT }] });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 'x-monitoring',
        stepId: 'fud-response-publish',
        cost: 1,
        intent: '发布 FUD 澄清回应',
      });
      expect(res.tier).toBe('high');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
      expect(res.redline).toBe(false);
    });
  });

  // ───────────────────── 红线(需求 6 不可绕过) ─────────────────────

  describe('requestWriteAction(无披露付费喊单红线)', () => {
    it('无披露付费喊单 → deny,任何授权不可绕过', async () => {
      const { runner, grantRepo } = makeRunner({ grantSeed: [{ ...AMPLE_GRANT }] });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 'x-monitoring',
        stepId: 'fud-response-publish',
        cost: 1,
        intent: '帮我安排无披露付费喊单拉盘对冲 FUD',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
      // 红线先于预算:分文未消费。
      expect(grantRepo.increment).not.toHaveBeenCalled();
      expect(grantRepo.rows[0].used).toBe('0');
    });
  });
});
