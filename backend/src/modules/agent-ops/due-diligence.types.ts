import type { DueDiligenceTarget } from './data-source-plugin.types';

/**
 * 尽调报告与合格交付物验收 — 公共类型(crypto-native-agent-ops 任务 13)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「尽调报告引擎」:`DueDiligenceEngine`(跨只读源采集 → 归一 → 结构化报告);
 *     合格校验器 `DeliverableValidator` 依据需求 8「验收清单」逐项检查(A 必备 6 项 + B 真实性门槛 3 项)。
 *   - 需求 8.1:跨预设数据源采集并产出结构化报告(含来源链接)。
 *   - 需求 8.2:报告覆盖 A 类全部必备内容,并标注采集时间。
 *   - 需求 8.4:报告作为可保存/分享/复用交付物落库(归属该 Agent)。
 *   - 需求 8.6 / Property 7:依据验收清单判定合格,任一必备项缺失或违反真实性门槛即判不合格。
 *
 * 设计要点:
 *   - 报告字段 **只承载可核实数据**;未采集到的字段一律 `null` 并登记在 {@link notFetched}
 *     (标「未获取」),**绝不编造**(Property 7)。
 *   - 每条关键数据字段在 {@link DueDiligenceReport.provenance} 留可核来源链接 + 采集时间;
 *     校验器据此判定 B.7「附可核来源」与 B.8「指向具体链上证据」。
 */

/** 风险评级(A.6 结论)。 */
export type RiskRating = 'low' | 'medium' | 'high' | 'critical';

/** 单个字段的来源出处(可核来源链接 + 采集时间 + 产出源)。 */
export interface FieldProvenance {
  /** 产出该字段的数据源名(`DataSourcePlugin.name`)。 */
  source: string;
  /** 可核来源链接(需求 8.7;空串视为缺失 → 触发不合格)。 */
  sourceUrl: string;
  /** 该字段的采集时间(ISO 8601,需求 8.2 / 8.8)。 */
  collectedAt: string;
}

/** 可核来源链接条目(落库到 `agent_ops_deliverable.sourceLinks`)。 */
export interface SourceLink {
  source: string;
  url: string;
  /** 采集状态:已获取 / 未获取(对应需求 8.5)。 */
  status: 'fetched' | 'not_fetched';
  collectedAt: string;
}

/** A.1 标的标识。 */
export interface ReportIdentity {
  name: string | null;
  address: string | null;
  chain: string | null;
  project: string | null;
}

/** A.2 基础信息。 */
export interface ReportBasics {
  category: string | null;
  launchTime: string | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  priceUsd: number | null;
  links: {
    website: string | null;
    social: string[] | null;
    docs: string | null;
  };
}

/** A.3 链上活动摘要。 */
export interface ReportOnchainActivity {
  holderCount: number | null;
  /** Top holders 集中度(百分比 0–100)。 */
  topHolderConcentration: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  contractVerified: boolean | null;
}

/** 合约权限信号(A.4 的一部分)。 */
export interface ContractPermissions {
  mintable: boolean | null;
  ownerPrivileged: boolean | null;
  pausable: boolean | null;
  upgradeableProxy: boolean | null;
}

/** A.4 风险信号(指向具体链上证据,见 provenance)。 */
export interface ReportRiskSignals {
  contractPermissions: ContractPermissions | null;
  /** 蜜罐 / rug 信号(true 表示检出)。 */
  honeypotRug: boolean | null;
  /** 大额解锁信号。 */
  largeUnlock: boolean | null;
  /** 可疑授权信号。 */
  suspiciousApprovals: boolean | null;
  /** 审计状态(文本)。 */
  auditStatus: string | null;
}

/** A.5 关键链接。 */
export interface ReportKeyLinks {
  blockExplorer: string | null;
  dexOrCex: string | null;
  official: string | null;
  auditReport: string | null;
}

/** A.6 结论。 */
export interface ReportConclusion {
  riskRating: RiskRating | null;
  summary: string | null;
}

/**
 * 结构化尽调报告。
 *
 * 设计:每个 A 段为强类型对象;`provenance` 以「点路径」为键登记每条关键数据的来源链接
 * 与采集时间;`notFetched` 记录被显式标「未获取」的字段;`sourceLinks` 汇总所有源链接。
 */
export interface DueDiligenceReport {
  /** A.1 标的(原始输入)。 */
  target: DueDiligenceTarget;
  /** A.1 归一标识。 */
  identity: ReportIdentity;
  /** A.2 基础信息。 */
  basics: ReportBasics;
  /** A.3 链上活动摘要。 */
  onchainActivity: ReportOnchainActivity;
  /** A.4 风险信号。 */
  riskSignals: ReportRiskSignals;
  /** A.5 关键链接。 */
  keyLinks: ReportKeyLinks;
  /** A.6 结论。 */
  conclusion: ReportConclusion;
  /** 每条关键数据字段的来源出处(点路径 → provenance)。 */
  provenance: Record<string, FieldProvenance>;
  /** 被显式标「未获取」的字段点路径(需求 8.5)。 */
  notFetched: string[];
  /** 全部可核来源链接(去重)。 */
  sourceLinks: SourceLink[];
  /** 代表性数据采集时间(B.8 标注采集时间)。 */
  collectedAt: string | null;
  /** 端到端时延(毫秒,B.9 可接受时延内)。 */
  latencyMs: number | null;
  /** 报告生成时间(ISO 8601)。 */
  generatedAt: string;
}

/** 验收清单单项判定。 */
export interface ChecklistCheck {
  /** 条目 id:A1–A6 / B7–B9。 */
  id: string;
  /** 条目说明。 */
  label: string;
  /** 是否通过。 */
  passed: boolean;
  /** 未通过原因(中文)。 */
  reason?: string;
}

/** 验收结果。 */
export interface DeliverableValidationResult {
  /** 是否合格(全部条目通过)。 */
  qualified: boolean;
  /** 逐项判定。 */
  checks: ChecklistCheck[];
  /** 未通过的 A 类必备项 id。 */
  missingItems: string[];
  /** 未通过的 B 类真实性/质量门槛 id。 */
  violations: string[];
}

/** 报告内可接受时延阈值(需求 8.9 建议 ≤ 5 分钟)。 */
export const MAX_DUE_DILIGENCE_LATENCY_MS = 5 * 60 * 1000;
