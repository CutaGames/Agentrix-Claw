import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RiskAssessment {
  riskScore: number; // 0-100, 100为最高风险
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  recommendation: 'allow' | 'review' | 'block';
  details?: Record<string, any>;
}

export interface DeviceFingerprint {
  ip: string;
  userAgent: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  fingerprint: string;
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);
  private blacklist: Set<string> = new Set();
  private deviceFingerprints: Map<string, DeviceFingerprint> = new Map();

  constructor(private configService: ConfigService) {
    this.loadBlacklist();
  }

  /**
   * 评估支付风险
   */
  async assessRisk(params: {
    userId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    deviceFingerprint?: DeviceFingerprint;
    ip?: string;
    recipient?: string;
    metadata?: Record<string, any>;
  }): Promise<RiskAssessment> {
    const factors: string[] = [];
    let riskScore = 0;

    // 1. 检查黑名单
    if (params.ip && this.blacklist.has(params.ip)) {
      factors.push('IP在黑名单中');
      riskScore += 50;
    }

    if (params.recipient && this.blacklist.has(params.recipient.toLowerCase())) {
      factors.push('收款地址在黑名单中');
      riskScore += 40;
    }

    // 2. 检查高风险金额
    if (params.amount > 10000) {
      factors.push('金额超过高风险阈值');
      riskScore += 20;
    }

    // 3. 检查设备指纹
    if (params.deviceFingerprint) {
      const fingerprint = this.deviceFingerprints.get(params.deviceFingerprint.fingerprint);
      if (fingerprint && fingerprint.ip !== params.ip) {
        factors.push('设备指纹异常');
        riskScore += 15;
      }
    }

    // 4. 检查频率限制（简化实现）
    const recentPayments = this.getRecentPaymentsCount(params.userId);
    if (recentPayments > 10) {
      factors.push('支付频率过高');
      riskScore += 10;
    }

    // 5. 检查链上地址风险（如果有）
    if (params.metadata?.onChainAddress) {
      const addressRisk = await this.getAddressRiskScore(params.metadata.onChainAddress);
      if (addressRisk > 50) {
        factors.push('链上地址风险评分高');
        riskScore += addressRisk * 0.3;
      }
    }

    // 确定风险等级
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    let recommendation: 'allow' | 'review' | 'block';

    if (riskScore < 30) {
      riskLevel = 'low';
      recommendation = 'allow';
    } else if (riskScore < 60) {
      riskLevel = 'medium';
      recommendation = 'review';
    } else if (riskScore < 80) {
      riskLevel = 'high';
      recommendation = 'review';
    } else {
      riskLevel = 'critical';
      recommendation = 'block';
    }

    return {
      riskScore: Math.min(100, Math.round(riskScore)),
      riskLevel,
      factors,
      recommendation,
      details: {
        amount: params.amount,
        currency: params.currency,
        paymentMethod: params.paymentMethod,
      },
    };
  }

  /**
   * 检查IP是否在黑名单中
   */
  async checkBlacklist(ip: string): Promise<boolean> {
    return this.blacklist.has(ip);
  }

  /**
   * 添加IP到黑名单
   */
  async addToBlacklist(ip: string, reason?: string): Promise<void> {
    this.blacklist.add(ip);
    this.logger.log(`IP ${ip} 已添加到黑名单，原因: ${reason || '未知'}`);
  }

  /**
   * 检查频率限制
   */
  async checkFrequencyLimit(
    userId: string,
    agentId: string,
    timeWindow: number = 60 * 1000, // 1分钟
    maxRequests: number = 10,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `${userId}:${agentId}`;
    const recentCount = this.getRecentPaymentsCount(userId);
    
    return {
      allowed: recentCount < maxRequests,
      remaining: Math.max(0, maxRequests - recentCount),
    };
  }

  /**
   * 获取链上地址风险评分
   */
  async getAddressRiskScore(address: string): Promise<number> {
    // 这里应该调用链上分析服务（如Chainalysis、Elliptic等）
    // 暂时使用模拟实现
    const suspiciousPatterns = ['0x0000', '0x1111', '0xdead'];
    const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
      address.toLowerCase().includes(pattern)
    );

    if (hasSuspiciousPattern) {
      return 70;
    }

    // 模拟风险评分
    return Math.random() * 30; // 0-30之间的随机值
  }

  /**
   * 获取设备指纹
   */
  generateDeviceFingerprint(data: {
    ip: string;
    userAgent: string;
    screenResolution?: string;
    timezone?: string;
    language?: string;
  }): DeviceFingerprint {
    // 生成设备指纹（简化实现）
    const fingerprint = Buffer.from(
      `${data.ip}-${data.userAgent}-${data.screenResolution || ''}-${data.timezone || ''}`
    ).toString('base64');

    return {
      ...data,
      fingerprint,
    };
  }

  /**
   * 加载黑名单
   */
  private loadBlacklist(): void {
    // 这里应该从数据库或文件加载黑名单
    // 暂时使用空列表
    this.logger.log('黑名单已加载');
  }

  /**
   * 获取最近支付次数（简化实现）
   */
  private getRecentPaymentsCount(userId: string): number {
    // 这里应该从数据库查询
    // 暂时返回随机值
    return Math.floor(Math.random() * 5);
  }
}

