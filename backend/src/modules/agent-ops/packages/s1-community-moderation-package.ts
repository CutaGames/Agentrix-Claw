import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S1 交付包 E · 社区审核 + 情绪日报(crypto-native-agent-ops 任务 19.5 / 需求 14.20–14.22)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:监控/巡检/识别/记录/情绪日报草稿 = 🟢(只读自动);
 *         删除/封禁等清理写动作 = 🟡 审批,批量封禁强制人确认(需求 14.20);
 *         买粉/机器人/刷量 = 红线拒绝(需求 6)。
 *   - 需求 14.20:WHILE 监控开启 持续巡检指定频道,识别垃圾/诈骗/违禁并记录;
 *       删除/封禁等清理写动作 SHALL 经 🟡 审批(批量封禁人确认)。
 *   - 需求 14.21:按日产出情绪日报 —— 响应时间 = 违规出现到处置(中位数 + P90);
 *       清理量 = 当日处置条数(按类型);情绪 = 正/中/负占比 + 主要话题。
 *   - 需求 14.22:计费为订阅(频道数 / 周期)。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - 情绪日报为只读自动产出(`deliverable_production`,🟢 监控/草稿),落库为 `sentiment_digest`
 *     交付物,可保存/分享/复用。响应时间(中位数+P90)/清理量(按类型)/情绪(占比+主要话题)
 *     口径见 {@link community-sentiment.ts}(buildSentimentDailyReport)。
 *   - 清理动作(删除/封禁)为 `write_action`,🟡 经分级审批;**批量封禁强制人确认**:
 *     用 `batch_operation`(isBatch=true)→ high → user_confirmation(需求 14.20),
 *     **预算授权不可绕过**;框架**绝不代执行清理**(仅返回决策)。
 *   - 买粉/机器人/刷量等达成路径命中后端红线集(`ABUSE_REDLINE_PATTERNS`),被永久拒绝
 *     (需求 6,不可被任何策略/预算绕过)。
 */

/**
 * 情绪日报交付物必备章节(需求 14.21 量化验收的章节级口径)。
 * 缺任一章节 → 交付物判不合格(`qualified=false`)。更细的口径(中位数/P90、按类型清理量、
 * 情绪占比 + 主要话题)由 community-sentiment.ts 在产出链中裁决。
 */
export const SENTIMENT_DIGEST_REQUIRED_SECTIONS = [
  'violations', // 巡检识别违规汇总(垃圾/诈骗/违禁,需求 14.20)
  'response_time', // 响应时间 = 违规出现到处置(中位数 + P90,需求 14.21)
  'cleanup_volume', // 清理量 = 当日处置条数(按类型,需求 14.21)
  'sentiment', // 情绪 = 正/中/负占比 + 主要话题(需求 14.21)
] as const;

export const S1_COMMUNITY_MODERATION_PACKAGE: DeliveryPackageTemplate = {
  slug: 's1-community-moderation',
  stage: 'S1',
  title: 'S1 交付包 E · 社区审核 + 情绪日报',
  summary:
    '监控开启时持续巡检指定频道,识别垃圾/诈骗/违禁并记录(🟢 只读);删除/封禁等清理写动作经 🟡 审批,批量封禁强制人确认(防误封)。按日产出情绪日报:响应时间=违规出现到处置(中位数+P90)、清理量=当日处置条数(按类型)、情绪=正/中/负占比+主要话题;缺样本口径标「未获取」不编造。买粉/机器人/刷量按红线拒绝。计费为订阅(频道数/周期)。',
  requirementRefs: ['14.20', '14.21', '14.22'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'channels',
      label: '待巡检频道列表(频道标识 / 平台,订阅计费维度)',
      required: true,
      type: 'string[]',
    },
    {
      key: 'moderationRuleset',
      label: '审核规则集(垃圾/诈骗/违禁识别口径与阈值)',
      required: false,
      type: 'object',
    },
    {
      key: 'reportDate',
      label: '情绪日报日期(口径标注,如 2026-05-10)',
      required: false,
      type: 'string',
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // 情绪日报:只读自动产出(🟢 监控/草稿),可保存/分享/复用。
      // 量化验收:章节覆盖 + 响应时间(中位数+P90)/清理量(按类型)/情绪(占比+主要话题)。
      id: 'sentiment-daily-report',
      label: '情绪日报(响应时间中位数+P90 / 清理量按类型 / 情绪占比+主要话题)',
      kind: 'deliverable_production',
      requirementRefs: ['14.20', '14.21'],
      deliverable: {
        deliverableType: 'sentiment_digest',
        requiredSections: [...SENTIMENT_DIGEST_REQUIRED_SECTIONS],
      },
    },
    {
      // 清理动作(删除/封禁):🟡 经分级审批,批量封禁强制人确认(防误封)。
      // batch_operation(isBatch=true)→ high → user_confirmation,预算授权不可绕过。
      // 框架不代执行清理;仅返回审批决策。
      id: 'community-cleanup',
      label: '社区清理(删除/封禁,🟡 审批,批量封禁强制人确认)',
      kind: 'write_action',
      requirementRefs: ['14.20'],
      action: {
        actionType: 'batch_operation',
        target: 'community_channel_moderation',
        isBatch: true,
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '14.20',
      description:
        '监控开启时持续巡检指定频道,识别垃圾/诈骗/违禁并记录(🟢 只读);删除/封禁等清理写动作经 🟡 审批,批量封禁强制人确认(batch_operation → high → user_confirmation),预算授权不可绕过;框架 SHALL NOT 代执行清理。',
    },
    {
      id: '14.21',
      description:
        '按日产出情绪日报:响应时间 = 违规出现到处置的中位数 + P90(秒,两位小数,中位数≤P90);清理量 = 当日处置条数(按处置动作类型,total = 各类型之和);情绪 = 正/中/负占比(百分比,两位小数)+ 主要话题(按频次降序);无样本时口径取「未获取」不编造。',
    },
    {
      id: '14.22',
      description: '计费为订阅(频道数 / 周期),挂载 user_subscription_usage 计量。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'subscription',
    unit: '频道数 / 周期',
    meteringRef: 'user_subscription_usage',
    note: '订阅计费(需求 14.22):按巡检频道数 × 周期计量,挂载 user_subscription_usage。',
  },
};
