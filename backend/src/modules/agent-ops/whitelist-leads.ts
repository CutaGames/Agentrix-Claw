/**
 * 白名单 / 候补名单收集 — 去重 + 基础真实性校验 + 合格 leads 量化口径 + 导出审批边界(纯函数)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:采集/去重/校验/名单草稿 = 🟢(只读自动);
 *         名单导出 = 🟡 审批(防外泄,需求 14.24);买粉/机器人/刷量 = 红线拒绝(需求 6)。
 *   - 需求 14.23:WHEN 项目方开启名单收集 THEN 采集去重报名信息,产出合格 leads 名单;
 *       合格 lead = 字段完整 ∧ 过去重 ∧ 过基础真实性校验。
 *   - 需求 14.24:量化交付 —— 合格 leads 数、去重剔除数、可疑数及依据;名单导出为 🟡 审批(防外泄)。
 *   - 需求 14.25:计费为按结果(合格 leads 数)。
 *   - design Property 7「不编造数据」:缺字段的报名不计合格(标记不完整),不臆造补全。
 *
 * 纯数据/算法,不含 I/O。运行期由 DeliveryPackageRunnerService / 名单收集执行链调用;
 * 名单导出的 🟡 审批(防外泄)由 `S1_WHITELIST_LEADS_PACKAGE` 的 write_action 步骤承载;
 * **本模块绝不代执行导出**(仅采集、去重、校验、统计与起草)。
 *
 * **边界(需求 14.24,硬约束):**
 *   - 名单导出为写动作,SHALL 经 🟡 审批(防外泄,{@link leadExportRequiresApproval} 恒为 true)。
 */

// ───────────────────────── 报名条目(14.23) ─────────────────────────

/**
 * 单条报名信息(白名单 / 候补名单)。
 *
 * 标准字段 + 任意扩展字段(均为字符串)。去重以 `walletAddress` / `email` 归一化值为键;
 * 字段完整性按 {@link LeadCollectionConfig.requiredFields} 判定。
 */
export interface LeadEntry {
  /** 邮箱(去重键之一 + 真实性校验)。 */
  email?: string | null;
  /** 钱包地址(去重键之一 + 真实性校验)。 */
  walletAddress?: string | null;
  /** X / Twitter 账号。 */
  twitterHandle?: string | null;
  /** Discord 账号。 */
  discordHandle?: string | null;
  /** 任意扩展字段(报名表自定义项)。 */
  [extra: string]: string | null | undefined;
}

/** 名单收集配置(项目方设定:必备字段 + 基础真实性校验参数)。 */
export interface LeadCollectionConfig {
  /**
   * 必备字段(合格 lead 须全部存在且非空,需求 14.23「字段完整」)。
   * 默认 ['email']。
   */
  requiredFields: string[];
  /**
   * 一次性 / 临时邮箱域名列表(命中 → 疑似,需求 14.23「基础真实性校验」)。
   * 比较时去首尾空白并小写。默认空列表。
   */
  disposableEmailDomains?: string[];
}

/** 默认名单收集配置(保守基线:邮箱必填;项目方可覆盖)。 */
export const DEFAULT_LEAD_COLLECTION_CONFIG: LeadCollectionConfig = {
  requiredFields: ['email'],
  disposableEmailDomains: [],
};

/** 去重键字段(报名条目按这些字段的归一化值去重,需求 14.23「过去重」)。 */
export const DEDUP_KEY_FIELDS: readonly (keyof LeadEntry)[] = [
  'walletAddress',
  'email',
] as const;

// ───────────────────────── 基础真实性校验(14.23) ─────────────────────────

/** 可疑信号(基础真实性校验依据,需求 14.24「可疑数及依据」)。 */
export type AuthenticitySignal =
  | 'invalid_email_format' // 邮箱格式非法
  | 'disposable_email_domain' // 一次性/临时邮箱域名
  | 'invalid_wallet_format' // 钱包地址格式非法(非 0x + 40 hex)
  | 'no_identifier'; // 无任何可去重/可核标识(邮箱与钱包均缺)

/** 单条 lead 真实性校验结果(需求 14.23/14.24)。 */
export interface AuthenticityResult {
  /** 是否疑似(命中任一信号)。 */
  suspicious: boolean;
  /** 命中的可疑信号(依据,可多个)。 */
  signals: AuthenticitySignal[];
}

/** 邮箱基础格式(基础真实性校验,非完备 RFC)。 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** EVM 钱包地址格式(0x + 40 hex)。 */
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * 基础真实性校验(需求 14.23)。
 *
 * 信号(仅就「已提供」的字段判定,缺字段不据以编造真实性信号):
 *   - 邮箱已提供但格式非法 → invalid_email_format;
 *   - 邮箱域名命中一次性/临时邮箱列表 → disposable_email_domain;
 *   - 钱包已提供但格式非法 → invalid_wallet_format;
 *   - 邮箱与钱包均缺(无任何可核标识)→ no_identifier。
 */
export function screenLeadAuthenticity(
  entry: LeadEntry,
  config: LeadCollectionConfig = DEFAULT_LEAD_COLLECTION_CONFIG,
): AuthenticityResult {
  const signals: AuthenticitySignal[] = [];

  const email = normalize(entry?.email);
  const wallet = normalize(entry?.walletAddress);

  if (email.length > 0) {
    if (!EMAIL_RE.test(email)) {
      signals.push('invalid_email_format');
    } else {
      const domain = email.slice(email.lastIndexOf('@') + 1);
      const disposable = (config?.disposableEmailDomains ?? []).map((d) =>
        (d ?? '').trim().toLowerCase(),
      );
      if (disposable.includes(domain)) {
        signals.push('disposable_email_domain');
      }
    }
  }

  if (wallet.length > 0 && !WALLET_RE.test(wallet)) {
    signals.push('invalid_wallet_format');
  }

  if (email.length === 0 && wallet.length === 0) {
    signals.push('no_identifier');
  }

  return { suspicious: signals.length > 0, signals };
}

// ───────────────────────── 去重(14.23) ─────────────────────────

/**
 * 报名条目的去重键(需求 14.23「过去重」)。
 * = 各去重键字段的归一化值用「|」拼接(`field:value`);无任何键值 → 空串(不可去重)。
 */
export function leadDedupKey(entry: LeadEntry): string {
  const parts: string[] = [];
  for (const field of DEDUP_KEY_FIELDS) {
    const v = normalize(entry?.[field]);
    if (v.length > 0) parts.push(`${String(field)}:${v}`);
  }
  return parts.join('|');
}

/**
 * 按去重键去重(需求 14.23)。保留首现条目,统计剔除数量。
 * 任一去重键字段的归一化值与既见条目冲突 → 视为重复(同人多渠道标识)。
 * 无任何键值(no_identifier)的条目不可去重 → 原样保留(后续判其疑似/不合格)。
 */
export function dedupLeads(entries: LeadEntry[]): {
  unique: LeadEntry[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const unique: LeadEntry[] = [];
  let duplicatesRemoved = 0;

  for (const entry of entries ?? []) {
    const keyValues: string[] = [];
    for (const field of DEDUP_KEY_FIELDS) {
      const v = normalize(entry?.[field]);
      if (v.length > 0) keyValues.push(`${String(field)}:${v}`);
    }

    if (keyValues.length === 0) {
      // 无可去重标识 → 原样保留。
      unique.push(entry);
      continue;
    }

    const isDup = keyValues.some((kv) => seen.has(kv));
    if (isDup) {
      duplicatesRemoved += 1;
      continue;
    }
    for (const kv of keyValues) seen.add(kv);
    unique.push(entry);
  }

  return { unique, duplicatesRemoved };
}

// ───────────────────────── 完整性 + 合格判定(14.23/14.24) ─────────────────────────

/** 单条 lead 评估(完整性 + 真实性 → 是否合格)。 */
export interface LeadEvaluation {
  /** 去重键(归一化)。 */
  identifier: string;
  /** 原始报名条目。 */
  entry: LeadEntry;
  /** 是否字段完整(必备字段齐全,需求 14.23)。 */
  complete: boolean;
  /** 缺失的必备字段。 */
  missingFields: string[];
  /** 真实性校验结果(依据)。 */
  authenticity: AuthenticityResult;
  /** 是否合格 lead(字段完整 ∧ 非疑似;去重已在名单层处理,需求 14.23)。 */
  qualified: boolean;
}

/** 合格 leads 名单产出结果(需求 14.23/14.24 量化口径)。 */
export interface QualifiedLeadListResult {
  /** 合格 leads(字段完整 ∧ 过去重 ∧ 非疑似)。 */
  qualified: LeadEvaluation[];
  /** 疑似 leads(命中真实性信号,标记不计合格,需求 14.24)。 */
  flaggedSuspicious: LeadEvaluation[];
  /** 字段不完整 leads(缺必备字段,不计合格)。 */
  incomplete: LeadEvaluation[];
  /** 合格 leads 数(计费口径,需求 14.25)。 */
  qualifiedCount: number;
  /** 去重剔除数(需求 14.24)。 */
  duplicatesRemoved: number;
  /** 可疑数(需求 14.24)。 */
  suspiciousCount: number;
}

/** 校验单条 lead 是否字段完整(需求 14.23)。 */
export function checkLeadCompleteness(
  entry: LeadEntry,
  config: LeadCollectionConfig = DEFAULT_LEAD_COLLECTION_CONFIG,
): { complete: boolean; missingFields: string[] } {
  const required = config?.requiredFields ?? [];
  const missingFields = required.filter((f) => normalize(entry?.[f]).length === 0);
  return { complete: missingFields.length === 0, missingFields };
}

/**
 * 产出去重 + 真实性校验的合格 leads 名单(需求 14.23 + 14.24)。
 *
 * 流程:先去重(过去重)→ 逐条校验完整性 + 真实性 → 分类:
 *   - 合格(qualified):字段完整 ∧ 非疑似;
 *   - 疑似(flaggedSuspicious):命中真实性信号 → 标记不计合格(依据保留);
 *   - 不完整(incomplete):缺必备字段 → 不计合格。
 *
 * 合格 lead = 字段完整 ∧ 过去重 ∧ 过基础真实性校验(需求 14.23)。
 * 完整但疑似的条目归入 `flaggedSuspicious`;不完整的条目(无论是否疑似)归入 `incomplete`。
 * **只读产出**——名单导出为 🟡 审批写动作({@link leadExportRequiresApproval}),本函数不导出。
 */
export function buildQualifiedLeadList(
  entries: LeadEntry[],
  config: LeadCollectionConfig = DEFAULT_LEAD_COLLECTION_CONFIG,
): QualifiedLeadListResult {
  const { unique, duplicatesRemoved } = dedupLeads(entries);

  const qualified: LeadEvaluation[] = [];
  const flaggedSuspicious: LeadEvaluation[] = [];
  const incomplete: LeadEvaluation[] = [];

  for (const entry of unique) {
    const { complete, missingFields } = checkLeadCompleteness(entry, config);
    const authenticity = screenLeadAuthenticity(entry, config);
    const isQualified = complete && !authenticity.suspicious;

    const evaluation: LeadEvaluation = {
      identifier: leadDedupKey(entry),
      entry,
      complete,
      missingFields,
      authenticity,
      qualified: isQualified,
    };

    if (!complete) {
      incomplete.push(evaluation);
    } else if (authenticity.suspicious) {
      flaggedSuspicious.push(evaluation);
    } else {
      qualified.push(evaluation);
    }
  }

  return {
    qualified,
    flaggedSuspicious,
    incomplete,
    qualifiedCount: qualified.length,
    duplicatesRemoved,
    suspiciousCount: flaggedSuspicious.length,
  };
}

// ───────────────────────── 导出审批边界(14.24) ─────────────────────────

/**
 * 名单导出恒需经 🟡 审批(防外泄,需求 14.24)。
 * 本模块仅采集 / 去重 / 校验 / 起草,绝不代执行导出。
 */
export const leadExportRequiresApproval = true as const;

// ───────────────────────── 内部工具 ─────────────────────────

/** 归一化字符串值(去首尾空白 + 小写;缺失/非字符串 → 空串)。 */
function normalize(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}
