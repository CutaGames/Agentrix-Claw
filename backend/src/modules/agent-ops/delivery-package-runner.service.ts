import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentOpsDeliverableEntity } from './entities/agent-ops-deliverable.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import { ApprovalGrantService } from './approval-grant.service';
import { ActionDescriptor } from '../agent/policy-evaluator.service';
import { ApprovalGrantScope } from './entities/approval-grant.entity';
import {
  AcceptanceCriterion,
  DELIVERY_PACKAGES,
  DeliverableStepResult,
  DeliveryPackageContext,
  DeliveryPackageStep,
  DeliveryPackageTemplate,
  SectionCoverageResult,
  WriteActionStepResult,
} from './delivery-package.types';

/** 产出交付物步骤入参。 */
export interface ProduceDeliverableParams {
  /** 包 slug。 */
  packageSlug: string;
  /** 步骤 id(必须为 deliverable_production)。 */
  stepId: string;
  /** Agent 产出的结构化内容(章节内容落在 `content.sections`)。 */
  content: ProducedDeliverableContent;
  /** 每条关键数据的可核来源(可选)。 */
  sourceLinks?: any[];
  /** 数据采集时间(可选)。 */
  collectedAt?: Date | null;
  /** 是否落库(默认 true)。 */
  persist?: boolean;
}

/** 产出的交付物内容形态(章节化,便于覆盖校验)。 */
export interface ProducedDeliverableContent {
  /** 章节内容映射(键 = 必备章节 id)。 */
  sections: Record<string, unknown>;
  /** 其它结构化字段(摘要 / 元信息等)。 */
  [extra: string]: unknown;
}

/** 写动作审批步骤入参。 */
export interface RequestWriteActionParams {
  packageSlug: string;
  /** 步骤 id(必须为 write_action)。 */
  stepId: string;
  /** 本次写动作的预算成本(USD,默认 0)。 */
  cost?: number;
  /** 审批范围(默认 task)。 */
  scope?: ApprovalGrantScope;
  /** 范围标识(默认 ctx.taskId)。 */
  scopeId?: string;
  /** 动作意图描述(用于红线检测与审计)。 */
  intent?: string;
  /** 评估时间(测试可注入)。 */
  now?: Date;
}

/**
 * DeliveryPackageRunnerService — 交付包任务模板运行器(crypto-native-agent-ops 任务 18)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C7「交付包 = 任务模板」:每个含「输入 → 动作 → 交付物 → 量化验收 → 计费」。
 *   - 需求 13.1/13.2/13.3:产出文档/研究/社媒/审计协调交付物(必备章节清单覆盖)。
 *   - 需求 13.4:涉及对外发布/账号操作的写动作接入分级审批(任务 9/10)。
 *
 * 职责边界:
 *   - **交付物产出**(deliverable_production):对 Agent 产出的结构化内容做**必备章节清单覆盖**
 *     校验(量化验收),按 `qualified` 落库到 `agent_ops_deliverable`(归属该 Agent),
 *     并记一条只读审计日志。只读自动,无对外副作用。
 *   - **写动作**(write_action):经 `ApprovalGrantService.evaluateAndConsume`(内部调用任务 9
 *     `PolicyEvaluatorService` 风险分级 + 任务 10 会话/任务预算授权)产出审批决策并记审计日志。
 *     本运行器**绝不代执行对外发布**——仅返回决策(auto_execute / user_confirmation / deny),
 *     实际发布由获批后的执行链(TaskOrchestrator)进行。
 */
@Injectable()
export class DeliveryPackageRunnerService {
  private readonly logger = new Logger(DeliveryPackageRunnerService.name);

  private readonly registry: Map<string, DeliveryPackageTemplate>;

  constructor(
    @Inject(DELIVERY_PACKAGES)
    packages: DeliveryPackageTemplate[],
    private readonly approvalGrants: ApprovalGrantService,
    @InjectRepository(AgentOpsDeliverableEntity)
    private readonly deliverableRepo: Repository<AgentOpsDeliverableEntity>,
    @InjectRepository(AgentOpsActionLogEntity)
    private readonly actionLogRepo: Repository<AgentOpsActionLogEntity>,
  ) {
    this.registry = new Map(packages.map((p) => [p.slug, p]));
  }

  // ───────────────────────── 模板查询 ─────────────────────────

  /** 列出所有交付包模板。 */
  listTemplates(): DeliveryPackageTemplate[] {
    return [...this.registry.values()];
  }

  /** 按 slug 取交付包模板。 */
  getTemplate(slug: string): DeliveryPackageTemplate {
    const tpl = this.registry.get(slug);
    if (!tpl) {
      throw new NotFoundException(`DeliveryPackage '${slug}' not found`);
    }
    return tpl;
  }

  /** 校验输入是否覆盖必填字段(交付包五要素之「输入」)。 */
  validateInputs(
    slug: string,
    input: Record<string, unknown>,
  ): { ok: boolean; missing: string[] } {
    const tpl = this.getTemplate(slug);
    const missing = tpl.inputs
      .filter((f) => f.required && !isPresent(input?.[f.key]))
      .map((f) => f.key);
    return { ok: missing.length === 0, missing };
  }

  // ─────────────────────── 交付物产出 ───────────────────────

  /**
   * 产出一个交付物步骤:必备章节清单覆盖校验(量化验收)→ 按合格落库 → 记只读审计日志。
   */
  async produceDeliverable(
    ctx: DeliveryPackageContext,
    params: ProduceDeliverableParams,
  ): Promise<DeliverableStepResult> {
    const step = this.getStep(params.packageSlug, params.stepId);
    if (step.kind !== 'deliverable_production' || !step.deliverable) {
      throw new NotFoundException(
        `Step '${params.stepId}' is not a deliverable_production step`,
      );
    }

    const coverage = checkSectionCoverage(
      params.content,
      step.deliverable.requiredSections,
      step.deliverable.minItems,
    );

    let deliverableId: string | null = null;
    if (params.persist !== false) {
      const saved = await this.deliverableRepo.save(
        this.deliverableRepo.create({
          taskId: ctx.taskId,
          agentId: ctx.agentId,
          type: step.deliverable.deliverableType,
          content: {
            packageSlug: params.packageSlug,
            stepId: step.id,
            ...params.content,
            coverage,
          } as Record<string, any>,
          sourceLinks: params.sourceLinks ?? [],
          collectedAt: params.collectedAt ?? null,
          qualified: coverage.qualified,
          qualityCheckedBy: 'delivery_package_validator',
        }),
      );
      deliverableId = saved.id;
    }

    // 交付物产出为只读自动动作:记审计日志(read 档,无人确认)。
    await this.actionLogRepo.save(
      this.actionLogRepo.create({
        taskId: ctx.taskId,
        step: await this.nextStepIndex(ctx.taskId),
        target: `deliverable:${step.deliverable.deliverableType}`,
        action: 'produce_deliverable',
        result: {
          stepId: step.id,
          qualified: coverage.qualified,
          missingSections: coverage.missingSections,
          deliverableId,
        },
        riskTier: 'read',
        approvedBy: null,
      }),
    );

    this.logger.debug(
      `produceDeliverable pkg=${params.packageSlug} step=${step.id} ` +
        `qualified=${coverage.qualified} missing=[${coverage.missingSections.join(',')}]`,
    );

    return {
      stepId: step.id,
      deliverableType: step.deliverable.deliverableType,
      coverage,
      qualified: coverage.qualified,
      deliverableId,
    };
  }

  // ─────────────────────── 写动作审批 ───────────────────────

  /**
   * 评估一个写动作步骤的分级审批决策(需求 13.4 / 任务 9/10)。
   * 经 `ApprovalGrantService` 做风险分级 + 会话/任务预算授权;记审计日志。
   * **不代执行对外发布**,仅返回决策。
   */
  async requestWriteAction(
    ctx: DeliveryPackageContext,
    params: RequestWriteActionParams,
  ): Promise<WriteActionStepResult> {
    const step = this.getStep(params.packageSlug, params.stepId);
    if (step.kind !== 'write_action' || !step.action) {
      throw new NotFoundException(
        `Step '${params.stepId}' is not a write_action step`,
      );
    }

    const action: ActionDescriptor = {
      type: step.action.actionType,
      targetApp: step.action.target,
      intent: params.intent ?? step.label,
      isBatch: step.action.isBatch,
      toExternalDomain: step.action.toExternalDomain,
    };

    const decision = await this.approvalGrants.evaluateAndConsume({
      action,
      userId: ctx.userId,
      agentId: ctx.agentId,
      scope: params.scope ?? 'task',
      scopeId: params.scopeId ?? ctx.taskId,
      cost: params.cost ?? 0,
      now: params.now,
    });

    const log = await this.actionLogRepo.save(
      this.actionLogRepo.create({
        taskId: ctx.taskId,
        step: await this.nextStepIndex(ctx.taskId),
        target: step.action.target,
        action: step.action.actionType,
        result: {
          stepId: step.id,
          decision: decision.decision,
          reason: decision.reason,
          withinGrant: decision.withinGrant,
          grantId: decision.grantId,
        },
        riskTier: decision.tier,
        // 仅当自动放行(范围内预算授权)时无需人确认;回落人确认 / 拒绝时 approvedBy 留空。
        approvedBy: null,
      }),
    );

    this.logger.debug(
      `requestWriteAction pkg=${params.packageSlug} step=${step.id} ` +
        `type=${step.action.actionType} tier=${decision.tier} decision=${decision.decision}`,
    );

    return {
      stepId: step.id,
      actionType: step.action.actionType,
      decision: decision.decision,
      tier: decision.tier,
      redline: decision.redline,
      mayProceed: decision.decision === 'auto_execute',
      reason: decision.reason,
      actionLogId: log.id,
    };
  }

  // ─────────────────────── 内部 ───────────────────────

  /** 取包内步骤。 */
  private getStep(slug: string, stepId: string): DeliveryPackageStep {
    const tpl = this.getTemplate(slug);
    const step = tpl.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundException(
        `Step '${stepId}' not found in package '${slug}'`,
      );
    }
    return step;
  }

  /** 任务内动作日志的下一个步骤序号(从 1 起)。 */
  private async nextStepIndex(taskId: string): Promise<number> {
    const count = await this.actionLogRepo.count({ where: { taskId } });
    return count + 1;
  }
}

/**
 * 必备章节清单覆盖校验(纯函数,量化验收口径 —— 需求 13.1)。
 *
 * 合格条件(全部满足):
 *   1. 每个必备章节在 `content.sections` 中存在且非空;
 *   2. 若该章节有最小条目数要求(minItems),其值为数组时长度须 ≥ 要求。
 */
export function checkSectionCoverage(
  content: ProducedDeliverableContent | null | undefined,
  requiredSections: string[],
  minItems?: Record<string, number>,
): SectionCoverageResult {
  const sections = (content?.sections ?? {}) as Record<string, unknown>;
  const covered: string[] = [];
  const missing: string[] = [];
  const underfilled: SectionCoverageResult['underfilledSections'] = [];

  for (const section of requiredSections) {
    const value = sections[section];
    if (!isPresent(value)) {
      missing.push(section);
      continue;
    }
    covered.push(section);

    const required = minItems?.[section];
    if (typeof required === 'number') {
      const actual = Array.isArray(value) ? value.length : 0;
      if (actual < required) {
        underfilled.push({ section, required, actual });
      }
    }
  }

  const qualified = missing.length === 0 && underfilled.length === 0;
  return {
    qualified,
    coveredSections: covered,
    missingSections: missing,
    underfilledSections: underfilled,
  };
}

/** 字段是否存在(非 null/undefined;空串/空数组/空对象视为不存在)。 */
function isPresent(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}
