import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, Wallet, JsonRpcProvider, TransactionRequest } from 'ethers';
import * as crypto from 'crypto';

/**
 * 签名请求
 */
export interface SignatureRequest {
  userId: string;
  walletAddress: string;
  transaction: TransactionRequest;
  encryptedShardA: string; // 前端传来的加密分片 A
  shardAPassword: string; // 前端派生的分片 A 密码
}

/**
 * 签名结果
 */
export interface SignatureResult {
  success: boolean;
  signedTransaction?: string;
  transactionHash?: string;
  error?: string;
}

/**
 * 授权支付请求
 */
export interface AuthorizedPaymentRequest {
  userId: string;
  walletAddress: string;
  to: string;
  amount: string; // 金额（以太单位）
  token?: string; // 代币地址（如果是 ERC20）
  memo?: string;
  encryptedShardA: string;
  shardAPassword: string;
}

/**
 * MPC 签名中继服务
 * 
 * 实现"无感签名"功能：
 * 1. 接收前端的分片 A 和交易数据
 * 2. 获取服务器存储的分片 B
 * 3. 组合两个分片恢复私钥（仅在内存中）
 * 4. 签名交易并广播
 * 5. 立即清除私钥
 * 
 * 安全注意事项：
 * - 私钥仅在签名时短暂存在于内存中
 * - 使用 SecureBuffer 模式（尽可能）
 * - 支持硬件安全模块 (HSM) 升级路径
 */
@Injectable()
export class MPCSignerService {
  private readonly logger = new Logger(MPCSignerService.name);
  private provider: JsonRpcProvider;

  // 模拟的分片 B 存储（实际应该从 UserMPCWalletService 获取）
  private shardBStore: Map<string, { encryptedShardB: string; salt: string }> = new Map();

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('BSC_RPC_URL', 'https://bsc-dataseed.binance.org');
    this.provider = new JsonRpcProvider(rpcUrl);
  }

  /**
   * 执行授权支付（无感签名）
   * 
   * 流程：
   * 1. 前端获取加密的分片 A（从 IndexedDB）
   * 2. 后端获取加密的分片 B
   * 3. 组合恢复私钥
   * 4. 签名并发送交易
   * 5. 清除私钥
   */
  async executeAuthorizedPayment(
    request: AuthorizedPaymentRequest,
  ): Promise<SignatureResult> {
    let privateKey: string | null = null;

    try {
      // 1. 获取分片 B
      const shardBData = await this.getShardB(request.userId);
      if (!shardBData) {
        throw new NotFoundException('User MPC wallet not found');
      }

      // 2. 解密分片 A
      const shardA = this.decryptShard(
        request.encryptedShardA,
        request.shardAPassword,
      );

      // 3. 解密分片 B
      const shardBPassword = this.deriveShardBPassword(
        request.userId,
        shardBData.salt,
      );
      const shardB = this.decryptShard(shardBData.encryptedShardB, shardBPassword);

      // 4. 组合恢复私钥（仅在内存中短暂存在）
      privateKey = this.combineShards(shardA, shardB);

      // 5. 创建钱包实例
      const wallet = new Wallet('0x' + privateKey, this.provider);

      // 验证地址匹配
      if (wallet.address.toLowerCase() !== request.walletAddress.toLowerCase()) {
        throw new BadRequestException('Wallet address mismatch');
      }

      // 6. 构建交易
      let tx: TransactionRequest;

      if (request.token) {
        // ERC20 转账
        tx = await this.buildERC20Transfer(
          request.token,
          request.to,
          request.amount,
          wallet.address,
        );
      } else {
        // 原生代币转账
        tx = {
          to: request.to,
          value: ethers.parseEther(request.amount),
          gasLimit: 21000n,
        };
      }

      // 添加备注（如果支持）
      if (request.memo) {
        tx.data = ethers.hexlify(ethers.toUtf8Bytes(request.memo));
      }

      // 7. 签名并发送交易
      this.logger.log(`Signing transaction for ${request.walletAddress}`);
      const txResponse = await wallet.sendTransaction(tx);

      // 8. 等待确认（可选）
      // const receipt = await txResponse.wait(1);

      this.logger.log(`Transaction sent: ${txResponse.hash}`);

      return {
        success: true,
        signedTransaction: txResponse.hash,
        transactionHash: txResponse.hash,
      };
    } catch (error: any) {
      this.logger.error(`MPC signing failed: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      // 9. 安全清除私钥
      if (privateKey) {
        this.secureWipe(privateKey);
        privateKey = null;
      }
    }
  }

  /**
   * 签名消息（用于授权等场景）
   */
  async signMessage(
    userId: string,
    walletAddress: string,
    message: string,
    encryptedShardA: string,
    shardAPassword: string,
  ): Promise<{ signature: string } | { error: string }> {
    let privateKey: string | null = null;

    try {
      // 获取并解密分片
      const shardBData = await this.getShardB(userId);
      if (!shardBData) {
        throw new NotFoundException('User MPC wallet not found');
      }

      const shardA = this.decryptShard(encryptedShardA, shardAPassword);
      const shardBPassword = this.deriveShardBPassword(userId, shardBData.salt);
      const shardB = this.decryptShard(shardBData.encryptedShardB, shardBPassword);

      privateKey = this.combineShards(shardA, shardB);
      const wallet = new Wallet('0x' + privateKey);

      if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new BadRequestException('Wallet address mismatch');
      }

      const signature = await wallet.signMessage(message);

      return { signature };
    } catch (error: any) {
      this.logger.error(`Message signing failed: ${error.message}`);
      return { error: error.message };
    } finally {
      if (privateKey) {
        this.secureWipe(privateKey);
        privateKey = null;
      }
    }
  }

  /**
   * 签名 EIP-712 类型数据
   */
  async signTypedData(
    userId: string,
    walletAddress: string,
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
    encryptedShardA: string,
    shardAPassword: string,
  ): Promise<{ signature: string } | { error: string }> {
    let privateKey: string | null = null;

    try {
      const shardBData = await this.getShardB(userId);
      if (!shardBData) {
        throw new NotFoundException('User MPC wallet not found');
      }

      const shardA = this.decryptShard(encryptedShardA, shardAPassword);
      const shardBPassword = this.deriveShardBPassword(userId, shardBData.salt);
      const shardB = this.decryptShard(shardBData.encryptedShardB, shardBPassword);

      privateKey = this.combineShards(shardA, shardB);
      const wallet = new Wallet('0x' + privateKey);

      if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new BadRequestException('Wallet address mismatch');
      }

      const signature = await wallet.signTypedData(domain, types, value);

      return { signature };
    } catch (error: any) {
      this.logger.error(`Typed data signing failed: ${error.message}`);
      return { error: error.message };
    } finally {
      if (privateKey) {
        this.secureWipe(privateKey);
        privateKey = null;
      }
    }
  }

  /**
   * 估算交易 Gas
   */
  async estimateGas(
    to: string,
    amount: string,
    token?: string,
  ): Promise<{ gasLimit: string; gasPrice: string; totalCost: string }> {
    try {
      const feeData = await this.provider.getFeeData();
      let gasLimit: bigint;

      if (token) {
        // ERC20 转账估算
        gasLimit = 65000n;
      } else {
        // 原生代币转账
        gasLimit = 21000n;
      }

      const gasPrice = feeData.gasPrice || ethers.parseUnits('5', 'gwei');
      const totalCost = gasLimit * gasPrice;

      return {
        gasLimit: gasLimit.toString(),
        gasPrice: ethers.formatUnits(gasPrice, 'gwei') + ' gwei',
        totalCost: ethers.formatEther(totalCost) + ' BNB',
      };
    } catch (error: any) {
      this.logger.error(`Gas estimation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 存储分片 B（供 UserMPCWalletService 调用）
   */
  storeShardB(userId: string, encryptedShardB: string, salt: string): void {
    this.shardBStore.set(userId, { encryptedShardB, salt });
  }

  /**
   * 获取分片 B
   */
  private async getShardB(
    userId: string,
  ): Promise<{ encryptedShardB: string; salt: string } | null> {
    return this.shardBStore.get(userId) || null;
  }

  /**
   * 派生分片 B 密码
   */
  private deriveShardBPassword(userId: string, salt: string): string {
    return crypto
      .pbkdf2Sync(userId, salt, 100000, 32, 'sha512')
      .toString('hex');
  }

  /**
   * 组合两个分片恢复私钥
   */
  private combineShards(shardA: string, shardB: string): string {
    const share1 = Buffer.from(shardA, 'hex');
    const share2 = Buffer.from(shardB, 'hex');
    
    const result = Buffer.alloc(share1.length);
    for (let i = 0; i < result.length; i++) {
      result[i] = share1[i] ^ share2[i];
    }
    
    return result.toString('hex');
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

  /**
   * 构建 ERC20 转账交易
   */
  private async buildERC20Transfer(
    tokenAddress: string,
    to: string,
    amount: string,
    from: string,
  ): Promise<TransactionRequest> {
    const erc20Interface = new ethers.Interface([
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)',
    ]);

    // 获取代币精度
    const tokenContract = new ethers.Contract(tokenAddress, erc20Interface, this.provider);
    const decimals = await tokenContract.decimals();

    // 构建交易数据
    const transferData = erc20Interface.encodeFunctionData('transfer', [
      to,
      ethers.parseUnits(amount, decimals),
    ]);

    return {
      to: tokenAddress,
      data: transferData,
      gasLimit: 65000n,
    };
  }

  /**
   * 安全清除敏感数据
   * 注意：JavaScript 无法真正保证内存清除，这是尽力而为的实现
   * 生产环境应该考虑使用 HSM 或 TEE
   */
  private secureWipe(data: string): void {
    // 尝试覆盖字符串内容
    // 注意：这在 JavaScript 中效果有限
    try {
      const buffer = Buffer.from(data, 'hex');
      crypto.randomFillSync(buffer);
    } catch {
      // 忽略错误
    }
  }
}
