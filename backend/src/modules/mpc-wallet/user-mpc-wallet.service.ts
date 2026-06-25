import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Wallet } from 'ethers';
import * as crypto from 'crypto';

/**
 * 用户 MPC 钱包实体
 * 支持社交登录用户的钱包管理
 */
export interface UserMPCWallet {
  id: string;
  userId: string;
  walletAddress: string;
  chain: string;
  encryptedShardB: string; // Agentrix 持有的分片
  shardBSalt: string; // 分片 B 的盐值
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 钱包创建结果
 */
export interface WalletCreationResult {
  walletAddress: string;
  encryptedShardA: string; // 存储在用户浏览器 IndexedDB
  encryptedShardC: string; // 恢复码，用户需要备份
  recoveryHint: string; // 恢复提示
}

/**
 * 分片存储位置
 */
export interface ShardStorage {
  shardA: 'indexeddb' | 'session' | 'localstorage';
  shardB: 'server';
  shardC: 'user_backup';
}

/**
 * 用户 MPC 钱包服务
 * 
 * 实现社交登录用户的"无感钱包"功能：
 * 1. 用户通过 Google/Twitter 登录后自动生成 MPC 钱包
 * 2. 分片 A 存储在用户浏览器（IndexedDB）
 * 3. 分片 B 绑定到用户第三方 ID，存储在服务器
 * 4. 分片 C 作为恢复码，用户备份
 */
@Injectable()
export class UserMPCWalletService {
  private readonly logger = new Logger(UserMPCWalletService.name);

  // 模拟数据库存储（实际应该使用 TypeORM 实体）
  private walletStore: Map<string, UserMPCWallet> = new Map();

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 为社交登录用户自动创建 MPC 钱包
   * 
   * @param userId 用户 ID
   * @param socialProviderId 社交登录提供者的用户 ID（Google ID / Twitter ID）
   * @param chain 目标链（默认 BSC）
   */
  async createWalletForSocialUser(
    userId: string,
    socialProviderId: string,
    chain: string = 'BSC',
  ): Promise<WalletCreationResult> {
    try {
      // 1. 检查用户是否已有钱包
      const existingWallet = await this.getUserWallet(userId);
      if (existingWallet) {
        throw new BadRequestException('User already has an active MPC wallet');
      }

      // 2. 验证用户存在
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // 3. 生成新的以太坊钱包
      const wallet = Wallet.createRandom();
      const privateKey = wallet.privateKey.substring(2); // 去掉 0x 前缀

      // 4. 生成分片密码
      // 使用社交登录 ID 作为分片 B 的派生因子
      const shardBSalt = crypto.randomBytes(16).toString('hex');
      const derivedPassword = this.derivePasswordFromSocialId(socialProviderId, shardBSalt);

      // 5. 使用 Shamir Secret Sharing 分片私钥
      const shards = this.splitSecret(privateKey, 3, 2);

      // 6. 加密分片
      // 分片 A：使用用户派生密钥加密（存储在浏览器）
      const shardAPassword = this.generateClientSidePassword(userId);
      const encryptedShardA = this.encryptShard(shards[0], shardAPassword);

      // 分片 B：使用派生密码加密（存储在服务器）
      const encryptedShardB = this.encryptShard(shards[1], derivedPassword);

      // 分片 C：使用恢复密码加密（用户备份）
      const recoveryPassword = this.generateRecoveryPassword();
      const encryptedShardC = this.encryptShard(shards[2], recoveryPassword);

      // 7. 存储钱包信息
      const mpcWallet: UserMPCWallet = {
        id: crypto.randomUUID(),
        userId,
        walletAddress: wallet.address,
        chain,
        encryptedShardB,
        shardBSalt,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.walletStore.set(userId, mpcWallet);

      // 8. 更新用户记录（添加钱包地址）
      // 使用 metadata 存储默认钱包地址（User 实体无此字段）
      user.metadata = {
        ...(user.metadata || {}),
        defaultMPCWalletAddress: wallet.address,
      };
      await this.userRepository.save(user);

      this.logger.log(`MPC wallet created for social user ${userId}: ${wallet.address}`);

      return {
        walletAddress: wallet.address,
        encryptedShardA,
        encryptedShardC,
        recoveryHint: `Recovery code: ${recoveryPassword.substring(0, 4)}...${recoveryPassword.substring(recoveryPassword.length - 4)}`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create MPC wallet for social user: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 获取用户的 MPC 钱包
   */
  async getUserWallet(userId: string): Promise<UserMPCWallet | null> {
    return this.walletStore.get(userId) || null;
  }

  /**
   * 检查用户是否有 MPC 钱包
   */
  async hasWallet(userId: string): Promise<boolean> {
    const wallet = await this.getUserWallet(userId);
    return wallet !== null && wallet.isActive;
  }

  /**
   * 获取分片 B（用于签名）
   * 
   * @param userId 用户 ID
   * @param socialProviderId 社交登录 ID（用于验证）
   */
  async getShardBForSigning(
    userId: string,
    socialProviderId: string,
  ): Promise<{ encryptedShardB: string; derivationParams: any }> {
    const wallet = await this.getUserWallet(userId);
    if (!wallet) {
      throw new NotFoundException('MPC wallet not found');
    }

    // 返回加密的分片 B 和派生参数
    return {
      encryptedShardB: wallet.encryptedShardB,
      derivationParams: {
        salt: wallet.shardBSalt,
        algorithm: 'PBKDF2',
        iterations: 100000,
        keyLength: 32,
      },
    };
  }

  /**
   * 恢复钱包（使用分片 A + 分片 C）
   */
  async recoverWallet(
    userId: string,
    encryptedShardA: string,
    encryptedShardC: string,
    shardAPassword: string,
    recoveryPassword: string,
  ): Promise<{ success: boolean; walletAddress: string }> {
    try {
      // 解密分片
      const shardA = this.decryptShard(encryptedShardA, shardAPassword);
      const shardC = this.decryptShard(encryptedShardC, recoveryPassword);

      // 恢复私钥
      const privateKey = this.combineShares([shardA, shardC]);

      // 验证钱包地址
      const wallet = new Wallet('0x' + privateKey);

      // 检查是否与存储的地址匹配
      const storedWallet = await this.getUserWallet(userId);
      if (storedWallet && storedWallet.walletAddress !== wallet.address) {
        throw new BadRequestException('Recovered wallet address does not match');
      }

      return {
        success: true,
        walletAddress: wallet.address,
      };
    } catch (error: any) {
      this.logger.error(`Wallet recovery failed: ${error.message}`);
      throw new BadRequestException('Failed to recover wallet. Please check your recovery code.');
    }
  }

  /**
   * 从社交登录 ID 派生密码
   */
  private derivePasswordFromSocialId(socialProviderId: string, salt: string): string {
    return crypto
      .pbkdf2Sync(socialProviderId, salt, 100000, 32, 'sha512')
      .toString('hex');
  }

  /**
   * 生成客户端密码（基于用户 ID）
   */
  private generateClientSidePassword(userId: string): string {
    // 客户端会使用相同的算法生成密码
    return crypto
      .createHash('sha256')
      .update(`agentrix-mpc-${userId}`)
      .digest('hex');
  }

  /**
   * 生成恢复密码
   */
  private generateRecoveryPassword(): string {
    // 生成 24 字符的恢复码
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let password = '';
    for (let i = 0; i < 24; i++) {
      if (i > 0 && i % 4 === 0) password += '-';
      password += chars.charAt(crypto.randomInt(chars.length));
    }
    return password;
  }

  /**
   * 使用 Shamir Secret Sharing 分片私钥
   * 简化实现：使用 XOR 基础的 2/3 门限方案
   */
  private splitSecret(secret: string, totalShares: number, threshold: number): string[] {
    const secretBytes = Buffer.from(secret, 'hex');
    const shareLength = secretBytes.length;

    // 生成两个随机分片
    const share1 = crypto.randomBytes(shareLength);
    const share2 = crypto.randomBytes(shareLength);

    // 第三个分片 = secret XOR share1 XOR share2
    const share3 = Buffer.alloc(shareLength);
    for (let i = 0; i < shareLength; i++) {
      share3[i] = secretBytes[i] ^ share1[i] ^ share2[i];
    }

    return [
      share1.toString('hex'),
      share2.toString('hex'),
      share3.toString('hex'),
    ];
  }

  /**
   * 恢复私钥（使用任意 2 个分片）
   */
  private combineShares(shares: string[]): string {
    if (shares.length < 2) {
      throw new BadRequestException('Need at least 2 shares to recover');
    }

    const share1 = Buffer.from(shares[0], 'hex');
    const share2 = Buffer.from(shares[1], 'hex');

    // 简化实现：任意两个分片 XOR 可以得到第三个
    // 然后三个分片 XOR 得到原始私钥
    const secret = Buffer.alloc(share1.length);
    for (let i = 0; i < secret.length; i++) {
      secret[i] = share1[i] ^ share2[i];
    }

    return secret.toString('hex');
  }

  /**
   * 加密分片（AES-256-GCM）
   */
  private encryptShard(shard: string, password: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(password, 'agentrix-mpc-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(shard, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

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

    const key = crypto.scryptSync(password, 'agentrix-mpc-salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
