import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('privacy_fence_grants')
@Index(['itemId', 'granteeUserId'])
export class PrivacyFenceGrantEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  itemId: string;

  @Column({ type: 'uuid' })
  granteeUserId: string;

  @Column({ type: 'uuid' })
  grantedByUserId: string;

  @Column({ type: 'bigint' })
  expiresAtMs: string;

  @Column({ type: 'bigint' })
  grantedAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
