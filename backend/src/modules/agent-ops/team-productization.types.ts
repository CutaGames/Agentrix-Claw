import type { AgentRoleDefinition } from '../../entities/agent-team-template.entity';
import type {
  AgentServiceListing,
  HireSettlementResult,
  SettlementParty,
} from './hire-settlement.types';

/**
 * Agent 团队产品化 · 公共类型(crypto-native-agent-ops 任务 24 / 需求 17)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C7「Agent 团队(P1 产品化)」:复用 `agent-team.provisionTeam` + `AgentTeamTemplate`;
 *     计费三模式(订阅 `user_subscription_usage` / 租赁 `pet_rental_leases` 模式 / 按结果 `agent_hire_escrow`);
 *     编排复用 `agent_tasks` 父/子 + `worktree_lanes`。
 *   - 需求 17.1–17.27(A 组组建/B 组订阅/C 组租赁/D 组按结果/E 组编排/F 组验收/G 组计量/H 组多跳分佣/I 组团队级预算)。
 *
 * 纯数据/契约,不含执行逻辑;编排由 `TeamProductizationService` 承担(复用既有积木)。
 */

// ───────────────────────── A 组:组建与定制 ─────────────────────────

/** 团队规模红线(需求 17.3):1–20 角色。 */
export const TEAM_MIN_ROLES = 1;
export const TEAM_MAX_ROLES = 20;

/**
 * roleOverrides 白名单字段(需求 17.3):仅允许覆盖 model / capabilities /
 * approvalLevel / spendingLimits,不得越权扩权(如 initialCreditScore / codename / name)。
 *
 * 「model」展开为 preferredModel / preferredProvider / modelTier 三个展示/路由字段。
 */
export const ROLE_OVERRIDE_WHITELIST: ReadonlyArray<keyof AgentRoleDefinition> = [
  'preferredModel',
  'preferredProvider',
  'modelTier',
  'capabilities',
  'approvalLevel',
  'spendingLimits',
];

/** roleOverrides 校验结果。 */
export interface RoleOverrideValidation {
  /** 是否全部合法(无越权字段)。 */
  ok: boolean;
  /** 违规明细:codename → 非白名单字段列表。 */
  violations: Array<{ codename: string; illegalFields: string[] }>;
}

/** 团队规模校验结果。 */
export interface TeamSizeValidation {
  ok: boolean;
  size: number;
  reason?: string;
}

/** 定制团队组建入参(A 组)。 */
export interface ProvisionCustomTeamDto {
  /** 模板 id(uuid)或 slug —— 二选一(对接 agent-team.provisionTeam)。 */
  templateId?: string;
  templateSlug?: string;
  /** 自定义团队名称前缀。 */
  teamNamePrefix?: string;
  /** 按 codename 的角色覆盖(仅白名单字段)。 */
  roleOverrides?: Record<string, Partial<AgentRoleDefinition>>;
}

// ───────────────────────── 三模式计费 ─────────────────────────

/** 计费模式(需求 17:订阅 / 租赁 / 按结果)。 */
export type TeamBillingMode = 'subscription' | 'rental' | 'per_result';

/** 超配额策略(需求 17.7,口径待定 → 二选一)。 */
export type OverQuotaPolicy = 'pause' | 'overage_billing';

/** 订阅配额检查结果(B 组)。 */
export interface SubscriptionQuotaDecision {
  /** 配额内放行。 */
  allowed: boolean;
  /** 是否触发超配额告警。 */
  warn: boolean;
  /** 超配额时的处置。 */
  overQuotaAction?: OverQuotaPolicy | null;
  /** 已用任务数。 */
  used: number;
  /** 剩余配额(null = 无限/不适用)。 */
  remaining: number | null;
  /** 周期配额上限(null = 无限)。 */
  quota: number | null;
  /** 人类可读原因。 */
  reason: string;
}

/** 周期结束处置(需求 17.8)。 */
export type CycleEndAction = 'renew' | 'downgrade' | 'cancel';

/** 进行中任务在取消/降级时的处置(需求 17.9)。 */
export type InFlightDisposition = 'grace_complete' | 'frozen';

// ───────────────────────── C 组:租赁生命周期 ─────────────────────────

/** 团队租约状态(复用 pet_rental_leases 模式)。 */
export type TeamLeaseStatus = 'active' | 'expired' | 'cancelled';

/** 团队租约窗口(需求 17.10–17.12)。 */
export interface TeamLeaseWindow {
  durationDays: number;
  startsAt: Date;
  endsAt: Date;
  status: TeamLeaseStatus;
  /** 因成员故障补偿而延长的天数累计(审计用)。 */
  compensatedDays?: number;
}

/** 成员故障补偿方式(需求 17.12,口径待定 → 二选一)。 */
export type MemberFaultCompensation = 'extend' | 'refund';

// ───────────────────────── D 组:按结果付费(escrow) ─────────────────────────

/**
 * 团队按结果结算入参(需求 17.13–17.17)。
 *
 * 复用 {@link HireSettlementResult} 的 escrow 轨道:reserve agreedUsd → 验收通过
 * release = min(agreedUsd, actualCostUsd) → 24h 争议窗口。多跳分佣(H 组,需求 17.25)
 * 经 listing.parties 表达,由 HireSettlementOrchestrator 合并为链上一次提交。
 */
export interface TeamResultSettlementDto {
  /** 关联团队任务 id(escrow 幂等键)。 */
  taskId: string;
  /** 项目方(雇主)用户 id。 */
  hirerUserId: string;
  /** 团队挂牌(承载执行 agent + 多跳分佣血缘)。 */
  listing: AgentServiceListing;
  /** 约定金额(USD)。服务端以 listing.unitPriceUsd × quantity 为权威总额。 */
  quantity?: number;
}

// ───────────────────────── E 组:协作编排 ─────────────────────────

/** 团队成员(编排维度)。 */
export interface TeamMember {
  /** 成员 AgentAccount id。 */
  agentId: string;
  /** 角色代号(对应模板 codename)。 */
  codename: string;
  /** 角色能力标签(用于子任务匹配)。 */
  capabilities?: string[];
}

/** 待拆分的子任务规格。 */
export interface SubTaskSpec {
  /** 子任务稳定标识(父任务内唯一)。 */
  id: string;
  /** 子任务标题。 */
  title: string;
  /** 期望承接角色(codename);留空则按 capabilities 匹配。 */
  preferredCodename?: string;
  /** 完成该子任务所需能力(用于匹配)。 */
  requiredCapability?: string;
}

/** 子任务派发记录(agent_tasks 父/子 + worktree_lanes 隔离)。 */
export interface SubTaskAssignment {
  subTaskId: string;
  title: string;
  /** 父任务 id。 */
  parentTaskId: string;
  /** 承接成员(为 null 表示无可匹配成员)。 */
  assignedAgentId: string | null;
  assignedCodename: string | null;
  /** 隔离上下文的 worktree lane 标识。 */
  laneId: string;
  /** 匹配方式(审计用)。 */
  matchedBy: 'preferred' | 'capability' | 'round_robin' | 'unassigned';
}

/** 任务拆分计划(需求 17.18)。 */
export interface TaskSplitPlan {
  parentTaskId: string;
  assignments: SubTaskAssignment[];
  /** 未能匹配到成员的子任务 id。 */
  unassigned: string[];
}

/** 单个子任务的成果。 */
export interface SubTaskDeliverable {
  subTaskId: string;
  agentId: string | null;
  /** 是否合格(沿用对应交付包量化口径 —— 需求 17.21)。 */
  qualified: boolean;
  /** 成果内容引用 / 摘要。 */
  content?: unknown;
}

/** 团队级汇总交付物(需求 17.19 / 17.21 / 17.22)。 */
export interface TeamDeliverable {
  parentTaskId: string;
  /** 子任务成果(可审计 / 可保存分享)。 */
  parts: SubTaskDeliverable[];
  /** 全部子任务合格 → 团队交付合格。 */
  qualified: boolean;
  /** 不合格的子任务 id(触发重做 / 争议 —— 需求 17.22)。 */
  unqualified: string[];
  /** 是否需要重做 / 进入争议。 */
  needsRework: boolean;
}

/** 成员替换入参(需求 17.20)。 */
export interface TeamReplacementAuditInput {
  /** 被替换的成员 AgentAccount id。 */
  fromAgentId: string;
  /** 接替的成员 AgentAccount id。 */
  toAgentId: string;
  /** 接替成员的角色代号(可选,留空沿用原角色)。 */
  toCodename?: string | null;
}

/** 成员替换审计记录(需求 17.20)。 */
export interface MemberReplacementAudit {
  parentTaskId: string;
  fromAgentId: string;
  toAgentId: string;
  /** 被改派的子任务 id 列表。 */
  reassignedSubTasks: string[];
  at: string;
}

// ───────────────────────── I 组:团队级预算 ─────────────────────────

/** 团队级预算评估入参(需求 17.27)。 */
export interface TeamBudgetEvaluation {
  /** 团队级支出预算上限(USD)。 */
  teamBudgetCap: number;
  /** 团队级已用支出(USD)。 */
  teamUsed: number;
  /** 单成员限额(USD,日/单笔/月由调用方选定口径)。 */
  memberLimit: number;
  /** 单成员已用(USD)。 */
  memberUsed: number;
  /** 本次动作成本(USD)。 */
  cost: number;
}

/**
 * 团队级预算决策(需求 17.27)。
 *
 * **优先级(precedence):团队级预算上限优先于单成员限额。**
 *   - 团队预算触顶 → `stop_team_budget`(即停 + 告警),即便成员仍有额度。
 *   - 团队预算内但成员超限 → `block_member_limit`。
 *   - 二者皆内 → `allow`。
 */
export interface TeamBudgetDecision {
  decision: 'allow' | 'stop_team_budget' | 'block_member_limit';
  /** 团队预算是否触顶(stop_team_budget 时为 true)。 */
  teamCapped: boolean;
  /** 是否需要告警(触顶即停告警)。 */
  alert: boolean;
  reason: string;
}

// ───────────────────────── G 组:计量与看板 ─────────────────────────

/** 单笔结算/分佣记录(看板展示用)。 */
export interface SettlementRecord {
  taskId: string;
  mode: TeamBillingMode;
  /** 成交总额(USD)。 */
  totalUsd: number;
  /** 执行 agent 净额(USD)。 */
  merchantNetUsd: number;
  /** 各分佣方明细(多跳分佣审计 —— 需求 17.24 / 17.25)。 */
  parties: Array<{ role: string; agentId?: string | null; amountUsd: number }>;
  /** 链上一次提交引用。 */
  submissionRef?: string;
  at: string;
}

/** 三模式计量看板(需求 17.23 / 17.24)。 */
export interface TeamMeteringDashboard {
  /** 区分订阅 / 租赁 / 按结果三种口径。 */
  subscription: {
    used: number;
    remaining: number | null;
    quota: number | null;
    warn: boolean;
  };
  rental: {
    activeLeases: number;
    expiredLeases: number;
    nextExpiryAt: string | null;
  };
  perResult: {
    settledTasks: number;
    totalSettledUsd: number;
  };
  /** 任务进度(进行中 / 已交付)。 */
  tasks: {
    inProgress: number;
    delivered: number;
  };
  /** 结算与分佣记录。 */
  settlements: SettlementRecord[];
}

/** 团队结算结果(透传 HireSettlementResult,便于上层引用)。 */
export type TeamSettlementResult = HireSettlementResult;

/** 便捷重导出。 */
export type { AgentServiceListing, SettlementParty };
