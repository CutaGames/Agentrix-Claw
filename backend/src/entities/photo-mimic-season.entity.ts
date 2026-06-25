import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'photo_mimic_seasons' })
@Index(['status'])
@Index(['submitOpenAt'])
export class PhotoMimicSeason {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 48, unique: true })
  themeCode!: string;

  @Column({ type: 'varchar', length: 160 })
  themeTitleEn!: string;

  @Column({ type: 'varchar', length: 160 })
  themeTitleZh!: string;

  @Column({ type: 'text', nullable: true })
  themeDescEn?: string | null;

  @Column({ type: 'text', nullable: true })
  themeDescZh?: string | null;

  @Column({ type: 'timestamptz' })
  submitOpenAt!: Date;

  @Column({ type: 'timestamptz' })
  submitCloseAt!: Date;

  @Column({ type: 'timestamptz' })
  voteCloseAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt?: Date | null;

  @Column({ type: 'bigint', default: '10000' })
  prizePoolAxp!: string;

  @Column({ type: 'uuid', nullable: true })
  championEntryId?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'upcoming' })
  status!: 'upcoming' | 'submitting' | 'voting' | 'settled';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
