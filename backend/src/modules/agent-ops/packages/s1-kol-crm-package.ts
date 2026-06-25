import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S1 交付包 C · KOL 发现 / 外联 / CRM(crypto-native-agent-ops 任务 19.3 / 需求 14.11–14.15)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:发现/CRM = 🟢;外联 = 🟡(策略+预算放行,新模板首发人确认);
 *         KOL 谈判/报价/签约/对外承诺 = 🔴 人确认;买粉/机器人/假互动 = 红线拒绝(需求 6)。
 *   - 需求 14.11:项目方提供赛道/受众画像 → 产出去重 + 真实性核验的 KOL 名单,每条含:
 *       账号、粉丝量、近 30 天均互动率、相关性标签、可核来源。
 *   - 需求 14.12:真实性核验标注疑似刷粉信号(粉丝/互动比异常、互动率低于阈值);
 *       疑似造假项标记而不计入「合格 KOL」;按唯一标识去重。
 *   - 需求 14.13:经 🟡 审批触达并记 CRM —— 触达数 = 唯一外联条数;回复率 = 回复数/触达数;
 *       转化合作数 = 进入合作状态数。
 *   - 需求 14.14:进入报价/佣金/签约/对外承诺 → 转 🔴 人确认,agent 仅备料跟踪,不自动签约。
 *   - 需求 14.15:计费为按结果(合格 KOL 条数/转化合作数)或订阅,二选一。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - KOL 名单(去重 + 真实性核验)为只读自动产出(`deliverable_production`,🟢 发现),
 *     落库为 `kol_list` 交付物,可保存/分享/复用。去重 / 真实性 / 合格判定与 CRM 口径见
 *     {@link kol-crm.ts}(buildQualifiedKolList / computeKolCrmMetrics)。
 *   - 外联触达为 `write_action`,🟡 经分级审批(任务 9/10):`submit_form`(medium):
 *     策略+预算上限内放行,否则回落人确认(14.13);框架**绝不代执行外联**。
 *   - 报价/佣金/签约/对外承诺为 `write_action`,🔴 强制人确认:`irreversible_submit`(high)
 *     → user_confirmation。agent **仅备料跟踪,SHALL NOT 自动签约**(14.14)。
 *   - 买粉/机器人/假互动等达成路径命中后端红线集(`ABUSE_REDLINE_PATTERNS`),被永久拒绝
 *     (需求 6,不可被任何策略/预算绕过)。
 */

/**
 * KOL 名单交付物必备章节(需求 14.11/14.12 量化验收的章节级口径)。
 * 缺任一章节 → 交付物判不合格(`qualified=false`)。更细的去重/真实性/合格判定
 * 由 kol-crm.ts 在产出链中裁决。
 */
export const KOL_LIST_REQUIRED_SECTIONS = [
  'qualified_kols', // 合格 KOL(字段完整且非疑似造假;每条含账号/粉丝量/近30天均互动率/标签/可核来源)
  'flagged_suspected_fake', // 疑似刷粉项(标记但不计合格,需求 14.12)
  'dedup_summary', // 去重摘要(按唯一标识去重的剔除数,需求 14.12)
  'authenticity_criteria', // 真实性核验阈值口径(互动率阈值 / 粉丝-互动比上限,可核方法学)
] as const;

export const S1_KOL_CRM_PACKAGE: DeliveryPackageTemplate = {
  slug: 's1-kol-crm',
  stage: 'S1',
  title: 'S1 交付包 C · KOL 发现 / 外联 / CRM',
  summary:
    '由赛道/受众画像产出去重 + 真实性核验的 KOL 名单(每条含账号/粉丝量/近30天均互动率/相关性标签/可核来源),标注疑似刷粉信号且不计入合格 KOL;外联触达经 🟡 审批并记 CRM(触达数=唯一外联条数、回复率=回复/触达、转化合作数=进入合作状态数);报价/佣金/签约/对外承诺转 🔴 人确认,agent 仅备料跟踪不自动签约;买粉/机器人/假互动按红线拒绝。',
  requirementRefs: ['14.11', '14.12', '14.13', '14.14', '14.15'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'trackProfile',
      label: '赛道 / 受众画像(KOL 相关性匹配依据)',
      required: true,
      type: 'object',
    },
    {
      key: 'authenticityThresholds',
      label: '真实性核验阈值(互动率阈值 / 粉丝-互动比上限,按平台基线设定)',
      required: true,
      type: 'object',
    },
    {
      key: 'candidateSources',
      label: 'KOL 候选采集来源(只读采集端点 / 列表)',
      required: false,
      type: 'string[]',
    },
    {
      key: 'outreachApproved',
      label: '项目方是否已批准外联(批准后方可触达)',
      required: false,
      type: 'boolean',
    },
    {
      key: 'billingMode',
      label: '计费模式(per_result 按结果 / subscription 订阅,二选一)',
      required: false,
      type: 'enum',
      enumValues: ['per_result', 'subscription'],
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // KOL 名单(去重 + 真实性核验):只读自动产出(🟢 发现/CRM),可保存/分享/复用。
      // 量化验收:章节覆盖 + 去重 + 真实性合格判定(见 kol-crm.ts)。
      id: 'kol-list',
      label: 'KOL 名单(去重 + 真实性核验,标注疑似刷粉项不计合格)',
      kind: 'deliverable_production',
      requirementRefs: ['14.11', '14.12'],
      deliverable: {
        deliverableType: 'kol_list',
        requiredSections: [...KOL_LIST_REQUIRED_SECTIONS],
      },
    },
    {
      // 外联触达:🟡 经分级审批(submit_form / medium)。策略+预算内放行,否则回落人确认(14.13)。
      // 框架不代执行外联;触达后由 CRM 记录(computeKolCrmMetrics)统计触达/回复/转化。
      id: 'kol-outreach',
      label: 'KOL 外联触达(🟡 经审批,策略+预算内放行,否则回落人确认)',
      kind: 'write_action',
      requirementRefs: ['14.13'],
      action: {
        actionType: 'submit_form',
        target: 'kol_outreach_channel',
      },
    },
    {
      // 报价/佣金/签约/对外承诺:🔴 强制人确认(irreversible_submit / high)。
      // agent 仅备料跟踪,SHALL NOT 自动签约(14.14)。
      id: 'kol-negotiation-commit',
      label: '报价/佣金/签约/对外承诺(🔴 强制人确认,agent 仅备料不自动签约)',
      kind: 'write_action',
      requirementRefs: ['14.14'],
      action: {
        actionType: 'irreversible_submit',
        target: 'kol_partnership_agreement',
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '14.11',
      description:
        '由赛道/受众画像产出去重 + 真实性核验的 KOL 名单,每条含账号、粉丝量、近 30 天均互动率、相关性标签、可核来源;缺任一必备字段 → 该条不计合格。',
    },
    {
      id: '14.12',
      description:
        '真实性核验标注疑似刷粉信号(粉丝/互动比异常、互动率低于阈值);疑似造假项被标记但 SHALL NOT 计入合格 KOL;按唯一标识(平台:handle)去重。',
    },
    {
      id: '14.13',
      description:
        '外联经 🟡 审批后触达并记 CRM:触达数 = 唯一外联条数;回复率 = 回复数/触达数(两位小数);转化合作数 = 进入合作状态(converted)数;触达数为 0 时回复率/转化率取「未获取」不编造。',
    },
    {
      id: '14.14',
      description:
        '进入报价/佣金/签约/对外承诺 → 转 🔴 人确认(irreversible_submit → high → user_confirmation);agent 仅备料跟踪,框架 SHALL NOT 自动签约。',
    },
    {
      id: '14.15',
      description:
        '计费为按结果(合格 KOL 条数 / 转化合作数)或订阅,二选一(billingMode 指定)。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'subscription_or_per_result',
    unit: '合格 KOL 条数 / 转化合作数(按结果) 或 周期配额(订阅)',
    meteringRef: 'user_subscription_usage',
    note: '二选一(需求 14.15):按结果计量合格 KOL 条数/转化合作数,或订阅周期配额挂载 user_subscription_usage。',
  },
};
