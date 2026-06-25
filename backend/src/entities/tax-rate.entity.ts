import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('tax_rates')
@Index(['countryCode', 'regionCode', 'taxType', 'effectiveDate'], { unique: true })
@Index(['countryCode'])
@Index(['regionCode'])
@Index(['taxType'])
export class TaxRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 2 })
  countryCode: string;

  @Column({ length: 10, nullable: true })
  regionCode: string;

  @Column({ length: 20 })
  taxType: string; // 'VAT', 'GST', 'SALES_TAX'

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  rate: number;

  @Column({ type: 'date' })
  effectiveDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

