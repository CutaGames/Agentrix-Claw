import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * 商户信息实体
 * 存储商户的详细信息，与User实体一对一关联
 */
@Entity('merchant_profiles')
export class MerchantProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @Column({ unique: true })
  userId: string; // 关联到User.id

  @Column()
  businessName: string; // 商户名称

  @Column({ nullable: true })
  businessLicense?: string; // 营业执照号

  @Column({ type: 'text', nullable: true })
  businessDescription?: string; // 商户描述

  @Column({ type: 'jsonb', nullable: true })
  contactInfo: {
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  businessInfo: {
    registrationDate?: Date;
    registrationCountry?: string;
    taxId?: string;
    industry?: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  documents: Array<{
    type: 'license' | 'certificate' | 'other';
    url: string;
    uploadedAt: Date;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

