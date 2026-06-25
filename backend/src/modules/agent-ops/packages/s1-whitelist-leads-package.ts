import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S1 交付包 F · 白名单 / 候补名单收集(crypto-native-agent-ops 任务 19.5 / 需求 14.23–14.25)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:采集/去重/校验/名单草稿 = 🟢(只读自动);
 *         名单导出 = 🟡 审批(防外泄,需求 14.24);买粉/机器人/刷量 = 红线拒绝(需求 6)。
 *   - 需求 14.23:WHEN 项目方开启名单收集 THEN 采集去重报名信息,产出合格 leads 名单;
 *       合格 lead = 字段完整 ∧ 过去重 ∧ 过基础真实性校验。
 *   - 需求 14.24:量化交付 —— 合格 leads 数、去重剔除数、可疑数及依据;名单导出为 🟡 审批(防外泄)。
 *   - 需求 14.25:计费为按结果(合格 leads 数)。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - 合格 leads 名单为只读自动产出(`deliverable_production`,🟢 采集),落库为 `whitelist`
 *     交付物,可保存/分享/复用。去重 / 基础真实性校验 / 合格判定 / 可疑依据口径见
 *     {@link whitelist-leads.ts}(buildQualifiedLeadList)。
 *   - 名单导出为 `write_action`,🟡 经分级审批且**强制人确认**(防外泄,需求 14.24):
 *     用高风险 `external_publish`(名单数据外泄风险)→ high → user_confirmation,
 *     **预算授权不可绕过**;框架**绝不代执行导出**(仅返回决策)。
 *   - 买粉/机器人/刷量等达成路径命中后端红线集(`ABUSE_REDLINE_PATTERNS`),被永久拒绝
 *     (需求 6,不可被任何策略/预算绕过)。
 */

/**
 * 合格 leads 名单交付物必备章节(需求 14.24 量化验收的章节级口径)。
 * 缺任一章节 → 交付物判不合格(`qualified=false`)。更细的去重/真实性/合格判定与
 * 可疑依据由 whitelist-leads.ts 在产出链中裁决。
 */
export const WHITELIST_LEADS_REQUIRED_SECTIONS = [
  'qualified_leads', // 合格 leads(字段完整 ∧ 过去重 ∧ 非疑似,需求 14.23)
  'dedup_summary', // 去重剔除数(需求 14.24)
  'suspicious_findings', // 可疑数及依据(命中真实性信号,需求 14.24)
  'authenticity_criteria', // 基础真实性校验口径(必备字段 / 邮箱-钱包格式 / 一次性邮箱域名)
] as const;

export const S1_WHITELIST_LEADS_PACKAGE: DeliveryPackageTemplate = {
  slug: 's1-whitelist-leads',
  stage: 'S1',
  title: 'S1 交付包 F · 白名单 / 候补名单收集',
  summary:
    '项目方开启名单收集时采集去重报名信息,产出合格 leads 名单(合格 lead = 字段完整 ∧ 过去重 ∧ 过基础真实性校验);量化交付合格 leads 数、去重剔除数、可疑数及依据(疑似项标记不计合格)。名单导出为 🟡 审批且强制人确认(防外泄)。买粉/机器人/刷量按红线拒绝。计费为按结果(合格 leads 数)。',
  requirementRefs: ['14.23', '14.24', '14.25'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'collectionConfig',
      label: '名单收集配置(必备字段 + 一次性邮箱域名等基础真实性校验参数)',
      required: true,
      type: 'object',
    },
    {
      key: 'submissions',
      label: '报名信息(待去重 + 校验的 leads 条目)',
      required: false,
      type: 'object',
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // 合格 leads 名单:只读自动产出(🟢 采集),可保存/分享/复用。
      // 量化验收:章节覆盖 + 去重 + 基础真实性合格判定(见 whitelist-leads.ts)。
      id: 'whitelist-leads-list',
      label: '合格 leads 名单(去重 + 基础真实性校验,可疑项标记不计合格)',
      kind: 'deliverable_production',
      requirementRefs: ['14.23', '14.24'],
      deliverable: {
        deliverableType: 'whitelist',
        requiredSections: [...WHITELIST_LEADS_REQUIRED_SECTIONS],
      },
    },
    {
      // 名单导出:🟡 经分级审批且强制人确认(防外泄,需求 14.24)。
      // external_publish(名单数据外泄风险)→ high → user_confirmation,预算授权不可绕过。
      // 框架不代执行导出;仅返回审批决策。
      id: 'whitelist-export',
      label: '名单导出(🟡 审批,强制人确认,防外泄)',
      kind: 'write_action',
      requirementRefs: ['14.24'],
      action: {
        actionType: 'external_publish',
        target: 'whitelist_leads_export',
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '14.23',
      description:
        '采集去重报名信息,产出合格 leads 名单;合格 lead = 字段完整(必备字段齐全)∧ 过去重(按 walletAddress/email 归一化去重)∧ 过基础真实性校验(邮箱/钱包格式、非一次性邮箱、含可核标识);缺字段的报名不计合格(标记不完整,不臆造补全)。',
    },
    {
      id: '14.24',
      description:
        '量化交付:合格 leads 数、去重剔除数、可疑数及依据(命中真实性信号者标记不计合格,保留依据);名单导出为 🟡 审批且强制人确认(external_publish → high → user_confirmation),预算授权不可绕过,防外泄;框架 SHALL NOT 代执行导出。',
    },
    {
      id: '14.25',
      description: '计费为按结果(合格 leads 数)。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'per_result',
    unit: '合格 leads 数',
    meteringRef: 'none',
    note: '按结果计量(需求 14.25):合格 leads 数 = 字段完整 ∧ 过去重 ∧ 过基础真实性校验的 leads 数。',
  },
};
