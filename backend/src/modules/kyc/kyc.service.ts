import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KYCRecord, KYCRecordStatus, KYCRecordLevel, DocumentType } from '../../entities/kyc-record.entity';

/**
 * 提交 KYC 申请 DTO
 */
export interface SubmitKYCDto {
  userId: string;
  level: KYCRecordLevel;
  fullName?: string;
  dateOfBirth?: Date;
  nationality?: string;
  countryCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  documentType?: DocumentType;
  documentNumber?: string;
  documents?: {
    type: DocumentType;
    url: string;
    uploadedAt?: Date;
  }[];
  metadata?: Record<string, any>;
}

/**
 * 审核 KYC DTO
 */
export interface ReviewKYCDto {
  status: KYCRecordStatus.APPROVED | KYCRecordStatus.REJECTED;
  reviewNotes?: string;
  rejectionReason?: string;
  expiresAt?: Date;
}

@Injectable()
export class KYCService {
  constructor(
    @InjectRepository(KYCRecord)
    private kycRepository: Repository<KYCRecord>,
  ) {}

  /**
   * 提交 KYC 申请
   */
  async submit(dto: SubmitKYCDto): Promise<KYCRecord> {
    // 检查是否有进行中的申请
    const pendingRecord = await this.kycRepository.findOne({
      where: {
        userId: dto.userId,
        status: KYCRecordStatus.PENDING,
      },
    });

    if (pendingRecord) {
      throw new BadRequestException('已有进行中的 KYC 申请');
    }

    // 检查是否已有同级别或更高级别的有效认证
    const existingRecord = await this.kycRepository.findOne({
      where: {
        userId: dto.userId,
        status: KYCRecordStatus.APPROVED,
      },
    });

    if (existingRecord && this.compareLevels(existingRecord.level, dto.level) >= 0) {
      if (!existingRecord.expiresAt || existingRecord.expiresAt > new Date()) {
        throw new BadRequestException('已有同级别或更高级别的有效 KYC 认证');
      }
    }

    const kycRecord = this.kycRepository.create({
      userId: dto.userId,
      level: dto.level,
      status: KYCRecordStatus.PENDING,
      fullName: dto.fullName,
      dateOfBirth: dto.dateOfBirth,
      nationality: dto.nationality,
      countryCode: dto.countryCode,
      address: dto.address,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      documents: dto.documents?.map(doc => ({
        ...doc,
        uploadedAt: doc.uploadedAt || new Date(),
      })),
      metadata: {
        ...dto.metadata,
        submittedAt: new Date(),
      },
    });

    return this.kycRepository.save(kycRecord);
  }

  /**
   * 比较 KYC 级别
   */
  private compareLevels(level1: KYCRecordLevel, level2: KYCRecordLevel): number {
    const order = [
      KYCRecordLevel.BASIC,
      KYCRecordLevel.STANDARD,
      KYCRecordLevel.ADVANCED,
      KYCRecordLevel.ENTERPRISE,
    ];
    return order.indexOf(level1) - order.indexOf(level2);
  }

  /**
   * 根据 ID 查找 KYC 记录
   */
  async findById(id: string): Promise<KYCRecord> {
    const record = await this.kycRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('KYC 记录不存在');
    }
    return record;
  }

  /**
   * 获取用户的 KYC 记录列表
   */
  async findByUser(userId: string): Promise<KYCRecord[]> {
    return this.kycRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取用户当前有效的 KYC 认证
   */
  async getActiveKYC(userId: string): Promise<KYCRecord | null> {
    const records = await this.kycRepository.find({
      where: {
        userId,
        status: KYCRecordStatus.APPROVED,
      },
      order: { level: 'DESC', createdAt: 'DESC' },
    });

    // 返回最高级别且未过期的认证
    for (const record of records) {
      if (!record.expiresAt || record.expiresAt > new Date()) {
        return record;
      }
    }

    return null;
  }

  /**
   * 检查用户是否满足 KYC 级别要求
   */
  async checkKYCLevel(userId: string, requiredLevel: KYCRecordLevel): Promise<boolean> {
    const activeKYC = await this.getActiveKYC(userId);
    if (!activeKYC) return false;

    return this.compareLevels(activeKYC.level, requiredLevel) >= 0;
  }

  /**
   * 开始审核
   */
  async startReview(id: string, reviewerId: string): Promise<KYCRecord> {
    const record = await this.findById(id);

    if (record.status !== KYCRecordStatus.PENDING) {
      throw new BadRequestException('只能审核待处理的 KYC 申请');
    }

    record.status = KYCRecordStatus.IN_REVIEW;
    record.reviewedBy = reviewerId;

    return this.kycRepository.save(record);
  }

  /**
   * 请求补充材料
   */
  async requestAdditionalInfo(id: string, requiredInfo: string[]): Promise<KYCRecord> {
    const record = await this.findById(id);

    if (record.status !== KYCRecordStatus.IN_REVIEW) {
      throw new BadRequestException('只有审核中的申请可以请求补充材料');
    }

    record.status = KYCRecordStatus.RESUBMIT;
    if (!record.metadata) record.metadata = {};
    record.metadata.requiredInfo = requiredInfo;
    record.metadata.infoRequestedAt = new Date();

    return this.kycRepository.save(record);
  }

  /**
   * 提交补充材料
   */
  async submitAdditionalInfo(id: string, additionalDocs: { type: DocumentType; url: string }[]): Promise<KYCRecord> {
    const record = await this.findById(id);

    if (record.status !== KYCRecordStatus.RESUBMIT) {
      throw new BadRequestException('当前状态不允许提交补充材料');
    }

    // 添加新文档
    if (!record.documents) record.documents = [];
    record.documents.push(...additionalDocs.map(doc => ({
      ...doc,
      uploadedAt: new Date(),
    })));

    record.status = KYCRecordStatus.IN_REVIEW;
    if (!record.metadata) record.metadata = {};
    record.metadata.additionalInfoSubmittedAt = new Date();

    return this.kycRepository.save(record);
  }

  /**
   * 完成审核
   */
  async completeReview(id: string, dto: ReviewKYCDto): Promise<KYCRecord> {
    const record = await this.findById(id);

    if (record.status !== KYCRecordStatus.IN_REVIEW) {
      throw new BadRequestException('只有审核中的申请可以完成审核');
    }

    record.status = dto.status;
    record.reviewNotes = dto.reviewNotes;
    record.reviewedAt = new Date();

    if (dto.status === KYCRecordStatus.APPROVED) {
      record.approvedAt = new Date();
      // 设置过期时间（默认1年）
      record.expiresAt = dto.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else {
      record.rejectionReason = dto.rejectionReason;
    }

    return this.kycRepository.save(record);
  }

  /**
   * 撤销认证（标记为过期）
   */
  async revoke(id: string, reason: string): Promise<KYCRecord> {
    const record = await this.findById(id);

    if (record.status !== KYCRecordStatus.APPROVED) {
      throw new BadRequestException('只能撤销已通过的认证');
    }

    record.status = KYCRecordStatus.EXPIRED;
    if (!record.metadata) record.metadata = {};
    record.metadata.revokedAt = new Date();
    record.metadata.revokeReason = reason;

    return this.kycRepository.save(record);
  }

  /**
   * 取消申请
   */
  async cancel(id: string, userId: string): Promise<KYCRecord> {
    const record = await this.findById(id);

    if (record.userId !== userId) {
      throw new BadRequestException('无权取消此申请');
    }

    if (![KYCRecordStatus.PENDING, KYCRecordStatus.RESUBMIT].includes(record.status)) {
      throw new BadRequestException('当前状态无法取消');
    }

    record.status = KYCRecordStatus.NOT_STARTED;
    if (!record.metadata) record.metadata = {};
    record.metadata.cancelledAt = new Date();

    return this.kycRepository.save(record);
  }

  /**
   * 获取待审核列表（管理员用）
   */
  async getPendingReviews(page = 1, limit = 20): Promise<{ items: KYCRecord[]; total: number }> {
    const [items, total] = await this.kycRepository.findAndCount({
      where: [
        { status: KYCRecordStatus.PENDING },
        { status: KYCRecordStatus.IN_REVIEW },
      ],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'ASC' },
    });
    return { items, total };
  }

  /**
   * 获取即将过期的认证
   */
  async getExpiringRecords(daysBeforeExpiry = 30): Promise<KYCRecord[]> {
    const expiryDate = new Date(Date.now() + daysBeforeExpiry * 24 * 60 * 60 * 1000);
    
    return this.kycRepository.createQueryBuilder('kyc')
      .where('kyc.status = :status', { status: KYCRecordStatus.APPROVED })
      .andWhere('kyc.expiresAt <= :expiryDate', { expiryDate })
      .andWhere('kyc.expiresAt > :now', { now: new Date() })
      .orderBy('kyc.expiresAt', 'ASC')
      .getMany();
  }

  /**
   * 更新风险评分
   */
  async updateRiskScore(id: string, amlScore: number): Promise<KYCRecord> {
    const record = await this.findById(id);

    record.amlRiskScore = amlScore;

    // 记录到元数据中
    if (!record.metadata) record.metadata = {};
    record.metadata.riskAssessment = {
      amlScore,
      assessedAt: new Date(),
    };

    return this.kycRepository.save(record);
  }

  /**
   * 添加审核历史
   */
  async addReviewHistory(id: string, notes: string, reviewerId: string): Promise<KYCRecord> {
    const record = await this.findById(id);

    if (!record.reviewHistory) record.reviewHistory = [];
    record.reviewHistory.push({
      status: record.status,
      notes,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    });

    return this.kycRepository.save(record);
  }

  /**
   * 获取 KYC 统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    byLevel: Record<string, number>;
  }> {
    const total = await this.kycRepository.count();
    const pending = await this.kycRepository.count({
      where: [
        { status: KYCRecordStatus.PENDING },
        { status: KYCRecordStatus.IN_REVIEW },
      ],
    });
    const approved = await this.kycRepository.count({
      where: { status: KYCRecordStatus.APPROVED },
    });
    const rejected = await this.kycRepository.count({
      where: { status: KYCRecordStatus.REJECTED },
    });

    // 按级别统计
    const byLevel: Record<string, number> = {};
    for (const level of Object.values(KYCRecordLevel)) {
      byLevel[level] = await this.kycRepository.count({
        where: { level, status: KYCRecordStatus.APPROVED },
      });
    }

    return { total, pending, approved, rejected, byLevel };
  }
}
