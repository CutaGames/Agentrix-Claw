import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('family_invitations')
@Index(['familyId', 'status'])
@Index(['code'], { unique: true })
export class FamilyInvitationEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  familyId: string;

  @Column({ type: 'uuid' })
  invitedByUserId: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  inviteeEmail?: string | null;

  @Column({ type: 'uuid', nullable: true })
  inviteeUserId?: string | null;

  @Column({ type: 'varchar', length: 16 })
  proposedRole: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'varchar', length: 16 })
  code: string;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint' })
  expiresAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
