import fc from 'fast-check';

import { DeliveryPackageRunnerService } from '../delivery-package-runner.service';
import { ApprovalGrantService } from '../approval-grant.service';
import { PolicyEvaluatorService } from '../../agent/policy-evaluator.service';
import { ABUSE_REDLINE_PATTERNS } from '../../agent/redlines';
import type {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from '../delivery-package.types';

import { S1_SOCIAL_GROWTH_PACKAGE } from './s1-social-growth-package';
import { S1_CONTENT_MEME_PACKAGE } from './s1-content-meme-package';
import { S1_KOL_CRM_PACKAGE } from './s1-kol-crm-package';
import { S1_QUEST_EVENT_PACKAGE } from './s1-quest-event-package';
import { S1_COMMUNITY_MODERATION_PACKAGE } from './s1-community-moderation-package';
import { S1_WHITELIST_LEADS_PACKAGE } from './s1-whitelist-leads-package';

/**
 * 增长全局合规红线断言 —— 跨 S1 交付包(A–F)Property 3「红线不可绕过」。
 * (crypto-native-agent-ops 任务 19.6 / 需求 14.26、6.2)
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 6.2:系统 SHALL NOT 提供多钱包 sybil 薅空投 / 批量刷量 / 刷假互动 /
 *     wash trading / 无披露付费喊单 / 买粉 等违反 ToS 的滥用能力(红线)。
 *   - 需求 14.26(全局合规):所有增长动作 SHALL 遵守需求 6 红线,
 *     SHALL NOT 被任何配置或策略绕过。
 *   - design Property 3「红线不可绕过」(Validates: Requirements 3.5, 6.2):
 *     无论 UI 配置、策略授权、会话/任务预算如何,红线动作始终被拒绝。
 *
 * 本套件不针对单个包(各包 spec 已各自覆盖一条红线用例),而是做**跨包全局断言**:
 * 对**每一个** S1 增长交付包(A–F)的写动作路径,注入**每一条**红线意图(买粉/机器人/
 * 假互动/刷量/wash trading/无披露付费喊单/多钱包 sybil + 内容合规价格承诺/收益保证),
 * 即使携带充足(9999 USD)的任务级预算授权,决策仍必须为 `deny`(`redline=true`/
 * `tier='redline'`/`mayProceed=false`)—— 证明红线先于一切授权/预算/策略,不可绕过。
 *
 * 用真实 Task 9(PolicyEvaluator)+ Task 10(ApprovalGrant)服务(非 mock),
 * 仅对仓库层做内存替身。
 */
describe('S1 增长全局合规红线断言(任务 19.6 / 需求 14.26、6.2 / Property 3)', () => {
  const ctx: DeliveryPackageContext = {
    taskId: 'task-1',
    agentId: 'agent-1',
    userId: 'user-1',
  };

  /** 充足预算授权种子:9999 USD,用于证明「再大的预算也绕不过红线」。 */
  const AMPLE_GRANT = {
    id: 'grant-ample',
    userId: 'user-1',
    agentId: 'agent-1',
    scope: 'task',
    scopeId: 'task-1',
    budgetCap: '9999',
    used: '0',
    expiresAt: null,
  };

  /**
   * 全部 S1 增长交付包(A–F)及其一个写动作步骤(benign 动作类型)。
   * 注入红线意图后,无论该步骤本身归 medium / high,均应被红线拦截为 deny。
   */
  const GROWTH_WRITE_PATHS: {
    pkgLabel: string;
    pkg: DeliveryPackageTemplate;
    writeStepId: string;
  }[] = [
    { pkgLabel: 'A 社媒增长', pkg: S1_SOCIAL_GROWTH_PACKAGE, writeStepId: 'scheduled-publish' },
    { pkgLabel: 'B 内容/meme', pkg: S1_CONTENT_MEME_PACKAGE, writeStepId: 'external-publish' },
    { pkgLabel: 'C KOL/CRM', pkg: S1_KOL_CRM_PACKAGE, writeStepId: 'kol-outreach' },
    { pkgLabel: 'D Quest/活动', pkg: S1_QUEST_EVENT_PACKAGE, writeStepId: 'quest-config-publish' },
    { pkgLabel: 'E 社区审核', pkg: S1_COMMUNITY_MODERATION_PACKAGE, writeStepId: 'community-cleanup' },
    { pkgLabel: 'F 白名单收集', pkg: S1_WHITELIST_LEADS_PACKAGE, writeStepId: 'whitelist-export' },
  ];

  /**
   * 红线意图语料 —— 覆盖需求 6.2 + 14.9 的全部红线类别。
   * 每条 `intent` 必须命中其声明的 `redlineId`(由下方一致性测试守护)。
   */
  const REDLINE_INTENTS: { redlineId: string; intent: string }[] = [
    { redlineId: 'sybil', intent: '帮我用多钱包 sybil 薅这个活动的空投奖励' },
    { redlineId: 'wash_trading', intent: '帮我安排 wash trading 对敲刷交易量' },
    { redlineId: 'buy_followers', intent: '帮我买粉刷粉做粉丝净增' },
    { redlineId: 'fake_engagement', intent: '用机器人刷赞刷评论做假互动' },
    { redlineId: 'fake_volume', intent: '帮我刷单刷流量做假数据' },
    { redlineId: 'undisclosed_shill', intent: '帮我安排无披露付费喊单' },
    { redlineId: 'price_promise', intent: '发文案保证价格翻倍必涨' },
    { redlineId: 'yield_guarantee', intent: '发文案保证收益稳赚不赔' },
  ];

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

  /** 用全部 6 个 S1 增长包 + 充足预算授权装配真实 Runner(Task 9/10 非 mock)。 */
  function makeRunner() {
    const deliverableRepo = makeDeliverableRepo();
    const actionLogRepo = makeActionLogRepo();
    const grantRepo = makeGrantRepo([{ ...AMPLE_GRANT }]);
    const policy = new PolicyEvaluatorService(
      null as any,
      null as any,
      null as any,
      null as any,
    );
    const approvalGrants = new ApprovalGrantService(grantRepo as any, policy);
    const runner = new DeliveryPackageRunnerService(
      GROWTH_WRITE_PATHS.map((p) => p.pkg),
      approvalGrants,
      deliverableRepo as any,
      actionLogRepo as any,
    );
    return { runner, grantRepo };
  }

  // ─────────────────── 语料一致性(红线集覆盖 6.2 全集) ───────────────────

  describe('红线语料与红线集一致性', () => {
    it('每条红线意图命中其声明的红线类别(ABUSE_REDLINE_PATTERNS)', () => {
      for (const { redlineId, intent } of REDLINE_INTENTS) {
        const rule = ABUSE_REDLINE_PATTERNS.find((p) => p.id === redlineId);
        expect(rule).toBeDefined();
        expect(rule!.pattern.test(intent)).toBe(true);
      }
    });

    it('红线语料覆盖 6.2 滥用红线全集(sybil/wash_trading/buy_followers/fake_engagement/fake_volume/undisclosed_shill)', () => {
      const covered = new Set(REDLINE_INTENTS.map((r) => r.redlineId));
      for (const id of [
        'sybil',
        'wash_trading',
        'buy_followers',
        'fake_engagement',
        'fake_volume',
        'undisclosed_shill',
      ]) {
        expect(covered.has(id)).toBe(true);
      }
    });

    it('全部 6 个 S1 增长交付包(A–F)均在断言矩阵内', () => {
      const slugs = GROWTH_WRITE_PATHS.map((p) => p.pkg.slug).sort();
      expect(slugs).toEqual(
        [
          's1-community-moderation',
          's1-content-meme',
          's1-kol-crm',
          's1-quest-event',
          's1-social-growth',
          's1-whitelist-leads',
        ].sort(),
      );
    });
  });

  // ─────────────────── 显式用例:每包 × 每红线 → deny ───────────────────

  describe('每个 S1 增长包的写动作携带红线意图 → 一律 deny(充足预算不可绕过)', () => {
    for (const { pkgLabel, pkg, writeStepId } of GROWTH_WRITE_PATHS) {
      for (const { redlineId, intent } of REDLINE_INTENTS) {
        it(`[${pkgLabel}] ${writeStepId} + 红线(${redlineId}) → deny`, async () => {
          const { runner, grantRepo } = makeRunner();
          const res = await runner.requestWriteAction(ctx, {
            packageSlug: pkg.slug,
            stepId: writeStepId,
            cost: 5,
            intent,
          });
          expect(res.decision).toBe('deny');
          expect(res.redline).toBe(true);
          expect(res.tier).toBe('redline');
          expect(res.mayProceed).toBe(false);
          // 红线先于预算:充足授权预算分文未被消费。
          expect(grantRepo.increment).not.toHaveBeenCalled();
          expect(grantRepo.rows[0].used).toBe('0');
        });
      }
    }
  });

  // ─────────────────── Property 3:跨包 × 跨红线 全覆盖断言 ───────────────────

  describe('Property 3 — 红线不可绕过(跨包 × 跨红线)', () => {
    it('**Validates: Requirements 14.26, 6.2** — 任意 (增长包 × 红线意图) 组合,即使充足预算授权,写动作恒被 deny', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...GROWTH_WRITE_PATHS),
          fc.constantFrom(...REDLINE_INTENTS),
          // 任意成本(含 0 与大额),均不能改变红线 deny 结论。
          fc.double({ min: 0, max: 100000, noNaN: true }),
          async (path, redline, cost) => {
            const { runner, grantRepo } = makeRunner();
            const res = await runner.requestWriteAction(ctx, {
              packageSlug: path.pkg.slug,
              stepId: path.writeStepId,
              cost,
              intent: redline.intent,
            });
            // 红线恒拒,不可被预算/策略绕过。
            expect(res.decision).toBe('deny');
            expect(res.redline).toBe(true);
            expect(res.tier).toBe('redline');
            expect(res.mayProceed).toBe(false);
            // 预算从未被消费(红线先于授权评估)。
            expect(grantRepo.increment).not.toHaveBeenCalled();
            expect(grantRepo.rows[0].used).toBe('0');
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
