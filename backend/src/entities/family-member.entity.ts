import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('family_members')
@Index(['familyId', 'userId'], { unique: true })
@Index(['userId'])
export class FamilyMemberEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  familyId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  role: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  displayName?: string | null;

  @Column({ type: 'bigint' })
  joinedAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
