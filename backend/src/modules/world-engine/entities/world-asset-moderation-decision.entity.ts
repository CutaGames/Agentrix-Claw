import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * WorldAssetModerationDecision — 内容审核决策记录（design §11）。
 *
 * 记录每次审核管线阶段的决策结果，用于合规审计。
 * 12 个月留存，由 ttl-cleanup-job 定期清理过期记录（R12.8）。
 */
@Entity('world_asset_moderation_decisions')
@Index(['worldAssetId'])
export class WorldAssetModerationDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The WorldAsset being moderated (FK → world_assets.id) */
  @Column()
  worldAssetId: string;

  /** Which stage of the moderation pipeline produced this decision */
  @Column({
    type: 'enum',
    enum: [
      'pre_upload_face',
      'pre_upload_copyright',
      'post_gen_words',
      'pre_listing',
      'post_publish_report',
    ],
  })
  stage: string;

  /** The decision outcome */
  @Column({ type: 'enum', enum: ['approved', 'rejected', 'pending'] })
  decision: string;

  /** Human-readable reason for the decision */
  @Column({ nullable: true })
  reason: string | null;

  /** ID of the human reviewer (null for automated decisions) */
  @Column({ nullable: true })
  reviewerId: string | null;

  /** Automated confidence score from the classifier (0.0-1.0) */
  @Column({ type: 'float', nullable: true })
  automatedScore: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
