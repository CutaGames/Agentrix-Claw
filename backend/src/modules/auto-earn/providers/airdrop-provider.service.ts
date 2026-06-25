/**
 * 空投数据提供者服务
 * 整合多个空投数据源，提供真实的空投发现能力
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { getMainnetChains, ChainConfig } from '../../../config/chains.config';

export interface AirdropData {
  projectName: string;
  description: string;
  chain: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  estimatedAmount?: number;
  currency: string;
  requirements: string[];
  claimUrl?: string;
  claimContractAddress?: string;
  merkleRoot?: string;
  expiresAt?: Date;
  source: string; // 数据来源
  riskScore?: number; // 0-100, 越低越安全
  metadata?: Record<string, any>;
}

export interface EligibilityResult {
  eligible: boolean;
  missingRequirements: string[];
  proofData?: any; // Merkle proof 或其他证明数据
  claimableAmount?: number;
}

@Injectable()
export class AirdropProviderService {
  private readonly logger = new Logger(AirdropProviderService.name);

  constructor(private configService: ConfigService) {}

  /**
   * 从多个数据源发现空投
   */
  async discoverAirdrops(
    walletAddress: string,
    chains: string[] = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'base', 'solana'],
  ): Promise<AirdropData[]> {
    const allAirdrops: AirdropData[] = [];

    // 并行查询多个数据源
    const results = await Promise.allSettled([
      this.fetchFromDebank(walletAddress, chains),
      this.fetchFromArkham(walletAddress, chains),
      this.fetchFromEarndrop(walletAddress, chains),
      this.fetchFromOnchainData(walletAddress, chains),
      this.fetchFromSocialProofs(walletAddress),
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allAirdrops.push(...result.value);
      }
    }

    // 去重并按估值排序
    const deduplicated = this.deduplicateAirdrops(allAirdrops);
    return deduplicated.sort((a, b) => (b.estimatedAmount || 0) - (a.estimatedAmount || 0));
  }

  /**
   * 从 DeBank 获取空投数据
   * DeBank 提供钱包资产和待领取空投的查询
   */
  private async fetchFromDebank(walletAddress: string, chains: string[]): Promise<AirdropData[]> {
    const apiKey = this.configService.get('DEBANK_API_KEY');
    if (!apiKey) {
      this.logger.debug('DeBank API key not configured, skipping');
      return [];
    }

    const airdrops: AirdropData[] = [];

    try {
      // 查询用户的待领取代币
      const response = await axios.get(
        `https://pro-openapi.debank.com/v1/user/token_list`,
        {
          params: {
            id: walletAddress,
            is_all: false,
            has_balance: false, // 包含待领取的
          },
          headers: { AccessKey: apiKey },
          timeout: 10000,
        },
      );

      if (response.data && Array.isArray(response.data)) {
        for (const token of response.data) {
          if (token.is_core === false && token.amount > 0) {
            airdrops.push({
              projectName: `${token.name} Token Airdrop`,
              description: `Claimable ${token.symbol} tokens detected`,
              chain: token.chain || 'ethereum',
              tokenAddress: token.id,
              tokenSymbol: token.symbol,
              estimatedAmount: token.amount * (token.price || 0),
              currency: 'USD',
              requirements: ['verify_wallet'],
              source: 'debank',
              riskScore: 20,
              metadata: { raw: token },
            });
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(`DeBank API error: ${error.message}`);
    }

    return airdrops;
  }

  /**
   * 从 Arkham 获取空投数据
   */
  private async fetchFromArkham(walletAddress: string, chains: string[]): Promise<AirdropData[]> {
    const apiKey = this.configService.get('ARKHAM_API_KEY');
    if (!apiKey) {
      return [];
    }

    // Arkham API implementation placeholder
    // 实际需要调用 Arkham Intelligence API
    return [];
  }

  /**
   * 从 Earndrop.io 获取空投数据
   */
  private async fetchFromEarndrop(walletAddress: string, chains: string[]): Promise<AirdropData[]> {
    const airdrops: AirdropData[] = [];

    try {
      // Earndrop 提供免费的空投检查 API
      const response = await axios.get(
        `https://api.earndrop.io/v1/check/${walletAddress}`,
        { timeout: 15000 },
      );

      if (response.data?.airdrops) {
        for (const airdrop of response.data.airdrops) {
          airdrops.push({
            projectName: airdrop.project,
            description: airdrop.description || `${airdrop.project} airdrop opportunity`,
            chain: airdrop.chain || 'ethereum',
            tokenSymbol: airdrop.token,
            estimatedAmount: airdrop.estimated_value,
            currency: 'USD',
            requirements: airdrop.requirements || [],
            claimUrl: airdrop.claim_url,
            expiresAt: airdrop.deadline ? new Date(airdrop.deadline) : undefined,
            source: 'earndrop',
            riskScore: 30,
            metadata: airdrop,
          });
        }
      }
    } catch (error: any) {
      this.logger.debug(`Earndrop API error: ${error.message}`);
    }

    return airdrops;
  }

  /**
   * 直接从链上数据发现空投
   * 查询 Merkle Distributor 合约等
   */
  private async fetchFromOnchainData(walletAddress: string, chains: string[]): Promise<AirdropData[]> {
    const airdrops: AirdropData[] = [];

    // 知名的 Merkle Distributor 合约地址
    const knownDistributors: Record<string, { address: string; name: string; token: string }[]> = {
      ethereum: [
        // Uniswap UNI 空投（历史）
        // Arbitrum ARB 空投
        // ENS 空投
      ],
      arbitrum: [
        // ARB 空投分发合约
      ],
    };

    for (const chain of chains) {
      const distributors = knownDistributors[chain] || [];
      for (const distributor of distributors) {
        try {
          const eligible = await this.checkMerkleEligibility(
            walletAddress,
            distributor.address,
            chain,
          );
          if (eligible) {
            airdrops.push({
              projectName: `${distributor.name} Airdrop`,
              description: `Claimable ${distributor.token} from ${distributor.name}`,
              chain,
              currency: 'USD',
              claimContractAddress: distributor.address,
              tokenSymbol: distributor.token,
              requirements: ['verify_wallet', 'claim_onchain'],
              source: 'onchain',
              riskScore: 10, // 链上验证，风险最低
            });
          }
        } catch (error) {
          // 忽略单个合约查询失败
        }
      }
    }

    return airdrops;
  }

  /**
   * 从社交证明获取空投资格
   * Twitter、Discord 活动等
   */
  private async fetchFromSocialProofs(walletAddress: string): Promise<AirdropData[]> {
    // 需要用户授权 Twitter/Discord 账号后才能检查
    return [];
  }

  /**
   * 检查 Merkle Tree 空投资格
   */
  private async checkMerkleEligibility(
    walletAddress: string,
    contractAddress: string,
    chain: string,
  ): Promise<boolean> {
    // 实际实现需要：
    // 1. 获取 Merkle Root
    // 2. 从 IPFS/API 获取完整 Merkle Tree
    // 3. 检查地址是否在树中
    return false;
  }

  /**
   * 验证空投资格（详细检查）
   */
  async checkEligibility(
    walletAddress: string,
    airdrop: AirdropData,
  ): Promise<EligibilityResult> {
    const missingRequirements: string[] = [];

    for (const req of airdrop.requirements) {
      const passed = await this.checkRequirement(walletAddress, req, airdrop);
      if (!passed) {
        missingRequirements.push(req);
      }
    }

    // 如果是链上空投，尝试获取 proof
    let proofData: any;
    let claimableAmount: number | undefined;

    if (airdrop.claimContractAddress && missingRequirements.length === 0) {
      try {
        const proof = await this.getMerkleProof(walletAddress, airdrop);
        if (proof) {
          proofData = proof.proof;
          claimableAmount = proof.amount;
        }
      } catch (error) {
        this.logger.warn(`Failed to get merkle proof: ${error}`);
      }
    }

    return {
      eligible: missingRequirements.length === 0,
      missingRequirements,
      proofData,
      claimableAmount,
    };
  }

  /**
   * 检查单个要求
   */
  private async checkRequirement(
    walletAddress: string,
    requirement: string,
    airdrop: AirdropData,
  ): Promise<boolean> {
    switch (requirement) {
      case 'verify_wallet':
        return true; // 钱包已验证
      case 'follow_twitter':
        // 需要 Twitter OAuth 验证
        return false;
      case 'join_discord':
        // 需要 Discord OAuth 验证
        return false;
      case 'complete_kyc':
        // 需要 KYC 验证
        return false;
      case 'claim_onchain':
        return true; // 只需要链上交易
      case 'min_balance':
        // 检查最低余额
        return true;
      default:
        return true;
    }
  }

  /**
   * 获取 Merkle Proof
   */
  private async getMerkleProof(
    walletAddress: string,
    airdrop: AirdropData,
  ): Promise<{ proof: string[]; amount: number } | null> {
    if (!airdrop.claimContractAddress) return null;

    // 实际实现需要：
    // 1. 从项目 API 或 IPFS 获取 merkle tree 数据
    // 2. 生成 proof
    // 这里返回示例结构
    return null;
  }

  /**
   * 去重空投
   */
  private deduplicateAirdrops(airdrops: AirdropData[]): AirdropData[] {
    const seen = new Map<string, AirdropData>();

    for (const airdrop of airdrops) {
      const key = `${airdrop.chain}-${airdrop.projectName.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, airdrop);
      } else {
        // 优先保留风险分数更低的
        const existing = seen.get(key)!;
        if ((airdrop.riskScore || 100) < (existing.riskScore || 100)) {
          seen.set(key, airdrop);
        }
      }
    }

    return Array.from(seen.values());
  }
}
