import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MPCWallet } from '../../entities/mpc-wallet.entity';
import { Wallet } from 'ethers';
import { decryptShard, encryptShard } from './mpc-shard-crypto.util';
import { MPCShardProtectionService } from './mpc-shard-protection.service';
import { combineShares, splitSecret } from './mpc-threshold.util';

/**
 * MPC 钱包服务
 * 实现私钥分片生成、存储和管理
 */
@Injectable()
export class MPCWalletService {
  private readonly logger = new Logger(MPCWalletService.name);

  constructor(
    @InjectRepository(MPCWallet)
    private mpcWalletRepository: Repository<MPCWallet>,
    private readonly shardProtectionService: MPCShardProtectionService,
  ) {}

  /**
   * 生成 MPC 钱包
   * 使用 Shamir Secret Sharing 将私钥分成 3 份，需要 2 份恢复
   */
  async generateMPCWallet(
    merchantId: string,
    password: string,
  ): Promise<{
    walletAddress: string;
    encryptedShardA: string; // 返回给前端（商户持有）
    encryptedShardB: string; // 存储在数据库（PayMind 持有）
    encryptedShardC: string; // 返回给商户备份
  }> {
    try {
      // 1. 检查是否已有钱包
      const existingWallet = await this.mpcWalletRepository.findOne({
        where: { merchantId, isActive: true },
      });

      if (existingWallet) {
        throw new BadRequestException('Merchant already has an active MPC wallet');
      }

      // 2. 生成随机私钥
      const wallet = Wallet.createRandom();
      const privateKey = wallet.privateKey.substring(2); // 去掉 0x 前缀

      // 3. 使用 Shamir Secret Sharing 分成 3 份，需要 2 份恢复
      const shards = this.splitSecret(privateKey, 3, 2);

      // 4. 加密分片
      const encryptedShardA = this.encryptShard(shards[0], password);
      const encryptedShardC = this.encryptShard(shards[2], password);
      const protectedShardB = await this.shardProtectionService.protectShard(
        merchantId,
        shards[1],
        password,
      );

      // 5. 保存到数据库（只存储分片 B）
      const mpcWallet = this.mpcWalletRepository.create({
        merchantId,
        walletAddress: wallet.address,
        chain: 'BSC',
        currency: 'USDC',
        encryptedShardB: protectedShardB.encryptedShard,
        isActive: true,
        metadata: {
          mpcThreshold: {
            totalShares: 3,
            threshold: 2,
            algorithm: 'shamirs-secret-sharing',
          },
          mpcShardProtection: protectedShardB.descriptor,
        },
      });

      await this.mpcWalletRepository.save(mpcWallet);

      this.logger.log(`MPC wallet created for merchant ${merchantId}: ${wallet.address}`);

      return {
        walletAddress: wallet.address,
        encryptedShardA, // 返回给前端
        encryptedShardB: protectedShardB.encryptedShard, // 已存储在数据库
        encryptedShardC, // 返回给商户备份
      };
    } catch (error) {
      this.logger.error(`Failed to generate MPC wallet: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 获取商户 MPC 钱包
   */
  async getMPCWallet(merchantId: string): Promise<MPCWallet> {
    const wallet = await this.mpcWalletRepository.findOne({
      where: { merchantId, isActive: true },
    });

    if (!wallet) {
      throw new NotFoundException('MPC wallet not found');
    }

    return wallet;
  }

  /**
   * 获取用户 MPC 钱包（通过 userId）
   */
  async getMPCWalletByUserId(userId: string): Promise<MPCWallet> {
    const wallet = await this.mpcWalletRepository.findOne({
      where: [
        { merchantId: userId, isActive: true },
        { userId: userId, isActive: true },
      ],
    });

    if (!wallet) {
      throw new NotFoundException('MPC wallet not found');
    }

    return wallet;
  }

  /**
   * 检查用户是否有 MPC 钱包
   */
  async userHasMPCWallet(userId: string): Promise<boolean> {
    const wallet = await this.mpcWalletRepository.findOne({
      where: [
        { merchantId: userId, isActive: true },
        { userId: userId, isActive: true },
      ],
    });
    return !!wallet;
  }

  /**
   * 为社交登录用户生成 MPC 钱包
   */
  async generateMPCWalletForUser(
    userId: string,
    derivedPassword: string,
    chain: string = 'BSC',
  ): Promise<{
    walletAddress: string;
    encryptedShardA: string;
    encryptedShardC: string;
  }> {
    try {
      // 检查是否已有钱包
      const existingWallet = await this.mpcWalletRepository.findOne({
        where: [
          { merchantId: userId, isActive: true },
          { userId: userId, isActive: true },
        ],
      });

      if (existingWallet) {
        // 如果已有钱包，返回钱包信息但不返回分片
        return {
          walletAddress: existingWallet.walletAddress,
          encryptedShardA: '', // 已创建的钱包不返回分片
          encryptedShardC: '',
        };
      }

      // 生成新钱包
      const result = await this.generateMPCWallet(userId, derivedPassword);
      
      // 更新钱包: set userId and chain
      await this.mpcWalletRepository.update(
        { merchantId: userId, isActive: true },
        { userId, chain },
      );

      this.logger.log(`MPC wallet created for social user ${userId}: ${result.walletAddress}`);

      return {
        walletAddress: result.walletAddress,
        encryptedShardA: result.encryptedShardA,
        encryptedShardC: result.encryptedShardC,
      };
    } catch (error) {
      this.logger.error(`Failed to generate MPC wallet for user: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 获取分片 B（需要商户授权）
   */
  async getShardB(merchantId: string, authorizationToken: string): Promise<string> {
    // TODO: 验证授权令牌
    const wallet = await this.getMPCWallet(merchantId);
    return wallet.encryptedShardB;
  }


  /**
   * 使用 Shamir Secret Sharing 分片私钥
   * 简化实现：使用随机分片（实际应该使用专门的库）
   */
  private splitSecret(secret: string, totalShares: number, threshold: number): string[] {
    return splitSecret(secret, totalShares, threshold);
  }

  /**
   * 恢复私钥（使用 2 个分片）
   */
  private combineShares(shares: string[]): string {
    return combineShares(shares);
  }

  /**
   * 加密分片（AES-256-GCM）
   */
  private encryptShard(shard: string, password: string): string {
    return encryptShard(shard, password);
  }

  /**
   * 解密分片
   */
  private decryptShard(encryptedShard: string, password: string): string {
    return decryptShard(encryptedShard, password);
  }

  /**
   * 恢复钱包（使用分片 A + C）
   */
  async recoverWallet(
    merchantId: string,
    encryptedShardA: string,
    encryptedShardC: string,
    password: string,
  ): Promise<string> {
    try {
      // 1. 解密分片
      const decryptedShardA = this.decryptShard(encryptedShardA, password);
      const decryptedShardC = this.decryptShard(encryptedShardC, password);

      // 2. 恢复私钥
      const privateKeyHex = this.combineShares([decryptedShardA, decryptedShardC]);

      // 3. 验证钱包地址
      const wallet = new Wallet('0x' + privateKeyHex);

      // 4. 验证地址是否匹配
      const storedWallet = await this.getMPCWallet(merchantId);
      if (wallet.address.toLowerCase() !== storedWallet.walletAddress.toLowerCase()) {
        throw new BadRequestException('Recovered wallet address does not match');
      }

      return wallet.address;
    } catch (error) {
      this.logger.error(`Failed to recover wallet: ${error.message}`, error);
      throw error;
    }
  }
}

