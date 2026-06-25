import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * PetDiaryEntry — Phase C / C-7
 *
 * One row per (user, calendar day in Asia/Shanghai). Stores the
 * pre-rendered "one-sentence diary" so subsequent reads are O(1) and the
 * same user sees the same line all day.
 *
 * Indexed on (userId, dateKey) unique → upsert friendly.
 */
@Entity('pet_diary')
@Index(['userId', 'dateKey'], { unique: true })
export class PetDiaryEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** YYYY-MM-DD in Asia/Shanghai timezone. */
  @Column({ type: 'varchar', length: 10 })
  dateKey: string;

  /** Snapshot of pet emotion at generation time. */
  @Column({ type: 'varchar', length: 32 })
  emotion: string;

  /** Snapshot of intimacy level at generation time. */
  @Column({ type: 'smallint' })
  intimacyLevel: number;

  /** Rendered Chinese text. */
  @Column({ type: 'text' })
  textZh: string;

  /** Rendered English text. */
  @Column({ type: 'text' })
  textEn: string;

  /** Generation timestamp (epoch ms). Bigint because columns >= 2038-aware. */
  @Column({ type: 'bigint' })
  generatedAt: string;

  // ── P-9 wave 13 — Mood_Diary_Push tracking ────────────────────────
  /** Last time the diary was viewed by user (mood-diary deeplink). */
  @Column({ type: 'timestamptz', nullable: true })
  lastViewedAt: Date | null;

  /** Last time we successfully sent a push for this diary. */
  @Column({ type: 'timestamptz', nullable: true })
  lastPushedAt: Date | null;

  /** Counter of consecutive pushes without a view. ≥7 → weekly backoff. */
  @Column({ type: 'smallint', default: 0 })
  consecutivePushMisses: number;

  @CreateDateColumn()
  createdAt: Date;
}
