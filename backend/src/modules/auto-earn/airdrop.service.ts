import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Airdrop, AirdropStatus } from '../../entities/airdrop.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface AirdropInfo {
  projectName: string;
  description?: string;
  chain: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  estimatedAmount?: number;
  currency: string;
  requirements?: string[];
  claimUrl?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class AirdropService {
  private readonly logger = new Logger(AirdropService.name);

  constructor(
    @InjectRepository(Airdrop)
    private airdropRepository: Repository<Airdrop>,
  ) {}

  /**
   * 监控并发现新的空投机会
   * 扫描链上数据、社交媒体、项目公告等
   */
  async discoverAirdrops(userId: string, agentId?: string): Promise<Airdrop[]> {
    this.logger.log(`为用户 ${userId} 发现空投机会`);

    const discoveredAirdrops: Airdrop[] = [];

    try {
      // 1. 从空投聚合平台获取空投信息
      // 使用 AirdropAlert API (示例)
      if (process.env.AIRDROP_ALERT_API_KEY) {
        try {
          const response = await fetch('https://api.airdropalert.com/v1/airdrops?status=active&limit=20', {
            headers: {
              'Authorization': `Bearer ${process.env.AIRDROP_ALERT_API_KEY}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.airdrops) {
              for (const airdropData of data.airdrops) {
                const airdropInfo: AirdropInfo = {
                  projectName: airdropData.name,
                  description: airdropData.description,
                  chain: airdropData.chain || 'ethereum',
                  tokenSymbol: airdropData.tokenSymbol,
                  estimatedAmount: airdropData.estimatedAmount,
                  currency: airdropData.currency || 'USDC',
                  requirements: airdropData.requirements || [],
                  claimUrl: airdropData.claimUrl,
                  expiresAt: airdropData.expiresAt ? new Date(airdropData.expiresAt) : undefined,
                  metadata: airdropData,
                };
                
                const saved = await this.saveAirdropIfNotExists(userId, agentId, airdropInfo);
                if (saved) discoveredAirdrops.push(saved);
              }
            }
          }
        } catch (error) {
          this.logger.warn(`从 AirdropAlert API 获取空投失败: ${error.message}`);
        }
      }

      // 2. 从 CoinGecko 获取新代币信息（可能包含空投）
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
        if (response.ok) {
          const tokens = await response.json();
          // 筛选最近添加的代币（可能是新项目空投）
          const recentTokens = tokens
            .filter((t: any) => t.id && !t.id.includes('wrapped'))
            .slice(0, 10);
          
          for (const token of recentTokens) {
            // 检查是否可能是空投项目
            if (token.name && token.symbol) {
              const airdropInfo: AirdropInfo = {
                projectName: `${token.name} Potential Airdrop`,
                description: `新代币 ${token.symbol} 可能包含空投机会`,
                chain: token.platforms?.ethereum ? 'ethereum' : 'solana',
                tokenSymbol: token.symbol,
                estimatedAmount: 0, // 未知
                currency: 'USDC',
                requirements: ['verify_wallet'],
                metadata: { tokenId: token.id, platforms: token.platforms },
              };
              
              const saved = await this.saveAirdropIfNotExists(userId, agentId, airdropInfo);
              if (saved) discoveredAirdrops.push(saved);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`从 CoinGecko 获取代币信息失败: ${error.message}`);
      }

      // 3. 如果以上都失败，使用 MOCK 数据作为后备
      if (discoveredAirdrops.length === 0) {
        this.logger.log('使用 MOCK 数据作为后备');
        const mockAirdrops: AirdropInfo[] = [
          {
            projectName: 'Solana Ecosystem Airdrop',
            description: 'Solana生态项目空投，完成任务即可领取',
            chain: 'solana',
            tokenSymbol: 'SOL',
            estimatedAmount: 50,
            currency: 'SOL',
            requirements: ['follow_twitter', 'join_discord', 'verify_wallet'],
            claimUrl: 'https://airdrop.solana.ecosystem.com',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          {
            projectName: 'Ethereum DeFi Airdrop',
            description: 'DeFi协议空投，早期用户可获得代币',
            chain: 'ethereum',
            tokenSymbol: 'DEFI',
            estimatedAmount: 100,
            currency: 'USDC',
            requirements: ['verify_wallet', 'complete_kyc'],
            claimUrl: 'https://airdrop.defi.protocol.com',
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        ];

        for (const info of mockAirdrops) {
          const saved = await this.saveAirdropIfNotExists(userId, agentId, info);
          if (saved) discoveredAirdrops.push(saved);
        }
      }

      this.logger.log(`为用户 ${userId} 发现了 ${discoveredAirdrops.length} 个空投机会`);
      return discoveredAirdrops;
    } catch (error) {
      this.logger.error(`发现空投失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 保存空投（如果不存在）
   */
  private async saveAirdropIfNotExists(
    userId: string,
    agentId: string | undefined,
    info: AirdropInfo,
  ): Promise<Airdrop | null> {
    // 检查是否已存在
    const existing = await this.airdropRepository.findOne({
      where: {
        userId,
        projectName: info.projectName,
        chain: info.chain,
      },
    });

    if (!existing) {
      const airdrop = this.airdropRepository.create({
        userId,
        agentId,
        ...info,
        status: AirdropStatus.MONITORING,
      });
      return await this.airdropRepository.save(airdrop);
    }

    return null;
  }

  /**
   * 获取用户的空投列表
   */
  async getUserAirdrops(
    userId: string,
    status?: AirdropStatus,
    agentId?: string,
  ): Promise<Airdrop[]> {
    const query: any = { userId };
    if (status) query.status = status;
    if (agentId) query.agentId = agentId;

    return this.airdropRepository.find({
      where: query,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 检查空投是否符合领取条件
   */
  async checkEligibility(airdropId: string, userId: string): Promise<{
    eligible: boolean;
    missingRequirements?: string[];
  }> {
    const airdrop = await this.airdropRepository.findOne({
      where: { id: airdropId, userId },
    });

    if (!airdrop) {
      throw new Error('空投不存在');
    }

    if (airdrop.status !== AirdropStatus.MONITORING && airdrop.status !== AirdropStatus.ELIGIBLE) {
      return { eligible: false };
    }

    // TODO: 检查用户是否满足所有要求
    // 1. 检查Twitter关注状态
    // 2. 检查Discord加入状态
    // 3. 检查钱包验证状态
    // 4. 检查KYC状态

    // MOCK: 模拟检查
    const missingRequirements: string[] = [];

    if (airdrop.requirements?.includes('follow_twitter')) {
      // 检查Twitter关注
      // const isFollowing = await checkTwitterFollow(userId, airdrop.metadata?.twitterHandle);
      // if (!isFollowing) missingRequirements.push('follow_twitter');
    }

    if (airdrop.requirements?.includes('join_discord')) {
      // 检查Discord加入
      // const isMember = await checkDiscordMember(userId, airdrop.metadata?.discordServer);
      // if (!isMember) missingRequirements.push('join_discord');
    }

    const eligible = missingRequirements.length === 0;

    if (eligible && airdrop.status === AirdropStatus.MONITORING) {
      airdrop.status = AirdropStatus.ELIGIBLE;
      await this.airdropRepository.save(airdrop);
    }

    return { eligible, missingRequirements };
  }

  /**
   * 自动领取空投
   */
  async claimAirdrop(airdropId: string, userId: string): Promise<{
    success: boolean;
    transactionHash?: string;
    error?: string;
  }> {
    const airdrop = await this.airdropRepository.findOne({
      where: { id: airdropId, userId },
    });

    if (!airdrop) {
      throw new Error('空投不存在');
    }

    if (airdrop.status !== AirdropStatus.ELIGIBLE) {
      return {
        success: false,
        error: '空投不符合领取条件',
      };
    }

    // 检查是否过期
    if (airdrop.expiresAt && new Date() > airdrop.expiresAt) {
      airdrop.status = AirdropStatus.EXPIRED;
      await this.airdropRepository.save(airdrop);
      return {
        success: false,
        error: '空投已过期',
      };
    }

    try {
      // TODO: 调用真实领取逻辑
      // 1. 调用空投项目的API领取
      // 2. 或者执行链上交易领取
      // 3. 记录交易哈希

      // MOCK: 模拟领取
      await new Promise(resolve => setTimeout(resolve, 2000));

      const mockTransactionHash = `0x${Math.random().toString(16).substring(2, 66)}`;

      airdrop.status = AirdropStatus.CLAIMED;
      airdrop.claimTransactionHash = mockTransactionHash;
      airdrop.claimedAt = new Date();
      await this.airdropRepository.save(airdrop);

      this.logger.log(`空投已领取: ${airdropId} by user ${userId}`);

      return {
        success: true,
        transactionHash: mockTransactionHash,
      };
    } catch (error: any) {
      airdrop.status = AirdropStatus.FAILED;
      await this.airdropRepository.save(airdrop);

      this.logger.error(`领取空投失败: ${airdropId}`, error);

      return {
        success: false,
        error: error.message || '领取失败',
      };
    }
  }

  /**
   * 自动监控空投（定时任务）
   * 每小时执行一次，发现新的空投机会
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoMonitorAirdrops() {
    this.logger.log('开始自动监控空投机会');

    // TODO: 获取所有活跃用户
    // const activeUsers = await this.userRepository.find({ where: { status: 'active' } });
    // for (const user of activeUsers) {
    //   await this.discoverAirdrops(user.id);
    // }

    this.logger.log('空投监控完成');
  }

  /**
   * 检查并更新过期空投
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async checkExpiredAirdrops() {
    this.logger.log('检查过期空投');

    const expiredAirdrops = await this.airdropRepository.find({
      where: {
        status: AirdropStatus.MONITORING,
      },
    });

    const now = new Date();
    for (const airdrop of expiredAirdrops) {
      if (airdrop.expiresAt && now > airdrop.expiresAt) {
        airdrop.status = AirdropStatus.EXPIRED;
        await this.airdropRepository.save(airdrop);
      }
    }

    this.logger.log(`已更新 ${expiredAirdrops.length} 个过期空投`);
  }
}

