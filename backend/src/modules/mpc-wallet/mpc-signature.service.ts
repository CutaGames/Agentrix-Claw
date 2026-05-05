import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MPCWallet } from '../../entities/mpc-wallet.entity';
import { Wallet } from 'ethers';
import * as crypto from 'crypto';
import { decryptShard } from './mpc-shard-crypto.util';
import { MPCShardProtectionService } from './mpc-shard-protection.service';
import { combineShares } from './mpc-threshold.util';

/**
 * MPC 签名服务
 * 实现 2/3 签名机制
 * 
 * 注意：当前使用多签钱包方式实现（简化版）
 * 未来可以升级为真正的阈值签名（TSS）
 */
@Injectable()
export class MPCSignatureService {
  private readonly logger = new Logger(MPCSignatureService.name);

  constructor(
    @InjectRepository(MPCWallet)
    private mpcWalletRepository: Repository<MPCWallet>,
    private readonly shardProtectionService: MPCShardProtectionService,
  ) {}

  /**
   * 场景 1: 商户主动支付（需要分片 A + B）
   * 商户在前端签名，PayMind 在后端签名
   */
  async signWithShardAAndB(
    merchantId: string,
    to: string,
    amount: bigint,
    encryptedShardA: string,
    merchantPassword: string,
    authorizationToken: string,
  ): Promise<{
    signature: string;
    txHash?: string;
  }> {
    try {
      // 1. 获取分片 B（需要商户授权）
      const wallet = await this.mpcWalletRepository.findOne({
        where: { merchantId, isActive: true },
      });

      if (!wallet) {
        throw new BadRequestException('MPC wallet not found');
      }

      // TODO: 验证授权令牌
      const encryptedShardB = wallet.encryptedShardB;

      // 2. 解密分片
      const decryptedShardA = this.decryptShard(encryptedShardA, merchantPassword);
      const decryptedShardB = await this.shardProtectionService.unprotectShard(
        wallet.userId || wallet.merchantId || merchantId,
        encryptedShardB,
        wallet.metadata?.mpcShardProtection,
        merchantPassword,
      );

      // 3. 恢复私钥（使用分片 A + B）
      const privateKey = this.combineShares([decryptedShardA, decryptedShardB]);

      // 4. 使用私钥签名
      const walletInstance = new Wallet('0x' + privateKey);
      if (walletInstance.address.toLowerCase() !== wallet.walletAddress.toLowerCase()) {
        throw new BadRequestException('Recovered wallet address does not match stored MPC wallet');
      }
      const messageHash = this.buildMessageHash(to, amount);
      const signature = await walletInstance.signMessage(messageHash);

      return {
        signature,
      };
    } catch (error) {
      this.logger.error(`Failed to sign with shard A and B: ${error.message}`, error);
      throw error;
    }
  }


  /**
   * 场景 3: 商户提现（需要分片 A + C）
   * 商户提现，不需要 PayMind
   */
  async signWithShardAAndC(
    encryptedShardA: string,
    encryptedShardC: string,
    merchantPassword: string,
    to: string,
    amount: bigint,
  ): Promise<{
    signature: string;
    txHash?: string;
  }> {
    try {
      // 1. 解密分片
      const decryptedShardA = this.decryptShard(encryptedShardA, merchantPassword);
      const decryptedShardC = this.decryptShard(encryptedShardC, merchantPassword);

      // 2. 恢复私钥（使用分片 A + C）
      const privateKey = this.combineShares([decryptedShardA, decryptedShardC]);

      // 3. 使用私钥签名
      const walletInstance = new Wallet('0x' + privateKey);
      const messageHash = this.buildMessageHash(to, amount);
      const signature = await walletInstance.signMessage(messageHash);

      return {
        signature,
      };
    } catch (error) {
      this.logger.error(`Failed to sign with shard A and C: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 构建消息哈希
   */
  private buildMessageHash(to: string, amount: bigint): string {
    // 使用 EIP-712 兼容的消息哈希
    const message = {
      to,
      amount: amount.toString(),
      timestamp: Date.now(),
    };

    const messageHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(message))
      .digest('hex');

    return '0x' + messageHash;
  }

  /**
   * 恢复私钥（使用 2 个分片）
   */
  private combineShares(shares: string[]): string {
    return combineShares(shares);
  }

  /**
   * 解密分片
   */
  private decryptShard(encryptedShard: string, password: string): string {
    return decryptShard(encryptedShard, password);
  }
}

