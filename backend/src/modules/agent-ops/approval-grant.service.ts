import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ApprovalGrantEntity,
  ApprovalGrantScope,
} from './entities/approval-grant.entity';
import {
  PolicyEvaluatorService,
  ActionDescriptor,
  RiskTier,
} from '../agent/policy-evaluator.service';

/** 创建一条会话/任务预算授权的入参。 */
export interface CreateApprovalGrantDto {
  /** 被授权的 Agent(AgentAccount id)。 */
  agentId: string;
  /** 授权范围:会话级或任务级。 */
  scope: ApprovalGrantScope;
  /** 范围标识(会话 id 或任务 id)。 */
  scopeId: string;
  /** 预算上限(USD)。 */
  budgetCap: number;
  /** 过期时间;不传则不设过期(仅受 budgetCap 约束)。 */
  expiresAt?: Date | null;
}

/** 评估并按需消费授权的入参。 */
export interface EvaluateWithGrantParams {
  /** 待评估的动作描述(用于风险分级)。 */
  action: ActionDescriptor;
  /** 授权发起人(被代表的用户)。 */
  userId: string;
  /** 执行动作的 Agent。 */
  agentId: string;
  /** 当前会话/任务范围维度。 */
  scope: ApprovalGrantScope;
  /** 当前会话/任务范围标识。 */
  scopeId: string;
  /** 本次动作的预算成本(USD),默认 0。 */
  cost?: number;
  /** 评估时间(可注入用于测试过期边界),默认 now。 */
  now?: Date;
}

/**
 * 授权覆盖判定结果(Property 9 的核心判定)。
 */
export interface GrantCoverage {
  /** 该 grant 是否覆盖本次动作(范围内 + 预算内 + 未过期)。 */
  covered: boolean;
  /** 不覆盖时的原因码:EXPIRED / EXCEEDS_BUDGET / NO_ACTIVE_GRANT。 */
  reason?: string;
}

/**
 * 分级审批 + 预算授权的最终决策。
 */
export interface ApprovalGrantDecision {
  /** auto_execute(范围内自动放行)/ user_confirmation(回落人确认)/ deny(红线拒绝)。 */
  decision: 'auto_execute' | 'user_confirmation' | 'deny';
  /** 动作风险档。 */
  tier: RiskTier;
  /** 是否命中红线。 */
  redline: boolean;
  /** medium 档时:本次是否被某条 ApprovalGrant 自动放行。 */
  withinGrant: boolean;
  /** 命中的授权 id(自动放行时)。 */
  grantId?: string;
  /** 决策原因码(审计用)。 */
  reason?: string;
}

/**
 * ApprovalGrantService — 会话/任务级预算授权(需求 3.4 / Property 9)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C3「会话/任务预算授权」、§Data Models `approval_grant`。
 *   - 需求 3.4:用户可为某任务/会话设定自动放行范围与预算上限,超出即回落人确认。
 *   - Property 9「审批范围有界」:`ApprovalGrant` 自动放行严格限定在
 *     scope + budgetCap + expiresAt 内;越界即回落人确认。
 *
 * 与 Task 9 的 `PolicyEvaluatorService` 风险分级对接:
 *   - redline → deny(不可绕过,先于一切授权)。
 *   - read    → auto_execute(无人值守)。
 *   - high    → user_confirmation(强制人确认,grant 不能放行高风险)。
 *   - medium  → 命中有效 grant(范围内 + 预算够 + 未过期)→ auto_execute 并消费预算;
 *               否则回落 user_confirmation(桌面端复用 `requireDesktopActionApproval`)。
 *
 * 注意:本服务只做后端「自动放行 vs 回落人确认」决策;人确认 UI 由桌面端
 * `requireDesktopActionApproval` 在收到 user_confirmation 时触发。
 */
@Injectable()
export class ApprovalGrantService {
  private readonly logger = new Logger(ApprovalGrantService.name);

  constructor(
    @InjectRepository(ApprovalGrantEntity)
    private readonly grantRepo: Repository<ApprovalGrantEntity>,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  /** 创建一条会话/任务预算授权。 */
  async createGrant(
    userId: string,
    dto: CreateApprovalGrantDto,
  ): Promise<ApprovalGrantEntity> {
    const grant = this.grantRepo.create({
      userId,
      agentId: dto.agentId,
      scope: dto.scope,
      scopeId: dto.scopeId,
      budgetCap: this.toNumericString(dto.budgetCap),
      used: this.toNumericString(0),
      expiresAt: dto.expiresAt ?? null,
    });
    const saved = await this.grantRepo.save(grant);
    this.logger.debug(
      `createGrant ${saved.id} scope=${dto.scope}:${dto.scopeId} cap=${dto.budgetCap} for user ${userId}`,
    );
    return saved;
  }

  /**
   * 查找当前 scope + scopeId 下、归属 user + agent 的最新一条授权。
   * 不做过期/预算判定(交由 {@link checkCoverage})。
   */
  async findActiveGrant(params: {
    userId: string;
    agentId: string;
    scope: ApprovalGrantScope;
    scopeId: string;
  }): Promise<ApprovalGrantEntity | null> {
    return this.grantRepo.findOne({
      where: {
        userId: params.userId,
        agentId: params.agentId,
        scope: params.scope,
        scopeId: params.scopeId,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 纯函数:判定一条 grant 是否覆盖本次成本(Property 9 的边界核心)。
   *
   * 覆盖条件(全部满足):
   *   1. 未过期:无 expiresAt,或 expiresAt > now;
   *   2. 预算内:used + cost ≤ budgetCap。
   * 任一不满足 → 不覆盖,回落人确认。
   */
  checkCoverage(
    grant: ApprovalGrantEntity | null,
    cost: number,
    now: Date = new Date(),
  ): GrantCoverage {
    if (!grant) {
      return { covered: false, reason: 'NO_ACTIVE_GRANT' };
    }

    // 1. 过期判定(expiresAt <= now 视为已过期)
    if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) {
      return { covered: false, reason: 'EXPIRED' };
    }

    // 2. 预算判定(numeric 存为字符串,转 number 比较)
    const used = Number(grant.used);
    const cap = Number(grant.budgetCap);
    if (used + cost > cap) {
      return { covered: false, reason: 'EXCEEDS_BUDGET' };
    }

    return { covered: true };
  }

  /**
   * 评估一个动作:在风险分级基础上,medium 档结合会话/任务预算授权决定
   * 自动放行还是回落人确认;命中放行时原子消费 grant 预算。
   *
   * 返回 user_confirmation 时,桌面端应调用 `requireDesktopActionApproval`
   * 弹出人确认 UI(需求 3.4)。
   */
  async evaluateAndConsume(
    params: EvaluateWithGrantParams,
  ): Promise<ApprovalGrantDecision> {
    const now = params.now ?? new Date();
    const cost = params.cost ?? 0;

    const { tier, redline } = this.policyEvaluator.classifyActionRisk(
      params.action,
    );

    // 红线:先于一切授权,永久拒绝(不可绕过)。
    if (redline) {
      return {
        decision: 'deny',
        tier,
        redline: true,
        withinGrant: false,
        reason: 'REDLINE_VIOLATION',
      };
    }

    // 只读:无人值守自动放行。
    if (tier === 'read') {
      return {
        decision: 'auto_execute',
        tier,
        redline: false,
        withinGrant: false,
      };
    }

    // 高风险:强制人确认,grant 不能放行高风险(资金/签名等)。
    if (tier === 'high') {
      return {
        decision: 'user_confirmation',
        tier,
        redline: false,
        withinGrant: false,
        reason: 'HIGH_RISK_REQUIRES_CONFIRMATION',
      };
    }

    // 中风险:结合会话/任务预算授权判定。
    const grant = await this.findActiveGrant({
      userId: params.userId,
      agentId: params.agentId,
      scope: params.scope,
      scopeId: params.scopeId,
    });
    const coverage = this.checkCoverage(grant, cost, now);

    if (!coverage.covered) {
      // 越界(无授权/超预算/过期)→ 回落人确认。
      return {
        decision: 'user_confirmation',
        tier,
        redline: false,
        withinGrant: false,
        reason: coverage.reason,
      };
    }

    // 范围内 + 预算内 + 未过期 → 自动放行并消费预算。
    await this.consume(grant!, cost);
    return {
      decision: 'auto_execute',
      tier,
      redline: false,
      withinGrant: true,
      grantId: grant!.id,
    };
  }

  /**
   * 原子消费 grant 预算:used += cost。
   * 用 SQL 级 increment 避免读改写竞态(保持 used 单调,不超 cap)。
   */
  private async consume(
    grant: ApprovalGrantEntity,
    cost: number,
  ): Promise<void> {
    if (cost <= 0) {
      return;
    }
    await this.grantRepo.increment({ id: grant.id }, 'used', cost);
    // 同步内存对象,便于调用方/测试读取最新值。
    grant.used = this.toNumericString(Number(grant.used) + cost);
  }

  /** numeric 列以字符串形态保精度。 */
  private toNumericString(value: number): string {
    return Number(value).toString();
  }
}
