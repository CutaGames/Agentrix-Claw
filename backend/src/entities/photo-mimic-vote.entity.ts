import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'photo_mimic_votes' })
@Unique('UQ_photo_mimic_vote_once', ['seasonId', 'entryId', 'voterUserId'])
@Index(['voterUserId', 'votedAt'])
export class PhotoMimicVote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  seasonId!: string;

  @Column('uuid')
  entryId!: string;

  @Column('uuid')
  voterUserId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  votedAt!: Date;
}
