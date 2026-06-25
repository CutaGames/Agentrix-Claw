import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetRiveAsset — Phase 2 W1 Rive 资产清单
 *
 * PRD: docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §5 RD-T2.1-T2.6
 *
 * 一只灵魂（soul_template_id）可能挂多个 Rive 资产（默认皮肤 + 主题皮肤）。
 * 渲染端通过 stateMachine + 10 情绪 trigger 名映射来切换情绪。
 */
@Entity('pet_rive_assets')
@Index(['soulTemplateId', 'kind'])
@Index(['retired'])
export class PetRiveAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联灵魂模板 id（如 'claw' / 'owl'）；NULL = 通用兜底 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  soulTemplateId: string | null;

  /** 关联皮肤 id（如果是皮肤定制 Rive）；通用 Rive 时 NULL */
  @Column({ type: 'uuid', nullable: true })
  skinId: string | null;

  /** 'default' | 'seasonal' | 'collab' — 用于商城分类 */
  @Column({ type: 'varchar', length: 24, default: 'default' })
  kind: string;

  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  /** Rive 文件 URL */
  @Column({ type: 'text' })
  url: string;

  /** 缩略图 / 海报 */
  @Column({ type: 'text', nullable: true })
  thumbnailUrl: string | null;

  /** Rive State Machine 名称 */
  @Column({ type: 'varchar', length: 120, default: 'PetSM' })
  stateMachine: string;

  /**
   * 10 情绪 → Rive trigger / state name 映射
   * { happy: 'TriggerHappy', sad: 'TriggerSad', ... }
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  emotionMap: Record<string, string>;

  /** 文件大小（字节）+ 加载时长基线，用于 RD-T2.2-2.4 */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  perfBaseline: Record<string, unknown>;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'boolean', default: false })
  retired: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
