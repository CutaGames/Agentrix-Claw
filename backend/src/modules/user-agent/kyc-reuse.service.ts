import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, KYCLevel } from '../../entities/user.entity';
import { KYCService } from '../compliance/kyc.service';

export interface KYCReuseStatus {
  canReuse: boolean;
  kycLevel: KYCLevel;
  kycStatus: string;
  reason?: string;
  merchantKYCRequirement?: {
    required: boolean;
    minLevel: KYCLevel;
  };
}

@Injectable()
export class KYCReuseService {
  private readonly logger = new Logger(KYCReuseService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private kycService: KYCService,
  ) {}

  /**
   * 检查KYC是否可以复用
   */
  async checkKYCReuse(
    userId: string,
    merchantId?: string,
  ): Promise<KYCReuseStatus> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      return {
        canReuse: false,
        kycLevel: KYCLevel.NONE,
        kycStatus: 'none',
        reason: '用户不存在',
      };
    }

    const kycStatus = await this.kycService.getKYCStatus(userId);

    // 如果KYC已通过，可以复用
    if (kycStatus.status === 'approved' && kycStatus.level !== KYCLevel.NONE) {
      return {
        canReuse: true,
        kycLevel: kycStatus.level,
        kycStatus: kycStatus.status,
      };
    }

    // 如果KYC未通过或未提交，不能复用
    return {
      canReuse: false,
      kycLevel: kycStatus.level,
      kycStatus: kycStatus.status,
      reason: kycStatus.status === 'pending' 
        ? 'KYC审核中，请等待审核完成'
        : kycStatus.status === 'rejected'
        ? 'KYC审核未通过，请重新提交'
        : '未完成KYC认证',
    };
  }

  /**
   * 获取用户的KYC状态（用于前端展示）
   */
  async getUserKYCStatus(userId: string) {
    const kycStatus = await this.kycService.getKYCStatus(userId);
    
    return {
      level: kycStatus.level,
      status: kycStatus.status,
      provider: kycStatus.provider,
      submittedAt: kycStatus.submittedAt,
      approvedAt: kycStatus.approvedAt,
      rejectionReason: kycStatus.rejectionReason,
      canReuse: kycStatus.status === 'approved' && kycStatus.level !== KYCLevel.NONE,
    };
  }
}

