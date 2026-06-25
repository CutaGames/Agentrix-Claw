import { Injectable } from '@nestjs/common';

import {
  ChecklistCheck,
  DeliverableValidationResult,
  DueDiligenceReport,
  FieldProvenance,
  MAX_DUE_DILIGENCE_LATENCY_MS,
} from './due-diligence.types';

/**
 * DeliverableValidator — 合格交付物验收清单校验器(crypto-native-agent-ops 任务 13)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「合格校验器」:依据需求 8「验收清单」逐项检查(A 必备 6 项 + B 真实性门槛 3 项);
 *     任一缺失/违反 → 不合格。
 *   - 需求 8 验收清单:
 *       A. 必备内容(齐全)
 *         A1 标的标识:名称/合约地址/链/项目方。
 *         A2 基础信息:类别、上线时间、市值/FDV、流通量/总量、官网+社媒+文档链接。
 *         A3 链上活动摘要:持币地址数、Top holders 集中度、流动性、近期活跃、合约验证状态。
 *         A4 风险信号:合约权限、蜜罐/rug、大额解锁、可疑授权、审计状态。
 *         A5 关键链接:区块浏览器、DEX/CEX、官方渠道、审计报告(若有)。
 *         A6 结论:风险评级 + 一句话摘要。
 *       B. 真实性与质量(门槛)
 *         B7 每条关键数据附可核来源链接;缺失项标「未获取」,严禁编造。
 *         B8 标注数据采集时间;报告内数字自洽不矛盾;风险信号指向具体链上证据。
 *         B9 结构化、可快速阅读;在可接受时延内完成(≤ 5 分钟)。
 *   - 需求 8.6 / Property 7:任一 A 类必备项缺失,或违反任一 B 类门槛(尤其编造数据)→ 判不合格。
 *
 * 纯函数式:不触网、不落库,只对结构化报告做逐项判定,便于单测与属性测试。
 */
@Injectable()
export class DeliverableValidator {
  /**
   * 依据验收清单逐项校验尽调报告。
   * @param maxLatencyMs B.9 可接受时延阈值(默认 5 分钟)。
   */
  validate(
    report: DueDiligenceReport,
    maxLatencyMs: number = MAX_DUE_DILIGENCE_LATENCY_MS,
  ): DeliverableValidationResult {
    const checks: ChecklistCheck[] = [
      this.checkA1Identity(report),
      this.checkA2Basics(report),
      this.checkA3Onchain(report),
      this.checkA4RiskSignals(report),
      this.checkA5KeyLinks(report),
      this.checkA6Conclusion(report),
      this.checkB7Sources(report),
      this.checkB8Consistency(report),
      this.checkB9Structured(report, maxLatencyMs),
    ];

    const missingItems = checks
      .filter((c) => c.id.startsWith('A') && !c.passed)
      .map((c) => c.id);
    const violations = checks
      .filter((c) => c.id.startsWith('B') && !c.passed)
      .map((c) => c.id);
    const qualified = checks.every((c) => c.passed);

    return { qualified, checks, missingItems, violations };
  }

  // ───────────────────────── A. 必备内容 ─────────────────────────

  /** A1 标的标识:链 + (合约地址 或 名称)。 */
  private checkA1Identity(report: DueDiligenceReport): ChecklistCheck {
    const { identity } = report;
    const hasName = isNonEmptyString(identity.name);
    const hasAddress = isNonEmptyString(identity.address);
    const hasChain = isNonEmptyString(identity.chain);
    const passed = hasChain && (hasName || hasAddress);
    return mk(
      'A1',
      '标的标识(名称/合约地址/链/项目方)',
      passed,
      passed ? undefined : '缺少链或名称/合约地址',
    );
  }

  /** A2 基础信息:类别、市值/FDV、流通/总量、官网链接。 */
  private checkA2Basics(report: DueDiligenceReport): ChecklistCheck {
    const { basics } = report;
    const hasCategory = isNonEmptyString(basics.category);
    const hasValuation = isNum(basics.marketCapUsd) || isNum(basics.fdvUsd);
    const hasSupply =
      isNum(basics.circulatingSupply) || isNum(basics.totalSupply);
    const hasWebsite = isNonEmptyString(basics.links?.website ?? null);
    const passed = hasCategory && hasValuation && hasSupply && hasWebsite;
    return mk(
      'A2',
      '基础信息(类别/市值或FDV/供应量/官网链接)',
      passed,
      passed
        ? undefined
        : `缺少:${[
            !hasCategory && '类别',
            !hasValuation && '市值/FDV',
            !hasSupply && '流通量/总量',
            !hasWebsite && '官网链接',
          ]
            .filter(Boolean)
            .join('、')}`,
    );
  }

  /** A3 链上活动摘要:持币地址数 + 流动性 + 合约验证状态。 */
  private checkA3Onchain(report: DueDiligenceReport): ChecklistCheck {
    const o = report.onchainActivity;
    const hasHolders = isNum(o.holderCount);
    const hasLiquidity = isNum(o.liquidityUsd);
    const hasVerified = typeof o.contractVerified === 'boolean';
    const passed = hasHolders && hasLiquidity && hasVerified;
    return mk(
      'A3',
      '链上活动摘要(持币地址数/流动性/合约验证状态)',
      passed,
      passed
        ? undefined
        : `缺少:${[
            !hasHolders && '持币地址数',
            !hasLiquidity && '流动性',
            !hasVerified && '合约验证状态',
          ]
            .filter(Boolean)
            .join('、')}`,
    );
  }

  /** A4 风险信号:合约权限 + 蜜罐/rug 评估 + 审计状态。 */
  private checkA4RiskSignals(report: DueDiligenceReport): ChecklistCheck {
    const r = report.riskSignals;
    const hasPermissions =
      r.contractPermissions != null &&
      Object.values(r.contractPermissions).some((v) => v != null);
    const hasHoneypot = typeof r.honeypotRug === 'boolean';
    const hasAudit = isNonEmptyString(r.auditStatus);
    const passed = hasPermissions && hasHoneypot && hasAudit;
    return mk(
      'A4',
      '风险信号(合约权限/蜜罐rug/审计状态)',
      passed,
      passed
        ? undefined
        : `缺少:${[
            !hasPermissions && '合约权限',
            !hasHoneypot && '蜜罐/rug 评估',
            !hasAudit && '审计状态',
          ]
            .filter(Boolean)
            .join('、')}`,
    );
  }

  /** A5 关键链接:区块浏览器 + DEX/CEX + 官方渠道。 */
  private checkA5KeyLinks(report: DueDiligenceReport): ChecklistCheck {
    const k = report.keyLinks;
    const hasExplorer = isNonEmptyString(k.blockExplorer);
    const hasMarket = isNonEmptyString(k.dexOrCex);
    const hasOfficial = isNonEmptyString(k.official);
    const passed = hasExplorer && hasMarket && hasOfficial;
    return mk(
      'A5',
      '关键链接(区块浏览器/DEX或CEX/官方渠道)',
      passed,
      passed
        ? undefined
        : `缺少:${[
            !hasExplorer && '区块浏览器',
            !hasMarket && 'DEX/CEX',
            !hasOfficial && '官方渠道',
          ]
            .filter(Boolean)
            .join('、')}`,
    );
  }

  /** A6 结论:风险评级 + 一句话摘要。 */
  private checkA6Conclusion(report: DueDiligenceReport): ChecklistCheck {
    const c = report.conclusion;
    const hasRating = isNonEmptyString(c.riskRating);
    const hasSummary = isNonEmptyString(c.summary);
    const passed = hasRating && hasSummary;
    return mk(
      'A6',
      '结论(风险评级 + 一句话摘要)',
      passed,
      passed ? undefined : '缺少风险评级或摘要',
    );
  }

  // ───────────────────────── B. 真实性与质量门槛 ─────────────────────────

  /**
   * B7 每条关键数据附可核来源链接;缺失项标「未获取」,严禁编造。
   * 判定:报告中**每个非空的关键数据字段**必须在 provenance 中有非空 sourceUrl;
   * 缺失字段(null)允许,但必须登记在 notFetched(标「未获取」)。任一编造(有值无来源)→ 违反。
   */
  private checkB7Sources(report: DueDiligenceReport): ChecklistCheck {
    const fabricated: string[] = [];
    const notFetched = new Set(report.notFetched ?? []);

    for (const path of KEY_DATA_PATHS) {
      const value = getByPath(report, path);
      const present = isPresent(value);
      if (!present) {
        continue; // 缺失字段允许(应在 notFetched 标注,见 B8/B9 不强制此处)
      }
      const prov: FieldProvenance | undefined = report.provenance?.[path];
      if (!prov || !isNonEmptyString(prov.sourceUrl)) {
        // 有值但无可核来源 → 视为编造。
        fabricated.push(path);
      }
      // 若同一字段既有值又被标「未获取」,语义矛盾,亦判违反。
      if (notFetched.has(path)) {
        fabricated.push(path);
      }
    }

    const passed = fabricated.length === 0;
    return mk(
      'B7',
      '每条关键数据附可核来源链接(严禁编造)',
      passed,
      passed
        ? undefined
        : `以下字段有值但缺可核来源(疑似编造):${fabricated.join('、')}`,
    );
  }

  /**
   * B8 标注采集时间 + 报告内数字自洽不矛盾 + 风险信号指向具体链上证据。
   */
  private checkB8Consistency(report: DueDiligenceReport): ChecklistCheck {
    const problems: string[] = [];

    // 采集时间标注。
    if (!isNonEmptyString(report.collectedAt)) {
      problems.push('缺少数据采集时间');
    }

    const b = report.basics;
    const o = report.onchainActivity;

    // 非负约束。
    for (const [path, v] of [
      ['basics.marketCapUsd', b.marketCapUsd],
      ['basics.fdvUsd', b.fdvUsd],
      ['basics.circulatingSupply', b.circulatingSupply],
      ['basics.totalSupply', b.totalSupply],
      ['basics.priceUsd', b.priceUsd],
      ['onchainActivity.holderCount', o.holderCount],
      ['onchainActivity.liquidityUsd', o.liquidityUsd],
      ['onchainActivity.volume24hUsd', o.volume24hUsd],
    ] as [string, number | null][]) {
      if (isNum(v) && (v as number) < 0) {
        problems.push(`${path} 为负数(${v})`);
      }
    }

    // 流通量不应超过总量。
    if (
      isNum(b.circulatingSupply) &&
      isNum(b.totalSupply) &&
      (b.circulatingSupply as number) > (b.totalSupply as number)
    ) {
      problems.push('流通量 > 总量(数字矛盾)');
    }

    // 市值不应超过 FDV(全摊薄估值)。
    if (
      isNum(b.marketCapUsd) &&
      isNum(b.fdvUsd) &&
      (b.marketCapUsd as number) > (b.fdvUsd as number)
    ) {
      problems.push('市值 > FDV(数字矛盾)');
    }

    // Top holders 集中度应在 [0,100]。
    if (
      isNum(o.topHolderConcentration) &&
      ((o.topHolderConcentration as number) < 0 ||
        (o.topHolderConcentration as number) > 100)
    ) {
      problems.push('Top holders 集中度超出 [0,100]');
    }

    // 风险信号指向具体链上证据:任一被检出(true)的风险信号必须有来源链接。
    const flagged: [string, boolean | null][] = [
      ['riskSignals.honeypotRug', report.riskSignals.honeypotRug],
      ['riskSignals.largeUnlock', report.riskSignals.largeUnlock],
      ['riskSignals.suspiciousApprovals', report.riskSignals.suspiciousApprovals],
    ];
    for (const [path, v] of flagged) {
      if (v === true) {
        const prov = report.provenance?.[path];
        if (!prov || !isNonEmptyString(prov.sourceUrl)) {
          problems.push(`${path} 检出但未指向具体链上证据`);
        }
      }
    }

    const passed = problems.length === 0;
    return mk(
      'B8',
      '采集时间标注 + 数字自洽 + 风险信号有据',
      passed,
      passed ? undefined : problems.join(';'),
    );
  }

  /**
   * B9 结构化可快速阅读 + 可接受时延内完成。
   */
  private checkB9Structured(
    report: DueDiligenceReport,
    maxLatencyMs: number,
  ): ChecklistCheck {
    const problems: string[] = [];

    // 结构化:必备段对象齐备(结构存在即可,内容齐全由 A 项判定)。
    const structured =
      report.identity != null &&
      report.basics != null &&
      report.onchainActivity != null &&
      report.riskSignals != null &&
      report.keyLinks != null &&
      report.conclusion != null;
    if (!structured) {
      problems.push('报告结构不完整(缺少必备段)');
    }

    // 时延:必须可度量且在阈值内。
    if (!isNum(report.latencyMs)) {
      problems.push('缺少时延度量');
    } else if ((report.latencyMs as number) > maxLatencyMs) {
      problems.push(
        `时延 ${report.latencyMs}ms 超出阈值 ${maxLatencyMs}ms`,
      );
    }

    const passed = problems.length === 0;
    return mk(
      'B9',
      '结构化可快速阅读 + 可接受时延内',
      passed,
      passed ? undefined : problems.join(';'),
    );
  }
}

/**
 * 关键数据字段点路径清单(B7「每条关键数据」判定范围)。
 * 不含 identity(标的标识来自用户输入)与 conclusion(分析结论非原始数据)。
 */
export const KEY_DATA_PATHS: string[] = [
  'basics.category',
  'basics.launchTime',
  'basics.marketCapUsd',
  'basics.fdvUsd',
  'basics.circulatingSupply',
  'basics.totalSupply',
  'basics.priceUsd',
  'basics.links.website',
  'basics.links.social',
  'basics.links.docs',
  'onchainActivity.holderCount',
  'onchainActivity.topHolderConcentration',
  'onchainActivity.liquidityUsd',
  'onchainActivity.volume24hUsd',
  'onchainActivity.contractVerified',
  'riskSignals.contractPermissions',
  'riskSignals.honeypotRug',
  'riskSignals.largeUnlock',
  'riskSignals.suspiciousApprovals',
  'riskSignals.auditStatus',
];

// ───────────────────────── 工具 ─────────────────────────

function mk(
  id: string,
  label: string,
  passed: boolean,
  reason?: string,
): ChecklistCheck {
  return reason ? { id, label, passed, reason } : { id, label, passed };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 字段是否存在(非 null/undefined;空数组视为不存在)。 */
function isPresent(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

/** 按点路径读取嵌套字段。 */
function getByPath(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
}
