import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type DmcaStatus = 'pending' | 'reviewing' | 'upheld' | 'rejected' | 'withdrawn';
export type DmcaTargetKind = 'pet_skin' | 'pet_soul_template' | 'marketplace_listing' | 'other';

/**
 * DmcaReport — Phase 2 W2 BE-T2.9 / BE-T3.4 / SC-T3.3
 *
 * 用户提交的版权 / 商标侵权举报。每条举报触发：
 *  1. ModerationLog 写入（kind='dmca_signal'，对应 PetSkin.isDelistedForDmca）
 *  2. 48h SLA 计时
 *  3. 假信号惩罚：claimant 滥用 → 限流（W3）
 *
 * 设计约束：
 *  - 不直接 cascade 删除目标资产；由人工审核后调用 PetSkinService.delist(skinId)
 *  - 同一 claimant 对同一 targetId 7 天内重复举报 → 自动 reject
 */
@Entity('dmca_reports')
@Index('idx_dmca_target', ['targetKind', 'targetId'])
@Index('idx_dmca_claimant_time', ['claimantUserId', 'createdAt'])
export class DmcaReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 举报人用户 ID（必填，匿名举报先创建占位用户） */
  @Column({ type: 'uuid' })
  claimantUserId: string;

  /** 举报对象类型 */
  @Column({ type: 'varchar', length: 32 })
  targetKind: DmcaTargetKind;

  /** 举报对象 ID（pet_skin.id / pet_soul_template.id / marketplace_listing.id） */
  @Column({ type: 'uuid' })
  targetId: string;

  /** 创作者 / 上传者 user_id（quick lookup，去 join） */
  @Column({ type: 'uuid', nullable: true })
  uploaderUserId: string | null;

  /** 主张的权利类型：copyright / trademark / right_of_publicity / other */
  @Column({ type: 'varchar', length: 32, default: 'copyright' })
  rightType: string;

  /** 完整描述（自由文本，最大 4KB） */
  @Column({ type: 'text' })
  description: string;

  /** 证据 URL（可选，如原始作品链接） */
  @Column({ type: 'jsonb', nullable: true })
  evidenceUrls: string[] | null;

  /** 举报人联系方式（邮箱，DMCA 法律要求） */
  @Column({ type: 'varchar', length: 320 })
  claimantEmail: string;

  /** 是否已宣誓真实性（DMCA 法律要求） */
  @Column({ type: 'boolean', default: false })
  swornStatement: boolean;

  /** 处理状态 */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: DmcaStatus;

  /** 审核员 user_id（解决后填） */
  @Column({ type: 'uuid', nullable: true })
  reviewerUserId: string | null;

  /** 审核备注 */
  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  /** 解决时间 */
  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  /** 是否被识别为假信号（用于 W3 惩罚） */
  @Column({ type: 'boolean', default: false })
  flaggedFalse: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
