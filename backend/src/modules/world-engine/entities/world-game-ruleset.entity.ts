import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * WorldGameRuleSet — UGC 游戏规则集 (Phase D, 二期)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §7.4 + Phase D。
 *
 * 让用户用自己的扫描角色**做自己的小游戏/副本**:一个规则集描述一场可分享的挑战
 * (数值修正 + 胜利条件 + 参与角色限制),通过 shareCode 分享给好友裂变。
 *
 * Phase D 范围保持克制:规则集作用于"交互战斗"的可调参数(回合上限/能量/充能/伤害倍率),
 * 不引入新引擎。后续可扩展到副本/关卡编辑。
 */
@Entity('world_game_rulesets')
@Index(['creatorUserId', 'createdAt'])
@Index(['shareCode'], { unique: true })
export class WorldGameRuleSet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 创建者 (FK → users.id) */
  @Column({ type: 'uuid' })
  creatorUserId: string;

  /** 规则集名称(1-40) */
  @Column({ type: 'varchar', length: 40 })
  name: string;

  /** 简介(展示用, 0-200) */
  @Column({ type: 'varchar', length: 200, default: '' })
  description: string;

  /** 6-12 位分享码(裂变) */
  @Column({ type: 'varchar', length: 16 })
  shareCode: string;

  /**
   * 可调参数(全部可空 → 缺省回退默认引擎常量)。Phase D 仅作用于交互战斗:
   *   {
   *     maxRounds?: number,         // 回合上限 (5-40)
   *     energyMax?: number,         // 行动力上限 (1-6)
   *     chargeMax?: number,         // 充能上限 (1-6)
   *     damageMultiplier?: number,  // 全局伤害倍率 (0.5-2.0)
   *     critEnabled?: boolean,      // 是否允许暴击
   *     winCondition?: 'ko' | 'hp_majority' | 'rounds_survival',
   *   }
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  rules: Record<string, unknown>;

  /** 玩了多少次(裂变热度) */
  @Column({ type: 'integer', default: 0 })
  playCount: number;

  /** 是否公开可被 shareCode 加载 */
  @Column({ type: 'boolean', default: true })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
