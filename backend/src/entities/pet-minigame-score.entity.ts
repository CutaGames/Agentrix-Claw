import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Pet Phase 6 S5 — 单次游戏得分记录
 */
@Entity({ name: 'pet_minigame_scores' })
@Index(['userId', 'createdAt'])
@Index(['userId', 'gameKey', 'createdAt'])
export class PetMinigameScore {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  /** scratch | feed | code_buddy（与前端常量一致） */
  @Column({ type: 'varchar', length: 32 })
  gameKey!: string;

  @Column({ type: 'integer', default: 0 })
  score!: number;

  @Column({ type: 'integer', default: 0 })
  intimacyXpAwarded!: number;

  @Column({ type: 'integer', default: 0 })
  energyAwarded!: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
