import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetSkin — 用户拥有的皮肤资产
 *
 * PRD: docs/PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md §2.3 §3.1
 *
 * 来源：
 *  - platform : 平台 dogfood 默认皮肤（系统注入，userId 可为 NULL 表示全局）
 *  - generated: 用户用 PetCreator 生成
 *  - purchased: Marketplace 购买
 *  - remixed  : 双图融合二创
 *  - gifted   : 赠送
 */
@Entity('pet_skins')
@Index(['ownerUserId', 'createdAt'])
@Index(['source'])
export class PetSkin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 拥有者；platform 来源时为 NULL（全局可见） */
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  /** 来源 */
  @Column({ type: 'varchar', length: 24, default: 'generated' })
  source: 'platform' | 'generated' | 'purchased' | 'remixed' | 'gifted';

  /** 显示名 */
  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  /** 资源主 URL（.vrm / .riv / .svg） */
  @Column({ type: 'text' })
  url: string;

  /** 缩略图 */
  @Column({ type: 'text', nullable: true })
  thumbnailUrl: string | null;

  /** 格式 */
  @Column({ type: 'varchar', length: 16, default: 'vrm' })
  format: 'svg' | 'rive' | 'vrm' | 'live2d';

  /** 完整资源清单（多边形数 / PBR / blendshape 标准 / 大小等） */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  manifest: Record<string, unknown>;

  /** 关联生成任务 / 上架记录的 ref id（uuid 或字符串） */
  @Column({ type: 'varchar', length: 120, nullable: true })
  sourceRefId: string | null;

  /** 修订版本 */
  @Column({ type: 'integer', default: 1 })
  version: number;

  /** 是否被标记下架（DMCA 等） */
  @Column({ type: 'boolean', default: false })
  retired: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
