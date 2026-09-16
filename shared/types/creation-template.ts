/**
 * 美学模板库 · Creation_Template / Template_Slot 契约（跨端单一来源）。
 *
 * spec: .kiro/specs/world-growth-engine-launch-readiness/{requirements,design}.md
 *   （§Data Models — 新增「模板，平台自持」；Requirement 8 美学模板库）。
 *
 * 设计取向（SSOT: docs/agentrix-positioning-2026-07.zh-CN.md §5 成败前提①）:
 *   生成不是「从零自由生成」，而是「模板驱动的槽位填充」（Slot_Fill_Generation）。
 *   平台自建、经美学审校的 Creation_Template 决定生成物的美学与结构**下限**;
 *   生成模型只把「用户简单描述 + 结构化数据」映射到模板的 Template_Slot。
 *
 * 复用既有共享类型，不重复定义:
 *   - 创作类型维度复用 `./creation` 的 `CreationType`（首发模板收敛为 shop/place）。
 *
 * 版本化（Requirement 8.6）:一个模板由「稳定逻辑标识 `id` + 单调 `version`」定位。
 *   新增/更新模板 = 追加一个新 `version` 行，既有已发布创作仍引用其生成时的旧
 *   `(id, version)`，因此模板升级向后兼容、不改动既有创作。
 *
 * 所有属性命名使用 camelCase，遵循全局 TypeORM SnakeNamingStrategy（列名自动 snake_case）。
 */

import type { CreationType } from './creation';

// ============================================================
// §1 模板类型（首发收敛为 shop/place）
// requirements: 8.1（首发至少覆盖 shop 与 place 两类）
// ============================================================

/**
 * Creation_Template 首发覆盖的创作类型 —— 收敛为 shop/place（可下单店铺/场所）。
 * 从 `CreationType` 收窄，保证与统一 Creation 契约一致，未来插件化时按 type 扩展。
 */
export type CreationTemplateType = Extract<CreationType, 'shop' | 'place'>;

// ============================================================
// §2 Template_Slot（模板槽位）
// design: §Data Models — TemplateSlot
// requirements: 8.2（为每个模板定义 slots：类型/是否必填/默认值/占位约束）
// ============================================================

/**
 * 槽位数据类型 —— 决定该槽位由用户输入或提供数据如何被填充/校验。
 *  - text:         自由文本（店名 / 简介 / 主题描述等）。
 *  - number:       数值（价格 / 容量 / 时长等）。
 *  - image:        图片资源地址或资产句柄（封面 / 商品图；缺省可触发 AI 生成）。
 *  - offeringList: 供给项列表（商品/服务项，映射为 Creation.offerings）。
 *  - enum:         受约束的枚举取值（由 `constraint.options` 限定）。
 */
export type TemplateSlotType = 'text' | 'number' | 'image' | 'offeringList' | 'enum';

/**
 * Template_Slot —— Creation_Template 中由用户输入或结构化数据填充的单个槽位。
 *
 * 每个槽位带类型与是否必填;缺失必填槽位时由 Conversational_Authoring 追问补齐
 * （Requirement 1.3 / 9.2），而不是用低质量占位兜底。
 */
export interface TemplateSlot {
  /** 槽位键（在模板内唯一，如 'shopName' | 'items' | 'theme' | 'coverImage' | 'summary'）。 */
  key: string;
  /** 槽位数据类型。 */
  type: TemplateSlotType;
  /** 是否必填（必填槽位缺失 → 触发追问，不落库半成品）。 */
  required: boolean;
  /** 可选默认值/占位约束基线（enum 时可给默认选项）。 */
  default?: unknown;
  /**
   * 可选约束（类型相关）:
   *  - text:         { minLength?, maxLength? }
   *  - number:       { min?, max? }
   *  - enum:         { options: string[] }
   *  - offeringList: { minItems?, maxItems? }
   */
  constraint?: Record<string, unknown>;
}

// ============================================================
// §3 Creation_Template（平台自持核心资产）
// design: §Data Models — CreationTemplate
// requirements: 8.1 / 8.2 / 8.3 / 8.6
// ============================================================

/**
 * Creation_Template —— 平台自建、经美学审校的 shop/place 模板。
 *
 * 定义布局主题皮肤、文案骨架、封面/首帧生成风格（路线 B 门面）与槽位集合，
 * 是生成质量的美学与结构地板，也是冷启动种子与 KOL 导入复用的同一来源
 * （Requirement 8.5）。
 *
 * 版本化定位:`(id, version)` 唯一确定一份模板快照。`id` 为稳定逻辑标识（跨版本
 * 不变），`version` 单调递增;新增/更新模板追加新 `version`，向后兼容不改既有创作
 * （Requirement 8.6）。
 */
export interface CreationTemplate {
  /** 稳定逻辑标识（跨版本不变，如 'shop-coffee-minimal'）。 */
  id: string;
  /** 模板创作类型（首发 shop/place）。 */
  type: CreationTemplateType;
  /** 版本号（同一 `id` 下单调递增;`(id, version)` 唯一）。 */
  version: number;
  /** 槽位集合（类型/必填/默认/占位约束）。 */
  slots: TemplateSlot[];
  /** 主题皮肤标识（布局/配色骨架）。 */
  themeSkin: string;
  /** 文案骨架（按段落键 → 骨架模板串;槽位值回填后成文）。 */
  copySkeleton: Record<string, string>;
  /** 封面/首帧生成风格 prompt（路线 B：Feed 与 Landing_Page 的主门面）。 */
  coverStylePrompt: string;
  /**
   * 是否已通过「与 Quality_Gate 一致口径」的美学基线校验（Requirement 8.3）。
   * 只有为 true 的模板才应被纳入可用库供生成/种子选用，保证以其为骨架的产物默认可过门。
   */
  aestheticBaselinePassed: boolean;
}

// ============================================================
// §4 SlotResolver 契约（[Seam] 未来 CreationTypePlugin 接口雏形）
// design: §Components and Interfaces — 新增「槽位解析（[Seam] 未来插件契约雏形）」
// requirements: 1.1（选模板 + 槽位填充）/ 1.3、9.2（缺必填返回清单而非低质占位）
// ============================================================

/**
 * Slot_Fill_Generation 的槽位填充结果。
 *
 * `filled` 为已成功填充（来自用户提供数据或经 ai-integration 抽取、且通过槽位类型/约束校验）的
 * 槽位键 → 值映射。`missingRequired` 为仍缺失的**必填**槽位键清单。
 *
 * 关键取向（Requirement 1.3 / 9.2 · design §Error Handling）:缺必填槽位时返回清单交由
 * Conversational_Authoring 追问补齐，**绝不用低质量占位兜底**。因此 `missingRequired` 非空时
 * `filled` 不含这些必填槽位的任何占位值;而可选槽位可回填模板 `default`（非兜底占位）。
 */
export interface SlotFillResult {
  /** 已成功填充的槽位键 → 值（通过类型/约束校验）。 */
  filled: Record<string, unknown>;
  /** 仍缺失的必填槽位键清单（供追问补齐;绝不占位兜底）。 */
  missingRequired: string[];
}

/**
 * TemplateSlotResolver —— 「选模板 + 槽位填充 + 缺失必填识别」的接缝契约
 * （[Seam]，design §与插件平台（P1）的接缝）。
 *
 * P0 以 shop/place 具体实现落地（`TemplateSlotResolverService`）;待 place 作为第二实现
 * 验证后，P1 `creation-type-plugin-platform` 提炼为 `CreationTypePlugin` 统一契约。
 */
export interface TemplateSlotResolver {
  /**
   * 按业态匹配并选定一个 Creation_Template。
   *
   * @param prompt 用户的自由描述（用于业态识别与模板匹配）。
   * @param hintType 可选的显式创作类型;缺省时依据描述**自动**推断业态（Requirement 8.4）。
   * @returns 选定的模板;无可用模板时应抛出描述性错误（不返回占位模板）。
   */
  pickTemplate(prompt: string, hintType?: CreationType): Promise<CreationTemplate>;

  /**
   * 把「用户描述 + 提供的结构化数据」映射到选定模板的 Template_Slot（Slot_Fill_Generation）。
   *
   * @param prompt 用户的自由描述（缺省槽位经 ai-integration 抽取的来源）。
   * @param data 用户/上游提供的结构化数据（权威;优先于描述抽取）。
   * @param tpl 选定的模板。
   * @returns `{ filled, missingRequired }`;缺必填槽位返回清单而非低质占位兜底。
   */
  fillSlots(
    prompt: string,
    data: Record<string, unknown>,
    tpl: CreationTemplate,
  ): Promise<SlotFillResult>;
}
