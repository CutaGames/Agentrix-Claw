import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PartnerAppUsage — daily usage roll-up per (partnerAppId, day).
 * day stored as 'YYYY-MM-DD' string for cheap GROUP BY.
 */
@Entity('partner_app_usage')
@Index(['partnerAppId', 'day'], { unique: true })
@Index(['day'])
export class PartnerAppUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  partnerAppId: string;

  @Column({ type: 'varchar', length: 10 })
  day: string;

  @Column({ type: 'integer', default: 0 })
  calls: number;

  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  costUsd: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
