import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * KYC 认证状态
 */
export enum KYCRecordStatus {
  NOT_STARTED = 'not_started',   // 未开始
  PENDING = 'pending',           // 待提交
  IN_REVIEW = 'in_review',       // 审核中
  APPROVED = 'approved',         // 已通过
  REJECTED = 'rejected',         // 已拒绝
  EXPIRED = 'expired',           // 已过期
  RESUBMIT = 'resubmit',         // 需重新提交
}

/**
 * KYC 认证等级
 */
export enum KYCRecordLevel {
  BASIC = 'basic',           // 基础认证（邮箱/手机验证）
  STANDARD = 'standard',     // 标准认证（身份证）
  ADVANCED = 'advanced',     // 高级认证（视频认证）
  ENTERPRISE = 'enterprise', // 企业认证
}

/**
 * 证件类型
 */
export enum DocumentType {
  ID_CARD = 'id_card',           // 身份证
  PASSPORT = 'passport',         // 护照
  DRIVER_LICENSE = 'driver_license', // 驾照
  BUSINESS_LICENSE = 'business_license', // 营业执照
  BANK_STATEMENT = 'bank_statement', // 银行流水
  UTILITY_BILL = 'utility_bill', // 水电账单（地址证明）
  OTHER = 'other',
}

/**
 * KYC 认证记录实体
 * 
 * 设计目标：
 * - 完整记录 KYC 认证流程
 * - 支持多等级认证
 * - 支持认证有效期管理
 * - 支持审核流程追踪
 */
@Entity('kyc_records')
@Index(['userId'])
@Index(['status'])
@Index(['level'])
@Index(['expiresAt'])
export class KYCRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 关联用户
   */
  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  /**
   * 认证等级
   */
  @Column({
    type: 'enum',
    enum: KYCRecordLevel,
  })
  level: KYCRecordLevel;

  /**
   * 认证状态
   */
  @Column({
    type: 'enum',
    enum: KYCRecordStatus,
    default: KYCRecordStatus.NOT_STARTED,
  })
  status: KYCRecordStatus;

  // ========== 个人信息 ==========

  /**
   * 真实姓名
   */
  @Column({ nullable: true, length: 100 })
  fullName?: string;

  /**
   * 证件类型
   */
  @Column({ type: 'enum',
    enum: DocumentType,
    nullable: true })
  documentType?: DocumentType;

  /**
   * 证件号码（加密存储）
   */
  @Column({ nullable: true, length: 100 })
  documentNumber?: string;

  /**
   * 出生日期
   */
  @Column({ type: 'date', nullable: true })
  dateOfBirth?: Date;

  /**
   * 国籍
   */
  @Column({ nullable: true, length: 50 })
  nationality?: string;

  /**
   * 居住地址
   */
  @Column({ type: 'text', nullable: true })
  address?: string;

  /**
   * 国家/地区代码
   */
  @Column({ nullable: true, length: 10 })
  countryCode?: string;

  // ========== 证件文档 ==========

  /**
   * 上传的证件文档
   */
  @Column({ type: 'jsonb', nullable: true })
  documents?: Array<{
    type: DocumentType;
    url: string;
    uploadedAt: Date;
    verified?: boolean;
    verifiedAt?: Date;
  }>;

  /**
   * 自拍照 URL（用于人脸比对）
   */
  @Column({ nullable: true, length: 500 })
  selfieUrl?: string;

  // ========== 企业信息（企业认证） ==========

  /**
   * 企业名称
   */
  @Column({ nullable: true, length: 200 })
  companyName?: string;

  /**
   * 企业注册号
   */
  @Column({ nullable: true, length: 100 })
  companyRegistrationNumber?: string;

  /**
   * 企业类型
   */
  @Column({ nullable: true, length: 50 })
  companyType?: string;

  /**
   * 企业信息
   */
  @Column({ type: 'jsonb', nullable: true })
  companyInfo?: {
    registrationDate?: Date;
    registrationCountry?: string;
    taxId?: string;
    industry?: string;
    website?: string;
    annualRevenue?: string;
  };

  // ========== 审核信息 ==========

  /**
   * 审核人 ID
   */
  @Column({ nullable: true })
  reviewedBy?: string;

  /**
   * 审核时间
   */
  @Column({ nullable: true })
  reviewedAt?: Date;

  /**
   * 拒绝原因
   */
  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  /**
   * 审核备注
   */
  @Column({ type: 'text', nullable: true })
  reviewNotes?: string;

  /**
   * 审核历史
   */
  @Column({ type: 'jsonb', nullable: true })
  reviewHistory?: Array<{
    status: KYCRecordStatus;
    reviewedBy: string;
    reviewedAt: Date;
    notes?: string;
  }>;

  // ========== 有效期管理 ==========

  /**
   * 认证通过时间
   */
  @Column({ nullable: true })
  approvedAt?: Date;

  /**
   * 认证过期时间
   */
  @Column({ nullable: true })
  expiresAt?: Date;

  /**
   * 上次提醒时间
   */
  @Column({ nullable: true })
  lastReminderAt?: Date;

  // ========== 第三方验证 ==========

  /**
   * 第三方 KYC 提供商
   */
  @Column({ nullable: true, length: 50 })
  providerName?: string;

  /**
   * 第三方验证 ID
   */
  @Column({ nullable: true, length: 100 })
  providerVerificationId?: string;

  /**
   * 第三方验证结果
   */
  @Column({ type: 'jsonb', nullable: true })
  providerResponse?: Record<string, any>;

  // ========== 风险评分 ==========

  /**
   * AML 风险评分 (0-100)
   */
  @Column('decimal', { name: 'aml_risk_score', precision: 5, scale: 2, nullable: true })
  amlRiskScore?: number;

  /**
   * 制裁检查结果
   */
  @Column({ type: 'jsonb', nullable: true })
  sanctionCheckResult?: {
    checked: boolean;
    checkedAt: Date;
    hits?: any[];
    cleared: boolean;
  };

  // ========== 元数据 ==========

  /**
   * 扩展元数据
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
