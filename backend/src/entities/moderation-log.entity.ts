import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * ModerationLog — Phase 2 W1 内容审核审计表
 *
 * PRD: docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §5 BE-T2.6 / 2.7 / 2.10
 *
 * 设计：
 *  - 每次 prompt / image 审核（包括通过 / 拒绝）都落一行
 *  - decision: 'allow' | 'deny' | 'review'（review 进人工队列）
 *  - kind: 'prompt' | 'image' | 'glb' | 'vrm' | 'rive'
 *  - score: 综合分（CLIP / 关键词加权），> 0.85 拒绝
 *  - reason: 简短代码，如 'nsfw_keyword' / 'clip_nsfw' / 'ip_match' / 'dmca_signal'
 */
@Entity('moderation_logs')
@Index(['userId', 'createdAt'])
@Index(['decision', 'createdAt'])
@Index(['kind'])
export class ModerationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: 'prompt' | 'image' | 'glb' | 'vrm' | 'rive';

  @Column({ type: 'varchar', length: 16 })
  decision: 'allow' | 'deny' | 'review';

  @Column({ type: 'numeric', precision: 4, scale: 3, default: 0 })
  score: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reason: string | null;

  /** sha256 of the input (prompt text 或 image bytes) — 不存原始内容 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  inputHash: string | null;

  /** 引用：generation task / skin id / report id 等 */
  @Column({ type: 'varchar', length: 120, nullable: true })
  refId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  detail: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
