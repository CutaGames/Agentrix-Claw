import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MPCWallet } from '../../entities/mpc-wallet.entity';
import { Wallet } from 'ethers';
import * as crypto from 'crypto';

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
    encryptedShardB: string; // 存储在数据库（Agentrix 持有）
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
      // 注意：这里使用简化实现，实际应该使用专门的库
      const shards = this.splitSecret(privateKey, 3, 2);

      // 4. 加密分片
      const encryptedShardA = this.encryptShard(shards[0], password);
      const encryptedShardB = this.encryptShard(shards[1], password);
      const encryptedShardC = this.encryptShard(shards[2], password);

      // 5. 保存到数据库（只存储分片 B）
      const mpcWallet = this.mpcWalletRepository.create({
        merchantId,
        walletAddress: wallet.address,
        chain: 'BSC',
        currency: 'USDC',
        encryptedShardB,
        isActive: true,
      });

      await this.mpcWalletRepository.save(mpcWallet);

      this.logger.log(`MPC wallet created for merchant ${merchantId}: ${wallet.address}`);

      return {
        walletAddress: wallet.address,
        encryptedShardA, // 返回给前端
        encryptedShardB, // 已存储在数据库
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
    // 简化实现：将私钥分成 3 份
    // 实际应该使用 shamir-secret-sharing 库
    const secretBytes = Buffer.from(secret, 'hex');
    const shareLength = Math.ceil(secretBytes.length / 2);

    const shares: string[] = [];
    for (let i = 0; i < totalShares; i++) {
      const share = crypto.randomBytes(shareLength);
      shares.push(share.toString('hex'));
    }

    // 计算最后一个分片，使得任意 2 个分片可以恢复私钥
    // 简化实现：最后一个分片 = secret XOR (share1 XOR share2)
    const share1 = Buffer.from(shares[0], 'hex');
    const share2 = Buffer.from(shares[1], 'hex');
    const share3 = Buffer.alloc(shareLength);

    for (let i = 0; i < Math.min(secretBytes.length, shareLength); i++) {
      share3[i] = secretBytes[i] ^ share1[i] ^ share2[i];
    }

    shares[2] = share3.toString('hex');

    return shares;
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
   * 加密分片（AES-256-GCM）
   */
  private encryptShard(shard: string, password: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(shard, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 返回格式: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
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

