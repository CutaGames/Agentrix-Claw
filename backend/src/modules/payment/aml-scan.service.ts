import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';

/**
 * P2: AML (Anti-Money Laundering) 扫描服务
 * 
 * 实现链上地址的 AML 扫描，包括：
 * 1. 制裁名单检查（OFAC, EU, UN）
 * 2. Mixer/Tornado Cash 交互检测
 * 3. 高风险交易所检测
 * 4. 黑名单地址检测
 * 5. 交易模式分析
 */

export enum AMLRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  SEVERE = 'severe',
  BLOCKED = 'blocked',
}

export interface AMLCheckResult {
  address: string;
  riskLevel: AMLRiskLevel;
  riskScore: number; // 0-100
  flags: AMLFlag[];
  recommendations: string[];
  checkTimestamp: Date;
  provider?: string;
  rawResponse?: any;
}

export interface AMLFlag {
  type: AMLFlagType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence?: string;
  source?: string;
}

export enum AMLFlagType {
  SANCTIONS = 'sanctions',
  MIXER = 'mixer',
  DARKNET = 'darknet',
  SCAM = 'scam',
  RANSOMWARE = 'ransomware',
  TERRORIST_FINANCING = 'terrorist_financing',
  HIGH_RISK_EXCHANGE = 'high_risk_exchange',
  UNUSUAL_PATTERN = 'unusual_pattern',
  BLACKLISTED = 'blacklisted',
  PEP = 'politically_exposed_person',
}

export interface BatchCheckResult {
  results: Map<string, AMLCheckResult>;
  totalChecked: number;
  highRiskCount: number;
  blockedCount: number;
}

@Injectable()
export class AmlScanService {
  private readonly logger = new Logger(AmlScanService.name);

  // 已知的高风险地址（示例，生产环境应从数据库或外部 API 获取）
  private readonly KNOWN_MIXER_ADDRESSES = new Set([
    '0x722122df12d4e14e13ac3b6895a86e84145b6967', // Tornado Cash Router
    '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', // Tornado Cash
    '0xa160cdab225685da1d56aa342ad8841c3b53f291', // Tornado Cash ETH
  ]);

  // OFAC 制裁地址（部分示例）
  private readonly OFAC_SANCTIONED_ADDRESSES = new Set([
    '0x8589427373d6d84e98730d7795d8f6f8731fda16', // Tornado Cash (Sanctioned)
    '0xdd4c48c0b24039969fc16d1cdf626eab821d3384', // Tornado Cash (Sanctioned)
  ]);

  // 高风险交易所
  private readonly HIGH_RISK_EXCHANGES = new Set([
    // 这里添加已知的高风险交易所地址
  ]);

  // 本地黑名单
  private localBlacklist: Set<string> = new Set();

  // 缓存检查结果
  private checkCache: Map<string, { result: AMLCheckResult; expiresAt: Date }> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 小时

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.loadBlacklist();
  }

  /**
   * 检查单个地址的 AML 风险
   */
  async checkAddress(address: string, options?: {
    skipCache?: boolean;
    includeTransactionAnalysis?: boolean;
    network?: string;
  }): Promise<AMLCheckResult> {
    const normalizedAddress = address.toLowerCase();
    
    // 检查缓存
    if (!options?.skipCache) {
      const cached = this.checkCache.get(normalizedAddress);
      if (cached && cached.expiresAt > new Date()) {
        return cached.result;
      }
    }

    this.logger.log(`执行 AML 检查: ${normalizedAddress}`);

    const flags: AMLFlag[] = [];
    let riskScore = 0;

    // 1. 制裁名单检查
    if (this.OFAC_SANCTIONED_ADDRESSES.has(normalizedAddress)) {
      flags.push({
        type: AMLFlagType.SANCTIONS,
        severity: 'critical',
        description: 'Address is on OFAC sanctions list',
        source: 'OFAC SDN List',
      });
      riskScore += 100;
    }

    // 2. Mixer 检测
    if (this.KNOWN_MIXER_ADDRESSES.has(normalizedAddress)) {
      flags.push({
        type: AMLFlagType.MIXER,
        severity: 'high',
        description: 'Address is associated with cryptocurrency mixer service',
        source: 'Internal Database',
      });
      riskScore += 80;
    }

    // 3. 本地黑名单检查
    if (this.localBlacklist.has(normalizedAddress)) {
      flags.push({
        type: AMLFlagType.BLACKLISTED,
        severity: 'high',
        description: 'Address is on internal blacklist',
        source: 'Internal Blacklist',
      });
      riskScore += 70;
    }

    // 4. 高风险交易所检查
    if (this.HIGH_RISK_EXCHANGES.has(normalizedAddress)) {
      flags.push({
        type: AMLFlagType.HIGH_RISK_EXCHANGE,
        severity: 'medium',
        description: 'Address belongs to high-risk exchange',
        source: 'Internal Database',
      });
      riskScore += 40;
    }

    // 5. 外部 API 检查（如果配置了）
    const externalResult = await this.checkExternalAPIs(normalizedAddress);
    if (externalResult) {
      flags.push(...externalResult.flags);
      riskScore += externalResult.additionalScore;
    }

    // 6. 链上交易分析（可选）
    if (options?.includeTransactionAnalysis) {
      const txAnalysis = await this.analyzeTransactionHistory(normalizedAddress, options.network);
      if (txAnalysis) {
        flags.push(...txAnalysis.flags);
        riskScore += txAnalysis.additionalScore;
      }
    }

    // 计算最终风险等级
    const riskLevel = this.calculateRiskLevel(riskScore, flags);

    // 生成建议
    const recommendations = this.generateRecommendations(riskLevel, flags);

    const result: AMLCheckResult = {
      address: normalizedAddress,
      riskLevel,
      riskScore: Math.min(riskScore, 100),
      flags,
      recommendations,
      checkTimestamp: new Date(),
      provider: 'agentrix-aml',
    };

    // 缓存结果
    this.checkCache.set(normalizedAddress, {
      result,
      expiresAt: new Date(Date.now() + this.CACHE_TTL),
    });

    return result;
  }

  /**
   * 批量检查多个地址
   */
  async checkAddresses(addresses: string[]): Promise<BatchCheckResult> {
    const results = new Map<string, AMLCheckResult>();
    let highRiskCount = 0;
    let blockedCount = 0;

    // 并行检查（限制并发数）
    const batchSize = 10;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(addr => this.checkAddress(addr)),
      );

      batchResults.forEach((result, index) => {
        results.set(batch[index], result);
        if (result.riskLevel === AMLRiskLevel.HIGH || result.riskLevel === AMLRiskLevel.SEVERE) {
          highRiskCount++;
        }
        if (result.riskLevel === AMLRiskLevel.BLOCKED) {
          blockedCount++;
        }
      });
    }

    return {
      results,
      totalChecked: addresses.length,
      highRiskCount,
      blockedCount,
    };
  }

  /**
   * 检查交易是否可以执行
   */
  async canExecuteTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    currency: string,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    fromCheck: AMLCheckResult;
    toCheck: AMLCheckResult;
  }> {
    const [fromCheck, toCheck] = await Promise.all([
      this.checkAddress(fromAddress),
      this.checkAddress(toAddress),
    ]);

    // 阻止与制裁地址的任何交易
    if (fromCheck.riskLevel === AMLRiskLevel.BLOCKED || toCheck.riskLevel === AMLRiskLevel.BLOCKED) {
      return {
        allowed: false,
        reason: 'Transaction blocked due to sanctions compliance',
        fromCheck,
        toCheck,
      };
    }

    // 高风险地址需要额外审核
    if (fromCheck.riskLevel === AMLRiskLevel.SEVERE || toCheck.riskLevel === AMLRiskLevel.SEVERE) {
      // 大额交易阻止
      if (amount > 10000) {
        return {
          allowed: false,
          reason: 'High-value transaction with severe-risk address requires manual review',
          fromCheck,
          toCheck,
        };
      }
    }

    return {
      allowed: true,
      fromCheck,
      toCheck,
    };
  }

  /**
   * 添加地址到本地黑名单
   */
  addToBlacklist(address: string, reason?: string): void {
    const normalized = address.toLowerCase();
    this.localBlacklist.add(normalized);
    this.logger.warn(`添加地址到黑名单: ${normalized}, 原因: ${reason || 'Not specified'}`);
    
    // 清除缓存
    this.checkCache.delete(normalized);
  }

  /**
   * 从本地黑名单移除地址
   */
  removeFromBlacklist(address: string): boolean {
    const normalized = address.toLowerCase();
    const removed = this.localBlacklist.delete(normalized);
    if (removed) {
      this.logger.log(`从黑名单移除地址: ${normalized}`);
      this.checkCache.delete(normalized);
    }
    return removed;
  }

  /**
   * 获取黑名单
   */
  getBlacklist(): string[] {
    return Array.from(this.localBlacklist);
  }

  // ========== 私有方法 ==========

  private loadBlacklist(): void {
    // 从环境变量加载黑名单
    const blacklistStr = this.configService.get<string>('AML_BLACKLIST') || '';
    if (blacklistStr) {
      const addresses = blacklistStr.split(',').map(a => a.trim().toLowerCase());
      addresses.forEach(addr => {
        if (ethers.isAddress(addr)) {
          this.localBlacklist.add(addr);
        }
      });
      this.logger.log(`加载了 ${this.localBlacklist.size} 个黑名单地址`);
    }
  }

  private async checkExternalAPIs(address: string): Promise<{
    flags: AMLFlag[];
    additionalScore: number;
  } | null> {
    // Chainalysis API（如果配置了）
    const chainalysisApiKey = this.configService.get<string>('CHAINALYSIS_API_KEY');
    if (chainalysisApiKey) {
      try {
        return await this.checkChainalysis(address, chainalysisApiKey);
      } catch (error) {
        this.logger.error(`Chainalysis API 检查失败: ${error.message}`);
      }
    }

    // Elliptic API（如果配置了）
    const ellipticApiKey = this.configService.get<string>('ELLIPTIC_API_KEY');
    if (ellipticApiKey) {
      try {
        return await this.checkElliptic(address, ellipticApiKey);
      } catch (error) {
        this.logger.error(`Elliptic API 检查失败: ${error.message}`);
      }
    }

    return null;
  }

  private async checkChainalysis(address: string, apiKey: string): Promise<{
    flags: AMLFlag[];
    additionalScore: number;
  }> {
    // 示例实现，实际需要调用 Chainalysis API
    // https://docs.chainalysis.com/
    this.logger.debug(`调用 Chainalysis API 检查: ${address}`);
    
    // TODO: 实现实际的 API 调用
    return { flags: [], additionalScore: 0 };
  }

  private async checkElliptic(address: string, apiKey: string): Promise<{
    flags: AMLFlag[];
    additionalScore: number;
  }> {
    // 示例实现，实际需要调用 Elliptic API
    // https://www.elliptic.co/
    this.logger.debug(`调用 Elliptic API 检查: ${address}`);
    
    // TODO: 实现实际的 API 调用
    return { flags: [], additionalScore: 0 };
  }

  private async analyzeTransactionHistory(
    address: string,
    network?: string,
  ): Promise<{
    flags: AMLFlag[];
    additionalScore: number;
  } | null> {
    // 分析链上交易历史
    // 检测：
    // 1. 与 Mixer 的交互
    // 2. 异常交易模式
    // 3. 高频小额交易（洗钱特征）

    try {
      const rpcUrl = this.configService.get<string>('RPC_URL');
      if (!rpcUrl) return null;

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const txCount = await provider.getTransactionCount(address);

      const flags: AMLFlag[] = [];
      let additionalScore = 0;

      // 高交易数量可能是异常信号
      if (txCount > 10000) {
        flags.push({
          type: AMLFlagType.UNUSUAL_PATTERN,
          severity: 'medium',
          description: `Unusually high transaction count: ${txCount}`,
          source: 'Transaction Analysis',
        });
        additionalScore += 20;
      }

      return { flags, additionalScore };
    } catch (error) {
      this.logger.error(`交易历史分析失败: ${error.message}`);
      return null;
    }
  }

  private calculateRiskLevel(score: number, flags: AMLFlag[]): AMLRiskLevel {
    // 制裁直接阻止
    if (flags.some(f => f.type === AMLFlagType.SANCTIONS)) {
      return AMLRiskLevel.BLOCKED;
    }

    // 恐怖融资直接阻止
    if (flags.some(f => f.type === AMLFlagType.TERRORIST_FINANCING)) {
      return AMLRiskLevel.BLOCKED;
    }

    // 勒索软件直接阻止
    if (flags.some(f => f.type === AMLFlagType.RANSOMWARE)) {
      return AMLRiskLevel.BLOCKED;
    }

    // 根据分数判断
    if (score >= 80) return AMLRiskLevel.SEVERE;
    if (score >= 60) return AMLRiskLevel.HIGH;
    if (score >= 30) return AMLRiskLevel.MEDIUM;
    return AMLRiskLevel.LOW;
  }

  private generateRecommendations(level: AMLRiskLevel, flags: AMLFlag[]): string[] {
    const recommendations: string[] = [];

    switch (level) {
      case AMLRiskLevel.BLOCKED:
        recommendations.push('Transaction MUST NOT proceed - sanctions compliance violation');
        recommendations.push('Report to compliance team immediately');
        break;
      case AMLRiskLevel.SEVERE:
        recommendations.push('Require enhanced due diligence (EDD)');
        recommendations.push('Manual review required before any transaction');
        recommendations.push('Consider filing SAR if pattern persists');
        break;
      case AMLRiskLevel.HIGH:
        recommendations.push('Apply transaction limits');
        recommendations.push('Monitor ongoing transactions closely');
        recommendations.push('Require additional KYC documentation');
        break;
      case AMLRiskLevel.MEDIUM:
        recommendations.push('Standard monitoring recommended');
        recommendations.push('Periodic review of transaction patterns');
        break;
      case AMLRiskLevel.LOW:
        recommendations.push('Standard processing - no special action required');
        break;
    }

    // 特定标志的建议
    if (flags.some(f => f.type === AMLFlagType.MIXER)) {
      recommendations.push('Mixer interaction detected - enhanced monitoring required');
    }

    if (flags.some(f => f.type === AMLFlagType.PEP)) {
      recommendations.push('PEP status - enhanced due diligence required');
    }

    return recommendations;
  }

  /**
   * 清理过期缓存
   */
  cleanupCache(): number {
    const now = new Date();
    let cleaned = 0;
    for (const [key, value] of this.checkCache.entries()) {
      if (value.expiresAt < now) {
        this.checkCache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}
