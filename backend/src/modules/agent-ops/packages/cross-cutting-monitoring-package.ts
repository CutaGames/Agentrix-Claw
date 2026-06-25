import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * 贯穿层交付包 · 协议/金库/治理监控 + sybil 只读检测 + FUD 情绪 + 报告/KPI 看板
 * (crypto-native-agent-ops 任务 20 / 需求 15.1–15.4)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 15.1:周期性监控项目方指定的协议指标、金库地址、治理提案,异常时告警。
 *   - 需求 15.2:基于链上行为输出 sybil/作弊风险评分与可疑簇 + 判定依据
 *       (只读分析,不替项目方处置;不得反向用于作弊)。
 *   - 需求 15.3:提供 FUD/情绪监控与响应草稿。
 *   - 需求 15.4:按时产出可保存/可分享的运营与数据报告(KPI 看板)。
 *   - design §C7「交付包 = 任务模板」:贯穿(监控/sybil 检测/报告),每个含
 *       「输入 → 动作 → 交付物 → 量化验收 → 计费」。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - **监控摘要**(monitor_digest):周期性只读监控协议/金库/治理结果汇总 + 异常告警。
 *     周期只读检查由 Task 16 `MonitorScheduler`/`MonitorService` 承担(MonitorType 已含
 *     `protocol_metric` / `treasury` / `governance`);本步骤把结果汇总为可保存交付物
 *     (口径见 {@link kpi-report.ts} summarizeMonitoring)。
 *   - **sybil 只读检测报告**(sybil_detection_report):风险评分 + 可疑簇 + 判定依据。
 *     口径见 {@link sybil-detection.ts}(buildSybilDetectionReport);**只读不处置**——
 *     报告不含任何发放/扣发/封禁,处置由项目方决定(需求 15.2 / 14.18)。
 *   - **FUD 响应草稿**(fud_response_draft):FUD 等级研判 + 只读响应草稿。
 *     口径见 {@link fud-monitor.ts}(assessFud / buildFudResponseDraft);**仅起草**。
 *   - **KPI 看板报告**(kpi_dashboard_report):监控 + sybil + FUD 汇总 + 按时产出研判,
 *     可保存/可分享(需求 15.4)。口径见 {@link kpi-report.ts}(buildKpiDashboardReport)。
 *   - **FUD 响应发布**(write_action):对外发布响应为 🟡 但**强制人确认**
 *     (external_publish → high → user_confirmation),预算授权不可绕过;框架绝不代执行发布。
 *     无披露付费喊单 / 价格承诺等达成路径命中后端红线集(`ABUSE_REDLINE_PATTERNS`),
 *     被永久拒绝(需求 6,不可被任何策略/预算绕过)。
 */

/** 监控摘要交付物必备章节(需求 15.1 量化验收的章节级口径)。 */
export const MONITOR_DIGEST_REQUIRED_SECTIONS = [
  'protocol_metrics', // 协议指标监控结果(需求 15.1)
  'treasury', // 金库地址监控结果(需求 15.1)
  'governance', // 治理提案监控结果(需求 15.1)
  'alerts', // 异常告警汇总(需求 15.1)
] as const;

/** sybil 只读检测报告交付物必备章节(需求 15.2)。 */
export const SYBIL_DETECTION_REQUIRED_SECTIONS = [
  'risk_scores', // 逐参与者风险评分(需求 15.2)
  'suspicious_clusters', // 可疑簇(共享资金来源,需求 15.2)
  'evidence', // 判定依据(命中信号,需求 15.2)
  'disposition_notice', // 只读不处置声明(处置由项目方决定,需求 15.2 / 14.18)
] as const;

/** FUD 响应草稿交付物必备章节(需求 15.3)。 */
export const FUD_RESPONSE_DRAFT_REQUIRED_SECTIONS = [
  'fud_level', // FUD 等级研判(需求 15.3)
  'fud_topics', // FUD 焦点话题(判定依据,需求 15.3)
  'response_draft', // 只读响应草稿(需求 15.3)
] as const;

/** KPI 看板报告交付物必备章节(需求 15.4)。 */
export const KPI_DASHBOARD_REQUIRED_SECTIONS = [
  'monitoring', // 监控汇总(需求 15.1)
  'sybil', // sybil 检测汇总(需求 15.2)
  'sentiment', // FUD/情绪汇总(需求 15.3)
  'schedule', // 按时产出研判(需求 15.4)
] as const;

export const CROSS_CUTTING_MONITORING_PACKAGE: DeliveryPackageTemplate = {
  slug: 'x-monitoring',
  stage: 'cross_cutting',
  title: '贯穿层 · 监控 / sybil 只读检测 / FUD 情绪 / 报告 KPI 看板',
  summary:
    '周期性只读监控协议指标/金库地址/治理提案,异常时告警(🟢 只读);基于链上行为输出 sybil 风险评分+可疑簇+判定依据(只读分析,不替项目方处置、不得反向用于作弊);FUD/情绪监控+只读响应草稿(发布为 🟡 强制人确认);按时产出可保存/可分享的运营与数据报告(KPI 看板)。无披露付费喊单/价格承诺等按红线拒绝。计费为订阅(监控项/周期)。',
  requirementRefs: ['15.1', '15.2', '15.3', '15.4'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'monitorTargets',
      label: '监控目标(协议指标 / 金库地址 / 治理提案 + 触发条件)',
      required: true,
      type: 'object',
    },
    {
      key: 'participants',
      label: '参与者地址/活动数据(sybil 只读链上行为读数)',
      required: false,
      type: 'object',
    },
    {
      key: 'sybilThresholds',
      label: '反 sybil 阈值(链上交易数/钱包年龄/交互对手数/簇规模/风险评分阈值)',
      required: false,
      type: 'object',
    },
    {
      key: 'sentimentSamples',
      label: '社区情绪样本(FUD/情绪监控输入)',
      required: false,
      type: 'object',
    },
    {
      key: 'reportPeriod',
      label: '报告产出周期(daily / weekly / monthly,用于按时产出研判)',
      required: false,
      type: 'enum',
      enumValues: ['daily', 'weekly', 'monthly'],
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // 监控摘要:只读自动产出(🟢),协议/金库/治理周期检查结果 + 异常告警汇总。
      id: 'monitor-digest',
      label: '监控摘要(协议指标 / 金库 / 治理 + 异常告警)',
      kind: 'deliverable_production',
      requirementRefs: ['15.1'],
      deliverable: {
        deliverableType: 'monitor_digest',
        requiredSections: [...MONITOR_DIGEST_REQUIRED_SECTIONS],
      },
    },
    {
      // sybil 只读检测报告:只读自动产出(🟢),评分 + 可疑簇 + 依据;只读不处置。
      id: 'sybil-detection',
      label: 'sybil 只读检测报告(风险评分 + 可疑簇 + 判定依据;只读不处置)',
      kind: 'deliverable_production',
      requirementRefs: ['15.2'],
      deliverable: {
        deliverableType: 'sybil_detection_report',
        requiredSections: [...SYBIL_DETECTION_REQUIRED_SECTIONS],
      },
    },
    {
      // FUD 响应草稿:只读自动产出(🟢),FUD 等级 + 焦点话题 + 草稿;仅起草不发布。
      id: 'fud-response-draft',
      label: 'FUD 响应草稿(FUD 等级 + 焦点话题 + 只读草稿)',
      kind: 'deliverable_production',
      requirementRefs: ['15.3'],
      deliverable: {
        deliverableType: 'fud_response_draft',
        requiredSections: [...FUD_RESPONSE_DRAFT_REQUIRED_SECTIONS],
      },
    },
    {
      // KPI 看板报告:只读自动产出(🟢),监控+sybil+FUD 汇总 + 按时产出研判;可保存/分享。
      id: 'kpi-dashboard',
      label: 'KPI 看板报告(监控 / sybil / 情绪汇总 + 按时产出研判)',
      kind: 'deliverable_production',
      requirementRefs: ['15.4'],
      deliverable: {
        deliverableType: 'kpi_dashboard_report',
        requiredSections: [...KPI_DASHBOARD_REQUIRED_SECTIONS],
      },
    },
    {
      // FUD 响应发布:🟡 强制人确认(对外发布响应)。
      // external_publish → high → user_confirmation,预算授权不可绕过;框架不代执行发布。
      // 无披露付费喊单/价格承诺等命中红线 → 永久拒绝。
      id: 'fud-response-publish',
      label: 'FUD 响应发布(🟡 强制人确认,对外发布)',
      kind: 'write_action',
      requirementRefs: ['15.3'],
      action: {
        actionType: 'external_publish',
        target: 'community_channel_post',
        toExternalDomain: true,
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '15.1',
      description:
        '周期性只读监控协议指标/金库地址/治理提案(MonitorType protocol_metric/treasury/governance),异常时告警;监控摘要交付物覆盖 protocol_metrics/treasury/governance/alerts 章节。',
    },
    {
      id: '15.2',
      description:
        '基于链上行为输出 sybil 风险评分 + 可疑簇 + 判定依据(只读分析);SHALL NOT 替项目方处置(报告不含发放/扣发/封禁,dispositionIsProjectOwnerDecision 恒为 true);SHALL NOT 反向用于作弊。报告覆盖 risk_scores/suspicious_clusters/evidence/disposition_notice 章节。',
    },
    {
      id: '15.3',
      description:
        'FUD/情绪监控 + 只读响应草稿(覆盖 fud_level/fud_topics/response_draft 章节);响应发布为 🟡 强制人确认(external_publish → high → user_confirmation),无披露付费喊单/价格承诺命中红线被永久拒绝,框架 SHALL NOT 代执行发布。',
    },
    {
      id: '15.4',
      description:
        '按时产出可保存/可分享的运营与数据报告(KPI 看板);看板覆盖 monitoring/sybil/sentiment/schedule 章节,schedule 含按时产出研判(onTime / overdueSeconds);shareable 恒为 true。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'subscription',
    unit: '监控项 / 周期',
    meteringRef: 'user_subscription_usage',
    note: '订阅计费(需求 15):按监控项数 × 周期计量,挂载 user_subscription_usage。',
  },
};
