import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * LivingPet — 主宠灵魂实体（顿领 §3.2 §3.4）
 *
 * 契约：
 * - 1 user = 1 LivingPet（unique on userId）
 * - pet_id 与 primary_agent_id 永远独立（§3.8）
 * - 不参与经济（§9.1，无 AgentAccount 关联）
 * - 不可删除 / 不可转让 / 不可卖
 */
@Entity('living_pets')
@Index(['userId'], { unique: true })
export class LivingPet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** 主宠名 */
  @Column({ length: 64, default: 'Aira' })
  name: string;

  /** 物种 / 化身类型 */
  @Column({ length: 32, default: 'aira' })
  species: string;

  /** 人格（JSON） */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  personality: Record<string, unknown>;

  /** 当前情绪（顿领 §3.4.1） */
  @Column({
    type: 'enum',
    enum: [
      'happy',
      'focused',
      'concerned',
      'tired',
      'excited',
      'calm',
      'love',
      'sad',
      'angry',
      'sleepy',
    ],
    default: 'calm',
  })
  emotion:
    | 'happy'
    | 'focused'
    | 'concerned'
    | 'tired'
    | 'excited'
    | 'calm'
    | 'love'
    | 'sad'
    | 'angry'
    | 'sleepy';

  /** 强度 0-3 */
  @Column({ type: 'smallint', default: 0 })
  emotionIntensity: number;

  /** 当前情绪起始时间 */
  @Column({ type: 'bigint' })
  emotionSince: string;

  /** 该情绪何时自动衰减 calm */
  @Column({ type: 'bigint' })
  emotionDecayAt: string;

  /** §3.5 亲密度 lv 0-10 */
  @Column({ type: 'smallint', default: 0 })
  intimacyLevel: number;

  @Column({ type: 'integer', default: 0 })
  intimacyXp: number;

  /** 最近 5 条记忆片段 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  recentMemorySnippets: string[];

  /**
   * 已解锁的灵魂模板集合。
   * Free 默认只有 claw；Pro 最多 3 只；Pro+ / Enterprise 不限。
   */
  @Column({ type: 'jsonb', default: () => "'[\"claw\"]'" })
  unlockedSoulTemplateIds: string[];

  /** §3.8 当前驱动主宠的 working agent；可切换不影响灵魂 */
  @Column({ type: 'uuid', nullable: true })
  primaryAgentId?: string;

  /**
   * Phase 1 新增：当前灵魂模板 id（slug，如 'claw'）。
   * 默认为 'claw'（A 族群旗舰），nullable 仅为兼容老数据迁移期。
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  soulTemplateId?: string | null;

  /**
   * Phase 1 新增：用户对默认 SystemPrompt 的覆写片段。
   * 可包含自定义口吻 / 称呼 / 边界等键值。
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  personalityOverrides: Record<string, unknown>;

  /** 引擎切换中（1-2s 换装动画窗口） */
  @Column({ default: false })
  engineSwitching: boolean;

  /** 上次任意端互动时间，用于 14 天衰减判定 */
  @Column({ type: 'bigint', nullable: true })
  lastInteractionAt?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
