import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S0 建设期交付包(crypto-native-agent-ops 任务 18 / 需求 13)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 13.1:产出 litepaper/tokenomics 草稿(必备章节清单覆盖)、赛道/竞品定位报告。
 *   - 需求 13.2:协助搭建并配置品牌社媒矩阵(X/TG/Discord/落地页)至「上线可用」。
 *   - 需求 13.3:维护审计/服务商对接清单与进度跟踪。
 *   - 需求 13.4:涉及对外发布/账号操作的写动作接入分级审批(任务 9/10)。
 *
 * 该包以「交付包 = 任务模板」框架声明(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - 文档/研究类交付物(litepaper/tokenomics/赛道定位/审计清单)为只读自动产出,
 *     量化验收 = **必备章节清单覆盖**;
 *   - 社媒矩阵「搭建配置」的对外发布/账号操作步骤标记为 `write_action`,
 *     运行时经分级审批(external_publish → high → 人确认),框架本身绝不代执行发布。
 *
 * 必备章节清单为行业通用基线(litepaper / tokenomics / 竞品定位 / 审计协调);
 * 具体项目可在 input 中追加,但不得低于此基线。
 */

/** litepaper 必备章节(需求 13.1 草稿必备章节清单)。 */
export const LITEPAPER_REQUIRED_SECTIONS = [
  'overview', // 项目概述 / 愿景
  'problem_solution', // 问题与解决方案
  'product_architecture', // 产品与技术架构
  'token_utility', // 代币用途(utility)
  'roadmap', // 路线图
  'team', // 团队
  'risks_disclaimer', // 风险与免责声明
] as const;

/** tokenomics 必备章节(需求 13.1)。 */
export const TOKENOMICS_REQUIRED_SECTIONS = [
  'supply_allocation', // 总量与分配
  'vesting_schedule', // 释放 / 解锁计划
  'utility_value_capture', // 用途与价值捕获
  'emission_mechanism', // 通胀 / 通缩机制
  'treasury', // 金库与资金用途
] as const;

/** 赛道/竞品定位报告必备章节(需求 13.1)。 */
export const TRACK_POSITIONING_REQUIRED_SECTIONS = [
  'track_definition', // 赛道定义与规模
  'competitors', // 竞品列表与对比
  'differentiation', // 差异化定位
  'target_users', // 目标用户
  'opportunities_risks', // 机会与风险
] as const;

/** 品牌社媒矩阵「上线可用」配置必备项(需求 13.2:X/TG/Discord/落地页)。 */
export const SOCIAL_MATRIX_REQUIRED_SECTIONS = [
  'x_profile', // X:简介/头像/头图/置顶
  'telegram', // TG:群组/频道/规则/bot
  'discord', // Discord:服务器/频道/角色/验证
  'landing_page', // 落地页:域名/内容/CTA/SEO
] as const;

/** 审计/服务商对接清单与进度跟踪必备项(需求 13.3)。 */
export const AUDIT_VENDOR_REQUIRED_SECTIONS = [
  'vendor_shortlist', // 候选审计/服务商名单
  'engagement_status', // 对接状态(询价/报价/签约)
  'timeline', // 时间表
  'progress_tracking', // 进度跟踪(里程碑/阻塞项)
] as const;

export const S0_BUILD_PACKAGE: DeliveryPackageTemplate = {
  slug: 's0-build',
  stage: 'S0',
  title: 'S0 建设期 · 立项与上线准备交付包',
  summary:
    '建设期帮项目方产出文档(litepaper/tokenomics 草稿)、赛道/竞品定位研究,搭建配置品牌社媒矩阵至「上线可用」,并维护审计/服务商对接清单与进度跟踪。',
  requirementRefs: ['13.1', '13.2', '13.3', '13.4'],

  // ───────── 输入 ─────────
  inputs: [
    { key: 'projectName', label: '项目名称', required: true, type: 'string' },
    { key: 'oneLiner', label: '一句话定位', required: true, type: 'string' },
    { key: 'chain', label: '主链', required: false, type: 'string' },
    { key: 'track', label: '所属赛道', required: true, type: 'string' },
    { key: 'brandTone', label: '品牌调性', required: false, type: 'string' },
    {
      key: 'socialHandles',
      label: '社媒账号信息(X/TG/Discord/域名)',
      required: false,
      type: 'object',
    },
    {
      key: 'extraLitepaperSections',
      label: '额外 litepaper 章节',
      required: false,
      type: 'string[]',
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      id: 'litepaper-draft',
      label: 'litepaper 草稿(必备章节清单覆盖)',
      kind: 'deliverable_production',
      requirementRefs: ['13.1'],
      deliverable: {
        deliverableType: 'litepaper_draft',
        requiredSections: [...LITEPAPER_REQUIRED_SECTIONS],
      },
    },
    {
      id: 'tokenomics-draft',
      label: 'tokenomics 草稿(必备章节清单覆盖)',
      kind: 'deliverable_production',
      requirementRefs: ['13.1'],
      deliverable: {
        deliverableType: 'tokenomics_draft',
        requiredSections: [...TOKENOMICS_REQUIRED_SECTIONS],
      },
    },
    {
      id: 'track-positioning',
      label: '赛道/竞品定位报告',
      kind: 'deliverable_production',
      requirementRefs: ['13.1'],
      deliverable: {
        deliverableType: 'track_positioning_report',
        requiredSections: [...TRACK_POSITIONING_REQUIRED_SECTIONS],
        // 竞品对比至少覆盖 3 个竞品。
        minItems: { competitors: 3 },
      },
    },
    {
      id: 'social-matrix-config',
      label: '品牌社媒矩阵配置(X/TG/Discord/落地页 → 上线可用)',
      kind: 'deliverable_production',
      requirementRefs: ['13.2'],
      deliverable: {
        deliverableType: 'social_matrix_config',
        requiredSections: [...SOCIAL_MATRIX_REQUIRED_SECTIONS],
      },
    },
    {
      // 社媒矩阵「搭建配置至上线可用」涉及对外发布/账号操作 → 写动作,必经分级审批(13.4)。
      id: 'social-matrix-publish',
      label: '社媒账号上线发布(对外发布/账号操作)',
      kind: 'write_action',
      requirementRefs: ['13.2', '13.4'],
      action: {
        actionType: 'external_publish',
        target: 'brand_social_matrix',
      },
    },
    {
      id: 'audit-vendor-checklist',
      label: '审计/服务商对接清单与进度跟踪',
      kind: 'deliverable_production',
      requirementRefs: ['13.3'],
      deliverable: {
        deliverableType: 'audit_vendor_checklist',
        requiredSections: [...AUDIT_VENDOR_REQUIRED_SECTIONS],
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '13.1',
      description:
        'litepaper/tokenomics 草稿覆盖各自必备章节清单;赛道/竞品定位报告覆盖必备章节且竞品 ≥ 3。',
    },
    {
      id: '13.2',
      description:
        '品牌社媒矩阵(X/TG/Discord/落地页)配置覆盖全部「上线可用」必备项。',
    },
    {
      id: '13.3',
      description: '审计/服务商对接清单含候选名单、对接状态、时间表与进度跟踪。',
    },
    {
      id: '13.4',
      description:
        '社媒对外发布/账号操作等写动作经分级审批(高风险回落人确认),框架不代执行发布。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'one_time',
    unit: '项目(建设期立项)',
    meteringRef: 'none',
    note: 'S0 建设期为一次性立项交付;对外发布写动作的执行计费随对应账号操作另计。',
  },
};
