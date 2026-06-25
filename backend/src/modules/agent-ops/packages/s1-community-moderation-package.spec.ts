import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import type { ProducedDeliverableContent } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';
import {
  S1_COMMUNITY_MODERATION_PACKAGE,
  SENTIMENT_DIGEST_REQUIRED_SECTIONS,
} from './s1-community-moderation-package';

/**
 * S1 交付包 E · 社区审核 + 情绪日报 单测(任务 19.5 / 需求 14.20–14.22)。
 *
 * 覆盖:
 *   - 模板结构(五要素 + 需求覆盖 + 计费订阅 subscription)。
 *   - 情绪日报产出:必备章节清单覆盖
 *     (violations/response_time/cleanup_volume/sentiment)。
 *   - 清理动作(删除/封禁)🟡 强制人确认(batch_operation / isBatch → high)→ user_confirmation,
 *     即便有充足预算授权也不可绕过(需求 14.20 批量封禁人确认)。
 *   - 买粉/机器人/刷量(redline)→ deny,任何授权不可绕过(需求 6)。
 *
 * 用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身。
 */
describe('S1_COMMUNITY_MODERATION_PACKAGE (任务 19.5 / 需求 14.20–14.22)', () => {
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
      opts?.packages ?? [S1_COMMUNITY_MODERATION_PACKAGE],
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
    it('包含五要素且覆盖需求 14.20–14.22', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-community-moderation');
      expect(tpl.stage).toBe('S1');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['14.20', '14.21', '14.22']),
      );
    });

    it('计费为订阅(频道数 / 周期,需求 14.22)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-community-moderation');
      expect(tpl.billing.model).toBe('subscription');
      expect(tpl.billing.unit).toContain('频道');
    });

    it('含 🟡 清理动作(batch_operation 批量封禁)与 🟢 情绪日报交付物', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s1-community-moderation');
      const writes = tpl.steps.filter((s) => s.kind === 'write_action');
      const deliverables = tpl.steps.filter(
        (s) => s.kind === 'deliverable_production',
      );
      expect(writes.map((s) => s.action?.actionType)).toContain(
        'batch_operation',
      );
      // 批量封禁强制人确认:isBatch 标记。
      expect(writes.some((s) => s.action?.isBatch === true)).toBe(true);
      expect(deliverables.map((s) => s.deliverable?.deliverableType)).toContain(
        'sentiment_digest',
      );
    });

    it('validateInputs:缺必填(待巡检频道列表)→ ok=false', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s1-community-moderation', {
        reportDate: '2026-05-10',
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toContain('channels');
    });
  });

  // ───────────────────── 情绪日报产出(14.20/14.21) ─────────────────────

  describe('produceDeliverable(情绪日报)', () => {
    it('覆盖全部必备章节 → 合格落库 sentiment_digest', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-community-moderation',
        stepId: 'sentiment-daily-report',
        content: fullContent(SENTIMENT_DIGEST_REQUIRED_SECTIONS),
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('sentiment_digest');
      expect(deliverableRepo.rows[0].qualified).toBe(true);
    });

    it('缺 response_time(响应时间中位数+P90)章节 → 不合格(14.21)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(SENTIMENT_DIGEST_REQUIRED_SECTIONS);
      delete (content.sections as any).response_time;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-community-moderation',
        stepId: 'sentiment-daily-report',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('response_time');
    });

    it('缺 sentiment(正/中/负占比+主要话题)章节 → 不合格(14.21)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(SENTIMENT_DIGEST_REQUIRED_SECTIONS);
      delete (content.sections as any).sentiment;
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's1-community-moderation',
        stepId: 'sentiment-daily-report',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('sentiment');
    });
  });

  // ───────────────────── 清理动作 🟡 强制人确认(14.20) ─────────────────────

  describe('requestWriteAction(社区清理 🟡 批量封禁人确认)', () => {
    it('清理 batch_operation(high)→ 人确认,充足预算也不可绕过(14.20)', async () => {
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
        packageSlug: 's1-community-moderation',
        stepId: 'community-cleanup',
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
    it('买粉/刷量假互动 → deny,任何授权不可绕过', async () => {
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
        ...S1_COMMUNITY_MODERATION_PACKAGE,
        slug: 's1-community-moderation-redline',
        steps: [
          {
            id: 'buy-followers',
            label: '买粉刷量做假活跃',
            kind: 'write_action',
            action: {
              actionType: 'batch_operation',
              target: 'community_channel_moderation',
              isBatch: true,
            },
          },
        ],
      };
      const { runner } = makeRunner({
        packages: [redlinePackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's1-community-moderation-redline',
        stepId: 'buy-followers',
        intent: '帮我买粉刷量做假活跃数据',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });
  });
});
