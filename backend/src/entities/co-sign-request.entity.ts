import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('co_sign_requests')
@Index(['initiatorUserId', 'status'])
@Index(['expiresAtMs'])
export class CoSignRequestEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'uuid' })
  initiatorUserId: string;

  @Column({ type: 'varchar', length: 16 })
  actionKind: string;

  @Column({ type: 'varchar', length: 255 })
  resource: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ type: 'integer' })
  requiredSignatures: number;

  @Column({ type: 'jsonb' })
  requiredSurfaces: string[];

  @Column({ type: 'jsonb' })
  signatures: Array<{ surface: string; device_id?: string; ts: number; method?: string }>;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint' })
  expiresAtMs: string;

  @Column({ type: 'bigint', nullable: true })
  finalizedAtMs?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
