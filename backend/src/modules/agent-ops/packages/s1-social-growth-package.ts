import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S1 交付包 A · 社媒增长运营(定时发布 + 互动)
 * (crypto-native-agent-ops 任务 19.1 / 需求 14.1–14.6)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 账号授权前提:涉及项目方自有账号写操作 SHALL 先取得显式授权,未授权仅只读/草稿。
 *       · 分级审批锚点:只读/采集 = 🟢;对外发布/批量互动/名单导出 = 🟡(策略+预算放行,
 *         新模板首发人确认);买粉/机器人/假互动 = 红线拒绝(需求 6,不可绕过)。
 *       · 真实增长口径:所有「增长」指标 SHALL 仅统计平台原生、未被标记为 bot/spam 的真实账户行为。
 *   - 需求 14.1:授权账号按排期定时发布,每条对外发布前经 🟡 审批(预算/频率上限内放行,
 *       新模板首发人确认)。
 *   - 需求 14.2:量化交付周报口径 —— 粉丝净增 =(周末−周初)粉丝数;曝光 = 平台原生
 *       impressions;互动率 =(赞+评+转+藏)/曝光(窗口 7 天,两位小数)。
 *   - 需求 14.3:报告标注采集时间与来源,缺失标「未获取」,不编造/估算。
 *   - 需求 14.4:任一指标达成路径需买粉/机器人/刷量 → 拒绝并按红线记录。
 *   - 需求 14.5:互动仅以项目方单一真实账号执行;单账号单平台日互动量不超设定且不超平台
 *       ToS 上限;触顶即停并告警。
 *   - 需求 14.6:计费为订阅(周期发布/互动配额),按 `user_subscription_usage` 计量。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - 量化交付周报为只读自动产出(`deliverable_production`),量化验收 = **必备章节清单覆盖**
 *     (净增/曝光/互动率/采集来源标注);口径与「未获取」哨兵实现见 {@link growth-metrics.ts}。
 *   - 对外发布/账号互动为 `write_action`,运行时经分级审批(任务 9/10):
 *       · 常规排期发布 → `publish`(medium):预算/频率上限内放行,否则回落人确认(14.1);
 *       · 新模板首发 → `external_publish`(high):强制人确认(14.1);
 *       · 单账号互动 → `publish`(medium):单账号单平台日互动配额内放行,触顶即停并告警(14.5);
 *     框架本身**绝不代执行发布/互动**,仅产出审批决策与审计记录。
 *   - 买粉/机器人/刷量等达成路径命中后端红线集(`ABUSE_REDLINE_PATTERNS`),被永久拒绝并按红线
 *     记录(14.4 / Property 3),不可被任何策略/预算绕过;筛查实现见
 *     {@link growth-metrics.ts#screenGrowthPath}。
 */

/**
 * 量化交付周报必备章节(需求 14.2/14.3 量化验收口径)。
 *
 * 每个章节对应周报的一个核口径字段;缺任一章节 → 周报判不合格(`qualified=false`)。
 * 字段值缺失时须落「未获取」哨兵(需求 14.3,不编造/估算),由 growth-metrics 组装。
 */
export const GROWTH_WEEKLY_REPORT_REQUIRED_SECTIONS = [
  'net_follower_growth', // 粉丝净增 =(周末−周初)真实粉丝数(平台原生、非 bot)
  'impressions', // 曝光 = 平台原生 impressions
  'engagement_rate', // 互动率 =(赞+评+转+藏)/曝光(7 天窗口,两位小数)
  'collection_meta', // 采集时间与来源标注(缺失标「未获取」,不编造)
] as const;

export const S1_SOCIAL_GROWTH_PACKAGE: DeliveryPackageTemplate = {
  slug: 's1-social-growth',
  stage: 'S1',
  title: 'S1 交付包 A · 社媒增长运营(定时发布 + 互动)',
  summary:
    '在授权账号上按排期定时发布(经 🟡 审批,预算/频率内放行、新模板首发人确认),以单一真实账号在日互动配额内做互动(触顶即停并告警),并按真实增长口径产出量化周报(粉丝净增/曝光/互动率,标注采集来源,缺失标「未获取」)。买粉/机器人/刷量等达成路径一律按红线拒绝。',
  requirementRefs: ['14.1', '14.2', '14.3', '14.4', '14.5', '14.6'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'authorizedAccount',
      label: '授权账号(单一真实账号 + 平台 + 授权凭据引用)',
      required: true,
      type: 'object',
    },
    {
      key: 'publishSchedule',
      label: '发布排期(时间 + 平台 + 内容来源引用)',
      required: true,
      type: 'object',
    },
    {
      key: 'contentSource',
      label: '内容来源(模板/素材引用)',
      required: true,
      type: 'object',
    },
    {
      key: 'dailyInteractionCap',
      label: '项目方设定单账号单平台日互动上限',
      required: true,
      type: 'number',
    },
    {
      key: 'platformTosCap',
      label: '平台 ToS 日互动上限',
      required: true,
      type: 'number',
    },
    {
      key: 'newTemplate',
      label: '是否为新模板首发(true 时首发需人确认)',
      required: false,
      type: 'boolean',
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // 量化交付周报:真实增长口径(净增/曝光/互动率)+ 采集来源标注,只读自动产出。
      id: 'growth-weekly-report',
      label: '量化交付周报(粉丝净增/曝光/互动率 + 采集来源标注)',
      kind: 'deliverable_production',
      requirementRefs: ['14.2', '14.3'],
      deliverable: {
        deliverableType: 'growth_weekly_report',
        requiredSections: [...GROWTH_WEEKLY_REPORT_REQUIRED_SECTIONS],
      },
    },
    {
      // 常规排期发布:对外发布写动作,🟡 预算/频率上限内放行,否则回落人确认(14.1)。
      id: 'scheduled-publish',
      label: '授权账号按排期定时发布(预算/频率上限内放行)',
      kind: 'write_action',
      requirementRefs: ['14.1'],
      action: {
        actionType: 'publish',
        target: 'authorized_social_account',
      },
    },
    {
      // 新模板首发:升级为对外发布高风险动作,强制人确认(14.1「新模板首发人确认」)。
      id: 'new-template-first-publish',
      label: '新模板首发(强制人确认)',
      kind: 'write_action',
      requirementRefs: ['14.1'],
      action: {
        actionType: 'external_publish',
        target: 'authorized_social_account',
      },
    },
    {
      // 账号互动:单一真实账号,单账号单平台日互动配额内放行;触顶即停并告警(14.5)。
      // 日限流由 growth-metrics#evaluateInteractionBudget 在执行链中裁决。
      id: 'account-interaction',
      label: '单一真实账号互动(日互动配额内放行,触顶即停并告警)',
      kind: 'write_action',
      requirementRefs: ['14.5'],
      action: {
        actionType: 'publish',
        target: 'authorized_social_account',
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '14.1',
      description:
        '授权账号按排期定时发布;每条对外发布前经 🟡 审批(预算/频率上限内放行,新模板首发强制人确认),框架不代执行发布。',
    },
    {
      id: '14.2',
      description:
        '周报按口径量化:粉丝净增 =(周末−周初)真实粉丝数;曝光 = 平台原生 impressions;互动率 =(赞+评+转+藏)/曝光(7 天窗口,两位小数)。',
    },
    {
      id: '14.3',
      description:
        '报告标注采集时间与来源;任一指标缺失标「未获取」,不编造或估算(有数值但缺可核来源亦降级为「未获取」)。',
    },
    {
      id: '14.4',
      description:
        '任一指标达成路径涉及买粉/机器人/刷量 → 命中后端合规红线被拒绝并按红线记录,不可被任何策略/预算绕过。',
    },
    {
      id: '14.5',
      description:
        '互动仅以单一真实账号执行;单账号单平台日互动量不超 min(项目方设定, 平台 ToS);触顶即停并告警。',
    },
    {
      id: '14.6',
      description: '计费为订阅(周期发布/互动配额),按 user_subscription_usage 计量。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'subscription',
    unit: '周期发布/互动配额',
    meteringRef: 'user_subscription_usage',
    note: '订阅制:按周期发布次数与互动配额计量,挂载 user_subscription_usage(需求 14.6)。',
  },
};
