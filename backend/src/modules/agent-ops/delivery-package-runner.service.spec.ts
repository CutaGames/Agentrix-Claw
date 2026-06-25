import {
  DeliveryPackageRunnerService,
  checkSectionCoverage,
  ProducedDeliverableContent,
} from './delivery-package-runner.service';
import { ApprovalGrantService } from './approval-grant.service';
import { PolicyEvaluatorService } from '../agent/policy-evaluator.service';
import {
  DeliveryPackageContext,
  DeliveryPackageTemplate,
} from './delivery-package.types';
import {
  S0_BUILD_PACKAGE,
  LITEPAPER_REQUIRED_SECTIONS,
  TOKENOMICS_REQUIRED_SECTIONS,
  TRACK_POSITIONING_REQUIRED_SECTIONS,
  SOCIAL_MATRIX_REQUIRED_SECTIONS,
  AUDIT_VENDOR_REQUIRED_SECTIONS,
} from './packages/s0-build-package';

/**
 * DeliveryPackageRunnerService 单测(crypto-native-agent-ops 任务 18 / 需求 13)。
 *
 * 覆盖两类核心能力:
 *   1. **交付物产出**:必备章节清单覆盖校验(量化验收)+ 按合格落库 + 只读审计日志。
 *   2. **写动作接分级审批**(需求 13.4):经真实 ApprovalGrantService(任务 10)
 *      + PolicyEvaluatorService(任务 9)做风险分级:
 *        - external_publish → high → 回落人确认(mayProceed=false);
 *        - 红线动作(买粉)→ deny(不可绕过);
 *        - medium + 有效预算授权 → 自动放行(auto_execute)。
 *      且运行器**绝不代执行发布**,仅返回决策并记审计日志。
 *
 * 测试用真实 Task 9/10 服务(非 mock),仅对仓库层做内存替身,验证真实集成逻辑。
 */
describe('DeliveryPackageRunnerService (任务 18 / 需求 13)', () => {
  const ctx: DeliveryPackageContext = {
    taskId: 'task-1',
    agentId: 'agent-1',
    userId: 'user-1',
  };

  /** 内存交付物仓库替身。 */
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

  /** 内存动作日志仓库替身(支持 count by taskId)。 */
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

  /** 内存授权(ApprovalGrant)仓库替身:支持 findOne + increment。 */
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
    // 真实 PolicyEvaluator:classifyActionRisk 为纯函数,不触库(repo 传 null 即可)。
    const policy = new PolicyEvaluatorService(
      null as any,
      null as any,
      null as any,
      null as any,
    );
    const approvalGrants = new ApprovalGrantService(grantRepo as any, policy);
    const runner = new DeliveryPackageRunnerService(
      opts?.packages ?? [S0_BUILD_PACKAGE],
      approvalGrants,
      deliverableRepo as any,
      actionLogRepo as any,
    );
    return { runner, deliverableRepo, actionLogRepo, grantRepo };
  }

  /** 组装一份覆盖全部章节的内容。 */
  function fullContent(sections: readonly string[]): ProducedDeliverableContent {
    const out: Record<string, unknown> = {};
    for (const s of sections) out[s] = `draft:${s}`;
    return { sections: out };
  }

  // ───────────────────── checkSectionCoverage 纯函数 ─────────────────────

  describe('checkSectionCoverage(量化验收口径)', () => {
    it('覆盖全部必备章节 → 合格', () => {
      const res = checkSectionCoverage(
        fullContent(LITEPAPER_REQUIRED_SECTIONS),
        [...LITEPAPER_REQUIRED_SECTIONS],
      );
      expect(res.qualified).toBe(true);
      expect(res.missingSections).toEqual([]);
      expect(res.coveredSections).toHaveLength(LITEPAPER_REQUIRED_SECTIONS.length);
    });

    it('缺章节 → 不合格并列出缺失', () => {
      const content = fullContent(LITEPAPER_REQUIRED_SECTIONS);
      delete (content.sections as any).roadmap;
      delete (content.sections as any).team;
      const res = checkSectionCoverage(content, [...LITEPAPER_REQUIRED_SECTIONS]);
      expect(res.qualified).toBe(false);
      expect(res.missingSections).toEqual(
        expect.arrayContaining(['roadmap', 'team']),
      );
    });

    it('空串 / 空数组章节视为缺失', () => {
      const res = checkSectionCoverage(
        { sections: { a: '   ', b: [], c: 'ok' } },
        ['a', 'b', 'c'],
      );
      expect(res.missingSections).toEqual(expect.arrayContaining(['a', 'b']));
      expect(res.coveredSections).toEqual(['c']);
    });

    it('minItems:章节数组长度未达最小条目数 → 不合格(underfilled)', () => {
      const res = checkSectionCoverage(
        { sections: { competitors: [{ n: 1 }, { n: 2 }] } },
        ['competitors'],
        { competitors: 3 },
      );
      expect(res.qualified).toBe(false);
      expect(res.underfilledSections).toEqual([
        { section: 'competitors', required: 3, actual: 2 },
      ]);
    });

    it('minItems:达标 → 合格', () => {
      const res = checkSectionCoverage(
        { sections: { competitors: [1, 2, 3] } },
        ['competitors'],
        { competitors: 3 },
      );
      expect(res.qualified).toBe(true);
      expect(res.underfilledSections).toEqual([]);
    });

    it('content 为空 → 全部缺失', () => {
      const res = checkSectionCoverage(null, ['x', 'y']);
      expect(res.qualified).toBe(false);
      expect(res.missingSections).toEqual(['x', 'y']);
    });
  });

  // ───────────────────── 交付物产出 ─────────────────────

  describe('produceDeliverable(交付物产出)', () => {
    it('合格内容 → 落库 qualified=true + 记只读审计日志', async () => {
      const { runner, deliverableRepo, actionLogRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's0-build',
        stepId: 'litepaper-draft',
        content: fullContent(LITEPAPER_REQUIRED_SECTIONS),
      });

      expect(res.qualified).toBe(true);
      expect(res.deliverableType).toBe('litepaper_draft');
      expect(res.deliverableId).toBe('dlv-1');

      // 落库:类型 + 归属 + qualified + 校验器标识。
      expect(deliverableRepo.rows).toHaveLength(1);
      const saved = deliverableRepo.rows[0];
      expect(saved.taskId).toBe('task-1');
      expect(saved.agentId).toBe('agent-1');
      expect(saved.type).toBe('litepaper_draft');
      expect(saved.qualified).toBe(true);
      expect(saved.qualityCheckedBy).toBe('delivery_package_validator');

      // 审计日志:只读档,无人确认。
      expect(actionLogRepo.rows).toHaveLength(1);
      const log = actionLogRepo.rows[0];
      expect(log.action).toBe('produce_deliverable');
      expect(log.riskTier).toBe('read');
      expect(log.approvedBy).toBeNull();
      expect(log.step).toBe(1);
    });

    it('缺章节 → 落库 qualified=false 且记录缺失项', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const content = fullContent(TOKENOMICS_REQUIRED_SECTIONS);
      delete (content.sections as any).vesting_schedule;

      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's0-build',
        stepId: 'tokenomics-draft',
        content,
      });

      expect(res.qualified).toBe(false);
      expect(res.coverage.missingSections).toContain('vesting_schedule');
      expect(deliverableRepo.rows[0].qualified).toBe(false);
    });

    it('赛道定位报告竞品 < 3 → 不合格(minItems)', async () => {
      const { runner } = makeRunner();
      const content = fullContent(TRACK_POSITIONING_REQUIRED_SECTIONS);
      (content.sections as any).competitors = [{ name: 'A' }, { name: 'B' }];

      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's0-build',
        stepId: 'track-positioning',
        content,
      });
      expect(res.qualified).toBe(false);
      expect(res.coverage.underfilledSections[0]).toMatchObject({
        section: 'competitors',
        required: 3,
      });
    });

    it('persist=false → 不落库但仍校验', async () => {
      const { runner, deliverableRepo } = makeRunner();
      const res = await runner.produceDeliverable(ctx, {
        packageSlug: 's0-build',
        stepId: 'audit-vendor-checklist',
        content: fullContent(AUDIT_VENDOR_REQUIRED_SECTIONS),
        persist: false,
      });
      expect(res.qualified).toBe(true);
      expect(res.deliverableId).toBeNull();
      expect(deliverableRepo.rows).toHaveLength(0);
    });

    it('对 write_action 步骤调用 produceDeliverable → 抛错', async () => {
      const { runner } = makeRunner();
      await expect(
        runner.produceDeliverable(ctx, {
          packageSlug: 's0-build',
          stepId: 'social-matrix-publish',
          content: fullContent(SOCIAL_MATRIX_REQUIRED_SECTIONS),
        }),
      ).rejects.toThrow();
    });

    it('审计日志步骤序号随任务内动作递增', async () => {
      const { runner, actionLogRepo } = makeRunner();
      await runner.produceDeliverable(ctx, {
        packageSlug: 's0-build',
        stepId: 'litepaper-draft',
        content: fullContent(LITEPAPER_REQUIRED_SECTIONS),
      });
      await runner.produceDeliverable(ctx, {
        packageSlug: 's0-build',
        stepId: 'tokenomics-draft',
        content: fullContent(TOKENOMICS_REQUIRED_SECTIONS),
      });
      expect(actionLogRepo.rows.map((r) => r.step)).toEqual([1, 2]);
    });
  });

  // ───────────────────── 写动作接分级审批(需求 13.4) ─────────────────────

  describe('requestWriteAction(写动作接分级审批 / 任务 9/10)', () => {
    it('社媒对外发布 external_publish → high → 回落人确认,不可代执行', async () => {
      const { runner, actionLogRepo } = makeRunner();
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 's0-build',
        stepId: 'social-matrix-publish',
      });

      expect(res.tier).toBe('high');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
      expect(res.redline).toBe(false);

      // 审计日志记录:高风险 + 决策。
      const log = actionLogRepo.rows[0];
      expect(log.action).toBe('external_publish');
      expect(log.riskTier).toBe('high');
      expect(log.result.decision).toBe('user_confirmation');
    });

    it('红线写动作(买粉)→ deny,任何授权都不可绕过', async () => {
      const redlinePackage: DeliveryPackageTemplate = {
        ...S0_BUILD_PACKAGE,
        slug: 'test-redline',
        steps: [
          {
            id: 'buy-followers',
            label: '买粉刷量',
            kind: 'write_action',
            action: { actionType: 'buy_followers', target: 'x_account' },
          },
        ],
      };
      const { runner } = makeRunner({ packages: [redlinePackage] });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 'test-redline',
        stepId: 'buy-followers',
      });
      expect(res.redline).toBe(true);
      expect(res.tier).toBe('redline');
      expect(res.decision).toBe('deny');
      expect(res.mayProceed).toBe(false);
    });

    it('中风险写动作 + 有效任务预算授权 → 自动放行', async () => {
      const mediumPackage: DeliveryPackageTemplate = {
        ...S0_BUILD_PACKAGE,
        slug: 'test-medium',
        steps: [
          {
            id: 'submit-config',
            label: '提交落地页配置表单',
            kind: 'write_action',
            action: { actionType: 'submit_form', target: 'landing_page' },
          },
        ],
      };
      // 任务级授权:预算 100,未过期。
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
      const { runner, grantRepo } = makeRunner({
        packages: [mediumPackage],
        grantSeed,
      });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 'test-medium',
        stepId: 'submit-config',
        cost: 10,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('auto_execute');
      expect(res.mayProceed).toBe(true);
      // 预算被消费。
      expect(grantRepo.increment).toHaveBeenCalledWith(
        { id: 'grant-1' },
        'used',
        10,
      );
    });

    it('中风险写动作但无授权 → 回落人确认', async () => {
      const mediumPackage: DeliveryPackageTemplate = {
        ...S0_BUILD_PACKAGE,
        slug: 'test-medium-2',
        steps: [
          {
            id: 'submit-config',
            label: '提交落地页配置表单',
            kind: 'write_action',
            action: { actionType: 'submit_form', target: 'landing_page' },
          },
        ],
      };
      const { runner } = makeRunner({ packages: [mediumPackage] });
      const res = await runner.requestWriteAction(ctx, {
        packageSlug: 'test-medium-2',
        stepId: 'submit-config',
        cost: 10,
      });
      expect(res.tier).toBe('medium');
      expect(res.decision).toBe('user_confirmation');
      expect(res.mayProceed).toBe(false);
    });

    it('对 deliverable_production 步骤调用 requestWriteAction → 抛错', async () => {
      const { runner } = makeRunner();
      await expect(
        runner.requestWriteAction(ctx, {
          packageSlug: 's0-build',
          stepId: 'litepaper-draft',
        }),
      ).rejects.toThrow();
    });
  });

  // ───────────────────── 模板查询 + 输入校验 ─────────────────────

  describe('模板查询与输入校验', () => {
    it('S0 包结构:含五要素(输入/动作/交付物/验收/计费)', () => {
      const { runner } = makeRunner();
      const tpl = runner.getTemplate('s0-build');
      expect(tpl.stage).toBe('S0');
      expect(tpl.inputs.length).toBeGreaterThan(0);
      expect(tpl.steps.length).toBeGreaterThan(0);
      expect(tpl.acceptance.length).toBeGreaterThan(0);
      expect(tpl.billing.model).toBe('one_time');
      // 需求 13.1/13.2/13.3/13.4 全覆盖。
      expect(tpl.requirementRefs).toEqual(
        expect.arrayContaining(['13.1', '13.2', '13.3', '13.4']),
      );
      // 含至少一个写动作步骤(需求 13.4)。
      expect(tpl.steps.some((s) => s.kind === 'write_action')).toBe(true);
    });

    it('未知 slug → 抛错', () => {
      const { runner } = makeRunner();
      expect(() => runner.getTemplate('nope')).toThrow();
    });

    it('validateInputs:缺必填字段 → ok=false 并列出', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s0-build', { projectName: 'Foo' });
      expect(res.ok).toBe(false);
      expect(res.missing).toEqual(expect.arrayContaining(['oneLiner', 'track']));
    });

    it('validateInputs:必填齐全 → ok=true', () => {
      const { runner } = makeRunner();
      const res = runner.validateInputs('s0-build', {
        projectName: 'Foo',
        oneLiner: 'the foo',
        track: 'DeFi',
      });
      expect(res.ok).toBe(true);
      expect(res.missing).toEqual([]);
    });
  });
});
