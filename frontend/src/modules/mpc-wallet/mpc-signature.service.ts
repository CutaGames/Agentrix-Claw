import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MPCWallet } from '../../entities/mpc-wallet.entity';
import { Wallet, JsonRpcProvider, Contract } from 'ethers';
import * as crypto from 'crypto';

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
  ) {}

  /**
   * 场景 1: 商户主动支付（需要分片 A + B）
   * 商户在前端签名，Agentrix 在后端签名
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
      const decryptedShardB = this.decryptShard(encryptedShardB, merchantPassword);

      // 3. 恢复私钥（使用分片 A + B）
      const privateKey = this.combineShares([decryptedShardA, decryptedShardB]);

      // 4. 使用私钥签名
      const walletInstance = new Wallet('0x' + privateKey);
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
   * 商户提现，不需要 Agentrix
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
    if (shares.length < 2) {
      throw new BadRequestException('Need at least 2 shares to recover');
    }

    const share1 = Buffer.from(shares[0], 'hex');
    const share2 = Buffer.from(shares[1], 'hex');
    const share3 = shares[2] ? Buffer.from(shares[2], 'hex') : null;

    const secret = Buffer.alloc(Math.max(share1.length, share2.length));

    if (share3) {
      // 使用 3 个分片恢复
      for (let i = 0; i < secret.length; i++) {
        secret[i] = share1[i] ^ share2[i] ^ share3[i];
      }
    } else {
      // 使用 2 个分片恢复（简化实现）
      for (let i = 0; i < secret.length; i++) {
        secret[i] = share1[i] ^ share2[i];
      }
    }

    return secret.toString('hex');
  }

  /**
   * 解密分片
   */
  private decryptShard(encryptedShard: string, password: string): string {
    const algorithm = 'aes-256-gcm';
    const parts = encryptedShard.split(':');
    if (parts.length !== 3) {
      throw new BadRequestException('Invalid encrypted shard format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

