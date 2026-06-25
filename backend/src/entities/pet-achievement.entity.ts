import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Pet Phase 6 S4 — 成就解锁记录
 *
 * 一行 = 一个用户解锁一个成就。`achievementKey` 与 `PET_ACHIEVEMENTS` 常量对应。
 */
@Entity({ name: 'pet_achievements' })
@Index(['userId', 'achievementKey'], { unique: true })
@Index(['userId', 'unlockedAt'])
export class PetAchievement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  achievementKey!: string;

  /** 解锁时的展示信息快照（label/desc/icon），便于历史 UI 不受常量变更影响。 */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  snapshot!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  unlockedAt!: Date;
}
