import type { RiskTier } from '../agent/policy-evaluator.service';

/**
 * 空投发现与合法协助领取 — 公共类型与契约(crypto-native-agent-ops 任务 22,需求 11)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5「监控告警」(空投资格/领取窗口监控)、§C3「分级审批」(领取交易 high → 人确认)、
 *     §Security & Compliance(只读优先;资金/签名强制人确认;红线 sybil 不可绕过)。
 *   - 需求 11.1:基于用户钱包发现潜在空投资格,提供资格检查与领取窗口/截止提醒。
 *   - 需求 11.2:用户合法获得资格并选择领取 → agent 准备/导航/填好领取流程,领取交易由用户签名确认。
 *   - 需求 11.3:涉及完成项目要求的合法任务以参与 → 仅以单一真实身份协助,写操作需人确认。
 *   - 需求 11.4 / 6.2 / Property 3:SHALL NOT 提供多钱包批量刷量 / sybil 薅空投能力(红线,不可绕过)。
 *   - Property 4:领取交易(transaction_sign)在无人工确认时不得执行。
 *   - Property 7/8:资格数据不可得时显式降级(fetched:false),绝不编造资格/窗口。
 *
 * 设计要点:
 *   - 资格发现复用 Task 12 只读采集路径(`ReadOnlyFetcher`:navigate + browser_eval);
 *     无可核来源 / 取数失败 → 显式 `fetched:false`(不编造资格,Property 7/8)。
 *   - 领取窗口提醒复用 Task 16 `MonitorService`(`airdrop_window` 类型,in_window 算子)。
 *   - 领取动作经 Task 9 `PolicyEvaluatorService.classifyActionRisk({type:'transaction_sign'})`
 *     → high → 人确认;本服务只产出**未签名领取计划**,`autoExecuted` 恒 false(Property 4)。
 *   - sybil 守卫:多钱包/批量刷量意图经 `redlines.checkRedline` 拒绝(需求 11.4 / 6.2,不可绕过)。
 */

// ───────────────────────── 资格发现(需求 11.1) ─────────────────────────

/** 单条空投候选的资格状态(显式:不臆断,不可得时为 unknown)。 */
export type AirdropEligibilityStatus = 'eligible' | 'not_eligible' | 'unknown';

/** 一条空投候选(由只读资格检查解析;无法核实字段一律留空,不编造)。 */
export interface AirdropCandidate {
  /** 空投项目名称。 */
  projectName: string;
  /** 链标识(slug)。 */
  chain: string;
  /** 代币 symbol(若可解析)。 */
  tokenSymbol?: string;
  /** 资格状态(显式;不可得为 unknown,不谎报 eligible)。 */
  eligibility: AirdropEligibilityStatus;
  /** 资格判定依据/说明。 */
  eligibilityNote?: string;
  /** 领取需完成的合法任务/要求清单(若有)。 */
  requirements?: string[];
  /** 领取页面 URL(可核来源)。 */
  claimUrl?: string;
  /** 领取窗口开始时间(ISO 8601,若可解析)。 */
  claimWindowStart?: string;
  /** 领取窗口截止时间(ISO 8601,若可解析)。 */
  claimWindowEnd?: string;
  /** 该候选的可核来源链接。 */
  sourceUrl?: string;
}

/** 领取窗口/截止提醒(从候选派生,需求 11.1)。 */
export interface AirdropClaimReminder {
  /** 空投项目名称。 */
  projectName: string;
  /** 领取窗口截止时间(ISO 8601,若已知)。 */
  claimWindowEnd?: string;
  /** 距离截止的剩余毫秒(可为负 = 已过期;未知时为 null)。 */
  msUntilDeadline: number | null;
  /** 提醒状态。 */
  status: 'open' | 'closing_soon' | 'expired' | 'unknown';
}

/** 资格发现请求(只读)。 */
export interface AirdropDiscoveryRequest {
  userId: string;
  agentId: string;
  /** 单一真实身份钱包(需求 11.3)。 */
  wallet: string;
  /** 误用检测:若调用方塞入多钱包,触发 sybil 红线(需求 11.4)。 */
  wallets?: string[];
  /** 链标识(slug)。 */
  chain: string;
  /** 只读资格检查页 URL(可核来源);缺省 → 显式降级 NO_ELIGIBILITY_SOURCE。 */
  checkerUrl?: string;
  /** 只读 JS 提取表达式(缺省用默认读取页面资格列表)。 */
  extract?: string;
  /** 意图描述(用于 sybil 红线检查)。 */
  intent?: string;
  deviceId?: string;
  sessionId?: string;
}

/** 资格发现结果。 */
export interface AirdropDiscoveryResult {
  wallet: string;
  chain: string;
  /** 可核来源链接(资格检查页)。 */
  sourceUrl: string;
  /** 是否成功取数(失败/无源时 false,candidates 为空,explicit degraded)。 */
  fetched: boolean;
  /** 发现的空投候选(含资格状态与领取窗口)。 */
  candidates: AirdropCandidate[];
  /** 领取窗口/截止提醒(从 candidates 派生)。 */
  reminders: AirdropClaimReminder[];
  /** 采集时间(ISO 8601)。 */
  discoveredAt: string;
  /** 取数失败/降级时的结构化原因(不编造)。 */
  note?: string;
}

// ───────────────────────── 协助领取(需求 11.2 / Property 4) ─────────────────────────

/** 协助领取请求。 */
export interface AirdropClaimAssistRequest {
  userId: string;
  agentId: string;
  /** 单一真实身份钱包(需求 11.3)。 */
  wallet: string;
  /** 误用检测:多钱包 → sybil 红线(需求 11.4)。 */
  wallets?: string[];
  /** 空投项目名称。 */
  projectName: string;
  /** 链标识(slug)。 */
  chain: string;
  /** 领取页面 URL(若经页面领取)。 */
  claimUrl?: string;
  /** 领取合约地址(若经链上合约领取)。 */
  contract?: string;
  /** 领取合约方法(若经链上合约领取)。 */
  method?: string;
  /** 领取合约调用参数(若经链上合约领取)。 */
  args?: Record<string, any>;
  /** 意图描述(用于 sybil 红线检查)。 */
  intent?: string;
}

/**
 * 未签名的领取协助计划(本服务**绝不代执行**,仅产出供人确认签名)。
 *
 * 硬约束(Property 4):`autoExecuted` 恒 false,`requiresUserConfirmation` 恒 true,
 * `decision` 恒 `'user_confirmation'`;本服务不持有/不调用任何签名或转账能力。
 */
export interface AirdropClaimAssistPlan {
  projectName: string;
  chain: string;
  /** 领取所用的单一真实身份钱包。 */
  wallet: string;
  /** agent 已备好的导航/填表准备步骤(只读 + 预填,不含签名)。 */
  preparationSteps: string[];
  /** 未签名的领取交易计划(由用户钱包签名后执行)。 */
  claimTransaction: {
    /** 链上领取目标合约地址(若适用)。 */
    to?: string;
    /** 页面领取 URL(若适用)。 */
    claimUrl?: string;
    /** 领取方法(若适用)。 */
    method?: string;
    /** 领取参数(若适用)。 */
    args?: Record<string, any>;
    /** 人类可读说明。 */
    description: string;
  };
  /** 领取动作风险档(经 PolicyEvaluator,固定为 high)。 */
  riskTier: RiskTier;
  /** 是否需要人工确认签名(恒 true,需求 11.2 / Property 4)。 */
  requiresUserConfirmation: true;
  /** 是否已由系统自动执行(恒 false —— 不代执行资金,Property 4)。 */
  autoExecuted: false;
  /** 后端决策(恒 user_confirmation,桌面端据此弹 `requireDesktopActionApproval`)。 */
  decision: 'user_confirmation';
  /** 决策原因码(审计用)。 */
  reason: string;
}
