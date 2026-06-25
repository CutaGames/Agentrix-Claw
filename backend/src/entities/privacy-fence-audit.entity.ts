import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('privacy_fence_audit_logs')
@Index(['tsMs'])
@Index(['actor'])
export class PrivacyFenceAuditEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'bigint' })
  tsMs: string;

  @Column({ type: 'varchar', length: 64 })
  actor: string;

  @Column({ type: 'varchar', length: 16 })
  action: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  itemId?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  target?: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  category?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
