import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * PartnerInquiry — captured submissions from /hardware partner form
 * (Phase 5 WB-12.1). Reviewed manually by @bd; downstream CRM integration
 * is a P1 follow-up.
 */
@Entity('partner_inquiries')
@Index(['createdAt'])
export class PartnerInquiry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 120 })
  email: string;

  @Column({ type: 'varchar', length: 120 })
  company: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  expectedVolume: string | null;

  @Column({ type: 'varchar', length: 32, default: 'new' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
