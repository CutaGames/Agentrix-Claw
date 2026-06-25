import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentOpsDeliverableEntity } from './entities/agent-ops-deliverable.entity';
import { DataSourceRegistry } from './data-source-registry.service';
import { DeliverableValidator } from './deliverable-validator.service';
import {
  DataSourceFetchResult,
  DueDiligenceTarget,
} from './data-source-plugin.types';
import {
  ContractPermissions,
  DeliverableValidationResult,
  DueDiligenceReport,
  FieldProvenance,
  ReportConclusion,
  RiskRating,
  SourceLink,
} from './due-diligence.types';

/** 外部贡献的单条事实(LLM 抽取 / 其它源),携带可核来源(绝不无源)。 */
export interface DueDiligenceFact {
  /** 字段键(见 {@link FACT_FIELD_TO_PATH})。 */
  field: string;
  /** 字段值。 */
  value: any;
  /** 产出源名。 */
  source: string;
  /** 可核来源链接。 */
  sourceUrl: string;
  /** 采集时间(ISO 8601);缺省用当前时间。 */
  collectedAt?: string;
}

/** 运行尽调引擎入参。 */
export interface RunDueDiligenceParams {
  taskId: string;
  agentId: string;
  userId: string;
  target: DueDiligenceTarget;
  deviceId?: string;
  sessionId?: string;
  /**
   * 额外事实(其它只读源 / LLM 抽取),每条必须带可核来源链接。
   * 引擎与跨源采集结果一并归一进报告(同样登记 provenance,绝不编造)。
   */
  extraFacts?: DueDiligenceFact[];
  /** 是否落库为交付物(默认 true)。 */
  persist?: boolean;
}

/** 引擎运行结果。 */
export interface DueDiligenceRunResult {
  report: DueDiligenceReport;
  validation: DeliverableValidationResult;
  deliverable: AgentOpsDeliverableEntity | null;
}

/**
 * DueDiligenceEngine — 尽调报告引擎(crypto-native-agent-ops 任务 13)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4:输入(token/钱包/合约/项目)→ 经 DataSourceRegistry 跨只读源采集 → 归一
 *     → 结构化报告(含来源链接 + 采集时间);经 `DeliverableValidator` 判合格;交付物落库。
 *   - 需求 8.1:跨预设数据源采集并产出结构化报告(含来源链接)。
 *   - 需求 8.2:报告覆盖 A 类全部必备内容,并标注采集时间。
 *   - 需求 8.4:报告作为可保存/分享/复用交付物落库(归属该 Agent)。
 *   - 需求 8.6 / Property 7:依据验收清单判定合格;**严禁编造数据**——所有字段只来自
 *     带可核来源的采集结果 / 事实,未采集到的字段标「未获取」(null)。
 */
@Injectable()
export class DueDiligenceEngine {
  private readonly logger = new Logger(DueDiligenceEngine.name);

  constructor(
    private readonly registry: DataSourceRegistry,
    private readonly validator: DeliverableValidator,
    @InjectRepository(AgentOpsDeliverableEntity)
    private readonly deliverableRepo: Repository<AgentOpsDeliverableEntity>,
  ) {}

  /**
   * 执行尽调:跨只读源采集 → 归一为结构化报告 → 合格判定 → (可选)交付物落库。
   */
  async run(params: RunDueDiligenceParams): Promise<DueDiligenceRunResult> {
    const startedAt = Date.now();
    const { target, userId, agentId } = params;

    const results = await this.registry.fetchAll(target, {
      userId,
      agentId,
      deviceId: params.deviceId,
      sessionId: params.sessionId,
    });

    const report = this.buildReport(
      target,
      results,
      params.extraFacts ?? [],
      startedAt,
    );
    const validation = this.validator.validate(report);

    let deliverable: AgentOpsDeliverableEntity | null = null;
    if (params.persist !== false) {
      deliverable = await this.persist(params, report, validation);
    }

    this.logger.debug(
      `DueDiligence task=${params.taskId} target=${target.type} qualified=${validation.qualified} ` +
        `missing=[${validation.missingItems.join(',')}] violations=[${validation.violations.join(',')}]`,
    );

    return { report, validation, deliverable };
  }

  // ───────────────────────── 报告组装 ─────────────────────────

  /**
   * 由采集结果 + 额外事实归一为结构化报告。**只搬运带源数据,绝不编造**。
   */
  buildReport(
    target: DueDiligenceTarget,
    results: DataSourceFetchResult[],
    extraFacts: DueDiligenceFact[],
    startedAt: number,
  ): DueDiligenceReport {
    const report = this.emptyReport(target);
    const collectedAts: string[] = [];

    // 1) 跨源采集结果归一。
    for (const res of results) {
      report.sourceLinks.push({
        source: res.source,
        url: res.sourceUrl,
        status: res.status,
        collectedAt: res.collectedAt,
      });

      // 关键链接:区块浏览器 / DEX / 审计源 URL(无论是否取到数据,链接可核)。
      this.applySourceLink(report, res);

      if (res.status !== 'fetched' || res.data == null) {
        continue;
      }
      // 严守 Property 7:无可核来源链接的数据一律不并入(绝不无源归因)。
      // 真实插件契约下 fetched ⟹ sourceUrl 非空;此处再兜一层防御。
      if (!isNonEmptyString(res.sourceUrl)) {
        this.logger.warn(
          `Skipped sourceless fetched result from ${res.source} — refusing to attribute without a verifiable link`,
        );
        continue;
      }
      collectedAts.push(res.collectedAt);
      for (const [field, value] of Object.entries(res.data)) {
        this.applyFact(report, {
          field,
          value,
          source: res.source,
          sourceUrl: res.sourceUrl,
          collectedAt: res.collectedAt,
        });
      }
    }

    // 2) 额外事实(其它源 / LLM 抽取)归一 —— 必须带可核来源。
    for (const fact of extraFacts) {
      if (!isNonEmptyString(fact.sourceUrl)) {
        // 无源事实拒绝并入(防编造);记日志后跳过。
        this.logger.warn(
          `Rejected sourceless fact field=${fact.field} (no sourceUrl) — refusing to fabricate`,
        );
        continue;
      }
      const collectedAt = fact.collectedAt ?? new Date().toISOString();
      collectedAts.push(collectedAt);
      this.applyFact(report, { ...fact, collectedAt });
    }

    // 3) 官方渠道关键链接来自官网。
    if (isNonEmptyString(report.basics.links.website)) {
      report.keyLinks.official = report.basics.links.website;
    }

    // 4) 标注代表性采集时间(取最近一次)。
    report.collectedAt = collectedAts.length
      ? collectedAts.sort().slice(-1)[0]
      : null;

    // 5) 标注未获取字段。
    report.notFetched = this.computeNotFetched(report);

    // 6) 派生结论(基于可核风险信号,非编造)。
    report.conclusion = this.deriveConclusion(report);

    // 7) 时延。
    report.latencyMs = Math.max(0, Date.now() - startedAt);

    return report;
  }

  /** 把单条带源事实落到报告对应字段 + 登记 provenance。 */
  private applyFact(report: DueDiligenceReport, fact: DueDiligenceFact): void {
    const path = FACT_FIELD_TO_PATH[fact.field];
    if (!path) {
      // 审计报告链接特殊处理。
      if (fact.field === 'auditReportUrl' && isNonEmptyString(fact.value)) {
        report.keyLinks.auditReport = fact.value;
      }
      return;
    }
    if (!isPresentValue(fact.value)) {
      return; // 不写空值(留缺,标未获取)。
    }
    setByPath(report, path, fact.value);
    const prov: FieldProvenance = {
      source: fact.source,
      sourceUrl: fact.sourceUrl,
      collectedAt: fact.collectedAt ?? new Date().toISOString(),
    };
    report.provenance[path] = prov;
  }

  /** 由采集源 URL 填充关键链接(区块浏览器 / DEX / 审计)。 */
  private applySourceLink(
    report: DueDiligenceReport,
    res: DataSourceFetchResult,
  ): void {
    if (!isNonEmptyString(res.sourceUrl)) return;
    if (res.source === 'block_explorer' && !report.keyLinks.blockExplorer) {
      report.keyLinks.blockExplorer = res.sourceUrl;
    } else if (res.source === 'dex' && !report.keyLinks.dexOrCex) {
      report.keyLinks.dexOrCex = res.sourceUrl;
    } else if (res.source === 'audit_source' && !report.keyLinks.auditReport) {
      report.keyLinks.auditReport = res.sourceUrl;
    }
  }

  /** 计算被标「未获取」的关键数据字段(null 且无 provenance)。 */
  private computeNotFetched(report: DueDiligenceReport): string[] {
    const out: string[] = [];
    for (const path of NOT_FETCHED_TRACKED_PATHS) {
      const v = getByPath(report, path);
      if (!isPresentValue(v) && !report.provenance[path]) {
        out.push(path);
      }
    }
    return out;
  }

  /**
   * 由可核风险信号派生结论(风险评级 + 一句话摘要)。
   * 仅当存在可判定信号时给出评级,否则评级留 null(不臆断)。
   */
  private deriveConclusion(report: DueDiligenceReport): ReportConclusion {
    const r = report.riskSignals;
    const o = report.onchainActivity;

    const perms = r.contractPermissions;
    const hasAnySignal =
      (perms != null && Object.values(perms).some((v) => v != null)) ||
      typeof r.honeypotRug === 'boolean' ||
      typeof r.largeUnlock === 'boolean' ||
      typeof r.suspiciousApprovals === 'boolean' ||
      isNonEmptyString(r.auditStatus) ||
      typeof o.contractVerified === 'boolean';

    if (!hasAnySignal) {
      return { riskRating: null, summary: null };
    }

    let rating: RiskRating;
    if (r.honeypotRug === true) {
      rating = 'critical';
    } else if (
      r.suspiciousApprovals === true ||
      r.largeUnlock === true ||
      (perms?.mintable === true && perms?.ownerPrivileged === true)
    ) {
      rating = 'high';
    } else if (
      isAuditedClean(r.auditStatus) &&
      o.contractVerified === true &&
      !permsRisky(perms)
    ) {
      rating = 'low';
    } else {
      rating = 'medium';
    }

    const subject = this.subjectLabel(report);
    const summary = `${subject} 风险评级:${RATING_ZH[rating]}。${this.summaryReason(report, rating)}`;
    return { riskRating: rating, summary };
  }

  private subjectLabel(report: DueDiligenceReport): string {
    const id = report.identity;
    return (
      id.name ??
      id.address ??
      id.project ??
      `${report.target.type}`
    );
  }

  private summaryReason(report: DueDiligenceReport, rating: RiskRating): string {
    const r = report.riskSignals;
    const reasons: string[] = [];
    if (r.honeypotRug === true) reasons.push('检出蜜罐/rug 信号');
    if (r.suspiciousApprovals === true) reasons.push('存在可疑授权');
    if (r.largeUnlock === true) reasons.push('存在大额解锁');
    if (r.contractPermissions?.mintable === true) reasons.push('合约可增发');
    if (r.contractPermissions?.ownerPrivileged === true) reasons.push('owner 特权');
    if (isAuditedClean(r.auditStatus)) reasons.push('已通过审计');
    if (report.onchainActivity.contractVerified === true) reasons.push('合约已验证');
    return reasons.length
      ? `依据:${reasons.join('、')}。`
      : '依据现有链上信号综合评估。';
  }

  // ───────────────────────── 落库 ─────────────────────────

  private async persist(
    params: RunDueDiligenceParams,
    report: DueDiligenceReport,
    validation: DeliverableValidationResult,
  ): Promise<AgentOpsDeliverableEntity> {
    const entity = this.deliverableRepo.create({
      taskId: params.taskId,
      agentId: params.agentId,
      type: 'due_diligence_report',
      content: { report, validation } as Record<string, any>,
      sourceLinks: report.sourceLinks as any[],
      collectedAt: report.collectedAt ? new Date(report.collectedAt) : null,
      qualified: validation.qualified,
      qualityCheckedBy: 'deliverable_validator',
    });
    return this.deliverableRepo.save(entity);
  }

  private emptyReport(target: DueDiligenceTarget): DueDiligenceReport {
    return {
      target,
      identity: {
        name: target.name ?? null,
        address: target.address ?? null,
        chain: target.chain ?? null,
        project: target.project ?? null,
      },
      basics: {
        category: null,
        launchTime: null,
        marketCapUsd: null,
        fdvUsd: null,
        circulatingSupply: null,
        totalSupply: null,
        priceUsd: null,
        links: { website: null, social: null, docs: null },
      },
      onchainActivity: {
        holderCount: null,
        topHolderConcentration: null,
        liquidityUsd: null,
        volume24hUsd: null,
        contractVerified: null,
      },
      riskSignals: {
        contractPermissions: null,
        honeypotRug: null,
        largeUnlock: null,
        suspiciousApprovals: null,
        auditStatus: null,
      },
      keyLinks: {
        blockExplorer: null,
        dexOrCex: null,
        official: null,
        auditReport: null,
      },
      conclusion: { riskRating: null, summary: null },
      provenance: {},
      notFetched: [],
      sourceLinks: [],
      collectedAt: null,
      latencyMs: null,
      generatedAt: new Date().toISOString(),
    };
  }
}

/** 风险评级中文。 */
const RATING_ZH: Record<RiskRating, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

/** 事实字段键 → 报告点路径映射。 */
export const FACT_FIELD_TO_PATH: Record<string, string> = {
  category: 'basics.category',
  launchTime: 'basics.launchTime',
  marketCapUsd: 'basics.marketCapUsd',
  fdvUsd: 'basics.fdvUsd',
  circulatingSupply: 'basics.circulatingSupply',
  totalSupply: 'basics.totalSupply',
  priceUsd: 'basics.priceUsd',
  website: 'basics.links.website',
  social: 'basics.links.social',
  docs: 'basics.links.docs',
  holderCount: 'onchainActivity.holderCount',
  topHolderConcentration: 'onchainActivity.topHolderConcentration',
  liquidityUsd: 'onchainActivity.liquidityUsd',
  volume24hUsd: 'onchainActivity.volume24hUsd',
  contractVerified: 'onchainActivity.contractVerified',
  contractPermissions: 'riskSignals.contractPermissions',
  honeypotRug: 'riskSignals.honeypotRug',
  largeUnlock: 'riskSignals.largeUnlock',
  suspiciousApprovals: 'riskSignals.suspiciousApprovals',
  auditStatus: 'riskSignals.auditStatus',
};

/** 「未获取」追踪的关键数据字段路径(与 KEY_DATA_PATHS 一致语义)。 */
const NOT_FETCHED_TRACKED_PATHS: string[] = Object.values(FACT_FIELD_TO_PATH);

// ───────────────────────── 工具 ─────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPresentValue(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

function isAuditedClean(auditStatus: string | null): boolean {
  if (!isNonEmptyString(auditStatus)) return false;
  const s = auditStatus.toLowerCase();
  return /audit(ed)?|passed|clean|verified/.test(s) && !/fail|unaudit|no audit/.test(s);
}

function permsRisky(perms: ContractPermissions | null): boolean {
  if (!perms) return false;
  return (
    perms.mintable === true ||
    perms.ownerPrivileged === true ||
    perms.pausable === true ||
    perms.upgradeableProxy === true
  );
}

function getByPath(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function setByPath(obj: any, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
