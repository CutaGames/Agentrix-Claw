import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, KYCLevel } from '../../entities/user.entity';
import { ConfigService } from '@nestjs/config';

export interface KYCRequest {
  userId: string;
  type: 'individual' | 'merchant';
  documents: {
    idCard?: string; // 身份证照片URL
    passport?: string; // 护照照片URL
    businessLicense?: string; // 营业执照URL（商户）
    addressProof?: string; // 地址证明URL
  };
  personalInfo?: {
    name: string;
    idNumber: string;
    address: string;
    phone: string;
  };
  businessInfo?: {
    companyName: string;
    registrationNumber: string;
    address: string;
    legalRepresentative: string;
  };
}

export interface KYCStatus {
  userId: string;
  level: KYCLevel;
  status: 'none' | 'pending' | 'approved' | 'rejected';
  provider?: string;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectionReason?: string;
}

@Injectable()
export class KYCService {
  private readonly logger = new Logger(KYCService.name);
  private kycProviders: string[] = ['sumsub', 'jumio', 'onfido'];

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {}

  /**
   * 创建KYC申请
   */
  async createKYC(request: KYCRequest): Promise<KYCStatus> {
    const user = await this.userRepository.findOne({
      where: { id: request.userId },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    // 选择KYC Provider（简化实现）
    const provider = this.selectKYCProvider(request.type);

    // 提交到KYC Provider（这里应该调用实际的KYC API）
    try {
      // 模拟KYC提交
      const kycResult = await this.submitToKYCProvider(provider, request);

      // 更新用户KYC状态
      user.kycLevel = KYCLevel.BASIC;
      user.kycStatus = 'pending';
      await this.userRepository.save(user);

      return {
        userId: user.id,
        level: KYCLevel.BASIC,
        status: 'pending',
        provider,
        submittedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('KYC提交失败:', error);
      throw new BadRequestException('KYC提交失败，请重试');
    }
  }

  /**
   * 获取KYC状态
   */
  async getKYCStatus(userId: string): Promise<KYCStatus> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    return {
      userId: user.id,
      level: user.kycLevel,
      status: user.kycStatus as any,
    };
  }

  /**
   * 执行KYT检查（Know Your Transaction）
   */
  async performKYT(params: {
    transactionHash: string;
    fromAddress: string;
    toAddress: string;
    amount: number;
    currency: string;
  }): Promise<{
    riskScore: number;
    riskLevel: 'low' | 'medium' | 'high';
    flags: string[];
  }> {
    // 这里应该调用链上分析服务（如Chainalysis、Elliptic等）
    // 暂时使用模拟实现
    const flags: string[] = [];
    let riskScore = 0;

    // 检查地址是否在制裁名单中（模拟）
    const sanctionedAddresses = ['0x0000000000000000000000000000000000000000'];
    if (sanctionedAddresses.includes(params.fromAddress.toLowerCase()) ||
        sanctionedAddresses.includes(params.toAddress.toLowerCase())) {
      flags.push('地址在制裁名单中');
      riskScore += 80;
    }

    // 检查金额是否异常
    if (params.amount > 100000) {
      flags.push('交易金额异常大');
      riskScore += 20;
    }

    const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high';

    return {
      riskScore,
      riskLevel,
      flags,
    };
  }

  /**
   * 获取交易限额
   */
  async getTransactionLimits(userId: string): Promise<{
    dailyLimit: number;
    monthlyLimit: number;
    singleLimit: number;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    // 根据KYC级别设置限额
    const limits: Record<KYCLevel, { dailyLimit: number; monthlyLimit: number; singleLimit: number }> = {
      [KYCLevel.NONE]: {
        dailyLimit: 1000,
        monthlyLimit: 5000,
        singleLimit: 100,
      },
      [KYCLevel.BASIC]: {
        dailyLimit: 10000,
        monthlyLimit: 50000,
        singleLimit: 1000,
      },
      [KYCLevel.VERIFIED]: {
        dailyLimit: 100000,
        monthlyLimit: 500000,
        singleLimit: 10000,
      },
    };

    return limits[user.kycLevel] || limits[KYCLevel.NONE];
  }

  /**
   * 创建商户KYB（Know Your Business）
   */
  async createMerchantKYB(params: {
    merchantId: string;
    companyName: string;
    registrationNumber: string;
    businessLicense: string;
    legalRepresentative: string;
    address: string;
  }): Promise<any> {
    // 这里应该调用KYB Provider API
    // 暂时使用模拟实现
    this.logger.log(`创建商户KYB: ${params.companyName}`);

    return {
      merchantId: params.merchantId,
      status: 'pending',
      submittedAt: new Date(),
    };
  }

  /**
   * 选择KYC Provider
   */
  private selectKYCProvider(type: 'individual' | 'merchant'): string {
    // 根据类型选择Provider
    if (type === 'merchant') {
      return 'sumsub'; // Sumsub支持企业KYC
    }
    return this.kycProviders[0]; // 默认使用第一个
  }

  /**
   * 提交到KYC Provider
   */
  private async submitToKYCProvider(provider: string, request: KYCRequest): Promise<any> {
    // 这里应该调用实际的KYC Provider API
    // 暂时使用模拟实现
    this.logger.log(`提交KYC到 ${provider}`);
    
    return {
      provider,
      status: 'pending',
      requestId: `kyc_${Date.now()}`,
    };
  }
}

