import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetSoulTemplate — 灵魂模板（人格 / 专长 / 口吻 / 行为倾向）
 *
 * PRD: docs/PRD_PET_6_CLANS_PERSONA.zh-CN.md §1
 *      docs/PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md §3.1
 *
 * 契约：
 *  - id 是稳定 slug（如 'claw' / 'tinker' / 'whale'），由 seed 写入；非 uuid
 *  - 不绑定 user_id（全局共享）
 *  - 用户对 LivingPet.soulTemplateId 引用本表
 *  - 内容修订时 version++
 */
@Entity('pet_soul_templates')
@Index(['clan'])
export class PetSoulTemplate {
  /** slug 主键，如 'claw' */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  /** 6 族群之一：A_office / B_life / C_learn / D_play / E_web3 / F_family */
  @Column({ type: 'varchar', length: 16 })
  clan: string;

  @Column({ type: 'varchar', length: 64 })
  displayName: string;

  @Column({ type: 'varchar', length: 64 })
  displayNameEn: string;

  @Column({ type: 'varchar', length: 240 })
  tagline: string;

  /** 人格原型，如 'ENTJ' */
  @Column({ type: 'varchar', length: 32 })
  archetype: string;

  /** 口吻关键词 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  toneKeywords: string[];

  /** 禁止口吻 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  forbiddenTone: string[];

  /** LLM system prompt 模板（含变量占位 {{user_name}} {{intimacy_level}} 等） */
  @Column({ type: 'text' })
  systemPromptTemplate: string;

  /** 默认接单标签 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  defaultSkillTags: string[];

  /** 工具白名单 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  toolWhitelist: string[];

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 1.0 })
  budgetDailyUSD: string;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0.5 })
  budgetPerTaskUSD: string;

  /** 默认 idle 情绪（PetEmotion 之一） */
  @Column({ type: 'varchar', length: 24, default: 'calm' })
  defaultIdleEmotion: string;

  /** 情绪倾向分布 {emotion: 0-1} */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  emotionTendency: Record<string, number>;

  /** PetCreator 推荐 prompt 关键词 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  recommendedSkinTags: string[];

  /** 营销 Hook（一句话） */
  @Column({ type: 'varchar', length: 240, default: '' })
  marketingHook: string;

  /** 商业层级：high_arpu | high_dau | edu | viral | web3 | family */
  @Column({ type: 'varchar', length: 16, default: 'high_dau' })
  tier: string;

  /** 年龄分级：all | 13+ | 18+ */
  @Column({ type: 'varchar', length: 8, default: 'all' })
  ageRating: string;

  /** 合规标记 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  complianceFlags: string[];

  /** 是否启用（运维可关停某只灵魂） */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** 内容版本号 */
  @Column({ type: 'integer', default: 1 })
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
