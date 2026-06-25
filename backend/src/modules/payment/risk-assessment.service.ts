import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { Payment, PaymentMethod, PaymentStatus } from '../../entities/payment.entity';
import { User, KYCLevel } from '../../entities/user.entity';
import { RiskAssessment as RiskAssessmentEntity } from '../../entities/risk-assessment.entity';
import { v4 as uuidv4 } from 'uuid';

export interface RiskFactor {
  name: string;
  score: number; // 0-100
  weight: number; // 权重 0-1
  description: string;
}

export interface RiskAssessment {
  riskScore: number; // 综合风险评分 0-100
  riskLevel: 'low' | 'medium' | 'high'; // 风险等级
  riskFactors: RiskFactor[];
  decision: 'approve' | 'review' | 'reject'; // 决策
  metadata?: Record<string, any>; // 元数据
  recommendation?: string; // 建议
}

@Injectable()
export class RiskAssessmentService {
  private readonly logger = new Logger(RiskAssessmentService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RiskAssessmentEntity)
    private riskAssessmentRepository: Repository<RiskAssessmentEntity>,
  ) {}

  /**
   * 评估交易风险
   */
  async assessRisk(
    userId: string | undefined,
    amount: number,
    paymentMethod: PaymentMethod | string,
    metadata?: any,
  ): Promise<RiskAssessment> {
    const riskFactors: RiskFactor[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // 1. 金额风险（大额交易风险高）
    const amountRisk = this.assessAmountRisk(amount);
    riskFactors.push({
      name: '金额风险',
      score: amountRisk.score,
      weight: 0.3,
      description: amountRisk.description,
    });
    totalScore += amountRisk.score * 0.3;
    totalWeight += 0.3;

    // 2. 频率风险（高频交易风险高）
    const frequencyRisk = await this.assessFrequencyRisk(userId);
    riskFactors.push({
      name: '频率风险',
      score: frequencyRisk.score,
      weight: 0.2,
      description: frequencyRisk.description,
    });
    totalScore += frequencyRisk.score * 0.2;
    totalWeight += 0.2;

    // 3. KYC风险（未KYC风险高）
    const kycRisk = await this.assessKYCRisk(userId);
    riskFactors.push({
      name: 'KYC风险',
      score: kycRisk.score,
      weight: 0.25,
      description: kycRisk.description,
    });
    totalScore += kycRisk.score * 0.25;
    totalWeight += 0.25;

    // 4. 历史风险（历史异常交易风险高）
    const historyRisk = await this.assessHistoryRisk(userId);
    riskFactors.push({
      name: '历史风险',
      score: historyRisk.score,
      weight: 0.15,
      description: historyRisk.description,
    });
    totalScore += historyRisk.score * 0.15;
    totalWeight += 0.15;

    // 5. IP/设备风险（异常IP风险高）
    const ipRisk = this.assessIPRisk(metadata?.ipAddress, metadata?.deviceFingerprint);
    riskFactors.push({
      name: 'IP/设备风险',
      score: ipRisk.score,
      weight: 0.1,
      description: ipRisk.description,
    });
    totalScore += ipRisk.score * 0.1;
    totalWeight += 0.1;

    // 计算综合风险评分
    const riskScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // 确定风险等级
    let riskLevel: 'low' | 'medium' | 'high';
    let decision: 'approve' | 'review' | 'reject';
    let recommendation: string;

    if (riskScore < 30) {
      riskLevel = 'low';
      decision = 'approve';
      recommendation = '风险较低，可以自动通过';
    } else if (riskScore < 70) {
      riskLevel = 'medium';
      decision = 'review';
      recommendation = '风险中等，建议二次确认或人工审核';
    } else {
      riskLevel = 'high';
      decision = 'reject';
      recommendation = '风险较高，建议拒绝或需要额外验证';
    }

    const result: RiskAssessment = {
      riskScore: Math.round(riskScore * 100) / 100,
      riskLevel,
      riskFactors,
      decision,
      recommendation,
      metadata: {
        userId,
        amount,
        paymentMethod,
        ...metadata,
      },
    };

    return result;
  }

  /**
   * 评估金额风险
   */
  private assessAmountRisk(amount: number): { score: number; description: string } {
    // 金额越大，风险越高
    if (amount < 100) {
      return { score: 10, description: '小额交易，风险很低' };
    } else if (amount < 1000) {
      return { score: 30, description: '中等金额，风险较低' };
    } else if (amount < 10000) {
      return { score: 60, description: '大额交易，风险中等' };
    } else {
      return { score: 90, description: '超大额交易，风险很高' };
    }
  }

  /**
   * 评估频率风险
   */
  private async assessFrequencyRisk(userId: string | undefined): Promise<{ score: number; description: string }> {
    if (!userId) {
      return { score: 50, description: '匿名用户，无法评估频率风险' };
    }
    // 查询最近1小时的交易次数
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentPayments = await this.paymentRepository.count({
      where: {
        userId,
        createdAt: MoreThanOrEqual(oneHourAgo),
      },
    });

    if (recentPayments === 0) {
      return { score: 10, description: '无近期交易，风险很低' };
    } else if (recentPayments < 3) {
      return { score: 30, description: '交易频率正常，风险较低' };
    } else if (recentPayments < 10) {
      return { score: 60, description: '交易频率较高，风险中等' };
    } else {
      return { score: 90, description: '交易频率异常高，风险很高' };
    }
  }

  /**
   * 评估KYC风险
   */
  private async assessKYCRisk(userId: string | undefined): Promise<{ score: number; description: string }> {
    if (!userId) {
      return { score: 80, description: '匿名用户，未进行KYC' };
    }
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'kycLevel', 'kycStatus'],
    });

    if (!user) {
      return { score: 100, description: '用户不存在，风险极高' };
    }

    if (user.kycStatus === 'verified' && user.kycLevel === KYCLevel.VERIFIED) {
      return { score: 10, description: 'KYC已认证，风险很低' };
    } else if (user.kycStatus === 'verified' && user.kycLevel === KYCLevel.BASIC) {
      return { score: 40, description: 'KYC基础认证，风险较低' };
    } else if (user.kycStatus === 'pending') {
      return { score: 70, description: 'KYC待审核，风险中等' };
    } else {
      return { score: 90, description: 'KYC未认证，风险很高' };
    }
  }

  /**
   * 评估历史风险
   */
  private async assessHistoryRisk(userId: string | undefined): Promise<{ score: number; description: string }> {
    if (!userId) {
      return { score: 50, description: '匿名用户，无历史记录' };
    }
    // 查询用户历史交易
    const totalPayments = await this.paymentRepository.count({
      where: { userId },
    });

    // 查询失败/退款交易数
    const failedPayments = await this.paymentRepository.count({
      where: {
        userId,
        status: In([PaymentStatus.FAILED, PaymentStatus.REFUNDED]),
      },
    });

    if (totalPayments === 0) {
      return { score: 50, description: '新用户，无历史记录' };
    }

    const failureRate = failedPayments / totalPayments;

    if (failureRate < 0.05) {
      return { score: 20, description: '历史交易良好，风险很低' };
    } else if (failureRate < 0.2) {
      return { score: 50, description: '历史交易一般，风险中等' };
    } else {
      return { score: 80, description: '历史交易异常，风险很高' };
    }
  }

  /**
   * 评估IP/设备风险
   */
  private assessIPRisk(ipAddress?: string, deviceFingerprint?: string): { score: number; description: string } {
    // 简化处理，实际应该检查：
    // 1. IP是否在黑名单
    // 2. IP是否频繁变化
    // 3. 设备指纹是否异常
    // 4. IP地理位置是否异常

    if (!ipAddress) {
      return { score: 30, description: 'IP信息缺失，风险较低' };
    }

    // 这里简化处理，实际应该调用风控服务
    return { score: 30, description: 'IP/设备信息正常，风险较低' };
  }

  /**
   * 记录风险评估结果
   */
  async recordRiskAssessment(
    paymentId: string,
    assessment: RiskAssessment,
  ): Promise<RiskAssessmentEntity> {
    const riskAssessment = this.riskAssessmentRepository.create({
      paymentId,
      userId: assessment.metadata?.userId,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel as any,
      decision: assessment.decision as any,
      riskFactors: assessment.riskFactors,
      recommendation: assessment.recommendation,
      metadata: assessment.metadata || {},
    });

    return await this.riskAssessmentRepository.save(riskAssessment);
  }
}

